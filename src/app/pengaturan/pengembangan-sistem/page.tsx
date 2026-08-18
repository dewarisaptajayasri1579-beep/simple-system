import { AppLayout } from "@/components/layout/AppLayout"
import { SystemDevelopmentList } from "@/components/pengaturan/SystemDevelopmentList"
import { getCurrentUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"

/** Sengaja TIDAK pakai requirePageRole (beda dari /pengaturan lain yang Owner-only) —
 *  semua role boleh lihat & usul item di sini, cuma Owner yang boleh hapus (lihat guard di
 *  DELETE /api/system-development/[id]). */
export default async function PengembanganSistemPage() {
  const user = await getCurrentUser()
  const items = await prisma.systemDevelopmentItem.findMany({ orderBy: { createdAt: "desc" } })

  return (
    <AppLayout userName={user.name} userRole={user.role}>
      <div className="space-y-6 max-w-4xl mx-auto">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">List Pengembangan Sistem</h1>
          <p className="text-xs sm:text-sm text-slate-600 font-medium mt-1">
            Daftar fitur/perbaikan yang akan atau sedang dikerjakan di sistem ini — mis. &quot;Cetak MOU dari Project — Timeline Pembayaran&quot;.
          </p>
        </div>

        <SystemDevelopmentList
          isOwner={user.role === "owner"}
          items={items.map((i) => ({
            id: i.id,
            title: i.title,
            description: i.description,
            status: i.status as "belum" | "proses" | "selesai",
            createdByName: i.createdByName,
            createdAt: i.createdAt.toISOString(),
          }))}
        />
      </div>
    </AppLayout>
  )
}
