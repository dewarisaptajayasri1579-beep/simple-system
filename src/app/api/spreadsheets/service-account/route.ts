import { NextResponse } from "next/server"

import { getServiceAccountEmail } from "@/lib/google-sheets"
import { getApiUser } from "@/lib/current-user"

function canView(user: { role: string; modules: string[] }) {
  return user.role === "owner" || user.modules.includes("spreadsheet")
}

export async function GET() {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })
  if (!canView(user)) return NextResponse.json({ error: "Tidak punya akses ke modul ini" }, { status: 403 })

  try {
    const email = getServiceAccountEmail()
    return NextResponse.json({ email })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
