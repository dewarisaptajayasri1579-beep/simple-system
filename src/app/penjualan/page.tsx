import Link from "next/link"
import { AppLayout } from "@/components/layout/AppLayout"
import { Button } from "@/components/ui"
import { InvoiceListTable } from "@/components/penjualan/InvoiceListTable"
import { getCurrentUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"
import { Plus } from "lucide-react"

export default async function PenjualanPage() {
  const user = await getCurrentUser()

  const invoices = await prisma.invoice.findMany({
    include: {
      client: true,
      payments: { where: { OR: [{ paymentId: null }, { payment: { is: { postStatus: "posted" } } }] } },
    },
    orderBy: { invoiceNumber: "desc" },
  })

  return (
    <AppLayout userName={user.name} userRole={user.role}>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">Invoice</h1>
            <p className="text-xs sm:text-sm text-slate-600 font-medium mt-1">Daftar invoice — jasa &amp; barang.</p>
          </div>
          <Link href="/penjualan/baru">
            <Button variant="primary" leftIcon={<Plus className="w-4 h-4" />}>
              Buat Invoice
            </Button>
          </Link>
        </div>

        <InvoiceListTable
          rows={invoices.map((inv) => ({
            id: inv.id,
            invoiceNumber: inv.invoiceNumber,
            clientName: inv.client.name,
            issuedAt: inv.issuedAt ? inv.issuedAt.toISOString() : null,
            totalAmount: inv.totalAmount,
            remaining: inv.totalAmount - inv.payments.reduce((sum, p) => sum + p.amount, 0),
            status: inv.status,
            postStatus: inv.postStatus as "draft" | "posted" | "voided",
          }))}
        />
      </div>
    </AppLayout>
  )
}
