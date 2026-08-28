/**
 * Hitung ulang priority score SEMUA lead modul Marketing (sekali jalan / setelah ubah rumus).
 * Jalankan: npx tsx --env-file=.env scripts/recalc-marketing-priority.ts
 */
import { prisma } from "../src/lib/prisma"
import { recalcLeadPriority } from "../src/lib/marketing/priority"

async function main() {
  const leads = await prisma.lead.findMany({ select: { id: true, displayName: true } })
  console.log(`Recalc ${leads.length} lead…`)
  let done = 0
  for (const lead of leads) {
    const r = await recalcLeadPriority(lead.id)
    done++
    if (r) console.log(`[${done}/${leads.length}] ${lead.displayName}: ${r.score} (${r.level})`)
  }
  console.log("Selesai.")
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
