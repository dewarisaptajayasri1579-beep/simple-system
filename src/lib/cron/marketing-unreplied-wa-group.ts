import { getMarketingSetting } from "@/lib/marketing/settings"
import { isWithinWorkingHours } from "@/lib/marketing/working-hours"
import { prisma } from "@/lib/prisma"
import { sendWhatsappMessage } from "@/lib/wahub"

const TEMP_LABEL: Record<string, string> = { HOT: "🔥 Hot", WARM: "🌤️ Warm", COLD: "❄️ Cold" }

/**
 * Alert ke grup WA Marketing (`MARKETING_WAHUB_GROUP_JID`) untuk lead OPEN yang pesan
 * customer-nya belum dibalas Sales lebih dari `escalation.wa_group_unreplied_minutes` menit.
 *
 * - Setting 0 (default) atau env JID kosong → fitur mati.
 * - Anti-spam: `Lead.waGroupAlertedAt` di-set saat di-alert, di-reset null saat Sales membalas
 *   (di route kirim pesan). Jadi 1 lead = 1 alert per "episode belum dibalas".
 * - Hormati working hours kalau `working_hours.enabled` — di luar jam kerja tidak kirim.
 * - Pengirim = nomor Director Assistant (instance `WAHUB_BASE_URL`); nomor itu harus anggota grup.
 * - Dipanggil cron tiap 5 menit.
 */
export async function runMarketingUnrepliedWaGroupAlert() {
  const minutes = await getMarketingSetting("escalation.wa_group_unreplied_minutes")
  if (minutes <= 0) return { skipped: "disabled" as const }

  const groupJid = process.env.MARKETING_WAHUB_GROUP_JID
  if (!groupJid) return { skipped: "no MARKETING_WAHUB_GROUP_JID" as const }

  if (!(await isWithinWorkingHours())) return { skipped: "luar jam kerja" as const }

  const cutoff = new Date(Date.now() - minutes * 60_000)
  const leads = await prisma.lead.findMany({
    where: {
      outcome: "OPEN",
      waGroupAlertedAt: null,
      lastCustomerMessageAt: { lt: cutoff },
      OR: [
        { lastSalesMessageAt: null },
        { lastSalesMessageAt: { lt: prisma.lead.fields.lastCustomerMessageAt } },
      ],
    },
    select: {
      id: true,
      displayName: true,
      companyName: true,
      whatsappNumber: true,
      temperature: true,
      lastCustomerMessageAt: true,
      segment: { select: { name: true } },
      assignments: { where: { isActive: true }, select: { assignedUser: { select: { name: true } } } },
    },
    orderBy: { lastCustomerMessageAt: "asc" },
    take: 30,
  })
  if (leads.length === 0) return { alerted: 0 }

  const now = Date.now()
  const idle = (d: Date | null) => {
    if (!d) return "?"
    const m = Math.floor((now - d.getTime()) / 60_000)
    if (m < 60) return `${m} mnt`
    const h = Math.floor(m / 60)
    return h < 24 ? `${h} jam` : `${Math.floor(h / 24)} hari`
  }

  const lines = leads.map((l, i) => {
    const pic = l.assignments[0]?.assignedUser?.name ?? "belum ada PIC"
    const co = l.companyName ? ` · ${l.companyName}` : ""
    const seg = l.segment?.name ? ` · ${l.segment.name}` : ""
    const temp = TEMP_LABEL[l.temperature] ?? l.temperature
    const wa = l.whatsappNumber.replace(/[^0-9]/g, "")
    return `${i + 1}. *${l.displayName}*${co}${seg}\n   ${temp} · PIC: ${pic} · diam ${idle(l.lastCustomerMessageAt)}\n   wa.me/${wa}`
  })

  const appUrl = (process.env.APP_BASE_URL ?? "").replace(/\/$/, "")
  const text =
    `⏰ *${leads.length} lead belum direspon* (> ${minutes} menit)\n\n` +
    lines.join("\n\n") +
    (appUrl ? `\n\nBuka inbox: ${appUrl}/marketing/inbox` : "")

  await sendWhatsappMessage(groupJid, text)
  await prisma.lead.updateMany({
    where: { id: { in: leads.map((l) => l.id) } },
    data: { waGroupAlertedAt: new Date() },
  })

  return { alerted: leads.length }
}
