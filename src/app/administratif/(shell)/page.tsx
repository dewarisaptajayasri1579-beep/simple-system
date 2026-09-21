import Link from "next/link"
import { Mail, Users, UserCheck } from "lucide-react"

import { Card, CardTitle, CardDescription, StatTile } from "@/components/ui"
import { prisma } from "@/lib/prisma"

export default async function AdministratifBerandaPage() {
  const [totalKaryawan, karyawanAktif, totalSurat] = await Promise.all([
    prisma.employee.count(),
    prisma.employee.count({ where: { status: "AKTIF" } }),
    prisma.correspondenceLog.count(),
  ])

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-black text-slate-900">Beranda Administratif</h1>
        <p className="text-sm text-slate-600 font-medium mt-1">Ringkasan data karyawan &amp; surat-menyurat.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatTile label="Total Karyawan" value={totalKaryawan} icon={Users} color="blue" />
        <StatTile label="Karyawan Aktif" value={karyawanAktif} icon={UserCheck} color="emerald" />
        <StatTile label="Total Surat Tercatat" value={totalSurat} icon={Mail} color="amber" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Link href="/administratif/karyawan">
          <Card variant="glass" padding="lg" hoverable>
            <CardTitle>Data Karyawan</CardTitle>
            <CardDescription className="mt-1.5">Kelola master data karyawan — nama, jabatan, status, kontak.</CardDescription>
          </Card>
        </Link>
        <Link href="/administratif/surat">
          <Card variant="glass" padding="lg" hoverable>
            <CardTitle>Surat Menyurat</CardTitle>
            <CardDescription className="mt-1.5">Catat surat masuk &amp; keluar — nomor, perihal, tanggal, tujuan.</CardDescription>
          </Card>
        </Link>
      </div>
    </div>
  )
}
