# 07 — AI Agent: Modul Marketing

**Status:** Draft — dokumen kebutuhan (requirement gathering), belum ada implementasi.

**Tujuan dokumen:** Menangkap kebutuhan, scope, dan desain AI Agent yang akan berjalan di modul Marketing, sebelum masuk ke implementasi.

---

## 1. Konteks Existing (hasil eksplorasi codebase)

Modul Marketing saat ini (`src/app/marketing/(shell)/*`, `src/components/marketing/*`, `src/app/api/marketing/*`, `src/lib/marketing/*`) sudah punya:

- **Lead management**: `Lead`, `LeadSource`, `LeadSegmentHistory`, `LeadTemperatureHistory`, `LeadAssignment`, `LeadActivity`, `LeadNote`, dsb.
- **Follow-up otomatis**: `src/lib/marketing/auto-follow-up.ts` (`ensureAutoFollowUp`) — auto-schedule `LeadFollowUp` berdasarkan segment/settings offset, dipicu dari 4 tempat (lead baru, pesan masuk, aktivitas dicatat, follow-up selesai tanpa next).
- **AI analysis existing** (`src/lib/marketing/ai.ts`, fungsi `analyzeLead`): pakai Anthropic SDK (`claude-haiku-4-5` untuk cron/fast, `claude-sonnet-5` untuk manual/deep) — menghasilkan `LeadAiAnalysis` & `LeadAiSuggestion` (segmentasi, profiling, summary, next-best-action, buying signal). Dipanggil dari `api/marketing/leads/[id]/ai/route.ts` dan cron `marketing-ai-reanalysis.ts`.
- **AI reply suggestion**: `api/marketing/conversations/[id]/ai-suggestions/route.ts`.
- **AI Agent lain (di luar Marketing)**: `src/lib/agent.ts` + `src/lib/agent-tools.ts` — WhatsApp assistant untuk staff/client billing query, tool-calling loop, model `claude-haiku-4-5`, history di `WhatsappThread`.

Jadi sudah ada fondasi "AI analysis" (satu-arah, generate insight), tapi belum ada "AI Agent" penuh (tool-calling, bisa ambil aksi) yang scoped ke Marketing.

---

## 2. Kebutuhan (diisi dari diskusi)

> Bagian ini akan diisi bertahap seiring diskusi dengan user.

### 2.1 Tujuan / Masalah yang mau diselesaikan
1. **Backup tim Sales saat lead terlalu lama tidak dijawab.** Kalau sales tidak merespon chat lead dalam waktu tertentu, AI Agent turun tangan menjawab supaya lead tidak ditinggal / dingin.
2. **Follow-up terjadwal ke lead-lead lama** (outcome `CLIENT_LAMA` — lihat `client-lama/page.tsx`, nomor lama yang WA lagi/perlu di-reaktivasi). AI Agent proaktif follow-up sesuai jadwal, bukan cuma reaktif menjawab.
- (kemungkinan tujuan lain menyusul)

### 2.2 Peran Agent
- Backup responder untuk chat lead yang telat dijawab sales (WhatsApp inbox marketing).
- Scheduler + composer follow-up terjadwal untuk lead lama (`CLIENT_LAMA`).
- TBD tujuan/peran lain

### 2.3 Channel / Interface
- TBD (dashboard internal, WhatsApp langsung ke lead, dsb)

### 2.4 Scope Data & Aksi — Fitur "Backup Sales"
- **Trigger — 2 mode berbeda tergantung jam:**
  - **Jam 05:00–20:00 (jam kerja diperluas s.d. jam 8 malam, bukan cuma `working_hours.end_hour`=17)**: Cika tunggu dulu, threshold **5 menit** unreplied (setting baru `ai_backup.unreplied_minutes`, default 5) sebelum take over. Berlaku semua lead, tidak dibatasi HOT saja.
  - **Di atas jam 20:00 (malam) DAN sepanjang hari libur (Minggu selalu, Sabtu jika `working_hours.saturday`=0)**: Cika **full ambil alih otomatis** sejak pesan masuk (tidak nunggu 5 menit) — sales dianggap tidak available.
  - Catatan implementasi: window "17:00–20:00" sengaja **tetap ikut aturan 5 menit** (bukan ikut `working_hours.end_hour` yang berhenti di 17:00) — jadi perlu jam cutover terpisah (`20`) khusus fitur ini, tidak sekadar reuse `working_hours.end_hour`.
- **Delay buatan di luar jam kerja/hari libur**: saat mode full-auto (malam/libur), Cika **tidak langsung** balas — beri jeda **10–15 detik** dulu sebelum kirim, supaya terasa natural (tidak seperti bot instan).
- **Aksi**: AI **langsung kirim balasan** ke WhatsApp lead (bukan draft/approval) begitu kondisi take-over terpenuhi.
- **Setelah AI balas**: notify sales (pakai `createNotification` seperti pola escalation existing) bahwa AI sudah backup jawab lead ini → sales lanjut manual seperti biasa begitu online/available. AI tidak terus memegang percakapan.

### 2.4b Scope Data & Aksi — Fitur "Follow-up Terjadwal Client Lama"
- **Sumber jadwal**: reuse sistem `LeadFollowUp` / `auto-follow-up.ts` yang sudah ada (bukan bikin scheduler baru) — AI cuma jadi "executor" yang generate & kirim pesan begitu follow-up jatuh tempo untuk lead outcome `CLIENT_LAMA`.
- **Konten pesan**: di-generate dinamis oleh AI (Claude) berdasarkan histori/context lead tsb (personalized per lead, bukan template statis).
- **Approval**: tidak perlu — konsisten dengan fitur backup responder, AI langsung kirim ke WhatsApp lead.

### 2.5 Batasan & Guardrail
- Approval manusia: **tidak perlu**, AI langsung kirim (disepakati user, demi real-time backup).
- **Context terbatas ke data yang tercatat di sistem** (histori chat WhatsApp / `Message`, `LeadActivity`, `LeadNote`). AI **tidak tahu** kalau sales pernah Zoom/telepon dengan client kalau interaksi itu tidak dicatat sebagai activity/note di sistem — jadi ada risiko AI mengulang pertanyaan/informasi yang sebenarnya sudah dibahas sales lewat kanal offline itu. Perlu diingatkan ke tim sales: catat ringkasan hasil Zoom/telp sebagai `LeadActivity`/`LeadNote` supaya AI ikut "tahu".
- Jam/hari trigger sudah diputuskan (lihat §2.4). TBD: role yang boleh ubah setting ini di halaman Settings.

### 2.6a Persona
- **Nama**: **Cika** — persona AI Agent perempuan, dipakai sebagai identitas saat membalas chat lead (bukan tampil sebagai "AI/bot" generik).
- **Sifat**: sopan, ramah, pintar, solutif (bisa kasih solusi ke calon customer — detail solusi/knowledge base apa saja **dibahas menyusul**, belum final).
- **Peran bisnis**: bukan sekadar penjawab template — berperan sebagai **konsultan**, karena produk yang dijual tim Marketing adalah **aplikasi/software** (lihat `docs/01-project-overview.md` §2: SevenRent, SAP, Absensi, Bengkel, Gym, Custom Application, dst). Jadi gaya bicara Cika perlu bisa menggali kebutuhan lead & mengarahkan ke produk yang cocok, bukan cuma balas basa-basi/isi kekosongan.
- TBD: tone of voice detail (formal vs santai), apakah nama "Cika" disebut eksplisit ke lead (misal signature pesan) atau cuma internal, dan knowledge base/SOP solusi konsultasi per produk.

### 2.6 Model & Biaya
- TBD (pakai `claude-haiku-4-5` vs `claude-sonnet-5`, kapan pakai yang mana)
- API key Anthropic sudah tersedia (dari Console project "director_assistant_agent"), reuse env var `ANTHROPIC_API_KEY` yang sudah dipakai di `src/lib/agent.ts` & `src/lib/marketing/ai.ts` — tidak perlu setup key baru.

---

## 3. Desain Teknis

> Diisi setelah kebutuhan di atas jelas.

---

## 4. Acceptance Criteria

> Diisi setelah desain disepakati.
