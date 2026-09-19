import { NextResponse } from "next/server"

import { getApiUser } from "@/lib/current-user"
import { sshExec, sudoWrap, vpsSshCreds } from "@/lib/monitoring/ssh"
import { prisma } from "@/lib/prisma"

const DELIM = "___PRUNE_SPLIT___"

const UNIT_MULT: Record<string, number> = { B: 1, KB: 1024, MB: 1024 ** 2, GB: 1024 ** 3, TB: 1024 ** 4 }

function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0B"
  const units = ["B", "KB", "MB", "GB", "TB"]
  let i = 0
  let v = bytes
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(2)}${units[i]}`
}

/** `docker buildx prune` TANPA `--builder` cuma nge-prune builder yang lagi "current" di CLI
 *  context yang jalanin command itu — BUKAN semua builder. Coolify bikin builder container
 *  terpisah per project (mis. "coolify-railpack0") yang biasanya bukan builder default, jadi
 *  `docker buildx prune -af` polos TIDAK ngefek ke situ sama sekali (volume state-nya tetap gede
 *  walau sudah "dibersihkan" — kejadian nyata, lihat percakapan monitoring). Makanya di-loop
 *  eksplisit per builder yang ketahuan dari nama volume `buildx_buildkit_<builder>_state`. */
const BUILDX_PRUNE_LOOP =
  "bash -c 'for v in $(docker volume ls --format \"{{.Name}}\" | grep \"^buildx_buildkit_\"); do " +
  'b="${v#buildx_buildkit_}"; b="${b%_state}"; echo "-- builder: $b --"; ' +
  "docker buildx prune -af --builder \"$b\" 2>&1; done'"

/** Bersihkan SEMUA yang aman dihapus tanpa risiko data — image lama/dangling, container
 *  berhenti, network nganggur (`docker system prune -af`) + cache BuildKit tiap builder
 *  (`BUILDX_PRUNE_LOOP` di atas — TERPISAH dari system prune, cache builder BuildKit tersimpan
 *  di volume sendiri, mis. "buildx_buildkit_*", yang TIDAK ke-cover oleh `docker system prune`
 *  biasa walau sama-sama "volume"). SENGAJA TIDAK pakai `--volumes` di command mana pun — volume
 *  data aplikasi/database tidak pernah disentuh sama sekali. Cuma Owner, user harus konfirmasi
 *  dulu di UI. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })
  if (user.role !== "owner") return NextResponse.json({ error: "Cuma Owner yang bisa jalankan ini" }, { status: 403 })

  const { id } = await params
  const vps = await prisma.vpsServer.findUnique({ where: { id } })
  if (!vps) return NextResponse.json({ error: "VPS tidak ditemukan" }, { status: 404 })

  const creds = vpsSshCreds(vps)
  const script = [
    sudoWrap(creds.password, "docker system prune -af 2>&1"),
    `echo "${DELIM}"`,
    sudoWrap(creds.password, BUILDX_PRUNE_LOOP),
  ].join("\n")

  try {
    // Hapus data puluhan GB (cache BuildKit, bisa lebih dari 1 builder) beneran makan waktu I/O
    // disk — dikasih 150 detik biar tidak keburu timeout kalau yang dihapus banyak.
    const output = await sshExec(creds, script, 150000)
    const [systemPart = "", buildxPart = ""] = output.split(DELIM)
    const systemReclaimed = systemPart.match(/Total reclaimed space:\s*([\d.]+\s*[A-Za-z]+)/i)?.[1] ?? null
    const buildxReclaimedBytes = [...buildxPart.matchAll(/Total:\s*([\d.]+)\s*([A-Za-z]+)/gi)].reduce(
      (sum, m) => sum + parseFloat(m[1]) * (UNIT_MULT[m[2].toUpperCase()] ?? 1),
      0,
    )
    const buildxReclaimed = buildxReclaimedBytes > 0 ? formatBytes(buildxReclaimedBytes) : null
    // Sementara ikut dikirim buat debug kalau buildxReclaimed kosong tapi volume cache-nya
    // masih gede — biar kelihatan builder mana yang ke-loop & error asli dari `docker buildx
    // prune`, tanpa perlu akses SSH manual ke VPS.
    return NextResponse.json({ ok: true, systemReclaimed, buildxReclaimed, buildxOutput: buildxPart.trim().slice(0, 4000) })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Gagal jalankan cleanup" }, { status: 502 })
  }
}
