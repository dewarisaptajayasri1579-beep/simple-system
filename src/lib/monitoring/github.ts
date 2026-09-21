export type GithubCommit = {
  sha: string
  message: string
  author: string | null
  date: string | null
  url: string
}

/** Ekstrak "owner/repo" dari field Application.gitRepository — bisa berupa 3 format: langsung
 *  "owner/repo" (format yang Coolify simpan waktu sync, lihat firstCleanDomain-sejenis di
 *  coolify.ts), URL HTTPS ("https://github.com/owner/repo.git"), atau URL SSH
 *  ("git@github.com:owner/repo.git") — yang terakhir dua biasa dipakai kalau field ini diisi
 *  manual. Best-effort: return null kalau tidak cocok pola manapun (mis. repo di GitLab/Bitbucket,
 *  bukan GitHub — fitur commit log ini SENGAJA cuma dukung GitHub). */
function parseGithubRepo(gitRepository: string): { owner: string; repo: string } | null {
  const cleaned = gitRepository.trim().replace(/\.git$/, "")
  const directMatch = /^([\w.-]+)\/([\w.-]+)$/.exec(cleaned)
  if (directMatch) return { owner: directMatch[1], repo: directMatch[2] }
  const urlMatch = /github\.com[/:]([\w.-]+)\/([\w.-]+)/.exec(cleaned)
  if (urlMatch) return { owner: urlMatch[1], repo: urlMatch[2] }
  return null
}

/** Ambil commit terbaru repo GitHub-nya 1 aplikasi lewat REST API resmi — dipakai di modal "Lihat
 *  Detail" aplikasi monitoring. `token` idealnya Personal Access Token milik akun GitHub yang punya
 *  akses ke repo itu (diisi manual per Git App/Source lewat menu "Git Apps" — Coolify tidak
 *  mengekspos private key GitHub App-nya lewat API publik jadi tidak bisa auto-generate, lihat
 *  GithubSource di schema.prisma), fallback ke env GITHUB_TOKEN kalau tidak ada. Tanpa token sama
 *  sekali, tetap jalan buat repo PUBLIK (kena rate limit 60/jam per IP dari GitHub), tapi repo
 *  privat akan gagal (401/404) tanpa token. Best-effort — return array kosong kalau gitRepository
 *  bukan GitHub, repo tidak ketemu, token kurang akses, atau request gagal — TIDAK melempar error
 *  ke pemanggil. */
export async function fetchRecentCommits(gitRepository: string, token?: string | null, limit = 10): Promise<GithubCommit[]> {
  const parsed = parseGithubRepo(gitRepository)
  if (!parsed) return []

  const headers: Record<string, string> = { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" }
  const resolvedToken = token || process.env.GITHUB_TOKEN
  if (resolvedToken) headers.Authorization = `Bearer ${resolvedToken}`

  try {
    const res = await fetch(`https://api.github.com/repos/${parsed.owner}/${parsed.repo}/commits?per_page=${limit}`, {
      headers,
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return []
    const data = await res.json()
    if (!Array.isArray(data)) return []
    return data.map((c) => ({
      sha: c.sha,
      message: (c.commit?.message ?? "").split("\n")[0],
      author: c.commit?.author?.name ?? c.author?.login ?? null,
      date: c.commit?.author?.date ?? null,
      url: c.html_url,
    }))
  } catch {
    return []
  }
}
