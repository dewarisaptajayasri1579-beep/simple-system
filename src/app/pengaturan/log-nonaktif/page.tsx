import Link from "next/link"

import { AppLayout } from "@/components/layout/AppLayout"
import { Card, CardHeader, CardTitle, CardDescription, TableContainer, Table, TableHeader, TableRow, TableHead, TableBody, TableCell, Badge } from "@/components/ui"
import { requirePageRole } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"

const ENTITY_LABEL: Record<string, string> = {
  domain: "Domain",
  server: "Server",
  recurring_bill: "Biaya Berkala",
}

function formatDateTime(d: Date) {
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  }).format(d)
}

export default async function LogNonaktifPage() {
  const user = await requirePageRole(["owner"])

  const logs = await prisma.deactivationLog.findMany({ orderBy: { createdAt: "desc" } })

  return (
    <AppLayout userName={user.name} userRole={user.role}>
      <div className="space-y-6 max-w-6xl mx-auto">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">Log Nonaktif</h1>
            <p className="text-xs sm:text-sm text-slate-600 font-medium mt-1">
              Riwayat semua domain, server, dan biaya berkala yang dinonaktifkan lewat AI Agent WhatsApp.
            </p>
          </div>
          <Link href="/pengaturan" className="text-xs sm:text-sm font-bold text-blue-700 hover:underline whitespace-nowrap">
            &larr; Kembali ke Pengaturan
          </Link>
        </div>

        <Card variant="panel" padding="none">
          <CardHeader className="p-5 sm:p-6 mb-0">
            <CardTitle>Riwayat Nonaktif</CardTitle>
            <CardDescription>{logs.length} entri, terbaru di atas</CardDescription>
          </CardHeader>
          <TableContainer className="border-0 rounded-none shadow-none">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Waktu</TableHead>
                  <TableHead>Tipe</TableHead>
                  <TableHead>Nama</TableHead>
                  <TableHead>Alasan</TableHead>
                  <TableHead>Dinonaktifkan Oleh</TableHead>
                  <TableHead>Perintah Asli</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="whitespace-nowrap text-xs">{formatDateTime(log.createdAt)}</TableCell>
                    <TableCell>
                      <Badge>{ENTITY_LABEL[log.entityType] ?? log.entityType}</Badge>
                    </TableCell>
                    <TableCell className="font-semibold">{log.entityName}</TableCell>
                    <TableCell>{log.reason}</TableCell>
                    <TableCell>{log.actorName}</TableCell>
                    <TableCell className="text-xs text-slate-500 italic">&ldquo;{log.command}&rdquo;</TableCell>
                  </TableRow>
                ))}
                {logs.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-slate-400 py-8">
                      Belum ada riwayat nonaktif.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Card>
      </div>
    </AppLayout>
  )
}
