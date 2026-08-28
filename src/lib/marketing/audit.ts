import { Prisma } from "@prisma/client"

import { prisma } from "@/lib/prisma"

/**
 * Tulis 1 baris `AuditLog` (append-only, lihat catatan di schema.prisma model AuditLog).
 * Jangan pernah bikin endpoint edit/hapus baris audit.
 *
 * `before`/`after`/`metadata` opsional — kalau `undefined` kolomnya dibiarkan kosong;
 * kirim objek biasa, otomatis di-serialize ke JSON.
 */
interface AuditInput {
  actorUserId: string | null
  action: string
  entityType: string
  entityId?: string | null
  before?: unknown
  after?: unknown
  metadata?: Record<string, unknown>
  ipAddress?: string | null
}

function toJson(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined) return undefined
  return value as Prisma.InputJsonValue
}

export async function logAudit(input: AuditInput) {
  return prisma.auditLog.create({
    data: {
      actorUserId: input.actorUserId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      beforeJson: toJson(input.before),
      afterJson: toJson(input.after),
      metadataJson: toJson(input.metadata),
      ipAddress: input.ipAddress ?? null,
    },
  })
}
