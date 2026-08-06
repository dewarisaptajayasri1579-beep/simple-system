import { NextResponse } from "next/server"

import { getApiUser } from "@/lib/current-user"

export async function GET() {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })
  return NextResponse.json({ id: user.id, name: user.name, email: user.email, role: user.role })
}
