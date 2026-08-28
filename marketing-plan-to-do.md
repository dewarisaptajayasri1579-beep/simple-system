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

1. [x] **Instance WAHUB `backend-wahub-dewari` sudah hidup** — `https://backend-wahub-dewari.onyseven.com`
   (source `registrasi/backend-wahub`). Harus jalan 24/7 + reconnect sendiri.
2. [x] **Client key di WAHUB dewari sudah dibuat** — sudah terpasang di `.env`, dites
   `GET /api/sessions` → HTTP 200. Cara bikin (kalau butuh baru): `POST /api/admin/login`
   (user `admin` / pass = env `ADMIN_PASSWORD` di deploy dewari, atau default `admin123`) →
   `POST /api/admin/clients {"name":"..."}` → ambil `apiKey`.
3. [x] **`.env` lokal sudah lengkap**: `MARKETING_WAHUB_BASE_URL`, `MARKETING_WAHUB_API_KEY`,
   `APP_BASE_URL` (`https://simple.onyseven.com`), `WAHUB_WEBHOOK_SECRET`, `ANTHROPIC_API_KEY`.
   → **Sisa: pastikan env yang sama sudah ada di deploy PRODUCTION `simple.onyseven.com`.**
4. [ ] **Verifikasi webhook tembus dari luar** — `POST https://simple.onyseven.com/api/marketing/whatsapp/webhook?secret=...&session=x`
   harus sampai (dites beneran saat Fase 1).
5. [ ] **Volume persisten di deploy dewari** untuk `data/` (SQLite: client key + daftar sesi) &
   auth dir Baileys — kalau tidak, redeploy = key & sesi hilang, Sales scan ulang.
6. [ ] **Daftarkan user Sales/SPV/Manager** (Pengaturan → Users) + set `User.modules` mengandung
   `"marketing"`. Owner otomatis bypass.
7. [ ] **Tentukan struktur Tim** (Manager → SPV → Sales) — isi lewat UI Team (poin 51) atau kasih
   daftarnya, aku seed.
8. [ ] **Siapkan HP + nomor WA tiap Sales** untuk scan QR — 1 Sales 1 nomor, HP utama tetap online.
9. [ ] **Konfirmasi keputusan produk** (bisa nyusul saat jalan):
   - Daftar Segment final (SevenRent, SAP, Absensi, Bengkel, Gym, Custom App, + lainnya?)
   - Bobot Priority Score — pakai default `docs/06` (poin 25) dulu?
   - Grace period follow up & jam kerja (poin 50)

> Minimum biar aku mulai Fase 1: poin 1–3 beres (SUDAH). Poin 4–5 diverifikasi saat Fase 1,
> poin 6–9 jalan paralel.

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
1. [x] Skema Prisma modul Marketing (`prisma/schema.prisma:1081-1669`) sudah lengkap + ber-`@@index`
   (relasi & kolom filter: `temperature`, `outcome`, `priorityScore`, `lastInteractionAt`, dst).
   Diverifikasi — tidak ada yang kurang.
2. [x] Seed master data — `scripts/seed-marketing.ts` lengkap **& sudah dijalankan ke DB**
   (Segment, LeadSource, LeadActivityType, LeadFollowUpResultType, LeadLostReason).
   → Sisa: jalankan lagi di DB production saat deploy.
3. [x] Layout modul Marketing:
   - `src/components/marketing/MarketingShell.tsx` — sidebar (desktop) + bottom-nav (mobile) +
     header; nav: Beranda, Inbox, Lead, Follow Up, Tim, Dashboard + Hubungkan WhatsApp / Ganti
     Modul / Keluar. Semua role lihat semua menu.
   - `src/app/marketing/(shell)/layout.tsx` — gate `getCurrentUser("marketing")` + resolve role
     (Manager/SPV/Sales) untuk label. `/marketing/whatsapp` sengaja di luar grup (tetap chrome-less).
   - Stub page `MarketingComingSoon` untuk 6 route biar nav tidak 404. Build hijau.
4. [x] Helper izin server-side → `src/lib/marketing/permissions.ts`:
   - `canViewMarketing(user)` → semua anggota Tim `true` (operasi baca TIDAK difilter).
   - `resolveMarketingRole(userId, role)` → `MANAGER | SPV | SALES` (owner/manajer team = MANAGER).
   - `canActOnLead(user, leadId)` → `true` kalau MANAGER/SPV, atau SALES yang jadi PIC lead itu.
   - `actableLeadIds(user, leadIds)` → versi batch untuk list (anti N+1).
   Semua endpoint mutasi WAJIB cek `canActOnLead` → 403 kalau `false`.
5. [x] Helper `logAudit(...)` → `src/lib/marketing/audit.ts` (tulis `AuditLog` append-only).

---

## FASE 1 — Inbox & Percakapan (inti harian Sales) — SELESAI

6. [x] `GET /api/marketing/conversations` — list semua conversation; `scope=all|mine`,
   `filter=all|unread|priority|hot`, `q`, `page`/`limit`. Batch PIC + `actableLeadIds` (anti N+1),
   preview pesan terakhir via `messages take:1`. Tiap item bawa `canAct`.
7. [x] `GET /api/marketing/conversations/[id]/messages` — timeline (ambil 100 terbaru, `beforeId`
   untuk lebih lama), bawa meta lead + PIC + `canAct` + `hasWhatsappConnection`. Reset
   `unreadCustomerCount` HANYA kalau viewer = PIC.
8. [x] `POST /api/marketing/conversations/[id]/messages` — cek `canActOnLead` → 403; kirim via
   `sendWhatsappMessageFromSession(conn.wahubSessionId, …)` (nomor PIC); simpan `Message` OUTBOUND
   `senderUserId` + `deliveryStatus: "SENT"`; update `lastMessageAt` / `lastSalesMessageAt` /
   `lastInteractionAt`; `logAudit`.
9. [~] Delivery-status callback (SENT→DELIVERED→READ) **ditunda** — bentuk payload callback WAHUB
   dewari belum diketahui. Sekarang status berhenti di `SENT`. Wire saat lihat payload asli.
10. [x] Halaman `/marketing/inbox` (`InboxClient`) — filter tabs (Semua/Belum Dibalas/Prioritas/
    Hot) + toggle Semua Tim / Punya Saya + search (debounce) + unread badge + label "pantau" utk
    non-PIC. Filter server-side.
11. [x] Halaman `/marketing/inbox/[conversationId]` (`ConversationView`) — 1 layar: header lead
    (temperatur/segmen/outcome/PIC + link Detail) + timeline bubble + composer (Enter=kirim).
    Non-PIC: composer diganti banner "Kamu memantau lead ini (PIC: …)" + tombol **Ambil Alih**
    (disabled, nunggu Fase 7). Auto-scroll saat pesan bertambah.
12. [x] Realtime = polling: inbox tiap 15 dtk, conversation tiap 10 dtk (silent refresh).
    Profil ringkas panel terpisah & lazy-load pesan lama = enhancement nanti.

---

## FASE 2 — Lead Management — SELESAI

13. [x] `GET /api/marketing/leads` — list semua lead; `scope=all|mine`, `q`, `segmentId`,
    `temperature`, `stage`, `outcome`, `priorityLevel`, `picUserId`, `sort=priority|recent|created`,
    `page`/`limit`. Batch PIC + next-follow-up (`groupBy _min scheduledAt`) + `actableLeadIds` +
    `idleDays` (anti N+1). `GET /api/marketing/meta` — opsi segmen/sumber/lostReason/user/activity
    type/result type untuk dropdown.
14. [x] `GET /api/marketing/leads/[id]` — detail lengkap: identitas, segmen/sumber, temperatur,
    priority (+snapshot terakhir), aktivitas (30), follow up (30), riwayat penugasan, riwayat
    temperatur, conversations. Bawa `canAct` + `pic`.
15. [x] `PATCH /api/marketing/leads/[id]` — edit displayName/company/contact/email/city/segmentId
    (`canActOnLead` → 403). Ganti segmen → tulis `LeadSegmentHistory` (transaction). Audit before/after.
16. [x] Halaman `/marketing/leads` (`LeadListClient`) — tabel (desktop) + kartu (mobile), filter
    kombinasi (segmen/temp/tahap/outcome/prioritas/PIC/sort) + toggle Semua Tim/Punya Saya +
    search debounce. Kolom PIC selalu ada.
17. [x] Halaman `/marketing/leads/[id]` (`LeadDetailClient`) — section: header (+Chat), Temperatur,
    Outcome, Prioritas, Identitas & Segmen (form), Aktivitas, Follow Up, Riwayat Penugasan, Riwayat
    Temperatur. Tombol aksi disabled + banner "memantau" kalau `!canAct`. (Tambah aktivitas / buat
    follow up = Fase 3; Ambil Alih / Reassign = Fase 7.)
18. [x] `POST /api/marketing/leads/[id]/temperature` (COLD/WARM/HOT) — `canActOnLead`, no-op kalau
    sama, tulis `LeadTemperatureHistory`, panggil `recalcLeadPriority` (stub Fase 4), audit.
19. [x] `POST /api/marketing/leads/[id]/outcome` (OPEN/WON/LOST) — `canActOnLead`; WON→`wonAt`,
    LOST→wajib `lostReasonId`+`lostAt`, OPEN→bersihkan; audit. (Event timeline pakai audit dulu.)

---

## FASE 3 — Aktivitas & Follow Up — SELESAI

20. [x] `POST /api/marketing/leads/[id]/activities` — `canActOnLead`; geser `currentActivityStage`
    maju (rank NONE<DISCUSSION<ZOOM_DEMO<PROPOSAL<NEGOTIATION, tidak pernah mundur); update
    `lastInteractionAt`; `recalcLeadPriority` (stub); audit. UI: form inline di `LeadDetailClient`
    (jenis + waktu + catatan).
21. [x] `POST /api/marketing/leads/[id]/follow-ups` — `canActOnLead`; `assignedUserId` default ke
    PIC lead; status OPEN. UI: form inline di `LeadDetailClient` (waktu + tujuan + catatan).
22. [x] `POST /api/marketing/follow-ups/[id]/complete` — wajib `resultTypeId`; hitung `isOnTime`
    (grace 2 jam, `FOLLOW_UP_GRACE_MS`); opsi `next` → buat follow up lanjutan + link
    `nextFollowUpId` (transaction). `.../cancel` untuk batal. Komponen `CompleteFollowUpForm`
    dipakai di board & detail lead.
23. [x] Halaman `/marketing/follow-up` (`FollowUpBoard`) — tab Terlambat / Hari Ini / Akan Datang /
    Selesai (badge count scope-aware) + toggle Punya Saya / Semua Tim. `GET /api/marketing/follow-ups`
    (bucket derived dari status+scheduledAt, bukan kolom). Poll 30 dtk.
24. [x] Cron `runMarketingFollowupReminders` (`src/lib/cron/marketing-followup-reminders.ts`,
    tiap jam :05 di `instrumentation.ts`) — untuk tiap follow up OPEN yang ≤ now+3 jam, bikin
    `LeadNotification` ke PIC dengan `dedupeKey = followup:{id}:{DUE_SOON|DUE|OVERDUE}:{tanggal}`
    (`createMany skipDuplicates` → overdue nge-remind 1×/hari), set `reminderSentAt`.
    Pengiriman nyata (push/WA) = Fase 9.

---

## FASE 4 — Priority Engine — SELESAI

25. [x] `computeLeadPriority(input)` (`src/lib/marketing/priority.ts`) — deterministik, bobot
    Temperatur 25% / Aktivitas 30% / Hasil Follow Up 25% / Recency 10% / AI Signal 10%.
    `PRIORITY_RULE_VERSION = "v1"`. Lead non-OPEN → skor 0 / LOW. AI signal dibaca dari
    `LeadAiAnalysis` type BUYING_SIGNAL (default 0 sampai Fase 6).
26. [x] `recalcLeadPriority(leadId)` (dulu stub) — hitung, update `Lead.priorityScore`/`priorityLevel`,
    insert `LeadPrioritySnapshot` (5 komponen + `reasonJson` string[] + `ruleVersion`). Level
    TOP≥80 / HIGH≥60 / MONITOR≥40 / LOW.
27. [x] Trigger: ubah temperatur, aktivitas baru, follow up selesai, **ubah outcome**, **pesan
    masuk (webhook)**, **pesan keluar (POST messages)**. Script `scripts/recalc-marketing-priority.ts`
    untuk backfill semua lead.
28. [x] UI alasan: `LeadDetailClient` section Prioritas render `reasonJson` ("Hot · Negosiasi ·
    Idle 6 hari"). Beranda "Kerjakan Dulu" & list lead pakai skor/level terbaru.

---

## FASE 5 — Beranda Sales — SELESAI

29. [x] `GET /api/marketing/home` — `scope=mine|all`. KPI: `hotLeads`, `followUpToday`,
    `followUpOverdue`, `unrepliedChats` (semua scope-aware). "Kerjakan Dulu" = 10 lead OPEN urut
    `priorityScore` desc + alasan singkat (Hot/tahap/follow up terlambat/chat belum dibalas) +
    `nextAction` + `conversationId`. Batch next-follow-up / overdue / conv / `canAct` (anti N+1).
30. [x] Halaman `/marketing` (`HomeClient`, ganti stub) — 4 KPI card clickable (→ leads?temperature=HOT,
    follow-up, follow-up, inbox) + list "Kerjakan Dulu" (link lead + Buka Chat) + toggle Punya Saya /
    Semua Tim. Poll 20 dtk. (Notification bell = Fase 9, sudah ada placeholder disabled di shell.)

---

## FASE 6 — AI Analysis (async, tidak blocking chat) — SELESAI

31. [x] `analyzeLead(leadId)` (`src/lib/marketing/ai.ts`, `@anthropic-ai/sdk`, `claude-haiku-4-5`,
    `promptVersion "mkt-v1"`) — 1 call → 5 `LeadAiAnalysis` (versioned, `nextVersion` per tipe,
    status SUCCESS/FAILED). Endpoint `GET/POST /api/marketing/leads/[id]/ai` (POST gagal → 422, tidak
    fatal).
32. [x] Auto Segmentation — pilih `segmentCode` + confidence + reason. Auto-apply hanya kalau
    `confidence ≥ 0.7` DAN lead belum bersegmen (tulis `LeadSegmentHistory` source AI); selain itu
    tampil sebagai rekomendasi di section "AI Insight".
33. [x] Lead Profiling — companySize, buyingPower, buyingInterest, need, closingProbability, summary.
    UI dilabeli "AI Insight — Perkiraan".
34. [x] Conversation Summary — customerContext, needs, painPoints, objections, lastCommitment,
    nextAction. Versioned (tidak overwrite), tombol "Analisa ulang".
35. [x] Suggested Reply — `GET/POST /api/marketing/conversations/[id]/ai-suggestions` → 3
    `LeadAiSuggestion` (PROFESSIONAL/CASUAL/CLOSING). UI di `ConversationView`: "Saran AI" → pilih →
    isi composer (editable) → kirim dengan `aiSuggestionId` → `usedAt`/`usedByUserId` keset +
    `Message.aiSuggestionId`. Tidak auto-send.
36. [x] Next Best Action — action (7 enum) + reason + confidence, tampil di AI Insight.
37. [x] Panel "Saran AI" di percakapan + tombol "Buat ulang"; gagal AI = pesan error, chat tetap
    jalan. BUYING_SIGNAL feed ke Priority Engine (Fase 4).

---

## FASE 7 — Assignment / Reassign / Takeover — SELESAI

38. [x] `POST /api/marketing/leads/[id]/assignments` — `action: "takeover"` (caller jadi PIC, siapa
    pun boleh) atau `"reassign"` (ke `assignedUserId`, wajib `reason`, hanya MANAGER/SPV atau PIC
    aktif). Transaction: tutup assignment lama (`isActive:false`+`endedAt`) → buat baru
    (`TAKEOVER`/`PRIMARY`) → `LeadNotification` ke PIC baru (`dedupeKey assign:{id}`) → audit.
    Tolak kalau target sudah jadi PIC / tidak punya modul marketing.
39. [x] UI reassign di `LeadDetailClient` — tombol "Reassign PIC" (muncul untuk MANAGER/SPV atau
    PIC aktif): pilih user + alasan. Riwayat Penugasan section sudah menampilkan history.
    `GET /leads/[id]` sekarang balikin `viewerRole` + `isCurrentPic`.
40. [x] Tombol "Ambil Alih" di `ConversationView` (banner non-PIC) & `LeadDetailClient` sekarang
    aktif — 1 klik takeover, composer langsung kebuka setelah reload. Riwayat chat tetap "nempel"
    di nomor WA lama (takeover = ganti PIC + assignment, bukan pindah conversation).

### (rencana asli)

38. API `POST /api/marketing/leads/[id]/assignments` — assign / reassign / takeover. 1 active
    PRIMARY per lead, semua perubahan simpan actor + reason, kirim notifikasi ke PIC baru.
39. UI reassign di Lead Detail (SPV/Manager, scope divalidasi) + Assignment History.
40. Catatan: riwayat chat "nempel" di nomor WA Sales lama (1 nomor per Sales) — takeover =
    ganti PIC + assignment, bukan mindahin conversation. Dokumentasikan batasannya di UI.

---

## FASE 8 — SPV & Manager (view monitoring, bukan gerbang akses) — SELESAI

> Karena semua data sudah terbuka untuk semua Tim, halaman-halaman di fase ini adalah **cara
> pandang teragregasi** (per sales / per tim / funnel), bukan pembatas akses. Sales pun boleh
> membukanya kalau mau lihat performa tim.

41. [x] `GET /api/marketing/team` + halaman `/marketing/tim` (`TeamBoard`) — KPI per Sales (lead
    aktif, hot, FU hari ini/telat, chat belum dibalas, won bulan ini, on-time FU rate) via
    `buildTeamAggregates` (semua `groupBy`/`count` di DB, tanpa loop). Early Warning: "N Hot Lead
    milik X belum di-follow up" + "X punya N follow up terlambat" (≥3) + CTA.
42. [x] Halaman `/marketing/tim/[userId]` (`MemberDetail`) — KPI card member + daftar lead-nya
    (`?picUserId=`). (Trend/activity log detail = enhancement nanti.)
43. [x] `GET /api/marketing/dashboard` + halaman `/marketing/dashboard` (`ManagerDashboard`) — KPI
    (Total/Cold/Warm/Hot/Open/Won/Lost/FU Telat/On-Time FU rate) + funnel tahap (bar) + performa
    segmen (lead/won/konversi) + performa tim. (Avg Response Time & AI insight menyusul.)
44. [x] Performa Segmen & Performa Tim jadi section di `/marketing/dashboard`.

### (rencana asli)

---

## FASE 9 — Notification & Audit — SELESAI

45. [x] `createNotification()` (`src/lib/marketing/notify.ts`) — dedupe via `dedupeKey` unik
    (`createMany skipDuplicates`). Produser aktif: follow up due/overdue (cron), lead di-assign /
    takeover / reassign (assignments route), **pesan customer baru** (webhook, dedupe per menit).
    Semua ditarget ke PIC. (Eskalasi SPV & AI signal menyusul.)
46. [x] `GET/POST /api/marketing/notifications` (list 50 + unreadCount; mark `{id}` / `{all:true}`).
    `NotificationBell` di `MarketingShell` (badge unread, poll 30 dtk, tandai semua dibaca, klik →
    deep link + auto-mark). Menggantikan bell disabled.
47. [~] Web Push — `GET/POST/DELETE /api/marketing/push` (VAPID public key + simpan/hapus
    `PushSubscription`). `sendWebPush()` stub (no-op sampai VAPID di-set). **Service worker +
    subscribe UI + `npm i web-push` = Fase 10.**
48. [x] Section "Timeline / Audit" di `LeadDetailClient` — `AuditLog` (entityType lead +
    conversation lead ini) 40 terakhir, label Indonesia (`AUDIT_LABEL`), actor + waktu.

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

- **MVP minimum = Fase 0 → 1 → 2 → 3 → 5 → SELESAI ✅** (Sales bisa kerja penuh dari HP tanpa AI &
  tanpa dashboard atasan). Toggle "Punya Saya / Semua" + full transparansi chat ikut sejak Fase 1–2,
  jadi "saling pantau semua lead" sudah tercapai.
- **Berikutnya:** Fase 4 (Priority Engine — sekarang `recalcLeadPriority` masih stub, skor manual),
  lalu Fase 6 (AI) & Fase 7 (Ambil Alih/Reassign) & Fase 8 (SPV/Manager) & Fase 9 (Notif/Push).
- Setiap fase: `npx tsc --noEmit` + `npm run build` bersih sebelum commit; auto commit & push per
  aturan `CLAUDE.md`.

## Sisa tugas non-coding sebelum benar-benar dipakai (lihat juga checklist "YANG HARUS KAMU KERJAKAN")

- Deploy env `MARKETING_WAHUB_*`, `APP_BASE_URL`, `WAHUB_WEBHOOK_SECRET` ke production `simple.onyseven.com`.
- `npx tsx scripts/seed-marketing.ts` di DB production.
- Verifikasi webhook WAHUB dewari tembus + cocokkan bentuk payload (poin 0a).
- Daftarkan user Sales/SPV/Manager + `User.modules` berisi `"marketing"`; susun Tim.
- Tiap Sales scan QR di `/marketing/whatsapp`.
