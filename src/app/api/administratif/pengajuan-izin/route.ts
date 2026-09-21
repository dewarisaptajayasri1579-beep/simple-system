import { NextResponse } from "next/server"

import { prisma } from "@/lib/prisma"
import { getApiUser } from "@/lib/current-user"
import { logAudit } from "@/lib/audit"

function hasAccess(user: { role: string; modules: string[] }) {
  return user.role === "owner" || user.modules.includes("administratif")
}

export async function GET() {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })
  if (!hasAccess(user)) return NextResponse.json({ error: "Tidak punya akses" }, { status: 403 })

  const leaveRequests = await prisma.leaveRequest.findMany({
    include: { employee: { select: { id: true, name: true } }, leaveType: { select: { id: true, name: true } } },
    orderBy: { date: "desc" },
    take: 300,
  })
  return NextResponse.json({ leaveRequests })
}

// Tanpa approval (keputusan bisnis final) — HR input, langsung dianggap sah.
export async function POST(request: Request) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })
  if (!hasAccess(user)) return NextResponse.json({ error: "Tidak punya akses" }, { status: 403 })

  const body = await request.json().catch(() => null)
  const employeeId = typeof body?.employeeId === "string" ? body.employeeId : ""
  const leaveTypeId = typeof body?.leaveTypeId === "string" ? body.leaveTypeId : ""
  const dateStr = typeof body?.date === "string" ? body.date : ""
  if (!employeeId || !leaveTypeId || !dateStr) {
    return NextResponse.json({ error: "Karyawan, jenis izin, dan tanggal wajib diisi" }, { status: 400 })
  }
  const notes = typeof body?.notes === "string" && body.notes.trim() ? body.notes.trim() : null

  const leaveRequest = await prisma.leaveRequest.create({
    data: { employeeId, leaveTypeId, date: new Date(dateStr), notes, createdById: user.id },
  })
  await logAudit({ actorUserId: user.id, action: "administratif.pengajuan-izin.create", entityType: "leave_request", entityId: leaveRequest.id, after: leaveRequest })

  return NextResponse.json({ leaveRequest }, { status: 201 })
}
