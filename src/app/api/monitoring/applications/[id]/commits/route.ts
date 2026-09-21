import { NextResponse } from "next/server"

import { decryptSecret } from "@/lib/crypto"
import { getApiUser } from "@/lib/current-user"
import { canViewMonitoring } from "@/lib/monitoring"
import { fetchRecentCommits } from "@/lib/monitoring/github"
import { prisma } from "@/lib/prisma"

/** Commit terbaru repo GitHub 1 aplikasi — dibaca live (bukan disimpan/cache) tiap modal "Lihat
 *  Detail" dibuka, karena data commit itu sendiri sudah "live" di GitHub, tidak ada gunanya
 *  disimpan salinan basi di database kita. Token PAT diambil dari GithubSource yang ter-link
 *  (diisi manual lewat menu "Git Apps"), fallback ke env GITHUB_TOKEN kalau belum diisi. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })
  if (!canViewMonitoring(user)) return NextResponse.json({ error: "Tidak punya akses modul Monitoring" }, { status: 403 })

  const { id } = await params
  const app = await prisma.application.findUnique({
    where: { id },
    select: { gitRepository: true, githubSource: { select: { token: true } } },
  })
  if (!app?.gitRepository) return NextResponse.json([])

  const token = app.githubSource?.token ? decryptSecret(app.githubSource.token) : null
  const commits = await fetchRecentCommits(app.gitRepository, token)
  return NextResponse.json(commits)
}
