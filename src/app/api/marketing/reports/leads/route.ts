import { NextResponse } from "next/server"
import { Prisma } from "@prisma/client"

import { getMarketingApiUser } from "@/lib/marketing/auth"
import { resolveMarketingRole } from "@/lib/marketing/permissions"
import { getWorkingHoursConfig, workingMsBetweenSync } from "@/lib/marketing/working-hours"
import { resolveReportPeriod } from "@/lib/report-period"
import { prisma } from "@/lib/prisma"

/**
 * GET /api/marketing/reports/leads — Laporan Marketing tab "Daftar Lead": 1 baris per lead,
 * bukan angka agregat seperti 3 tab lainnya. Isinya kolom operasional yang dipakai buat evaluasi
 * harian: kapan masuk, siapa Sales-nya, berapa lama baru dibalas, jadwal follow up berikutnya,
 * catatan terakhir, dan tindak lanjut terakhir.
 *
 * `?format=csv` mengembalikan CSV (dibuka di Excel) dengan kolom yang sama persis.
 *
 * SEMUA data per-baris diambil batch (satu findMany/groupBy untuk seluruh halaman lalu
 * di-group ke Map di JS) — tidak ada satu pun query di dalam loop, lihat CLAUDE.md.
 */

const MAX_ROWS_PAGE = 100
const MAX_ROWS_CSV = 1000
/** Batas jumlah kondisi OR per query pencarian balasan pertama — dipecah supaya tidak bikin satu
 *  SQL raksasa saat CSV menarik ribuan percakapan. */
const OR_CHUNK = 200

export async function GET(request: Request) {
  const user = await getMarketingApiUser()
  if (!user) return NextResponse.json({ error: "Tidak punya akses modul Marketing" }, { status: 401 })

  const sp = new URL(request.url).searchParams
  const { from, to, fromIso, toIso } = resolveReportPeriod({ from: sp.get("from") || undefined, to: sp.get("to") || undefined })
  const marketingRole = await resolveMarketingRole(user.id, user.role)
  const isCsv = sp.get("format") === "csv"
  const page = Math.max(1, Number(sp.get("page")) || 1)
  const limit = isCsv ? MAX_ROWS_CSV : Math.min(MAX_ROWS_PAGE, Math.max(1, Number(sp.get("limit")) || 50))

  const salesId = sp.get("salesId") || null
  const segmentId = sp.get("segmentId") || null
  const sourceId = sp.get("sourceId") || null
  const outcome = sp.get("outcome") || null

  // "Lead masuk pada tanggal X" = Lead.firstContactAt (kontak pertama), BUKAN createdAt — beda
  // buat lead yang baru diinput manual beberapa hari setelah ketemu di pameran/referral. Laporan
  // Volume sengaja tetap pakai createdAt (lihat catatannya di sana) karena yang diukur di situ
  // "berapa lead masuk ke sistem per hari", bukan "kapan leadnya pertama kontak".
  const where: Prisma.LeadWhereInput = { firstContactAt: { gte: from, lte: to } }
  if (segmentId) where.segmentId = segmentId
  if (sourceId) where.sourceId = sourceId
  if (outcome) where.outcome = outcome
  // SALES cuma boleh melihat lead miliknya sendiri — sejajar dengan aturan di list Lead/Inbox.
  if (marketingRole === "SALES") where.assignments = { some: { isActive: true, assignedUserId: user.id } }
  else if (salesId) where.assignments = { some: { isActive: true, assignedUserId: salesId } }

  const [total, leads] = await Promise.all([
    prisma.lead.count({ where }),
    prisma.lead.findMany({
      where,
      orderBy: { firstContactAt: "desc" },
      skip: isCsv ? 0 : (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        displayName: true,
        companyName: true,
        whatsappNumber: true,
        firstContactAt: true,
        temperature: true,
        currentActivityStage: true,
        priorityScore: true,
        outcome: true,
        dealValue: true,
        note: true,
        priorityPinnedAt: true,
        priorityPinNote: true,
        segment: { select: { name: true } },
        source: { select: { name: true } },
        lostReason: { select: { name: true } },
      },
    }),
  ])

  const leadIds = leads.map((l) => l.id)
  if (leadIds.length === 0) {
    const empty = { rows: [], page, limit, total, hasMore: false, filters: { from: fromIso, to: toIso } }
    return isCsv ? csvResponse([], fromIso, toIso) : NextResponse.json(empty)
  }

  const [assignments, openFollowUps, doneFollowUps, lastActivities, lastNotes, conversations, whCfg] = await Promise.all([
    prisma.leadAssignment.findMany({
      where: { leadId: { in: leadIds }, isActive: true },
      select: { leadId: true, assignedUser: { select: { id: true, name: true } } },
    }),
    // Follow up OPEN terdekat per lead — diambil semua yang OPEN lalu dipilih yang paling awal di
    // JS (jumlahnya kecil: cuma yang masih terbuka, bukan seluruh riwayat).
    prisma.leadFollowUp.findMany({
      where: { leadId: { in: leadIds }, status: "OPEN" },
      orderBy: { scheduledAt: "asc" },
      select: { leadId: true, scheduledAt: true, purpose: true, assignedUser: { select: { name: true } } },
    }),
    // Follow up SELESAI terakhir per lead — `distinct` bikin database yang memilih 1 baris
    // teratas per lead, jadi tidak perlu narik seluruh riwayat ke memori.
    prisma.leadFollowUp.findMany({
      where: { leadId: { in: leadIds }, status: "COMPLETED" },
      orderBy: [{ leadId: "asc" }, { completedAt: "desc" }],
      distinct: ["leadId"],
      select: { leadId: true, completedAt: true, purpose: true, resultNote: true, isOnTime: true, resultType: { select: { name: true } } },
    }),
    prisma.leadActivity.findMany({
      where: { leadId: { in: leadIds }, isVoid: false },
      orderBy: [{ leadId: "asc" }, { occurredAt: "desc" }],
      distinct: ["leadId"],
      select: { leadId: true, occurredAt: true, note: true, activityType: { select: { name: true } }, actorUser: { select: { name: true } } },
    }),
    prisma.leadNote.findMany({
      where: { leadId: { in: leadIds } },
      orderBy: [{ leadId: "asc" }, { createdAt: "desc" }],
      distinct: ["leadId"],
      select: { leadId: true, body: true, createdAt: true, authorUser: { select: { name: true } } },
    }),
    prisma.conversation.findMany({ where: { leadId: { in: leadIds } }, select: { id: true, leadId: true } }),
    getWorkingHoursConfig(),
  ])

  // ——— Response time = chat customer PERTAMA masuk → balasan Sales pertama sesudahnya.
  // Dihitung 2 langkah supaya tetap batch: (1) kapan inbound pertama tiap percakapan,
  // (2) outbound pertama yang lebih baru dari inbound itu. Langkah 2 pakai OR per percakapan
  // (ambangnya beda-beda tiap percakapan) + `distinct` supaya database yang memilih 1 baris
  // teratas, bukan menarik semua pesan ke memori.
  const convByLead = new Map<string, string[]>()
  for (const c of conversations) convByLead.set(c.leadId, [...(convByLead.get(c.leadId) ?? []), c.id])
  const convIds = conversations.map((c) => c.id)

  const firstInboundRows = convIds.length
    ? await prisma.message.groupBy({
        by: ["conversationId"],
        where: { conversationId: { in: convIds }, direction: "INBOUND" },
        _min: { sentAt: true },
      })
    : []
  const firstInboundByConv = new Map<string, Date>()
  for (const r of firstInboundRows) if (r._min.sentAt) firstInboundByConv.set(r.conversationId, r._min.sentAt)

  const firstReplyByConv = new Map<string, Date>()
  const convsWithInbound = [...firstInboundByConv.entries()]
  for (let i = 0; i < convsWithInbound.length; i += OR_CHUNK) {
    const chunk = convsWithInbound.slice(i, i + OR_CHUNK)
    const replies = await prisma.message.findMany({
      where: { OR: chunk.map(([convId, at]) => ({ conversationId: convId, direction: "OUTBOUND", sentAt: { gt: at } })) },
      orderBy: [{ conversationId: "asc" }, { sentAt: "asc" }],
      distinct: ["conversationId"],
      select: { conversationId: true, sentAt: true },
    })
    for (const r of replies) firstReplyByConv.set(r.conversationId, r.sentAt)
  }

  const picByLead = new Map(assignments.map((a) => [a.leadId, a.assignedUser]))
  const nextFuByLead = new Map<string, (typeof openFollowUps)[number]>()
  for (const f of openFollowUps) if (!nextFuByLead.has(f.leadId)) nextFuByLead.set(f.leadId, f) // sudah urut scheduledAt asc
  const doneFuByLead = new Map(doneFollowUps.map((f) => [f.leadId, f]))
  const actByLead = new Map(lastActivities.map((a) => [a.leadId, a]))
  const noteByLead = new Map(lastNotes.map((n) => [n.leadId, n]))

  const rows = leads.map((l) => {
    // Lead bisa punya >1 percakapan (mis. pernah chat dari 2 nomor) — ambil yang paling awal.
    let firstInbound: Date | null = null
    let firstReply: Date | null = null
    for (const convId of convByLead.get(l.id) ?? []) {
      const inb = firstInboundByConv.get(convId)
      if (inb && (!firstInbound || inb < firstInbound)) {
        firstInbound = inb
        firstReply = firstReplyByConv.get(convId) ?? null
      }
    }
    const responseMs = firstInbound && firstReply ? workingMsBetweenSync(firstInbound, firstReply, whCfg) : null

    const fu = nextFuByLead.get(l.id)
    const doneFu = doneFuByLead.get(l.id)
    const act = actByLead.get(l.id)
    const note = noteByLead.get(l.id)

    return {
      id: l.id,
      masukAt: l.firstContactAt.toISOString(),
      nama: l.displayName,
      perusahaan: l.companyName,
      whatsappNumber: l.whatsappNumber,
      sales: picByLead.get(l.id)?.name ?? null,
      // Chat pertama masuk bisa beda dari "masuk" kalau lead-nya diinput manual duluan.
      chatPertamaAt: firstInbound?.toISOString() ?? null,
      dibalasAt: firstReply?.toISOString() ?? null,
      responseMinutes: responseMs == null ? null : Math.round(responseMs / 60000),
      jadwalFuAt: fu?.scheduledAt.toISOString() ?? null,
      jadwalFuPurpose: fu?.purpose ?? null,
      jadwalFuSales: fu?.assignedUser?.name ?? null,
      catatan: note?.body ?? l.note ?? null,
      // Kalau isinya jatuh balik ke Lead.note (catatan singkat yang tidak bertimestamp), tanggal &
      // penulisnya memang tidak ada — dibedakan lewat catatanAt null, bukan tanggal karangan.
      catatanAt: note?.createdAt.toISOString() ?? null,
      catatanOleh: note?.authorUser?.name ?? null,
      aktivitasTerakhir: act ? act.activityType.name : null,
      aktivitasTerakhirAt: act?.occurredAt.toISOString() ?? null,
      aktivitasTerakhirNote: act?.note ?? null,
      aktivitasTerakhirOleh: act?.actorUser?.name ?? null,
      hasilFuTerakhir: doneFu?.resultType?.name ?? null,
      hasilFuTerakhirAt: doneFu?.completedAt?.toISOString() ?? null,
      hasilFuTerakhirNote: doneFu?.resultNote ?? null,
      hasilFuTepatWaktu: doneFu?.isOnTime ?? null,
      segmen: l.segment?.name ?? null,
      sumber: l.source?.name ?? null,
      temperature: l.temperature,
      stage: l.currentActivityStage,
      priorityScore: Math.round(l.priorityScore),
      priorityPinnedAt: l.priorityPinnedAt?.toISOString() ?? null,
      priorityPinNote: l.priorityPinNote,
      outcome: l.outcome,
      lostReason: l.lostReason?.name ?? null,
      dealValue: l.dealValue,
      umurHari: Math.floor((Date.now() - l.firstContactAt.getTime()) / 86400000),
    }
  })

  if (isCsv) return csvResponse(rows, fromIso, toIso)
  return NextResponse.json({
    rows,
    page,
    limit,
    total,
    hasMore: page * limit < total,
    filters: { from: fromIso, to: toIso },
  })
}

interface Row {
  masukAt: string
  nama: string
  perusahaan: string | null
  whatsappNumber: string
  sales: string | null
  chatPertamaAt: string | null
  dibalasAt: string | null
  responseMinutes: number | null
  jadwalFuAt: string | null
  jadwalFuPurpose: string | null
  jadwalFuSales: string | null
  catatan: string | null
  catatanAt: string | null
  catatanOleh: string | null
  aktivitasTerakhir: string | null
  aktivitasTerakhirAt: string | null
  aktivitasTerakhirNote: string | null
  aktivitasTerakhirOleh: string | null
  hasilFuTerakhir: string | null
  hasilFuTerakhirAt: string | null
  hasilFuTerakhirNote: string | null
  hasilFuTepatWaktu: boolean | null
  segmen: string | null
  sumber: string | null
  temperature: string
  stage: string
  priorityScore: number
  priorityPinnedAt: string | null
  priorityPinNote: string | null
  outcome: string
  lostReason: string | null
  dealValue: number | null
  umurHari: number
}

const STAGE_LABEL: Record<string, string> = {
  NONE: "-",
  DISCUSSION: "Diskusi",
  ZOOM_DEMO: "Zoom/Demo",
  PROPOSAL: "Penawaran",
  NEGOTIATION: "Negosiasi",
}

function fmtWib(iso: string | null, withTime = true) {
  if (!iso) return ""
  const d = new Date(iso)
  return d.toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  })
}

/** Excel di Windows membaca CSV pakai encoding lokal, bukan UTF-8, kecuali filenya diawali BOM —
 *  tanpa ini nama ber-aksen/emoji jadi rusak. Pemisahnya titik-koma (bukan koma) karena Excel
 *  Indonesia memakai koma sebagai desimal, jadi CSV berkoma tertumpuk jadi satu kolom. */
function csvResponse(rows: Row[], fromIso: string, toIso: string) {
  const header = [
    "Tanggal & Jam Masuk",
    "Nama",
    "Perusahaan",
    "No WA",
    "Sales",
    "Chat Pertama Masuk",
    "Dibalas",
    "Response Time (menit)",
    "Jadwal FU",
    "Tujuan FU",
    "FU Untuk",
    "Catatan",
    "Tanggal Catatan",
    "Penulis Catatan",
    "Aktivitas Terakhir",
    "Tanggal Aktivitas",
    "Catatan Aktivitas",
    "Pelaku Aktivitas",
    "Hasil FU Terakhir",
    "Tanggal Hasil FU",
    "Catatan Hasil FU",
    "Segmen",
    "Sumber",
    "Temperatur",
    "Tahap",
    "Skor Prioritas",
    "Prioritas SPV",
    "Status",
    "Alasan Lost",
    "Nilai Deal",
    "Umur (hari)",
  ]

  const esc = (v: unknown) => {
    if (v == null) return ""
    const s = String(v).replace(/"/g, '""').replace(/\r?\n/g, " ")
    return /[";]/.test(s) ? `"${s}"` : s
  }

  const lines = [header.join(";")]
  for (const r of rows) {
    lines.push(
      [
        fmtWib(r.masukAt),
        r.nama,
        r.perusahaan,
        // Diawali apostrof supaya Excel tidak membaca nomor WA sebagai angka lalu membuang angka 0
        // di depan / mengubahnya jadi notasi ilmiah.
        r.whatsappNumber ? `'${r.whatsappNumber}` : "",
        r.sales,
        fmtWib(r.chatPertamaAt),
        fmtWib(r.dibalasAt),
        r.responseMinutes,
        fmtWib(r.jadwalFuAt),
        r.jadwalFuPurpose,
        r.jadwalFuSales,
        r.catatan,
        fmtWib(r.catatanAt),
        r.catatanOleh,
        r.aktivitasTerakhir,
        fmtWib(r.aktivitasTerakhirAt),
        r.aktivitasTerakhirNote,
        r.aktivitasTerakhirOleh,
        r.hasilFuTerakhir ? `${r.hasilFuTerakhir}${r.hasilFuTepatWaktu === false ? " (telat)" : ""}` : "",
        fmtWib(r.hasilFuTerakhirAt),
        r.hasilFuTerakhirNote,
        r.segmen,
        r.sumber,
        r.temperature,
        STAGE_LABEL[r.stage] ?? r.stage,
        r.priorityScore,
        r.priorityPinnedAt ? (r.priorityPinNote || "Ya") : "",
        r.outcome,
        r.lostReason,
        r.dealValue,
        r.umurHari,
      ]
        .map(esc)
        .join(";")
    )
  }

  return new NextResponse("﻿" + lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="laporan-lead-${fromIso}-sd-${toIso}.csv"`,
    },
  })
}
