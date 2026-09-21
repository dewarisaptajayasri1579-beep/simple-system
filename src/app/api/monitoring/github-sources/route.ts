import { NextResponse } from "next/server"

import { getApiUser } from "@/lib/current-user"
import { canViewMonitoring } from "@/lib/monitoring"
import { prisma } from "@/lib/prisma"

/** Daftar Git App/Source GitHub, dikelompokkan per VPS — dipakai menu "Git Apps". Data source-nya
 *  sendiri disinkron otomatis dari Coolify (lihat syncGithubSources() di
 *  src/lib/monitoring/coolify.ts), di sini cuma dibaca dan token TIDAK PERNAH dikirim balik ke
 *  client (cuma status `hasToken`) — supaya token yang sudah diisi tidak bisa dibaca ulang lewat
 *  network tab, cuma bisa DITIMPA. */
export async function GET() {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })
  if (!canViewMonitoring(user)) return NextResponse.json({ error: "Tidak punya akses modul Monitoring" }, { status: 403 })

  const vpsList = await prisma.vpsServer.findMany({
    select: {
      id: true,
      name: true,
      githubSources: {
        orderBy: { name: "asc" },
        select: { id: true, name: true, isPublic: true, token: true, tokenSetAt: true },
      },
    },
    orderBy: { name: "asc" },
  })

  return NextResponse.json(
    vpsList
      .filter((vps) => vps.githubSources.length > 0)
      .map((vps) => ({
        vpsId: vps.id,
        vpsName: vps.name,
        sources: vps.githubSources.map((s) => ({
          id: s.id,
          name: s.name,
          isPublic: s.isPublic,
          hasToken: Boolean(s.token),
          tokenSetAt: s.tokenSetAt,
        })),
      }))
  )
}
