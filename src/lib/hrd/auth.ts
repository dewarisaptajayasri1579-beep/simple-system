import { hashPassword, verifyPassword } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// Login Employee (app Android) TERPISAH total dari User/Session web — lihat catatan di
// Employee/EmployeeSession (prisma/schema.prisma). Token dikirim lewat header
// `Authorization: Bearer <token>`, bukan cookie (tidak ada browser session di app mobile).
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 hari, sama pola dengan Session (User)

export { hashPassword, verifyPassword }

export async function createEmployeeSession(employeeId: string) {
  return prisma.employeeSession.create({
    data: { employeeId, expiresAt: new Date(Date.now() + SESSION_TTL_MS) },
  })
}

export async function destroyEmployeeSession(token: string) {
  await prisma.employeeSession.delete({ where: { id: token } }).catch(() => {})
}

function extractBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization")
  if (!header?.startsWith("Bearer ")) return null
  return header.slice("Bearer ".length).trim() || null
}

export async function getEmployeeFromToken(request: Request) {
  const token = extractBearerToken(request)
  if (!token) return null

  const session = await prisma.employeeSession.findUnique({ where: { id: token }, include: { employee: true } })
  if (!session || session.expiresAt < new Date()) return null
  if (session.employee.status === "NONAKTIF") return null
  return session.employee
}
