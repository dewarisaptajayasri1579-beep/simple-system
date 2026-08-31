import { NextResponse } from "next/server"

import { getApiUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })
  if (user.role !== "owner") return NextResponse.json({ error: "Cuma Owner yang bisa kelola user" }, { status: 403 })

  const { id } = await params
  const body = await request.json().catch(() => null)

  const data: { role?: string; phoneNumber?: string | null; modules?: string[]; isActive?: boolean } = {}
  if (body?.role !== undefined) {
    if (!["owner", "direktur", "admin"].includes(body.role)) {
      return NextResponse.json({ error: "Role tidak valid" }, { status: 400 })
    }
    data.role = body.role
  }
  if (typeof body?.phoneNumber === "string") data.phoneNumber = body.phoneNumber || null
  if (Array.isArray(body?.modules)) {
    const valid = ["internal", "marketing", "monitoring"]
    if (body.modules.some((m: unknown) => !valid.includes(m as string))) {
      return NextResponse.json({ error: "Modul tidak valid" }, { status: 400 })
    }
    data.modules = body.modules
  }
  if (typeof body?.isActive === "boolean") {
    if (!body.isActive) {
      if (id === user.id) {
        return NextResponse.json({ error: "Tidak bisa menonaktifkan akun sendiri." }, { status: 400 })
      }
      const target = await prisma.user.findUnique({ where: { id }, select: { role: true } })
      if (!target) return NextResponse.json({ error: "User tidak ditemukan" }, { status: 404 })
      if (target.role === "owner") {
        return NextResponse.json({ error: "Akun Owner tidak bisa dinonaktifkan." }, { status: 400 })
      }
    }
    data.isActive = body.isActive
  }

  const updated = await prisma.user.update({
    where: { id },
    data,
    select: { id: true, name: true, email: true, role: true, phoneNumber: true, modules: true, isActive: true },
  })

  // Nonaktif → cabut semua sesi login user itu supaya langsung ter-logout di semua device.
  if (data.isActive === false) {
    await prisma.session.deleteMany({ where: { userId: id } })
  }

  return NextResponse.json(updated)
}

/** Hapus user PERMANEN — beda dari nonaktifkan (isActive: false, lihat PATCH di atas) yang
 *  memang sengaja dipertahankan supaya riwayat (pesan, aktivitas Lead, audit log, kasbon dst)
 *  tetap utuh. Delete beneran cuma diizinkan kalau user ini BENAR-BENAR belum punya riwayat apa
 *  pun (mis. baru dibuat lalu ternyata salah/tidak jadi dipakai) — kalau sudah ada histori,
 *  tolak dan arahkan ke nonaktifkan supaya data historis (nama staf di Buku Besar, Lead, dst)
 *  tidak jadi nyangkut/hilang rujukannya. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })
  if (user.role !== "owner") return NextResponse.json({ error: "Cuma Owner yang bisa menghapus user" }, { status: 403 })

  const { id } = await params
  if (id === user.id) return NextResponse.json({ error: "Tidak bisa menghapus akun sendiri." }, { status: 400 })

  const target = await prisma.user.findUnique({ where: { id }, select: { role: true } })
  if (!target) return NextResponse.json({ error: "User tidak ditemukan" }, { status: 404 })
  if (target.role === "owner") return NextResponse.json({ error: "Akun Owner tidak bisa dihapus." }, { status: 400 })

  const [
    teamsManaged,
    teamMemberships,
    supervisedMemberships,
    leadSegmentChanges,
    leadTemperatureChanges,
    leadAssignmentsReceived,
    leadAssignmentsMade,
    sentMessages,
    leadActivities,
    leadFollowUpsAssigned,
    leadFollowUpsCreated,
    leadAiSuggestionsUsed,
    auditLogs,
    leadSystemSettingsUpdated,
    kasbons,
    kasbonsCreated,
  ] = await Promise.all([
    prisma.team.count({ where: { managerUserId: id } }),
    prisma.teamMembership.count({ where: { userId: id } }),
    prisma.teamMembership.count({ where: { supervisorUserId: id } }),
    prisma.leadSegmentHistory.count({ where: { changedByUserId: id } }),
    prisma.leadTemperatureHistory.count({ where: { changedByUserId: id } }),
    prisma.leadAssignment.count({ where: { assignedUserId: id } }),
    prisma.leadAssignment.count({ where: { assignedByUserId: id } }),
    prisma.message.count({ where: { senderUserId: id } }),
    prisma.leadActivity.count({ where: { actorUserId: id } }),
    prisma.leadFollowUp.count({ where: { assignedUserId: id } }),
    prisma.leadFollowUp.count({ where: { createdByUserId: id } }),
    prisma.leadAiSuggestion.count({ where: { usedByUserId: id } }),
    prisma.auditLog.count({ where: { actorUserId: id } }),
    prisma.leadSystemSetting.count({ where: { updatedByUserId: id } }),
    prisma.kasbon.count({ where: { userId: id } }),
    prisma.kasbon.count({ where: { createdById: id } }),
  ])

  const hasHistory =
    teamsManaged > 0 ||
    teamMemberships > 0 ||
    supervisedMemberships > 0 ||
    leadSegmentChanges > 0 ||
    leadTemperatureChanges > 0 ||
    leadAssignmentsReceived > 0 ||
    leadAssignmentsMade > 0 ||
    sentMessages > 0 ||
    leadActivities > 0 ||
    leadFollowUpsAssigned > 0 ||
    leadFollowUpsCreated > 0 ||
    leadAiSuggestionsUsed > 0 ||
    auditLogs > 0 ||
    leadSystemSettingsUpdated > 0 ||
    kasbons > 0 ||
    kasbonsCreated > 0

  if (hasHistory) {
    return NextResponse.json(
      { error: "User ini sudah punya riwayat aktivitas (pesan/lead/audit/kasbon dst) — tidak bisa dihapus permanen. Nonaktifkan saja supaya riwayatnya tetap utuh." },
      { status: 400 }
    )
  }

  // Aman dihapus — sessions/whatsappConnection/pushSubscriptions/leadNotifications ikut kehapus
  // otomatis (onDelete: Cascade di schema, semuanya data ephemeral/device, bukan riwayat).
  await prisma.user.delete({ where: { id } })

  return NextResponse.json({ ok: true })
}
