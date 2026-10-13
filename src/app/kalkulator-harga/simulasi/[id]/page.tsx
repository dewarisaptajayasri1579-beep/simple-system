import { notFound } from "next/navigation"

import { AppLayout } from "@/components/layout/AppLayout"
import { SimulasiDetail } from "@/components/kalkulator-harga/SimulasiDetail"
import type { SimulasiRow } from "@/components/kalkulator-harga/SimulasiPanel"
import { getCurrentUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"

export default async function SimulasiDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  const { id } = await params

  const sim = await prisma.workPriceSimulation.findUnique({
    where: { id },
    include: { items: { orderBy: { sortOrder: "asc" } } },
  })
  if (!sim) notFound()

  const creator = sim.createdById
    ? await prisma.user.findUnique({ where: { id: sim.createdById }, select: { name: true } })
    : null

  const row: SimulasiRow = {
    id: sim.id,
    title: sim.title,
    summary: sim.summary,
    clientName: sim.clientName,
    totalPoints: sim.totalPoints,
    totalPrice: sim.totalPrice,
    createdAtIso: sim.createdAt.toISOString(),
    createdByName: creator?.name ?? null,
    items: sim.items.map((it) => ({
      id: it.id,
      nama: it.nama,
      qty: it.qty,
      points: it.points,
      unitPrice: it.unitPrice,
      reason: it.reason,
      scores: (it.scores ?? {}) as Record<string, string>,
    })),
  }

  const transcript = Array.isArray(sim.transcript) ? (sim.transcript as { role: string; text: string }[]) : []
  const canDelete = ["owner", "direktur"].includes(user.role) || sim.createdById === user.id

  return (
    <AppLayout userName={user.name} userRole={user.role}>
      <SimulasiDetail row={row} transcript={transcript} canDelete={canDelete} />
    </AppLayout>
  )
}
