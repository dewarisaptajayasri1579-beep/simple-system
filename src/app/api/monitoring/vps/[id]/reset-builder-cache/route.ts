import { NextResponse } from "next/server"

import { getApiUser } from "@/lib/current-user"
import { sshExec, sudoWrap, vpsSshCreds } from "@/lib/monitoring/ssh"
import { prisma } from "@/lib/prisma"

/** Beda dari prune-unused (`buildctl prune`, cuma hapus record cache yang BuildKit sendiri anggap
 *  reclaimable) — dipakai kalau `buildctl du` sudah nunjukkin 0B (cache-nya sendiri sudah kosong)
 *  tapi volume `buildx_buildkit_*_state` di disk masih gede (lihat percakapan monitoring: kejadian
 *  nyata 574MB nyangkut walau cache 0B — sisa file internal/metadata BuildKit yang tidak ke-cover
 *  `prune`). Solusinya: stop container builder-nya + hapus volume-nya sekalian — AMAN, itu cuma
 *  cache build, Coolify otomatis bikin ulang builder & volume baru pas deploy berikutnya (build
 *  pertama setelahnya mulai dari cache kosong, sedikit lebih lambat, tapi tidak ada data hilang). */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })
  if (user.role !== "owner") return NextResponse.json({ error: "Cuma Owner yang bisa jalankan ini" }, { status: 403 })

  const { id } = await params
  const vps = await prisma.vpsServer.findUnique({ where: { id } })
  if (!vps) return NextResponse.json({ error: "VPS tidak ditemukan" }, { status: 404 })

  const creds = vpsSshCreds(vps)
  const resetLoop =
    "bash -c 'for v in $(docker volume ls --format \"{{.Name}}\" | grep \"^buildx_buildkit_\"); do " +
    'c="${v%_state}"; echo "-- container: $c, volume: $v --"; ' +
    'docker stop "$c" 2>&1; docker rm "$c" 2>&1; docker volume rm "$v" 2>&1; done\''

  try {
    const output = await sshExec(creds, sudoWrap(creds.password, resetLoop), 60000)
    const ok = !/error response from daemon/i.test(output)
    return NextResponse.json({ ok, output: output.slice(0, 4000) })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Gagal reset builder cache" }, { status: 502 })
  }
}
