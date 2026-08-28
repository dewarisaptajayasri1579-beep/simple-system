# Marketing (Simple Lead) — Plan To-Do

Rencana kerja modul Marketing, dikerjakan **step by step per nomor**. Centang `[x]` kalau sudah
selesai. Acuan spec: `docs/01`–`06`. Kondisi awal: skema DB + koneksi WhatsApp per-Sales +
ingest pesan masuk **sudah ada**; UI pengelolaan lead **belum ada**.

## Model Visibilitas & Izin (keputusan project — override `docs/06`)

- **LIHAT: semua transparan.** Semua anggota Tim (Manager, SPV, Sales) bisa membuka & memantau
  **SEMUA lead**, termasuk **full isi percakapan WhatsApp** lead siapa pun. Tidak ada scope
  filter untuk operasi baca.
- **AKSI: hanya lead sendiri.** Balas chat, ubah temperatur, tambah aktivitas, selesaikan
  follow up, ubah outcome → **hanya boleh oleh PIC (assignee PRIMARY) lead itu**, atau oleh
  SPV/Manager. Sales lain = read-only di lead orang.
- **Ambil alih** tetap tersedia (reassign/takeover, Fase 7) kalau Sales lain memang perlu
  pegang lead tsb — mengubah PIC + catat alasan.
- **Semua aksi tercatat di `AuditLog`** (siapa, kapan, apa) apa pun rolenya.

## Di mana Scan WhatsApp

- Halaman: **`/marketing/whatsapp`** → komponen `src/components/marketing/ConnectWhatsapp.tsx`
  (tombol masuk dari `/marketing`, label "Hubungkan WhatsApp").
- Tiap Sales scan QR **nomornya sendiri** → session WAHUB `sales-{userId}`
  (`WhatsappConnection`, 1:1 ke `User`).
- API: `POST /api/marketing/whatsapp/connect` (mulai session), `GET .../qr` (ambil QR),
  `GET .../status` (poll sampai `READY`), `POST .../disconnect`.
- Pesan masuk ke nomor itu → webhook `POST /api/marketing/whatsapp/webhook?session=sales-{userId}`
  → auto buat Lead + set PIC = pemilik nomor.

---

## YANG HARUS KAMU (ONY) KERJAKAN SENDIRI — di luar coding

Bagian ini tanggung jawab kamu; sisanya (semua FASE di bawah) aku yang coding.

1. **Deploy / pastikan hidup instance WAHUB `backend-wahub-dewari`** (source `registrasi/backend-wahub`)
   — VPS/host-nya, `pm2`/service-nya, domain + HTTPS-nya. Ini server Baileys-nya, harus jalan 24/7
   dan bisa reconnect sendiri.
2. **Buat client key di WAHUB dewari**: `POST /api/admin/login` (user/pass admin instance) →
   `POST /api/admin/clients {"name":"simple-system-marketing"}` → salin API key.
3. **Isi `.env`** simple-system (production & lokal):
   - `MARKETING_WAHUB_BASE_URL` = URL publik WAHUB dewari
   - `MARKETING_WAHUB_API_KEY` = key dari poin 2
   - `APP_BASE_URL` = URL publik simple-system (dipakai bikin `webhookUrl`)
   - `WAHUB_WEBHOOK_SECRET` = string rahasia bebas (dicek di route webhook)
   - `ANTHROPIC_API_KEY` = untuk Fase 6 (AI) — boleh nyusul
4. **Pastikan `APP_BASE_URL` bisa diakses dari luar** (WAHUB dewari harus bisa `POST` ke
   `/api/marketing/whatsapp/webhook`). Kalau tes lokal: pakai tunnel (ngrok/cloudflared) dan set
   `APP_BASE_URL` ke URL tunnel.
5. **Daftarkan user Sales/SPV/Manager** di sistem (lewat Pengaturan → Users yang sudah ada) +
   set `User.modules` mengandung `"marketing"`. Owner otomatis bypass.
6. **Tentukan struktur Tim**: siapa Manager, SPV mana bawahannya siapa → nanti diisi lewat UI
   Team (poin 51) atau kamu kasih daftarnya, aku seed.
7. **Siapkan HP tiap Sales** untuk scan QR (nomor WA yang dipakai jualan) — 1 Sales 1 nomor.
   WA Web/Baileys butuh HP utama tetap online.
8. **Konfirmasi keputusan produk** yang masih perlu kamu putuskan saat jalan:
   - Daftar Segment final (SevenRent, SAP, Absensi, Bengkel, Gym, Custom App, + lainnya?)
   - Bobot Priority Score (default sudah ada di `docs/06`, poin 25) — pakai default dulu?
   - Grace period follow up & jam kerja (poin 50)
9. **Sediakan akses ke `docs/04-database.md` §11.1** kalau ada detail WAHUB dewari yang beda dari
   asumsi (mis. nama field payload webhook) — biar poin 0a cepat.

> Minimum biar aku bisa mulai Fase 1: poin 1–4 beres (WAHUB dewari hidup + env terisi + webhook
> tembus). Poin 5–8 bisa jalan paralel.

---

## FASE 0 — Persiapan & Fondasi

0a. **Verifikasi WAHUB Marketing (`backend-wahub-dewari`)** sebelum apa pun — simple-system TIDAK
    bikin Baileys sendiri, cuma HTTP client ke WAHUB (`src/lib/wahub.ts` sudah lengkap):
    - Instance `backend-wahub-dewari` running & reachable; `MARKETING_WAHUB_BASE_URL` +
      `MARKETING_WAHUB_API_KEY` terisi di `.env`.
    - Uji manual endpoint: `POST /api/sessions/start`, `GET /api/sessions/qr/:id`,
      `GET /api/sessions/status/:id`, `POST /api/messages/send` (dengan `sessionId`),
      `POST /api/sessions/logout/:id` — cocokkan shape response dengan yang di-parse `wahub.ts`.
    - **Webhook per-session**: pastikan `webhookUrl` per session dipanggil WAHUB saat pesan masuk,
      query `?session=` diteruskan, dan payload berbentuk
      `{ message: { from, to, body, timestamp, chatId, senderNumber, senderName } }` dengan
      konvensi `to === "me"` untuk INBOUND (dipakai `handleMarketingWhatsappWebhook`).
    - Cek apakah WAHUB kirim **delivery status callback** (SENT/DELIVERED/READ). Kalau tidak →
      poin 9 disederhanakan (status berhenti di `SENT`).
1. Cek ulang skema Prisma modul Marketing (`prisma/schema.prisma:1081+`) — pastikan semua `@@index`
   untuk kolom relasi (`leadId`, `assignedUserId`, `conversationId`, `teamId`, dst) dan kolom
   filter (`temperature`, `outcome`, `lastInteractionAt`, `priorityScore`) sudah ada.
2. Seed master data awal: `LeadSource` (WHATSAPP, MANUAL, REFERRAL), `Segment` (SevenRent, SAP,
   Absensi, Bengkel, Gym, Custom App), `LeadActivityType` (DISCUSSION, ZOOM_DEMO, PROPOSAL,
   NEGOTIATION, CALL, OFFLINE_MEETING), `LeadFollowUpResultType` (8 hasil baseline di `docs/03` §10),
   `LeadLostReason`. Buat script `scripts/seed-marketing.ts` (idempotent, upsert by code).
3. Buat layout modul Marketing sendiri — sidebar/bottom-nav khusus (bukan pakai `Sidebar.tsx`
   Internal). Item nav baseline: Beranda, Inbox, Lead, Follow Up, (SPV: Tim), (Manager: Dashboard).
4. Helper izin server-side (bukan scope baca — lihat "Model Visibilitas" di atas):
   - `canViewMarketing(user)` → semua anggota Tim `true` (operasi baca TIDAK difilter).
   - `canActOnLead(user, lead)` → `true` kalau user = PIC PRIMARY lead itu, ATAU role SPV/Manager.
     Semua endpoint mutasi (balas chat, temperatur, aktivitas, follow up, outcome) WAJIB cek ini
     dan tolak 403 kalau `false`.
5. Helper `logAudit(...)` untuk `AuditLog` (append-only) — dipakai di semua mutasi penting.

---

## FASE 1 — Inbox & Percakapan (inti harian Sales)

6. API `GET /api/marketing/conversations` — list SEMUA conversation (tanpa filter scope), field:
   lead, PIC, preview pesan terakhir, `unreadCustomerCount`, segment, temperature, `lastMessageAt`.
   Ada toggle "Punya Saya / Semua" (default: Semua). Pakai `take` + cursor pagination, hindari N+1
   (batch lead + last message).
7. API `GET /api/marketing/conversations/[id]/messages` — timeline pesan 1 conversation (boleh
   dibuka siapa pun), pagination (lazy load pesan lama). `unreadCustomerCount = 0` HANYA kalau
   yang buka = PIC (biar counter non-PIC tidak ikut ke-reset).
8. API `POST /api/marketing/conversations/[id]/messages` — kirim pesan keluar (OUTBOUND) via WAHUB
   `sendMessage`. **Cek `canActOnLead` → tolak 403 kalau bukan PIC/SPV/Manager.** Simpan `Message`
   dengan `senderUserId` = user login, `deliveryStatus` awal `PENDING`. (Catatan teknis: pesan
   dikirim lewat session WAHUB milik PIC, jadi non-PIC yang boleh aksi = SPV/Manager tetap terkirim
   dari nomor PIC.)
9. Perluas webhook (`whatsapp-webhook.ts`) untuk update `deliveryStatus` pesan OUTBOUND (SENT /
   DELIVERED / READ) kalau WAHUB kirim status callback.
10. Halaman `/marketing/inbox` — list SEMUA conversation + filter baseline (Semua, Belum Dibalas,
    Prioritas, Hot) + filter PIC / Tim + toggle "Punya Saya / Semua" + search
    (nama/perusahaan/nomor) + unread badge. Filter diproses server-side.
11. Halaman `/marketing/inbox/[conversationId]` — 1 layar: timeline chat (full transcript, terbuka
    untuk semua) + composer + panel Profil Ringkas lead + (nanti) AI card. Kalau pembuka **bukan
    PIC/SPV/Manager**: composer disabled + banner "Kamu memantau lead ini (PIC: {nama}). Klik
    Ambil Alih untuk membalas." Balas tanpa pindah halaman. Auto-scroll, anti-duplikat pesan.
12. Realtime pesan masuk saat app terbuka (polling interval dulu, atau SSE) — pesan baru naik ke
    atas list & muncul di timeline tanpa refresh manual.

---

## FASE 2 — Lead Management

13. API `GET /api/marketing/leads` — list SEMUA lead (tanpa filter scope) + filter (segment,
    temperature, activity stage, PIC, Tim, priority range, outcome, follow-up status, lead age,
    idle days) + toggle "Punya Saya / Semua" + pagination.
14. API `GET /api/marketing/leads/[id]` — detail lengkap (boleh dibuka siapa pun): identitas,
    segmentasi, temperatur, priority, aktivitas, follow-up, assignment history, summary. Sertakan
    flag `canAct` di response supaya UI tahu tombol aksi ditampilkan/disabled.
15. API `PATCH /api/marketing/leads/[id]` — update field manual (displayName, company, segmentId,
    dll). **Cek `canActOnLead` → 403 kalau bukan PIC/SPV/Manager.** Tulis history + audit.
16. Halaman `/marketing/leads` — list (mobile: nama/segment/temp/activity/priority/next follow up;
    desktop tambah PIC/last interaction/idle days/outcome/created). Default tampil SEMUA lead,
    kolom PIC selalu terlihat. Filter kombinasi, URL simpan state di desktop.
17. Halaman `/marketing/leads/[id]` — 10 section sesuai `docs/03` §6. Quick action (Chat, Tambah
    Aktivitas, Buat Follow Up, Ubah Temperatur, Won/Lost) hanya aktif kalau `canAct`; kalau tidak,
    tombol disabled + CTA "Ambil Alih". Reassign selalu terlihat untuk SPV/Manager.
18. Fitur ubah **Temperatur** (COLD/WARM/HOT) — manual update (PIC/SPV/Manager saja), simpan
    `LeadTemperatureHistory`, trigger recalculate priority, audit.
19. Fitur **Outcome** (OPEN/WON/LOST) — field terpisah dari temperatur; PIC/SPV/Manager saja;
    LOST wajib pilih `LeadLostReason`; timeline event + audit.

---

## FASE 3 — Aktivitas & Follow Up

20. API + UI **Aktivitas**: `POST /api/marketing/leads/[id]/activities` (type, occurred_at, note,
    result, attachment, source) — cek `canActOnLead`. Timeline aktivitas boleh DILIHAT semua Tim.
    Menambah aktivitas bisa menggeser activity stage bila rule terpenuhi + recalculate priority +
    audit.
21. API + UI **Follow Up**: buat follow up (schedule date/time, tujuan, PIC, note) — cek
    `canActOnLead`. Status OPEN/COMPLETED/CANCELLED. Overdue = derived (bukan enum).
22. Flow **selesaikan follow up** (PIC/SPV/Manager) — wajib isi `result` (8 hasil baseline),
    `completed_at`, opsi langsung buat "next follow up" dari layar completion.
23. Halaman `/marketing/follow-up` — default daftar follow up **milik saya** (Hari Ini, Akan
    Datang, Terlambat) + toggle "Semua Tim" untuk pantau follow up semua orang. KPI on-time
    dihitung per orang.
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

## FASE 8 — SPV & Manager (view monitoring, bukan gerbang akses)

> Karena semua data sudah terbuka untuk semua Tim, halaman-halaman di fase ini adalah **cara
> pandang teragregasi** (per sales / per tim / funnel), bukan pembatas akses. Sales pun boleh
> membukanya kalau mau lihat performa tim.

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
    Hot Lead tidak dibalas, reassign, eskalasi SPV, AI high buying signal. **Notifikasi
    ditargetkan ke PIC lead + SPV/Manager terkait** (bukan broadcast ke semua Tim, walau semua
    Tim bisa lihat leadnya). Deduplicated, simpan status sent/read, punya deep link.
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
  dashboard atasan). Toggle "Punya Saya / Semua" + full transparansi chat sudah ikut sejak
  Fase 1–2, jadi "saling pantau semua lead" tercapai sejak MVP.
- Fase 4 (Priority) bisa dikerjakan paralel setelah Fase 3.
- Fase 6 (AI) dan Fase 8 (SPV/Manager) menyusul setelah MVP stabil.
- Setiap fase: `npx tsc --noEmit` bersih sebelum commit; auto commit & push per aturan `CLAUDE.md`.
