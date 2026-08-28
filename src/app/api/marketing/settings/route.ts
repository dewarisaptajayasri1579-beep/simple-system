import { NextResponse } from "next/server"

import { getMarketingApiUser } from "@/lib/marketing/auth"
import { logAudit } from "@/lib/marketing/audit"
import { resolveMarketingRole } from "@/lib/marketing/permissions"
import { MARKETING_SETTING_DEFAULTS, getAllMarketingSettings } from "@/lib/marketing/settings"
import { prisma } from "@/lib/prisma"

/** GET — semua tunable + default. PUT — override (MANAGER/owner). body: { "<key>": number }. */
export async function GET() {
  const user = await getMarketingApiUser()
  if (!user) return NextResponse.json({ error: "Tidak punya akses modul Marketing" }, { status: 401 })
  const role = await resolveMarketingRole(user.id, user.role)
  return NextResponse.json({ settings: await getAllMarketingSettings(), defaults: MARKETING_SETTING_DEFAULTS, canEdit: role === "MANAGER" })
}

export async function PUT(request: Request) {
  const user = await getMarketingApiUser()
  if (!user) return NextResponse.json({ error: "Tidak punya akses modul Marketing" }, { status: 401 })
  if ((await resolveMarketingRole(user.id, user.role)) !== "MANAGER") {
    return NextResponse.json({ error: "Hanya Manager/Owner yang bisa ubah pengaturan." }, { status: 403 })
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) return NextResponse.json({ error: "Body tidak valid" }, { status: 400 })

  const keys = Object.keys(MARKETING_SETTING_DEFAULTS)
  for (const [key, value] of Object.entries(body)) {
    if (!keys.includes(key)) continue
    const n = Number(value)
    if (!Number.isFinite(n)) continue
    await prisma.leadSystemSetting.upsert({
      where: { key },
      update: { valueJson: n, updatedByUserId: user.id },
      create: { key, valueJson: n, updatedByUserId: user.id },
    })
  }

  await logAudit({ actorUserId: user.id, action: "marketing.settings.update", entityType: "settings", after: body })
  return NextResponse.json({ settings: await getAllMarketingSettings() })
}
