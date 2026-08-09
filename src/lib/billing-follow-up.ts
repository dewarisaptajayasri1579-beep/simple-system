import type { Prisma } from "@prisma/client"

type Db = Prisma.TransactionClient

export type BillingFollowUpRefType = "domain" | "server" | "maintenance"

export interface BillingFollowUpRef {
  refType: BillingFollowUpRefType
  refId: string
}

const DAY_MS = 24 * 60 * 60 * 1000
export const INVOICE_DEADLINE_DAYS = 3
export const RESPONSE_DEADLINE_DAYS = 3
export const PAYMENT_DEADLINE_DAYS = 2

/** Dipanggil tiap Dashboard di-load (lihat src/app/dashboard/page.tsx) — untuk tiap item yang
 *  lagi jatuh tempo (bucket != "safe") dan punya Client, pastikan ada 1 record BillingFollowUp
 *  aktif ("siklus" tagihan ini lagi jalan). Idempotent: cuma bikin yang belum ada, aman dipanggil
 *  berkali-kali tanpa duplikasi (lihat sop.txt buat konteks SLA-nya). */
export async function ensureBillingFollowUps(db: Db, items: BillingFollowUpRef[]) {
  if (items.length === 0) return

  const existing = await db.billingFollowUp.findMany({
    where: { paidRecordedAt: null, OR: items.map((i) => ({ refType: i.refType, refId: i.refId })) },
    select: { refType: true, refId: true },
  })
  const existingKeys = new Set(existing.map((e) => `${e.refType}:${e.refId}`))
  const missing = items.filter((i) => !existingKeys.has(`${i.refType}:${i.refId}`))
  if (missing.length === 0) return

  const now = new Date()
  await db.billingFollowUp.createMany({
    data: missing.map((i) => ({ refType: i.refType, refId: i.refId, dueAppearedAt: now })),
  })
}

export type BillingFollowUpStage = "belum_ditagih" | "menunggu_jawaban" | "menunggu_bayar"

export interface BillingFollowUpSla {
  stage: BillingFollowUpStage
  deadlineAt: string
  overdue: boolean
  daysOverdue: number // 0 kalau belum lewat deadline
  promisedPayAt: string | null
}

export interface BillingFollowUpRecordLike {
  dueAppearedAt: Date
  invoicedAt: Date | null
  clientRespondedAt: Date | null
  promisedPayAt: Date | null
  paidRecordedAt: Date | null
}

/** Hitung tahap SLA sekarang + apakah sudah lewat deadline tahap itu. Return null kalau siklus
 *  sudah selesai (paidRecordedAt terisi) — row itu tidak perlu badge lagi. */
export function computeSlaStatus(record: BillingFollowUpRecordLike, now: Date = new Date()): BillingFollowUpSla | null {
  if (record.paidRecordedAt) return null

  let stage: BillingFollowUpStage
  let deadline: Date

  if (!record.invoicedAt) {
    stage = "belum_ditagih"
    deadline = new Date(record.dueAppearedAt.getTime() + INVOICE_DEADLINE_DAYS * DAY_MS)
  } else if (!record.clientRespondedAt) {
    stage = "menunggu_jawaban"
    deadline = new Date(record.invoicedAt.getTime() + RESPONSE_DEADLINE_DAYS * DAY_MS)
  } else {
    stage = "menunggu_bayar"
    const anchor = record.promisedPayAt ?? record.clientRespondedAt
    deadline = new Date(anchor.getTime() + PAYMENT_DEADLINE_DAYS * DAY_MS)
  }

  const overdue = now.getTime() > deadline.getTime()
  const daysOverdue = overdue ? Math.floor((now.getTime() - deadline.getTime()) / DAY_MS) : 0

  return {
    stage,
    deadlineAt: deadline.toISOString(),
    overdue,
    daysOverdue,
    promisedPayAt: record.promisedPayAt ? record.promisedPayAt.toISOString() : null,
  }
}

export interface OverdueBillingFollowUp {
  refType: BillingFollowUpRefType
  refId: string
  sla: BillingFollowUpSla
}

/** Semua siklus aktif yang lagi lewat deadline tahap-nya sekarang — dipakai buat proaktifin SLA
 *  (badge nav Dashboard & laporan WA pagi/sore), bukan cuma nunggu staf buka halaman. Caller yang
 *  resolve nama item/client (butuh query Domain/Server/Maintenance terpisah per refType). */
export async function listOverdueBillingFollowUps(db: Db, now: Date = new Date()): Promise<OverdueBillingFollowUp[]> {
  const active = await db.billingFollowUp.findMany({ where: { paidRecordedAt: null } })
  return active
    .map((record) => ({ refType: record.refType as BillingFollowUpRefType, refId: record.refId, sla: computeSlaStatus(record, now) }))
    .filter((r): r is OverdueBillingFollowUp => r.sla !== null && r.sla.overdue)
    .sort((a, b) => b.sla.daysOverdue - a.sla.daysOverdue)
}

export const SLA_STAGE_LABEL: Record<BillingFollowUpStage, string> = {
  belum_ditagih: "Belum ditagih",
  menunggu_jawaban: "Menunggu jawaban Client",
  menunggu_bayar: "Menunggu pembayaran",
}

export interface BillingFollowUpStageTiming {
  label: string
  late: boolean
}

/** Evaluasi retrospektif buat siklus yang SUDAH selesai (paidRecordedAt terisi) — dipakai laporan
 *  riwayat SLA (lihat /laporan/tindak-lanjut-tagihan), bukan badge Dashboard (itu pakai
 *  computeSlaStatus di atas, cuma buat siklus aktif). Tahap yang timestamp-nya nggak lengkap
 *  (mis. invoice dibuat manual tanpa lewat "Tagih Sekarang") dilewati, bukan dianggap telat. */
export function evaluateClosedCycle(record: BillingFollowUpRecordLike): { late: boolean; stages: BillingFollowUpStageTiming[] } | null {
  if (!record.paidRecordedAt) return null

  const stages: BillingFollowUpStageTiming[] = []
  if (record.invoicedAt) {
    stages.push({ label: "Bikin Tagihan", late: record.invoicedAt.getTime() - record.dueAppearedAt.getTime() > INVOICE_DEADLINE_DAYS * DAY_MS })
  }
  if (record.invoicedAt && record.clientRespondedAt) {
    stages.push({
      label: "Jawaban Client",
      late: record.clientRespondedAt.getTime() - record.invoicedAt.getTime() > RESPONSE_DEADLINE_DAYS * DAY_MS,
    })
  }
  if (record.clientRespondedAt) {
    const anchor = record.promisedPayAt ?? record.clientRespondedAt
    stages.push({ label: "Pembayaran", late: record.paidRecordedAt.getTime() - anchor.getTime() > PAYMENT_DEADLINE_DAYS * DAY_MS })
  }

  return { late: stages.some((s) => s.late), stages }
}
