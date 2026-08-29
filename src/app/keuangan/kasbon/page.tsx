import { AppLayout } from "@/components/layout/AppLayout"
import { KasbonPanel } from "@/components/keuangan/KasbonPanel"
import { requirePageRole } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"

export default async function KeuanganKasbonPage() {
  const user = await requirePageRole(["owner", "direktur"])

  const [accounts, users, kasbons] = await Promise.all([
    prisma.account.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.user.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.kasbon.findMany({
      include: { user: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
    }),
  ])

  const kasbonIds = kasbons.map((k) => k.id)
  const sums = kasbonIds.length
    ? await prisma.transaction.groupBy({
        by: ["refId", "type"],
        where: { refType: "kasbon", refId: { in: kasbonIds }, postStatus: "posted" },
        _sum: { grossAmount: true },
      })
    : []
  // Dipecah per kasbon: `disbursed` (pencairan yang sudah posted — 0 kalau drafnya belum
  // diposting) dan `repaid` (total pelunasan posted) — dibedakan supaya UI bisa nampilin
  // status "Draft" (belum diposting) terpisah dari "Outstanding"/"Lunas", bukan cuma outstanding
  // mentah yang bisa 0 di kedua kasus itu dan bikin salah baca.
  const disbursedByKasbonId = new Map<string, number>()
  const repaidByKasbonId = new Map<string, number>()
  for (const row of sums) {
    if (!row.refId) continue
    const map = row.type === "expense" ? disbursedByKasbonId : repaidByKasbonId
    map.set(row.refId, (map.get(row.refId) ?? 0) + (row._sum.grossAmount ?? 0))
  }

  return (
    <AppLayout userName={user.name} userRole={user.role}>
      <KasbonPanel
        accounts={accounts}
        users={users}
        kasbons={kasbons.map((k) => {
          const disbursed = disbursedByKasbonId.get(k.id) ?? 0
          const repaid = repaidByKasbonId.get(k.id) ?? 0
          return {
            id: k.id,
            amount: k.amount,
            description: k.description,
            occurredAt: k.occurredAt.toISOString(),
            status: k.status as "outstanding" | "lunas",
            user: k.user,
            disbursed,
            outstanding: disbursed - repaid,
          }
        })}
      />
    </AppLayout>
  )
}
