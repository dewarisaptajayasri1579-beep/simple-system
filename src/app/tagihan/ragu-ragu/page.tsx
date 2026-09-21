import { AppLayout } from "@/components/layout/AppLayout"
import { Card, CardDescription } from "@/components/ui"
import { PiutangRaguRaguSection, type PiutangRaguRaguRow } from "@/components/dashboard/PiutangRaguRaguSection"
import { getCurrentUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"
import { invoiceCashDue } from "@/lib/invoice-due"
import { resolveUserNames } from "@/lib/user-names"
import { resolveDomainExpiry } from "@/lib/domain-status"
import { resolveServerExpiry } from "@/lib/recurring-bill-status"

function formatRupiah(amount: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(amount || 0)
}

/** Menu Tagihan > Piutang Ragu-Ragu — semua tagihan yang "direm" Owner, dua flag (Pending &
 *  Ragu-Ragu) x tiga jenis item (Invoice/Domain/Server). Semuanya sudah dikeluarkan dari
 *  Piutang Outstanding / "Tagihan Belum Ditagih" di Dashboard, Piutang, Neraca, dan Arus Kas;
 *  halaman ini tempat angkanya tetap bisa dilihat dan diaktifkan lagi. Menandai/melepas cuma
 *  boleh Owner (lihat API-nya), tapi daftarnya boleh dilihat siapa pun yang punya akses menu
 *  Tagihan (termasuk role "admin"). */
export default async function PiutangRaguRaguPage() {
  const user = await getCurrentUser()

  const [invoices, domains, servers] = await Promise.all([
    prisma.invoice.findMany({
      where: { postStatus: "posted", OR: [{ doubtfulAt: { not: null } }, { pendingAt: { not: null } }] },
      include: {
        client: { select: { name: true, isPemungutPpn: true } },
        payments: { where: { OR: [{ paymentId: null }, { payment: { is: { postStatus: "posted" } } }] } },
      },
      orderBy: { issuedAt: "desc" },
    }),
    prisma.domain.findMany({
      where: { OR: [{ doubtfulAt: { not: null } }, { pendingAt: { not: null } }] },
      include: { client: { select: { name: true } } },
    }),
    prisma.server.findMany({
      where: { OR: [{ doubtfulAt: { not: null } }, { pendingAt: { not: null } }] },
      include: { client: { select: { name: true } } },
    }),
  ])

  const names = await resolveUserNames([
    ...invoices.flatMap((inv) => [inv.doubtfulById, inv.pendingById]),
    ...domains.flatMap((d) => [d.doubtfulById, d.pendingById]),
    ...servers.flatMap((s) => [s.doubtfulById, s.pendingById]),
  ])

  /** true kalau doubtfulAt terisi — ragu-ragu tingkat lebih berat, API-nya membersihkan
   *  pendingAt saat eskalasi jadi dua-duanya tidak pernah beneran terisi bareng (lihat
   *  ../../api/invoices/[id]/doubtful & padanannya buat domain/server). */
  const flagOf = (row: { doubtfulAt: Date | null; pendingAt: Date | null }) => Boolean(row.doubtfulAt)

  const invoiceRows: PiutangRaguRaguRow[] = invoices
    .map((inv) => {
      const paid = inv.payments.reduce((sum, p) => sum + p.amount, 0)
      const isDoubtful = flagOf(inv)
      const flaggedAt = (isDoubtful ? inv.doubtfulAt : inv.pendingAt)!
      const flaggedById = isDoubtful ? inv.doubtfulById : inv.pendingById
      return {
        id: inv.id,
        itemType: "invoice" as const,
        label: inv.invoiceNumber,
        clientName: inv.client.name,
        remaining: Math.max(0, invoiceCashDue(inv, inv.client.isPemungutPpn) - paid),
        dueDate: inv.dueDate ? inv.dueDate.toISOString() : null,
        flag: isDoubtful ? ("ragu_ragu" as const) : ("pending" as const),
        flaggedAt: flaggedAt.toISOString(),
        flaggedReason: (isDoubtful ? inv.doubtfulReason : inv.pendingReason) ?? "-",
        flaggedByName: flaggedById ? (names.get(flaggedById) ?? null) : null,
      }
    })
    .filter((r) => r.remaining > 0)

  const domainRows: PiutangRaguRaguRow[] = domains.map((d) => {
    const isDoubtful = flagOf(d)
    const flaggedAt = (isDoubtful ? d.doubtfulAt : d.pendingAt)!
    const flaggedById = isDoubtful ? d.doubtfulById : d.pendingById
    return {
      id: d.id,
      itemType: "domain" as const,
      label: d.name,
      clientName: d.client?.name ?? "Internal",
      remaining: d.sellPrice ?? 0,
      dueDate: (() => {
        const expiry = resolveDomainExpiry(d)
        return expiry ? expiry.toISOString() : null
      })(),
      flag: isDoubtful ? ("ragu_ragu" as const) : ("pending" as const),
      flaggedAt: flaggedAt.toISOString(),
      flaggedReason: (isDoubtful ? d.doubtfulReason : d.pendingReason) ?? "-",
      flaggedByName: flaggedById ? (names.get(flaggedById) ?? null) : null,
    }
  })

  const serverRows: PiutangRaguRaguRow[] = servers.map((s) => {
    const isDoubtful = flagOf(s)
    const flaggedAt = (isDoubtful ? s.doubtfulAt : s.pendingAt)!
    const flaggedById = isDoubtful ? s.doubtfulById : s.pendingById
    return {
      id: s.id,
      itemType: "server" as const,
      label: s.name,
      clientName: s.client?.name ?? "Internal",
      remaining: s.price ?? 0,
      dueDate: (() => {
        const nextDue = resolveServerExpiry(s)
        return nextDue ? nextDue.toISOString() : null
      })(),
      flag: isDoubtful ? ("ragu_ragu" as const) : ("pending" as const),
      flaggedAt: flaggedAt.toISOString(),
      flaggedReason: (isDoubtful ? s.doubtfulReason : s.pendingReason) ?? "-",
      flaggedByName: flaggedById ? (names.get(flaggedById) ?? null) : null,
    }
  })

  const rows = [...invoiceRows, ...domainRows, ...serverRows].sort((a, b) => b.flaggedAt.localeCompare(a.flaggedAt))

  const totalPending = rows.filter((r) => r.flag === "pending").reduce((sum, r) => sum + r.remaining, 0)
  const totalDoubtful = rows.filter((r) => r.flag === "ragu_ragu").reduce((sum, r) => sum + r.remaining, 0)

  return (
    <AppLayout userName={user.name} userRole={user.role}>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">Piutang Ragu-Ragu</h1>
          <p className="text-xs sm:text-sm text-slate-600 font-medium mt-1">
            Invoice, Domain, dan Server yang sengaja ditahan Owner — tidak dihitung di Piutang Outstanding / Tagihan Belum Ditagih, dan tidak ditagih otomatis.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card variant="feature" padding="md">
            <CardDescription>Total Ditahan</CardDescription>
            <p className="text-2xl font-black text-slate-900 mt-1">{formatRupiah(totalPending + totalDoubtful)}</p>
          </Card>
          <Card variant="feature" padding="md">
            <CardDescription>Pending (ditunda, masih diharapkan cair)</CardDescription>
            <p className="text-2xl font-black text-sky-700 mt-1">{formatRupiah(totalPending)}</p>
          </Card>
          <Card variant="feature" padding="md">
            <CardDescription>Ragu-Ragu (kemungkinan hangus)</CardDescription>
            <p className="text-2xl font-black text-amber-700 mt-1">{formatRupiah(totalDoubtful)}</p>
          </Card>
        </div>

        <PiutangRaguRaguSection rows={rows} isOwner={user.role === "owner"} />
      </div>
    </AppLayout>
  )
}
