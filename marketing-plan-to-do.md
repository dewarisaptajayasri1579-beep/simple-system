# Marketing (Simple Lead) — Plan To-Do

Rencana kerja modul Marketing, dikerjakan **step by step per nomor**. Centang `[x]` kalau sudah
selesai. Acuan spec: `docs/01`–`06`. Kondisi awal: skema DB + koneksi WhatsApp per-Sales +
ingest pesan masuk **sudah ada**; UI pengelolaan lead **belum ada**.

---

## FASE 0 — Persiapan & Fondasi

1. Cek ulang skema Prisma modul Marketing (`prisma/schema.prisma:1081+`) — pastikan semua `@@index`
   untuk kolom relasi (`leadId`, `assignedUserId`, `conversationId`, `teamId`, dst) dan kolom
   filter (`temperature`, `outcome`, `lastInteractionAt`, `priorityScore`) sudah ada.
2. Seed master data awal: `LeadSource` (WHATSAPP, MANUAL, REFERRAL), `Segment` (SevenRent, SAP,
   Absensi, Bengkel, Gym, Custom App), `LeadActivityType` (DISCUSSION, ZOOM_DEMO, PROPOSAL,
   NEGOTIATION, CALL, OFFLINE_MEETING), `LeadFollowUpResultType` (8 hasil baseline di `docs/03` §10),
   `LeadLostReason`. Buat script `scripts/seed-marketing.ts` (idempotent, upsert by code).
3. Buat layout modul Marketing sendiri — sidebar/bottom-nav khusus (bukan pakai `Sidebar.tsx`
   Internal). Item nav baseline: Beranda, Inbox, Lead, Follow Up, (SPV: Tim), (Manager: Dashboard).
4. Helper scope data server-side: fungsi `marketingScope(user)` yang mengembalikan filter Prisma
   berdasarkan role TeamMembership (SALES = lead sendiri, SPV = tim, MANAGER = semua). Semua query
   modul ini WAJIB lewat helper ini.
5. Helper `logAudit(...)` untuk `AuditLog` (append-only) — dipakai di semua mutasi penting.

---

## FASE 1 — Inbox & Percakapan (inti harian Sales)

6. API `GET /api/marketing/conversations` — list conversation (scope-aware), field: lead, preview
   pesan terakhir, `unreadCustomerCount`, segment, temperature, `lastMessageAt`. Pakai `take` +
   cursor pagination, hindari N+1 (batch lead + last message).
7. API `GET /api/marketing/conversations/[id]/messages` — timeline pesan 1 conversation, pagination
   (lazy load pesan lama), tandai `unreadCustomerCount = 0` saat dibuka.
8. API `POST /api/marketing/conversations/[id]/messages` — kirim pesan keluar (OUTBOUND) via WAHUB
   `sendMessage`, simpan `Message` dengan `senderUserId` = user login, `deliveryStatus` awal
   `PENDING`.
9. Perluas webhook (`whatsapp-webhook.ts`) untuk update `deliveryStatus` pesan OUTBOUND (SENT /
   DELIVERED / READ) kalau WAHUB kirim status callback.
10. Halaman `/marketing/inbox` — list conversation + filter baseline (Semua, Belum Dibalas,
    Prioritas, Hot) + search (nama/perusahaan/nomor) + unread badge. Filter diproses server-side.
11. Halaman `/marketing/inbox/[conversationId]` — 1 layar: timeline chat + composer + panel Profil
    Ringkas lead + (nanti) AI card. Balas tanpa pindah halaman. Auto-scroll, anti-duplikat pesan.
12. Realtime pesan masuk saat app terbuka (polling interval dulu, atau SSE) — pesan baru naik ke
    atas list & muncul di timeline tanpa refresh manual.

---

## FASE 2 — Lead Management

13. API `GET /api/marketing/leads` — list lead scope-aware + filter (segment, temperature,
    activity stage, PIC, priority range, outcome, follow-up status, lead age, idle days) +
    pagination.
14. API `GET /api/marketing/leads/[id]` — detail lengkap: identitas, segmentasi, temperatur,
    priority, aktivitas, follow-up, assignment history, summary.
15. API `PATCH /api/marketing/leads/[id]` — update field manual (displayName, company, segmentId,
    dll) + tulis history + audit.
16. Halaman `/marketing/leads` — list (mobile: nama/segment/temp/activity/priority/next follow up;
    desktop tambah PIC/last interaction/idle days/outcome/created). Filter kombinasi, URL simpan
    state di desktop.
17. Halaman `/marketing/leads/[id]` — 10 section sesuai `docs/03` §6 + quick action (Chat, Tambah
    Aktivitas, Buat Follow Up, Ubah Temperatur, Reassign, Won/Lost).
18. Fitur ubah **Temperatur** (COLD/WARM/HOT) — manual update, simpan `LeadTemperatureHistory`,
    trigger recalculate priority, audit.
19. Fitur **Outcome** (OPEN/WON/LOST) — field terpisah dari temperatur; LOST wajib pilih
    `LeadLostReason`; timeline event + audit.

---

## FASE 3 — Aktivitas & Follow Up

20. API + UI **Aktivitas**: `POST /api/marketing/leads/[id]/activities` (type, occurred_at, note,
    result, attachment, source). Tampil chronological. Menambah aktivitas bisa menggeser
    activity stage bila rule terpenuhi + recalculate priority + audit.
21. API + UI **Follow Up**: buat follow up (schedule date/time, tujuan, PIC, note). Status
    OPEN/COMPLETED/CANCELLED. Overdue = derived (bukan enum).
22. Flow **selesaikan follow up** — wajib isi `result` (8 hasil baseline), `completed_at`, opsi
    langsung buat "next follow up" dari layar completion.
23. Halaman `/marketing/follow-up` — daftar follow up Sales: Hari Ini, Akan Datang, Terlambat.
    KPI on-time bisa dihitung.
24. Cron reminder follow up (`src/lib/cron/`): Scheduled (sebelum jatuh tempo), Due (saat jatuh
    tempo), Overdue (lewat batas). Simpan dedupe key di `LeadNotification` — 1 event tidak spam.

---

## FASE 4 — Priority Engine

25. Fungsi `computeLeadPriority(lead)` — skor 0–100, bobot baseline: Temperatur 25%, Aktivitas/
    Tahap 30%, Hasil Follow Up 25%, Recency/Idle 10%, AI Buying Signal 10% (rumus detail di
    `docs/06`). Deterministic, simpan `rule_version`.
26. Simpan hasil ke `LeadPrioritySnapshot` (`priority_score`, `priority_level`, `priority_reason[]`,
    `calculated_at`, `rule_version`). Level: 80–100 Utama, 60–79 Tinggi, 40–59 Pantau, 0–39 Rendah.
27. Trigger recalculate di event penting: pesan masuk, temperatur berubah, aktivitas baru, follow
    up selesai, AI analysis update.
28. Tampilkan di UI sebagai **alasan singkat**, bukan cuma angka: contoh `Hot + Negosiasi +
    Follow Up Hari Ini`.

---

## FASE 5 — Beranda Sales

29. API `GET /api/marketing/home` — KPI harian (Lead Hot, Follow Up Hari Ini, Terlambat, Chat
    Belum Dibalas) + list "Kerjakan Dulu" (urut Priority Score, server-side).
30. Halaman `/marketing` (ganti `ModulePlaceholder`) — header sapaan + notification bell + 4 KPI
    card + "Kerjakan Dulu" + quick filter (Hot, Follow Up, Belum Dibalas, Overdue). Angka konsisten
    dengan drill-down list-nya.

---

## FASE 6 — AI Analysis (async, tidak blocking chat)

31. Service `analyzeLead(leadId)` (pola sama `src/lib/agent.ts`, Claude) — jalan async, hasil ke
    `LeadAiAnalysis` (versioned, simpan `source_message_until_id`, model/version, confidence).
32. **Auto Segmentation** — baca beberapa pesan awal, pilih `segment_id` + confidence + reason.
    Kalau confidence < threshold → tampil sebagai rekomendasi, tidak auto-apply.
33. **Lead Profiling** — company_size, buying_power, buying_interest, need, closing_probability,
    buying_signal, summary, evidence. UI kasih label "Perkiraan dari AI".
34. **Conversation Summary** — customer context, need, pain point, produk diminati, objection,
    commitment, stage, next action. Bisa di-refresh, tidak hapus versi lama.
35. **Suggested Reply** (`LeadAiSuggestion`) — 3 mode (Profesional, Santai, Closing). Tidak
    auto-send; user tekan Gunakan → boleh edit → kirim. Lacak suggestion yang dipakai.
36. **Next Best Action** — CONTINUE_DISCUSSION / SCHEDULE_DEMO / SEND_PROPOSAL / FOLLOW_UP /
    NEGOTIATE / ESCALATE / WAIT_UNTIL_DATE + reason + confidence.
37. Integrasi AI card ke halaman percakapan (poin 11) + tombol regenerate. Gagal AI = card kosong,
    chat tetap jalan.

---

## FASE 7 — Assignment / Reassign / Takeover

38. API `POST /api/marketing/leads/[id]/assignments` — assign / reassign / takeover. 1 active
    PRIMARY per lead, semua perubahan simpan actor + reason, kirim notifikasi ke PIC baru.
39. UI reassign di Lead Detail (SPV/Manager, scope divalidasi) + Assignment History.
40. Catatan: riwayat chat "nempel" di nomor WA Sales lama (1 nomor per Sales) — takeover =
    ganti PIC + assignment, bukan mindahin conversation. Dokumentasikan batasannya di UI.

---

## FASE 8 — SPV & Manager

41. API + halaman **SPV Team Dashboard** (`/marketing/tim`) — KPI tim (lead aktif, hot, overdue
    follow up, chat belum dibalas, priority lead, won, follow up discipline, response time) +
    Early Warning card actionable (contoh: "5 Hot Lead milik Adit belum di-follow up" + CTA).
42. Halaman **SPV Sales Detail** — KPI per sales, lead list, follow up list, activity log, overdue,
    trend.
43. API + halaman **Manager Dashboard** (`/marketing/dashboard`) — KPI baseline (Total Lead, Cold,
    Warm, Hot, Open, Won, Lost, Follow Up On Time, Overdue, Avg Response Time) + funnel + segment
    performance + team performance + early warning + AI insight. Semua KPI drill-down.
44. Halaman **Segment Performance** & **Team Performance** (metrik lengkap di `docs/03` §22–23).

---

## FASE 9 — Notification & Audit

45. `LeadNotification` — engine notifikasi: lead di-assign, pesan baru, follow up due/overdue,
    Hot Lead tidak dibalas, reassign, eskalasi SPV, AI high buying signal. Role-aware,
    scope-aware, deduplicated, simpan status sent/read, punya deep link.
46. Halaman Notification Center + notification bell (unread count, mark all read, klik → deep link
    ke conversation / lead detail).
47. Web Push (PWA) — `PushSubscription`, service worker, subscribe flow, kirim push saat app
    background/closed. Realtime (app terbuka) dan push (background) dipisah.
48. Halaman **Timeline/Audit** user-friendly di Lead Detail — tampilkan `AuditLog` sebagai riwayat
    yang mudah dibaca staf.

---

## FASE 10 — PWA & Pengaturan

49. PWA shell — manifest, service worker, installable, standalone display, offline shell,
    safe-area, update notification saat versi baru.
50. Halaman **Settings** modul Marketing (Manager/Admin + permission) — kelola segment, follow up
    grace period, reminder offset, score weights, AI confidence threshold, escalation threshold,
    working hours, notification preference default. Simpan ke `LeadSystemSetting`.
51. Manajemen **Team & TeamMembership** — UI buat Owner/Manager: buat tim, tambah member, set
    `membershipRole` (SALES/SPV/MEMBER), set supervisor.

---

## FASE 11 — Uji End-to-End & Dokumentasi

52. Jalankan skenario end-to-end `docs/03` §30 (lead masuk → dibuat → segment AI → assign →
    notif → inbox → balas → aktivitas → priority berubah → follow up → reminder → selesai →
    KPI SPV & funnel Manager berubah → semua di audit).
53. Buat `Check-Flow-Marketing.MD` (pola sama Check-Flow modul Internal) — jejak alur nyata dari
    kode + hal yang gampang salah paham.
54. Update menu Dokumentasi in-app kalau perlu versi staf awam.

---

## Catatan urutan pengerjaan

- **MVP minimum** = Fase 0 → 1 → 2 → 3 → 5 (Sales bisa kerja penuh dari HP tanpa AI & tanpa
  dashboard atasan).
- Fase 4 (Priority) bisa dikerjakan paralel setelah Fase 3.
- Fase 6 (AI) dan Fase 8 (SPV/Manager) menyusul setelah MVP stabil.
- Setiap fase: `npx tsc --noEmit` bersih sebelum commit; auto commit & push per aturan `CLAUDE.md`.
