import { NextResponse } from "next/server"

import { getApiUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"

export async function GET(request: Request) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })

  const q = new URL(request.url).searchParams.get("q")?.trim() ?? ""
  if (q.length < 2) return NextResponse.json({ results: [] })

  const [clients, invoices, domains, servers] = await Promise.all([
    prisma.client.findMany({
      where: {
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { picName: { contains: q, mode: "insensitive" } },
          { phoneNumber: { contains: q, mode: "insensitive" } },
          { picPhone: { contains: q, mode: "insensitive" } },
        ],
      },
      take: 5,
      orderBy: { name: "asc" },
    }),
    prisma.invoice.findMany({
      where: {
        OR: [{ invoiceNumber: { contains: q, mode: "insensitive" } }, { client: { name: { contains: q, mode: "insensitive" } } }],
      },
      include: { client: true },
      take: 5,
      orderBy: { createdAt: "desc" },
    }),
    prisma.domain.findMany({
      where: {
        OR: [{ name: { contains: q, mode: "insensitive" } }, { client: { name: { contains: q, mode: "insensitive" } } }],
      },
      include: { client: true },
      take: 5,
    }),
    prisma.server.findMany({
      where: {
        OR: [{ name: { contains: q, mode: "insensitive" } }, { client: { name: { contains: q, mode: "insensitive" } } }],
      },
      include: { client: true },
      take: 5,
    }),
  ])

  const results = [
    ...clients.map((c) => ({
      type: "client" as const,
      id: c.id,
      title: c.name,
      subtitle: [c.picName, c.picPhone || c.phoneNumber].filter(Boolean).join(" · ") || undefined,
      href: `/pembayaran?clientId=${c.id}`,
    })),
    ...invoices.map((inv) => ({
      type: "invoice" as const,
      id: inv.id,
      title: inv.invoiceNumber,
      subtitle: inv.client.name,
      href: `/penjualan/${inv.id}`,
    })),
    ...domains.map((d) => ({
      type: "domain" as const,
      id: d.id,
      title: d.name,
      subtitle: d.client?.name ?? "Internal",
      href: `/pengaturan`,
    })),
    ...servers.map((s) => ({
      type: "server" as const,
      id: s.id,
      title: s.name,
      subtitle: s.client?.name ?? "Internal",
      href: `/pengaturan`,
    })),
  ]

  return NextResponse.json({ results })
}
