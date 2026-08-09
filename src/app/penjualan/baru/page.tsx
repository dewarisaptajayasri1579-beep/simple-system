import { AppLayout } from "@/components/layout/AppLayout"
import { InvoiceForm } from "@/components/penjualan/InvoiceForm"
import { getCurrentUser } from "@/lib/current-user"

export default async function NewInvoicePage({
  searchParams,
}: {
  searchParams: Promise<{ clientId?: string; description?: string; amount?: string; domainId?: string; serverId?: string }>
}) {
  const user = await getCurrentUser()
  const params = await searchParams

  return (
    <AppLayout userName={user.name} userRole={user.role}>
      <div className="space-y-6 max-w-3xl mx-auto">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">Buat Invoice</h1>
          <p className="text-xs sm:text-sm text-slate-600 font-medium mt-1">Pilih client, tambah item/jasa, atur diskon &amp; PPN.</p>
        </div>
        <InvoiceForm
          prefill={{
            clientId: params.clientId,
            description: params.description,
            amount: params.amount ? Number(params.amount) : undefined,
            domainId: params.domainId,
            serverId: params.serverId,
          }}
        />
      </div>
    </AppLayout>
  )
}
