import { NextResponse } from "next/server"

import { getApiUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"
import { isPrincipleBillableForMonth, resolvePrincipleMonth } from "@/lib/principle-billing"

/** Daftar Invoice Over Principle (header lampiran) — `?companyId=` opsional. */
export async function GET(request: Request) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })

  const companyId = new URL(request.url).searchParams.get("companyId")
  const rows = await prisma.principleInvoice.findMany({
    where: companyId ? { companyId } : undefined,
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      company: { select: { id: true, name: true } },
      invoice: { select: { id: true, invoiceNumber: true, totalAmount: true, status: true, postStatus: true, issuedAt: true } },
      _count: { select: { items: true } },
    },
  })
  return NextResponse.json(rows)
}

/**
 * Tandai sebuah Invoice yang BARU dibuat sebagai "Invoice Over Principle" + simpan snapshot
 * daftar principle-nya sebagai lampiran.
 *
 * Invoice-nya sendiri sengaja TIDAK dibuat di sini, tapi lewat POST /api/invoices seperti invoice
 * lain (dipanggil berurutan dari UI) — supaya alur nomor invoice, BillingFollowUp, dan pedoman
 * "invoice tidak menjurnal apa pun" tetap satu jalur, tidak ada logika pembukuan yang dikembar.
 */
export async function POST(request: Request) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })
  if (!["owner", "admin", "direktur"].includes(user.role)) {
    return NextResponse.json({ error: "Cuma Owner/Direktur/Admin yang bisa membuat invoice principle" }, { status: 403 })
  }

  const body = (await request.json().catch(() => null)) as
    | { invoiceId?: string; companyId?: string; periodMonth?: string }
    | null
  const invoiceId = body?.invoiceId
  const companyId = body?.companyId
  if (!invoiceId || !companyId) return NextResponse.json({ error: "invoiceId & companyId wajib" }, { status: 400 })
  const periodMonth = resolvePrincipleMonth(body?.periodMonth)

  const [invoice, company] = await Promise.all([
    prisma.invoice.findUnique({ where: { id: invoiceId }, select: { id: true } }),
    prisma.principleCompany.findUnique({
      where: { id: companyId },
      include: { principles: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }] } },
    }),
  ])
  if (!invoice) return NextResponse.json({ error: "Invoice tidak ditemukan" }, { status: 404 })
  if (!company) return NextResponse.json({ error: "Perusahaan tidak ditemukan" }, { status: 404 })

  const billable = company.principles.filter((p) => isPrincipleBillableForMonth(p, periodMonth))

  const created = await prisma.principleInvoice.create({
    data: {
      invoiceId,
      companyId,
      periodMonth,
      principleCount: billable.length,
      createdById: user.id,
      items: {
        create: billable.map((p, i) => ({
          principleId: p.id,
          name: p.name,
          appUrl: p.appUrl,
          sortOrder: i + 1,
        })),
      },
    },
    include: { items: { orderBy: { sortOrder: "asc" } } },
  })

  return NextResponse.json(created, { status: 201 })
}
