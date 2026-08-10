import { NextResponse } from "next/server"

import { getApiUser } from "@/lib/current-user"
import { runDataConsistencyChecks } from "@/lib/data-consistency-check"

/** Dipicu manual lewat tombol "Jalankan Pengecekan" (lihat CekKonsistensiDataPanel.tsx) — bukan
 *  auto-run tiap halaman dibuka, supaya kalau nanti checks-nya makin berat/lama, staf yang
 *  kontrol kapan dijalankan. Tidak menyimpan riwayat — cuma hasil run ini saja. */
export async function POST() {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })
  if (user.role !== "owner") return NextResponse.json({ error: "Cuma Owner yang bisa jalankan pengecekan ini" }, { status: 403 })

  const findings = await runDataConsistencyChecks()
  return NextResponse.json({ findings, checkedAt: new Date().toISOString() })
}
