import { NextResponse } from "next/server"

import { getMarketingApiUser } from "@/lib/marketing/auth"
import { logAudit } from "@/lib/marketing/audit"
import { canViewMarketing, resolveMarketingRole } from "@/lib/marketing/permissions"
import { getMarketingSetting } from "@/lib/marketing/settings"
import { prisma } from "@/lib/prisma"

/**
 * POST /api/marketing/leads/[id]/assignments — pindah PIC lead.
 *  body: { action: "takeover" | "reassign", assignedUserId?, reason? }
 *   - takeover  : caller jadi PIC (tombol "Ambil Alih"). Buat SALES cuma boleh kalau PIC lama
 *                 telat respon (pesan customer nggantung > `takeover.unreplied_minutes`) — lead
 *                 tanpa PIC & role SPV/Manager bebas. `reason` diisi OTOMATIS "Telat respon
 *                 (belum dibalas N menit)", bukan dari body.
 *   - reassign  : set PIC ke `assignedUserId` — hanya MANAGER/SPV, atau PIC aktif saat ini
 *                 (hand-off). Wajib `reason`.
 * Tutup assignment lama (isActive=false, endedAt), buat yang baru, kirim LeadNotification ke PIC baru.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getMarketingApiUser()
  if (!user) return NextResponse.json({ error: "Tidak punya akses modul Marketing" }, { status: 401 })

  const { id } = await params
  const lead = await prisma.lead.findUnique({
    where: { id },
    select: { id: true, displayName: true, lastCustomerMessageAt: true, lastSalesMessageAt: true },
  })
  if (!lead) return NextResponse.json({ error: "Lead tidak ditemukan" }, { status: 404 })

  const body = (await request.json().catch(() => null)) as
    | { action?: unknown; assignedUserId?: unknown; reason?: unknown }
    | null
  const action = body?.action === "reassign" ? "reassign" : "takeover"
  const reason = typeof body?.reason === "string" ? body.reason.trim() || null : null

  const [role, activeAssignment] = await Promise.all([
    resolveMarketingRole(user.id, user.role),
    prisma.leadAssignment.findFirst({ where: { leadId: id, isActive: true }, select: { id: true, assignedUserId: true } }),
  ])
  const isCurrentPic = activeAssignment?.assignedUserId === user.id

  let targetUserId: string
  let autoReason: string | null = null
  if (action === "takeover") {
    targetUserId = user.id
    // Ambil Alih oleh sesama Sales cuma boleh kalau PIC-nya memang telat respon — dulu bebas
    // tanpa syarat, dan itu celah rebutan lead (ambil lead panas menjelang deal). SPV/Manager
    // tidak kena batas ini (mereka memang atasannya), begitu juga lead yang belum ada PIC-nya
    // sama sekali — itu cuma "klaim lead nganggur", bukan mengambil punya orang.
    const isSales = role !== "MANAGER" && role !== "SPV"
    if (isSales && activeAssignment) {
      const limitMinutes = await getMarketingSetting("takeover.unreplied_minutes")
      if (limitMinutes > 0) {
        // "Telat respon" = ada pesan customer yang belum dibalas Sales, dan sudah nggantung
        // lebih lama dari batas. Kalau balasan terakhir Sales lebih baru dari pesan customer
        // terakhir, berarti tidak ada yang nggantung sama sekali.
        const customerAt = lead.lastCustomerMessageAt
        const repliedAfter = lead.lastSalesMessageAt != null && customerAt != null && lead.lastSalesMessageAt >= customerAt
        const unrepliedMinutes = customerAt && !repliedAfter ? (Date.now() - customerAt.getTime()) / 60000 : 0
        if (unrepliedMinutes < limitMinutes) {
          return NextResponse.json(
            {
              error: `Lead ini masih dipegang PIC-nya. Ambil Alih cuma bisa kalau pesan customer belum dibalas lebih dari ${limitMinutes} menit — minta SPV/Manager kalau memang perlu dipindah.`,
            },
            { status: 403 }
          )
        }
        autoReason = `Telat respon (belum dibalas ${Math.floor(unrepliedMinutes)} menit)`
      }
    }
  } else {
    if (role !== "MANAGER" && role !== "SPV" && !isCurrentPic) {
      return NextResponse.json({ error: "Hanya SPV/Manager atau PIC saat ini yang bisa reassign." }, { status: 403 })
    }
    targetUserId = typeof body?.assignedUserId === "string" ? body.assignedUserId : ""
    if (!targetUserId) return NextResponse.json({ error: "Pilih user tujuan dulu." }, { status: 400 })
    if (!reason) return NextResponse.json({ error: "Alasan reassign wajib diisi." }, { status: 400 })
  }

  if (activeAssignment?.assignedUserId === targetUserId) {
    return NextResponse.json({ error: "User itu sudah jadi PIC lead ini." }, { status: 400 })
  }

  const targetUser = await prisma.user.findUnique({ where: { id: targetUserId }, select: { id: true, role: true, modules: true, name: true } })
  if (!targetUser || !canViewMarketing(targetUser)) {
    return NextResponse.json({ error: "User tujuan tidak punya akses modul Marketing." }, { status: 400 })
  }

  const assignment = await prisma.$transaction(async (tx) => {
    await tx.leadAssignment.updateMany({
      where: { leadId: id, isActive: true },
      data: { isActive: false, endedAt: new Date() },
    })
    const created = await tx.leadAssignment.create({
      data: {
        leadId: id,
        assignedUserId: targetUserId,
        assignedByUserId: user.id,
        assignmentType: action === "takeover" ? "TAKEOVER" : "PRIMARY",
        // Takeover: alasannya diisi otomatis "Telat respon (...)" — Sales tidak perlu (dan tidak
        // bisa) mengarang alasan lain, karena satu-satunya kondisi yang mengizinkan takeover ya
        // memang telat respon. `reason` manual dari body cuma dipakai buat reassign.
        reason: action === "takeover" ? (autoReason ?? reason ?? "Ambil alih") : reason,
        isActive: true,
      },
    })
    await tx.leadNotification.create({
      data: {
        userId: targetUserId,
        type: "LEAD_ASSIGNED",
        title: `Kamu jadi PIC lead: ${lead.displayName}`,
        body: action === "takeover" ? `${user.name} mengambil alih & menyerahkan ke kamu` : reason || "Di-assign oleh SPV/Manager",
        entityType: "lead",
        entityId: id,
        deepLink: `/marketing/leads/${id}`,
        dedupeKey: `assign:${created.id}`,
        status: "PENDING",
      },
    })
    // PIC lama juga dikabari kalau lead-nya berpindah — dulu dia tidak tahu sama sekali. Penting
    // khususnya buat takeover "telat respon": yang kehilangan lead harus tahu alasannya, bukan
    // baru sadar pas lihat daftar lead-nya berkurang.
    const previousPicUserId = activeAssignment?.assignedUserId
    if (previousPicUserId && previousPicUserId !== targetUserId) {
      await tx.leadNotification.create({
        data: {
          userId: previousPicUserId,
          type: "LEAD_ASSIGNED",
          title: `Lead pindah PIC: ${lead.displayName}`,
          body:
            action === "takeover"
              ? `Diambil alih ${user.name}${autoReason ? ` — ${autoReason.toLowerCase()}` : ""}`
              : `Dipindahkan ${user.name} ke PIC lain${reason ? ` — ${reason}` : ""}`,
          entityType: "lead",
          entityId: id,
          deepLink: `/marketing/leads/${id}`,
          dedupeKey: `unassign:${created.id}`,
          status: "PENDING",
        },
      })
    }
    return created
  })

  await logAudit({
    actorUserId: user.id,
    action: `marketing.assignment.${action}`,
    entityType: "lead",
    entityId: id,
    before: { previousPicUserId: activeAssignment?.assignedUserId ?? null },
    after: { assignmentId: assignment.id, assignedUserId: targetUserId },
    metadata: (() => {
      const finalReason = autoReason ?? reason
      return finalReason ? { reason: finalReason } : undefined
    })(),
  })

  return NextResponse.json({ assignment: { id: assignment.id, assignedUserId: targetUserId } }, { status: 201 })
}
