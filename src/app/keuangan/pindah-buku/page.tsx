import { AppLayout } from "@/components/layout/AppLayout"
import { PindahBukuPanel } from "@/components/keuangan/PindahBukuPanel"
import { getCurrentUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"

export default async function PindahBukuPage() {
  const user = await getCurrentUser()

  const accounts = await prisma.account.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } })

  return (
    <AppLayout userName={user.name} userRole={user.role}>
      <PindahBukuPanel accounts={accounts} />
    </AppLayout>
  )
}
