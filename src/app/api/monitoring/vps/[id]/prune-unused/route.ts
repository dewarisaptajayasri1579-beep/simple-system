import { NextResponse } from "next/server"

import { getApiUser } from "@/lib/current-user"
import { sshExec, sudoWrap, vpsSshCreds } from "@/lib/monitoring/ssh"
import { prisma } from "@/lib/prisma"

const DELIM = "___PRUNE_SPLIT___"

/** `docker buildx prune --builder <name>` GAGAL di host VPS dengan "no builder ... found" —
 *  Coolify bikin builder BuildKit (mis. "coolify-railpack0") dari DALAM container Coolify
 *  sendiri, jadi registrasi builder itu (`~/.docker/buildx/instances/...`) cuma ada di
 *  filesystem container Coolify, bukan di host. Container BuildKit-nya (`buildx_buildkit_
 *  <builder>`) tetap jalan beneran di host, cuma CLI `docker buildx` di host tidak "kenal" dia
 *  (kejadian nyata, lihat percakapan monitoring — errornya persis begitu). Solusinya skip CLI
 *  `docker buildx` sama sekali: `docker exec` langsung ke container BuildKit-nya dan panggil
 *  `buildctl` (CLI native BuildKit yang ikut ter-bundle di image itu) buat prune cache-nya
 *  langsung tanpa lewat registrasi builder client-side. */
const BUILDX_PRUNE_LOOP =
  "bash -c 'for v in $(docker volume ls --format \"{{.Name}}\" | grep \"^buildx_buildkit_\"); do " +
  'c="${v%_state}"; echo "-- container: $c --"; ' +
  "docker exec \"$c\" buildctl prune --all 2>&1; done'"

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
    // `buildctl prune` (beda dari `docker buildx prune`) tidak ngeluarin baris ringkasan
    // "Total: X" — cuma daftar record cache yang dihapus — jadi ukuran yang kereclaim tidak bisa
    // dihitung dari sini. Cek berhasil/gagal lewat ada-tidaknya "error" di outputnya; angka
    // pastinya baru kelihatan dari breakdown volume setelah `handleCheckDockerDisk()` re-check.
    const buildxTrimmed = buildxPart.trim()
    const buildxOk = buildxTrimmed.length > 0 && !/error/i.test(buildxTrimmed)
    return NextResponse.json({ ok: true, systemReclaimed, buildxOk, buildxOutput: buildxTrimmed.slice(0, 4000) })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Gagal jalankan cleanup" }, { status: 502 })
  }
}
