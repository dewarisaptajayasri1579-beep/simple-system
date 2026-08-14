import { gzipSync } from "zlib"

import { prisma } from "@/lib/prisma"
import { uploadBackupFile } from "./google-drive"

const SCHEMA = "simple_system"

/** JSON.stringify replacer — satu-satunya tipe non-JSON-safe yang keluar dari Prisma di schema
 *  ini adalah Date (semua kolom lain String/Int/Float/Boolean, tidak ada BigInt/Decimal/Bytes). */
function jsonSafe(_key: string, value: unknown) {
  return value instanceof Date ? value.toISOString() : value
}

function jakartaDateStamp() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" })
    .format(new Date())
    .replaceAll("/", "-")
}

/** Backup logical (data-only, bukan pg_dump) — dump semua tabel di schema `simple_system` lewat
 *  query biasa, bukan pg_dump, supaya tidak perlu install Postgres client tools di image app ini
 *  (lihat catatan di lib/backup/google-drive.ts soal alasan Service Account). Skema/DDL-nya sendiri
 *  sudah tervensiasi lewat prisma/migrations di git, jadi yang perlu di-backup rutin cuma datanya. */
export async function runDatabaseBackup() {
  const tables = await prisma.$queryRawUnsafe<{ tablename: string }[]>(
    `SELECT tablename::text FROM pg_tables WHERE schemaname = $1 ORDER BY tablename`,
    SCHEMA
  )

  const dump: Record<string, unknown[]> = {}
  for (const { tablename } of tables) {
    dump[tablename] = await prisma.$queryRawUnsafe<unknown[]>(`SELECT * FROM ${SCHEMA}."${tablename}"`)
  }

  const json = JSON.stringify({ schema: SCHEMA, generatedAt: new Date().toISOString(), tables: dump }, jsonSafe)
  const gzipped = gzipSync(Buffer.from(json, "utf-8"))

  const fileName = `seven-os-backup-${jakartaDateStamp()}.json.gz`
  const { fileId, webViewLink } = await uploadBackupFile(fileName, gzipped, "application/gzip")

  return {
    fileName,
    tableCount: tables.length,
    rowCount: Object.values(dump).reduce((sum, rows) => sum + rows.length, 0),
    sizeBytes: gzipped.length,
    driveFileId: fileId,
    driveViewLink: webViewLink,
  }
}
