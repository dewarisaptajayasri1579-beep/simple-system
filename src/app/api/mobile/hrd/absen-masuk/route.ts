import { NextResponse } from "next/server"

import { prisma } from "@/lib/prisma"
import { getEmployeeFromToken } from "@/lib/hrd/auth"
import { distanceMeters, timeOnDate } from "@/lib/hrd/geo"
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
  if (existing?.status === "I") return NextResponse.json({ error: "Sudah absen masuk hari ini" }, { status: 400 })
  if (existing?.status === "C") return NextResponse.json({ error: "Sudah absen pulang hari ini" }, { status: 400 })

  const settings = await prisma.hrSettings.findUnique({ where: { id: "singleton" } })
  if (settings?.kantorLat != null && settings?.kantorLng != null) {
    const distance = distanceMeters(lat, lng, settings.kantorLat, settings.kantorLng)
    if (distance > settings.toleransiJarakM) {
      return NextResponse.json({ error: `Lokasi di luar radius kantor (jarak ${Math.round(distance)}m, maks ${settings.toleransiJarakM}m)` }, { status: 400 })
    }
  }

  const now = new Date()
  const jamMasuk = timeOnDate(today, settings?.jamMasuk ?? "08:00")
  const isLate = now > jamMasuk
  const lateMinutes = isLate ? Math.round((now.getTime() - jamMasuk.getTime()) / 60000) : null

  const mimeType = photo.type || "image/jpeg"
  const filename = `hrd-absensi/${employee.id}/${today.toISOString().slice(0, 10)}-masuk-${Date.now()}.jpg`
  const photoUrl = await uploadToSupabaseStorage(Buffer.from(await photo.arrayBuffer()), filename, mimeType)

  const record = await prisma.attendanceRecord.upsert({
    where: { employeeId_date: { employeeId: employee.id, date: today } },
    create: {
      employeeId: employee.id,
      date: today,
      status: "I",
      checkInAt: now,
      checkInLat: lat,
      checkInLng: lng,
      checkInAddress: address,
      checkInPhotoUrl: photoUrl,
      checkInLate: isLate,
      checkInLateMinutes: lateMinutes,
      source: "android",
    },
    update: {
      status: "I",
      checkInAt: now,
      checkInLat: lat,
      checkInLng: lng,
      checkInAddress: address,
      checkInPhotoUrl: photoUrl,
      checkInLate: isLate,
      checkInLateMinutes: lateMinutes,
    },
  })

  return NextResponse.json({ Sukses: "Y", record: { id: record.id, status: record.status, checkInAt: record.checkInAt, late: isLate } })
}
