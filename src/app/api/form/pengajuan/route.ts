import { NextResponse } from "next/server"

import { prisma } from "@/lib/prisma"
import { hasFormAccess } from "@/lib/work-price/form-gate"

/** Buat draft pengajuan baru. Dipanggil otomatis saat programmer mulai mengisi (auto-save),
 *  jadi isinya boleh kosong dulu. */
export async function POST() {
  if (!(await hasFormAccess())) return NextResponse.json({ error: "Sesi form habis — masukkan password lagi" }, { status: 401 })

  const draft = await prisma.workRequest.create({
    data: { clientName: "", programmerName: "" },
    select: { id: true },
  })
  return NextResponse.json(draft, { status: 201 })
}
