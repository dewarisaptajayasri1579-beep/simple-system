/**
 * Bersihkan `Conversation.unreadCustomerCount` yang nyangkut.
 *
 * Counter itu dulu cuma turun kalau PIC lead MEMBUKA percakapannya — membalas chat (baik lewat
 * Inbox maupun langsung dari HP Sales) tidak menurunkannya sama sekali, dan SPV/Manager yang
 * membaca juga tidak. Akibatnya badge "belum dibaca" nyangkut selamanya untuk percakapan yang
 * sebenarnya sudah dibalas. Perilaku itu sudah diperbaiki di kode (lihat
 * conversations/[id]/messages/route.ts & whatsapp-webhook.ts), tapi data lamanya tetap salah.
 *
 * Yang dinolkan HANYA percakapan yang balasan Sales-nya LEBIH BARU dari pesan customer terakhir —
 * artinya memang sudah dibalas, jadi tidak mungkin masih ada yang belum dibaca. Percakapan yang
 * benar-benar nggantung tidak disentuh.
 *
 * Aman diulang. Counter ini murni turunan (tidak dipakai buat akuntansi apa pun), dan akan terisi
 * lagi sendiri begitu ada pesan customer masuk.
 *
 * Simulasi (default): npx tsx scripts/reset-stale-unread-counts.ts
 * Eksekusi:           npx tsx scripts/reset-stale-unread-counts.ts --commit
 */
import { prisma } from "../src/lib/prisma"

const COMMIT = process.argv.includes("--commit")

async function main() {
  const stale = await prisma.conversation.findMany({
    where: {
      unreadCustomerCount: { gt: 0 },
      lead: {
        lastSalesMessageAt: { not: null },
        // "sudah dibalas" = balasan Sales lebih baru dari pesan customer terakhir.
        OR: [
          { lastCustomerMessageAt: null },
          { lastCustomerMessageAt: { lt: prisma.lead.fields.lastSalesMessageAt } },
        ],
      },
    },
    select: {
      id: true,
      unreadCustomerCount: true,
      lead: { select: { displayName: true, lastCustomerMessageAt: true, lastSalesMessageAt: true } },
    },
  })

  console.log(`${stale.length} percakapan punya counter nyangkut (sudah dibalas tapi masih dihitung belum dibaca)`)
  for (const c of stale.slice(0, 10)) {
    console.log(
      `  ${c.lead.displayName.padEnd(24)} unread=${String(c.unreadCustomerCount).padStart(3)}` +
        `  customer ${c.lead.lastCustomerMessageAt?.toISOString().slice(0, 16) ?? "-"}` +
        `  sales ${c.lead.lastSalesMessageAt?.toISOString().slice(0, 16)}`
    )
  }
  if (stale.length > 10) console.log(`  ... ${stale.length - 10} lagi`)

  if (!COMMIT) {
    console.log("\n(simulasi — belum ada yang diubah. Jalankan ulang dengan --commit.)")
    return
  }

  const res = await prisma.conversation.updateMany({
    where: { id: { in: stale.map((c) => c.id) } },
    data: { unreadCustomerCount: 0 },
  })
  console.log(`\n${res.count} counter dinolkan.`)
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
