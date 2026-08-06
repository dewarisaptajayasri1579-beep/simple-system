import { AppLayout } from "@/components/layout/AppLayout"
import { FollowUpPanel } from "@/components/follow-up/FollowUpPanel"
import { getCurrentUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"

export default async function FollowUpPage() {
  const user = await getCurrentUser()

  const followUps = await prisma.followUp.findMany({ orderBy: { followUpDate: "desc" } })

  const rows = followUps.map((f) => ({
    id: f.id,
    subject: f.subject,
    note: f.note,
    followUpDate: f.followUpDate.toISOString(),
  }))

  return (
    <AppLayout userName={user.name} userRole={user.role}>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">Follow Up</h1>
          <p className="text-xs sm:text-sm text-slate-600 font-medium mt-1">Catatan follow-up ke client — domain, sewa, dan lainnya.</p>
        </div>

        <FollowUpPanel rows={rows} />
      </div>
    </AppLayout>
  )
}
