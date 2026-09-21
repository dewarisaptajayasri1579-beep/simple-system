import { NextResponse } from "next/server"

import { prisma } from "@/lib/prisma"
import { getEmployeeFromToken } from "@/lib/hrd/auth"
import { uploadToSupabaseStorage } from "@/lib/supabase-storage"

const MAX_BYTES = 10 * 1024 * 1024

function startOfToday() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

export async function POST(request: Request) {
  const employee = await getEmployeeFromToken(request)
  if (!employee) return NextResponse.json({ error: "Sesi tidak valid, silakan login ulang" }, { status: 401 })

  const form = await request.formData().catch(() => null)
  const lat = parseFloat(String(form?.get("lat") ?? ""))
  const lng = parseFloat(String(form?.get("lng") ?? ""))
  const address = typeof form?.get("address") === "string" ? String(form.get("address")) : null
  const photo = form?.get("photo")
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return NextResponse.json({ error: "Lokasi GPS wajib diisi" }, { status: 400 })
  if (!(photo instanceof Blob) || photo.size === 0) return NextResponse.json({ error: "Foto wajib diambil" }, { status: 400 })
  if (photo.size > MAX_BYTES) return NextResponse.json({ error: "Foto terlalu besar (maks 10MB)" }, { status: 400 })

  const today = startOfToday()
  const existing = await prisma.attendanceRecord.findUnique({ where: { employeeId_date: { employeeId: employee.id, date: today } } })
  if (!existing || existing.status === "O") return NextResponse.json({ error: "Belum absen masuk hari ini" }, { status: 400 })
  if (existing.status === "C") return NextResponse.json({ error: "Sudah absen pulang hari ini" }, { status: 400 })

  const now = new Date()
  const workDurationMinutes = existing.checkInAt ? Math.round((now.getTime() - existing.checkInAt.getTime()) / 60000) : null

  const mimeType = photo.type || "image/jpeg"
  const filename = `hrd-absensi/${employee.id}/${today.toISOString().slice(0, 10)}-pulang-${Date.now()}.jpg`
  const photoUrl = await uploadToSupabaseStorage(Buffer.from(await photo.arrayBuffer()), filename, mimeType)

  const record = await prisma.attendanceRecord.update({
    where: { id: existing.id },
    data: {
      status: "C",
      checkOutAt: now,
      checkOutLat: lat,
      checkOutLng: lng,
      checkOutAddress: address,
      checkOutPhotoUrl: photoUrl,
      workDurationMinutes,
    },
  })

  return NextResponse.json({ Sukses: "Y", record: { id: record.id, status: record.status, checkOutAt: record.checkOutAt, workDurationMinutes } })
}
