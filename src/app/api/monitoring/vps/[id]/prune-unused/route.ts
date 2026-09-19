import { NextResponse } from "next/server"

import { getApiUser } from "@/lib/current-user"
import { sshExec, sudoWrap, vpsSshCreds } from "@/lib/monitoring/ssh"
import { prisma } from "@/lib/prisma"

const DELIM = "___PRUNE_SPLIT___"

/** Bersihkan SEMUA yang aman dihapus tanpa risiko data — image lama/dangling, container
 *  berhenti, network nganggur (`docker system prune -af`) + cache BuildKit (`docker buildx
 *  prune -af`, TERPISAH dari system prune — cache builder BuildKit tersimpan di volume sendiri,
 *  mis. "buildx_buildkit_*", yang TIDAK ke-cover oleh `docker system prune` biasa walau sama-sama
 *  "volume"). SENGAJA TIDAK pakai `--volumes` di command mana pun — volume data aplikasi/database
 *  tidak pernah disentuh sama sekali. Cuma Owner, user harus konfirmasi dulu di UI. */
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
    sudoWrap(creds.password, "docker buildx prune -af 2>&1"),
  ].join("\n")

  try {
    const output = await sshExec(creds, script, 90000)
    const [systemPart = "", buildxPart = ""] = output.split(DELIM)
    const systemReclaimed = systemPart.match(/Total reclaimed space:\s*([\d.]+\s*[A-Za-z]+)/i)?.[1] ?? null
    const buildxReclaimed = buildxPart.match(/Total:\s*([\d.]+\s*[A-Za-z]+)/i)?.[1] ?? null
    return NextResponse.json({ ok: true, systemReclaimed, buildxReclaimed })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Gagal jalankan cleanup" }, { status: 502 })
  }
}
