import { Client } from "pg"
import { NextResponse } from "next/server"

import { getApiUser } from "@/lib/current-user"
import { canViewMonitoring, formatBytes } from "@/lib/monitoring"
import { prisma } from "@/lib/prisma"

type DbSizeResult = {
  id: string
  name: string
  builtin: boolean
  sizeBytes: number | null
  sizePretty: string | null
  error: string | null
}

async function sizeOfSelf(): Promise<DbSizeResult> {
  try {
    const rows = await prisma.$queryRaw<{ bytes: bigint }[]>`SELECT pg_database_size(current_database()) as bytes`
    const bytes = Number(rows[0]?.bytes ?? 0)
    return { id: "self", name: "Database Aplikasi (Utama)", builtin: true, sizeBytes: bytes, sizePretty: formatBytes(bytes), error: null }
  } catch {
    return { id: "self", name: "Database Aplikasi (Utama)", builtin: true, sizeBytes: null, sizePretty: null, error: "Gagal membaca ukuran database" }
  }
}

async function sizeOfExternal(id: string, name: string, connectionString: string): Promise<DbSizeResult> {
  const client = new Client({ connectionString, connectionTimeoutMillis: 5000, query_timeout: 5000 })
  try {
    await client.connect()
    const result = await client.query("SELECT pg_database_size(current_database()) as bytes")
    const bytes = Number(result.rows[0]?.bytes ?? 0)
    return { id, name, builtin: false, sizeBytes: bytes, sizePretty: formatBytes(bytes), error: null }
  } catch (err) {
    return { id, name, builtin: false, sizeBytes: null, sizePretty: null, error: err instanceof Error ? err.message : "Gagal konek ke database" }
  } finally {
    await client.end().catch(() => {})
  }
}

export async function GET() {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })
  if (!canViewMonitoring(user)) return NextResponse.json({ error: "Tidak punya akses modul Monitoring" }, { status: 403 })

  const monitored = await prisma.monitoredDatabase.findMany({ orderBy: { createdAt: "asc" } })

  const results = await Promise.all([
    sizeOfSelf(),
    ...monitored.map((db) => sizeOfExternal(db.id, db.name, db.connectionString)),
  ])

  return NextResponse.json(results)
}

/** Nambah database eksternal yang mau dipantau ukurannya — cuma Owner (connection string berisi
 *  kredensial). Lihat catatan keamanan di model MonitoredDatabase. */
export async function POST(request: Request) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })
  if (user.role !== "owner") return NextResponse.json({ error: "Cuma Owner yang bisa tambah database" }, { status: 403 })

  const body = await request.json().catch(() => null)
  const name = typeof body?.name === "string" ? body.name.trim() : ""
  const connectionString = typeof body?.connectionString === "string" ? body.connectionString.trim() : ""

  if (!name || !connectionString) {
    return NextResponse.json({ error: "Nama dan connection string wajib diisi" }, { status: 400 })
  }

  const created = await prisma.monitoredDatabase.create({
    data: { name, connectionString, createdById: user.id },
    select: { id: true, name: true, createdAt: true },
  })

  return NextResponse.json(created, { status: 201 })
}
