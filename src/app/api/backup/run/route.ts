import { NextResponse } from "next/server"

import { getApiUser } from "@/lib/current-user"
import { runDatabaseBackup } from "@/lib/backup/database-backup"

/** Trigger manual — tombol "Proses Backup Sekarang" di Pengaturan (owner-only, sama pembatasan
 *  dengan halaman Pengaturan-nya sendiri). Pakai fungsi yang sama dengan cron jam 20:00 WIB
 *  (lihat instrumentation.ts) supaya hasilnya konsisten. */
export async function POST() {
  const user = await getApiUser()
  if (!user || user.role !== "owner") return NextResponse.json({ error: "Belum login / tidak diizinkan" }, { status: 403 })

  try {
    const result = await runDatabaseBackup()
    return NextResponse.json(result)
  } catch (e) {
    console.error("[backup] manual trigger gagal:", e)
    return NextResponse.json({ error: e instanceof Error ? e.message : "Backup gagal" }, { status: 500 })
  }
}
