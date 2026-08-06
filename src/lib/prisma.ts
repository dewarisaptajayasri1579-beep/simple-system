import { PrismaPg } from "@prisma/adapter-pg"
import { PrismaClient } from "@prisma/client"

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

// Supabase pooler saat ini menyajikan sertifikat self-signed di layer TLS-nya. Query engine
// Rust bawaan Prisma menolaknya walau sudah diberi sslmode=no-verify/require di connection
// string, jadi kita pakai driver adapter (node-postgres) yang jalan di atas TLS stack Node.js
// sendiri supaya rejectUnauthorized bisa dimatikan secara eksplisit.
const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
})

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter })

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma
