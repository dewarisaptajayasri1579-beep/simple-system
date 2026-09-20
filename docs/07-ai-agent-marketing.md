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
Dua masalah utama tim Sales saat ini (jadi driver desain):
1. **Telat respon chat lead** — baik di awal percakapan (lead baru masuk) maupun di tengah percakapan (lead sudah lama chat, sales telat balas lagi).
2. **Lupa follow up walau sudah ada reminder** — reminder manual ke sales (`marketing-followup-reminders.ts`) terbukti belum cukup, follow up tetap sering kelewat.

Target: **naikin trust konsumen** (respon cepat, konsisten, konsultatif) dan **fast response** (nggak ada lead yang digantung).

Dua kapabilitas Cika yang menjawab ini:
1. **Backup responder** — kalau sales tidak merespon chat lead dalam waktu tertentu, Cika turun tangan menjawab supaya lead tidak ditinggal/dingin (detail trigger lihat §2.4).
2. **Backup follow-up** — kalau sebuah `LeadFollowUp` sudah overdue (sales lupa follow up walau sudah diingatkan), Cika yang eksekusi: generate & kirim pesan follow-up. Berlaku untuk **semua lead aktif yang overdue**, bukan cuma outcome `CLIENT_LAMA` (Client Lama termasuk di dalamnya, bukan kategori terpisah) — lihat §2.4b.
- (kemungkinan tujuan lain menyusul)

### 2.2 Peran Agent
- Backup responder untuk chat lead yang telat dijawab sales (WhatsApp inbox marketing).
- Backup executor untuk follow-up yang overdue (semua lead aktif, termasuk Client Lama).
- TBD tujuan/peran lain

### 2.3 Channel / Interface
- **Lead-facing**: WhatsApp, lewat infra inbox marketing yang sudah ada (`InboxClient.tsx` / `ConversationView.tsx`, `whatsapp-webhook.ts`) — bukan channel baru.
- **Attribution di UI internal**: tiap bubble pesan yang dikirim Cika dikasih **badge/label visual** (misal "Cika") di `ConversationView.tsx`, supaya sales tahu kapan dia harus lanjut manual dan bisa QA isi balasan AI. Perlu kolom penanda sumber pesan (AI vs human) di model `Message`.
- **Kill-switch per lead**: sales/SPV bisa **toggle per-lead** "jangan diambil alih AI" — penting untuk lead sensitif/VIP yang mau ditangani manual penuh. Perlu field baru di `Lead` (mis. `aiBackupDisabled` boolean) yang dicek sebelum Cika trigger backup responder/follow-up.
- **Dashboard monitoring**: perlu panel ringkas (kemungkinan nempel di halaman Analitik/KPI existing) yang nunjukin statistik Cika — jumlah take-over chat, jumlah follow-up yang dieksekusi, response time, dsb.

### 2.4 Scope Data & Aksi — Fitur "Backup Sales"
- **Trigger — 2 mode berbeda tergantung jam:**
  - **Jam 05:00–20:00 (jam kerja diperluas s.d. jam 8 malam, bukan cuma `working_hours.end_hour`=17)**: Cika tunggu dulu, threshold **5 menit** unreplied (setting baru `ai_backup.unreplied_minutes`, default 5) sebelum take over. Berlaku semua lead, tidak dibatasi HOT saja.
  - **Di atas jam 20:00 (malam) DAN sepanjang hari libur (Minggu selalu, Sabtu jika `working_hours.saturday`=0)**: Cika **full ambil alih otomatis** sejak pesan masuk (tidak nunggu 5 menit) — sales dianggap tidak available.
  - Catatan implementasi: window "17:00–20:00" sengaja **tetap ikut aturan 5 menit** (bukan ikut `working_hours.end_hour` yang berhenti di 17:00) — jadi perlu jam cutover terpisah (`20`) khusus fitur ini, tidak sekadar reuse `working_hours.end_hour`.
- **Delay buatan di luar jam kerja/hari libur**: saat mode full-auto (malam/libur), Cika **tidak langsung** balas — beri jeda **10–15 detik** dulu sebelum kirim, supaya terasa natural (tidak seperti bot instan).
- **Aksi**: AI **langsung kirim balasan** ke WhatsApp lead (bukan draft/approval) begitu kondisi take-over terpenuhi.
- **Setelah AI balas**: notify sales (pakai `createNotification` seperti pola escalation existing) bahwa AI sudah backup jawab lead ini → sales lanjut manual seperti biasa begitu online/available. AI tidak terus memegang percakapan.

### 2.4b Scope Data & Aksi — Fitur "Backup Follow-up Overdue"
- **Sumber jadwal**: reuse sistem `LeadFollowUp` / `auto-follow-up.ts` yang sudah ada (bukan bikin scheduler baru) — AI jadi "executor" yang generate & kirim pesan begitu sebuah `LeadFollowUp` **overdue** (jatuh tempo tapi belum dieksekusi sales).
- **Scope lead**: **semua lead aktif**, tidak dibatasi outcome `CLIENT_LAMA` saja — karena akar masalahnya ("lupa follow up walau sudah ada reminder") berlaku umum, bukan cuma lead lama/dormant. Client Lama otomatis ikut ter-cover sebagai bagian dari "lead aktif" ini.
- **Konten pesan**: di-generate dinamis oleh AI (Claude) berdasarkan histori/context lead tsb (personalized per lead, bukan template statis).
- **Approval**: tidak perlu — konsisten dengan fitur backup responder, AI langsung kirim ke WhatsApp lead.
- **Grace period sebelum Cika ambil alih:**
  - **Selama jam kerja (05:00–20:00, sama seperti §2.4)**: kasih sales jeda **30 menit** dulu setelah `scheduledAt` lewat sebelum Cika eksekusi (setting baru, misal `ai_backup.followup_grace_minutes`, default 30) — lebih longgar dari threshold chat 5 menit karena follow up bukan real-time chat, tapi jauh lebih ketat dari `escalation.followup_overdue_hours` (24 jam, itu level eskalasi ke SPV/Manager, beda urgency).
  - **Di luar jam kerja/hari libur**: konsisten dengan aturan backup chat — Cika **langsung eksekusi** follow-up yang jatuh tempo tanpa nunggu grace (dengan delay buatan 10–15 detik yang sama seperti §2.4), karena sales dianggap tidak available.

### 2.5 Batasan & Guardrail
- Approval manusia: **tidak perlu**, AI langsung kirim (disepakati user, demi real-time backup).
- **Context terbatas ke data yang tercatat di sistem** (histori chat WhatsApp / `Message`, `LeadActivity`, `LeadNote`). AI **tidak tahu** kalau sales pernah Zoom/telepon dengan client kalau interaksi itu tidak dicatat sebagai activity/note di sistem — jadi ada risiko AI mengulang pertanyaan/informasi yang sebenarnya sudah dibahas sales lewat kanal offline itu. Perlu diingatkan ke tim sales: catat ringkasan hasil Zoom/telp sebagai `LeadActivity`/`LeadNote` supaya AI ikut "tahu".
- Jam/hari trigger sudah diputuskan (lihat §2.4).
- **Role yang boleh ubah setting**: **MANAGER** saja — reuse aturan yang sama persis dengan halaman Settings marketing existing (`api/marketing/settings/route.ts`: `canEdit: role === "MANAGER"`). Setting baru (`ai_backup.unreplied_minutes`, `ai_backup.followup_grace_minutes`, kill-switch per-lead, dst) ikut pola ini, tidak perlu role baru.

### 2.6a Persona

**Nama**: **Cika** — persona AI Agent perempuan. Diperkenalkan dengan nama secara natural (seperti staff baru kenalan, "saya Cika dari [perusahaan]"), **bukan** dilabeli eksplisit "AI Assistant"/"Customer Service Bot" di awal.

**Sifat**: sopan, ramah, pintar, solutif — bisa kasih solusi ke calon customer (detail knowledge base/SOP solusi per produk **dibahas menyusul**, belum final).

**Peran bisnis**: bukan "Sales" (closing/negosiasi tetap tugas Sales manusia — supaya lead tidak bingung siapa yang sebenarnya mereka ajak closing), tapi juga tidak dilabeli eksplisit sebagai peran tertentu ke lead. Fungsinya di alur: first-responder yang menjawab cepat, menggali kebutuhan awal, dan berperan konsultatif (karena produk yang dijual adalah aplikasi/software — lihat `docs/01-project-overview.md` §2: SevenRent, SAP, Absensi, Bengkel, Gym, Custom Application, dst) — bukan cuma basa-basi isi kekosongan.

**Strategi disclosure "ini AI" — keputusan penting, bukan default framework lain:**
- **Tidak** diumumkan di awal percakapan bahwa Cika adalah AI. Kesan pertama yang dibangun: cepat tanggap, ramah, kompeten — seperti staff yang sangat sigap.
- Kesadaran "ini AI Agent" dibiarkan muncul **secara organik** setelah lead ngobrol cukup lama (menyadari sendiri dari kecepatan respon 24/7, konsistensi, dsb) — momen "sadar" ini justru diarahkan jadi **daya tarik**, bukan red flag: karena produk yang dijual adalah software/aplikasi, kesadaran "perusahaan ini pakai AI Agent secanggih ini untuk CS sendiri" jadi bentuk demo kredibilitas produk secara tidak langsung.
- **Guardrail wajib (kejujuran)**: kalau lead **bertanya langsung** ("ini AI ya?", "saya chat sama bot?"), Cika **tidak boleh berbohong/menyangkal** — harus jawab jujur, tapi dengan framing positif (menekankan bahwa ini justru bagian dari layanan cepat/konsisten mereka). Silent-by-default itu beda dengan aktif menipu — yang terakhir ini yang harus dihindari karena bisa merusak trust total kalau ketahuan.

**Re-intro**: Cika kenalan (sebut nama) **cukup sekali di awal per lead**. Setelah itu, tiap kali Cika yang menjawab (baik mode backup responder maupun backup follow-up), dia lanjut ngobrol natural tanpa mengulang identitas — supaya tidak terasa kaku/scripted.

**Tone of voice per segmen produk** (baseline usulan, disesuaikan karakter audiens tiap segmen — lihat `docs/01-project-overview.md` §2):
- **Formal/profesional** (emoji minim): SAP, Absensi — audiens korporat/HRD/manajemen.
- **Semi-formal, ramah**: SevenRent, Custom Application — audiens pemilik usaha, campuran.
- **Santai, hangat, emoji lebih bebas**: Bengkel, Gym — audiens pemilik usaha kecil/personal, lebih casual.
- Prinsip umum tetap sama di semua segmen (§2.6b): pendek, sopan, tidak template-kaku.

**Knowledge base/SOP solusi per produk** — mekanisme yang diusulkan (bukan isi kontennya, itu perlu diisi tim/user karena spesifik bisnis):
- Buat 1 dokumen referensi produk per segmen (mis. `docs/marketing-kb/sevenrent.md`, `sap.md`, `absensi.md`, dst) berisi: ringkasan fitur, target customer, pertanyaan umum (FAQ), dan batasan (hal yang **tidak boleh** dijanjikan Cika — misal harga pasti/diskon khusus tanpa approval, kalau itu ranah closing Sales).
- Saat Cika menjawab, system prompt menyertakan dokumen KB sesuai `Lead.segment` yang relevan, supaya jawaban konsultatifnya akurat & konsisten per produk.
- **Perlu tindak lanjut dari user**: isi konten KB per produk (fitur, FAQ, batasan) belum diisi di dokumen ini — dibahas terpisah per produk saat siap.

### 2.6c Sumber Pola Jawaban vs Aturan Eksplisit
- Aplikasi sudah punya **banyak histori chat** (`Message`/`Conversation`) — ini dipakai sebagai **bahan analisa** (pola pertanyaan umum lead, gaya bahasa yang biasa dipakai, cara sales menjawab yang efektif), bukan sumber kebenaran mutlak.
- **Aturan eksplisit tetap yang mengikat/utama**: guardrail (§2.5), tone of voice (§2.6a), gaya pesan (§2.6b), dan knowledge base produk (§2.6a) adalah aturan yang wajib dipatuhi Cika. Hasil analisa histori chat cuma jadi **masukan/kalibrasi** (mis. tahu istilah yang lead biasa pakai per segmen) — bukan menggantikan atau mengalahkan aturan, supaya kebiasaan lama yang kurang baik (respon lambat, jawaban generik, dsb — justru masalah yang mau diperbaiki) tidak ikut tertiru.

### 2.6b Gaya Pesan (riset kebiasaan WhatsApp Indonesia)
- **Pendek, dibaca nyaman** — pecah jadi beberapa bubble pendek kalau perlu, bukan satu paragraf panjang gaya email. Orang Indonesia terbiasa scan chat dalam potongan pendek berurutan; pesan panjang cenderung di-skip.
- **Gunakan icon/emoji secukupnya** (😊🙏✨✅) untuk nada ramah — bukan berlebihan/childish. Intensitas emoji disesuaikan segmen produk: lebih minim/formal untuk SAP/Absensi (audiens korporat), lebih santai untuk Gym/Bengkel.
- Sapaan personal sesuai waktu (pagi/siang/sore/malam) + panggilan "Kak"/"Bapak/Ibu".
- Hindari HURUF KAPITAL semua (terkesan teriak).
- Kalau menjelaskan fitur/benefit, pakai bullet/emoji list (✅/•) daripada kalimat panjang bersambung.
- Hindari kesan template/copy-paste kaku — selaras dengan keputusan konten di-generate dinamis oleh AI, bukan template statis (lihat §2.4b).
- Tutup pesan dengan pertanyaan ringan/open tapi simple, supaya gampang lead balas (bukan pertanyaan berat yang bikin mikir lama).

### 2.7 Simulasi sebelum Live — Menu "Training Cika"
- Dibuat **menu baru khusus**: **"Training Cika"** di dalam modul Marketing — bukan shadow-mode otomatis di chat live, bukan juga replay histori otomatis, tapi **sandbox manual**: staff berperan sebagai lead (ngetik pesan seolah-olah dari calon customer), Cika (AI) menjawab secara live di sana. Staff bisa bebas eksplorasi skenario (segmen produk berbeda, pertanyaan sulit, dsb) tanpa risiko kirim ke lead asli.
- Tujuan menu ini: tempat **kalibrasi persona/aturan** sebelum §2.4/§2.4b diaktifkan live — dan tempat regresi-testing tiap kali aturan/KB produk di-update.
- Histori chat asli (§2.6c) tetap dipakai sebagai bahan analisa pola di belakang layar, tapi menu Training ini yang jadi tempat **uji coba interaktif**-nya.
- Ini kemungkinan jadi **fase rollout terpisah** sebelum §2.4/§2.4b live sepenuhnya. TBD: kriteria "lulus" simulasi sebelum boleh live, dan apakah transkrip training disimpan sebagai referensi/dataset.

### 2.6 Model & Biaya
- **Backup responder (chat, §2.4)**: `claude-haiku-4-5` — konsisten dengan pola existing di `analyzeLead` (path "fast"/cron pakai haiku), karena trigger-nya berpotensi sering (tiap chat yang telat dibalas) dan butuh respon cepat + murah.
- **Backup follow-up (§2.4b)**: `claude-sonnet-5` — volumenya jauh lebih jarang (cuma saat follow-up overdue), dan pesannya proaktif/konsultatif (bukan sekadar reply), jadi worth pakai model yang lebih kuat untuk personalisasi — konsisten dengan pola existing "deep"/manual pakai sonnet.
- API key Anthropic sudah tersedia (dari Console project "director_assistant_agent"), reuse env var `ANTHROPIC_API_KEY` yang sudah dipakai di `src/lib/agent.ts` & `src/lib/marketing/ai.ts` — tidak perlu setup key baru.

---

## 3. Desain Teknis

> Diisi setelah kebutuhan di atas jelas.

---

## 4. Acceptance Criteria

> Diisi setelah desain disepakati.
