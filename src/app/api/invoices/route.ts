import { NextResponse } from "next/server"

import { getApiUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"
import { generateInvoiceNumber } from "@/lib/invoice-number"
import { COA_CODE } from "@/lib/accounting/coa-seed"

export async function GET(request: Request) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const status = searchParams.get("status")
  const clientId = searchParams.get("clientId")
  const postStatus = searchParams.get("postStatus")

  // postStatus tidak difilter default — endpoint ini dipakai juga oleh menu manajemen Penjualan
  // yang perlu menampilkan draft. Consumer yang butuh "hanya invoice riil" (mis. picker piutang
  // di form Pembayaran) kirim eksplisit ?postStatus=posted.
  const invoices = await prisma.invoice.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(clientId ? { clientId } : {}),
      ...(postStatus ? { postStatus } : {}),
    },
    include: {
      client: true,
      payments: { where: { OR: [{ paymentId: null }, { payment: { is: { postStatus: "posted" } } }] } },
    },
    orderBy: { issuedAt: "asc" },
  })

  return NextResponse.json(invoices)
}

interface LineInput {
  itemId?: string | null
  description: string
  qty: number
  unitPrice: number
  unitCost?: number
  discountAmount?: number
}

export async function POST(request: Request) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })

  const body = await request.json().catch(() => null)
  const clientId = typeof body?.clientId === "string" ? body.clientId : ""
  const lines: LineInput[] = Array.isArray(body?.lines) ? body.lines : []

  if (!clientId) return NextResponse.json({ error: "Client wajib dipilih" }, { status: 400 })
  if (lines.length === 0) return NextResponse.json({ error: "Minimal 1 baris item" }, { status: 400 })

  // Kalau invoice ini dibuat dari "Tagih Sekarang" (Dashboard Domain/Server/Maintenance) — simpan
  // link-nya supaya form Pembayaran nanti bisa otomatis pilih Bayar Domain/Server/Maintenance
  // tanpa staf pilih manual, dan supaya BillingFollowUp (SLA tindak-lanjut tagihan, lihat
  // sop.txt) bisa dikaitkan balik ke item asalnya.
  const domainId = typeof body?.domainId === "string" && body.domainId ? body.domainId : null
  const serverId = typeof body?.serverId === "string" && body.serverId ? body.serverId : null
  const maintenanceId = typeof body?.maintenanceId === "string" && body.maintenanceId ? body.maintenanceId : null
  const costLinkType = domainId ? "domain" : serverId ? "server" : maintenanceId ? "maintenance" : null
  const costLinkId = domainId ?? serverId ?? maintenanceId

  // Kalau invoice ini narik 1 termin Project dari panel "Tagihan Belum Ditagih" — beda dari
  // costLinkType di atas (itu buat auto-pilih Bayar Domain/Server di Pembayaran, Project tidak
  // punya alur "Bayar Project" serupa). Cuma dipakai buat: (1) resolve akun Pendapatan Project,
  // (2) link balik ProjectPaymentSchedule.invoiceId, (3) BillingFollowUp refType "project_termin"
  // (skip tahap reminder, sama seperti generateTerminInvoice — lihat lib/project-termin.ts).
  const projectScheduleId = typeof body?.projectScheduleId === "string" && body.projectScheduleId ? body.projectScheduleId : null

  const settings = await prisma.settings.upsert({ where: { id: "default" }, update: {}, create: { id: "default" } })

  const ppnEnabled = Boolean(body?.ppnEnabled)
  const ppnRate = ppnEnabled ? Number(body?.ppnRate) || settings.defaultPpnRate : 0
  // "Include PPN": nominal baris item SUDAH termasuk PPN (mis. Nilai Pekerjaan kontrak
  // include PPN 11%) — di-breakdown jadi DPP+PPN, bukan ditambah PPN baru di atas afterDiscount.
  const ppnInclusive = ppnEnabled && Boolean(body?.ppnInclusive)
  const invoiceDiscount = Number(body?.discountAmount) || 0
  // DP (Rencana) — CATATAN saja (lihat Invoice.dpAmount di schema.prisma), tidak ada efek
  // kas/jurnal. Boleh diisi langsung saat create, sama field yang nanti diedit klik-langsung
  // lewat PATCH /api/invoices/[id]/dp.
  const dpAmount = Math.max(0, Number(body?.dpAmount) || 0)

  const preparedLines = lines.map((line) => {
    const qty = Number(line.qty) || 1
    const unitPrice = Number(line.unitPrice) || 0
    const unitCost = Number(line.unitCost) || 0
    const discountAmount = Number(line.discountAmount) || 0
    const lineTotal = Math.max(0, qty * unitPrice - discountAmount)
    return {
      itemId: line.itemId || null,
      description: line.description || "(tanpa keterangan)",
      qty,
      unitPrice,
      unitCost,
      discountAmount,
      lineTotal,
    }
  })

  const subtotal = preparedLines.reduce((sum, l) => sum + l.qty * l.unitPrice, 0)
  const totalLineDiscount = preparedLines.reduce((sum, l) => sum + l.discountAmount, 0)
  const totalCost = preparedLines.reduce((sum, l) => sum + l.qty * l.unitCost, 0)
  const discountAmount = totalLineDiscount + invoiceDiscount
  const afterDiscount = Math.max(0, subtotal - discountAmount)
  const ppnAmount = !ppnEnabled
    ? 0
    : ppnInclusive
      ? Math.round(afterDiscount * (ppnRate / (100 + ppnRate)))
      : Math.round(afterDiscount * (ppnRate / 100))
  const totalAmount = ppnInclusive ? afterDiscount : afterDiscount + ppnAmount

  try {
    const invoiceNumber = await generateInvoiceNumber()

    const invoice = await prisma.$transaction(async (tx) => {
      // Kalau ditautkan ke termin Project, klaim jadwalnya dulu secara atomic (where invoiceId:
      // null) — jaga-jaga kepentok bareng cron H-3 / tombol "Generate Invoice Sekarang" yang
      // barengan generate untuk termin yang sama.
      if (projectScheduleId) {
        const claimed = await tx.projectPaymentSchedule.updateMany({
          where: { id: projectScheduleId, invoiceId: null },
          data: { invoiceGeneratedAt: new Date() },
        })
        if (claimed.count === 0) throw new Error("Termin ini sudah ada invoice-nya atau tidak ditemukan")
      }

      const created = await tx.invoice.create({
        data: {
          invoiceNumber,
          clientId,
          issuedAt: body?.issuedAt ? new Date(body.issuedAt) : undefined,
          dueDate: body?.dueDate ? new Date(body.dueDate) : null,
          subtotal,
          discountAmount,
          ppnEnabled,
          ppnRate,
          ppnAmount,
          totalAmount,
          totalCost,
          notes: body?.notes || null,
          dpAmount,
          createdById: user.id,
          revenueCoaCode: projectScheduleId ? COA_CODE.pendapatanProject : null,
          costLinkType,
          costLinkId,
          lines: { create: preparedLines },
        },
        include: { lines: true, client: true },
      })

      // Tahap 1 SLA tindak-lanjut tagihan (lihat sop.txt/billing-follow-up.ts) — invoice ini
      // dibuat dari "Tagih Sekarang", jadi tandai siklus BillingFollowUp aktif punya item itu
      // sebagai "sudah ditagih". updateMany dipakai (bukan update) supaya tidak error kalau
      // record-nya belum sempat dibuat (mis. invoice dibuat manual tanpa lewat Dashboard).
      if (costLinkType && costLinkId) {
        await tx.billingFollowUp.updateMany({
          where: { refType: costLinkType, refId: costLinkId, paidRecordedAt: null, invoicedAt: null },
          data: { invoicedAt: created.issuedAt, invoiceId: created.id, invoicedById: user.id },
        })
      } else if (!projectScheduleId) {
        // Invoice manual (tidak terkait Domain/Server/Maintenance/Project) — tetap masuk siklus
        // log histori penagihan yang sama, cuma langsung mulai dari "invoiced" (tidak ada tahap
        // reminder, lihat catatan dueAppearedAt di schema.prisma).
        await tx.billingFollowUp.create({
          data: { refType: "invoice", refId: created.id, invoicedAt: created.issuedAt, invoicedById: user.id, invoiceId: created.id },
        })
      }

      // Termin Project yang ditarik dari panel "Tagihan Belum Ditagih" — link balik ke jadwalnya
      // + BillingFollowUp "project_termin" (skip tahap reminder), sama persis bookkeeping yang
      // dilakukan generateTerminInvoice (auto H-3 / tombol "Generate Invoice Sekarang").
      if (projectScheduleId) {
        await tx.projectPaymentSchedule.update({
          where: { id: projectScheduleId },
          data: { invoiceId: created.id },
        })
        await tx.billingFollowUp.create({
          data: { refType: "project_termin", refId: projectScheduleId, invoicedAt: created.issuedAt, invoicedById: user.id, invoiceId: created.id },
        })
      }

      // Invoice ini SENGAJA TIDAK bikin jurnal apa pun (Piutang, Pendapatan, MAUPUN HPP) —
      // Invoice cuma pencatatan Piutang (field biasa di tabel Invoice/InvoicePayment, bukan
      // akun GL). Semuanya (Pendapatan, PPN, HPP) baru diakui SEKALIGUS saat Payment-nya
      // diposting — lihat invoicePaymentLines di /api/payments. Lihat pedoman_akunting.md.

      return created
    })

    return NextResponse.json(invoice, { status: 201 })
  } catch (err) {
    console.error("[POST /api/invoices]", err)
    return NextResponse.json({ error: err instanceof Error ? err.message : "Gagal membuat invoice" }, { status: 500 })
  }
}
