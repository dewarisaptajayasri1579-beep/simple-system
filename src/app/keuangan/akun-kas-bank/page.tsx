import { AppLayout } from "@/components/layout/AppLayout"
import { AccountList } from "@/components/keuangan/AccountList"
import { AddAccountButton } from "@/components/keuangan/AddAccountButton"
import { requirePageRole } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"

export default async function AkunKasBankPage() {
  const user = await requirePageRole(["owner", "direktur"])
  const accounts = await prisma.account.findMany({ include: { coaAccount: true }, orderBy: { name: "asc" } })

  return (
    <AppLayout userName={user.name} userRole={user.role}>
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">Akun Kas dan Bank</h1>
            <p className="text-xs sm:text-sm text-slate-600 font-medium mt-1">Kelola akun yang dipakai untuk kas masuk, kas keluar, dan penerimaan pembayaran.</p>
          </div>
          {user.role === "owner" && <AddAccountButton />}
        </div>
        <AccountList
          rows={accounts.map((a) => ({
            id: a.id,
            name: a.name,
            type: a.type as "kas" | "bank",
            bankName: a.bankName,
            accountNumber: a.accountNumber,
            openingBalance: a.openingBalance,
            coa: a.coaAccount ? { code: a.coaAccount.code, name: a.coaAccount.name } : null,
            coaAccountId: a.coaAccountId,
          }))}
          canEdit={user.role === "owner"}
        />
      </div>
    </AppLayout>
  )
}
