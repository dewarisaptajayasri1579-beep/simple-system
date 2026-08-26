# 01 — Project Overview: Simple Lead

**Dokumen:** Project Overview  
**Project:** Simple Lead  
**Versi baseline:** 1.0  
**Platform:** Progressive Web App (PWA) untuk Sales, SPV, dan Manager Marketing  
**Bahasa UI utama:** Bahasa Indonesia  
**Tujuan dokumen:** Menjelaskan konteks, tujuan, pengguna, ruang lingkup, konsep inti, istilah, dan arsitektur tingkat tinggi agar AI Coding Agent dapat memahami project dari nol.

---

## 1. Ringkasan Produk

**Simple Lead** adalah aplikasi manajemen lead berbasis PWA yang berpusat pada percakapan WhatsApp, pengelolaan lead, follow up, monitoring tim, dan AI Sales Assistant.

Aplikasi sengaja **tidak dibuat seperti CRM besar** yang memiliki terlalu banyak form, menu, dan administrasi. Prinsip utamanya:

> Sales harus merasa sedang bekerja dari inbox dan daftar pekerjaan, bukan sedang mengisi CRM.

Simple Lead harus membantu pengguna menjawab lima pertanyaan utama:

1. Siapa calon customer yang harus saya tangani sekarang?
2. Apa kebutuhan calon customer tersebut?
3. Seberapa potensial lead tersebut?
4. Apa tindakan berikutnya yang harus dilakukan?
5. Kapan lead tersebut harus di-follow up?

AI dipakai untuk membantu membaca percakapan, mengklasifikasikan segmentasi produk, membuat profiling, merangkum percakapan, mengenali buying signal, memberi saran follow up, dan membantu menentukan prioritas. AI **tidak boleh menjadi satu-satunya sumber keputusan bisnis**; pengguna tetap dapat mengoreksi hasil AI.

---

## 2. Masalah yang Ingin Diselesaikan

Tim sales menjual banyak produk seperti:

- SevenRent
- SAP
- Absensi
- Bengkel
- Gym
- Custom Application
- dan segmentasi lain yang dapat bertambah.

Lead banyak masuk melalui WhatsApp. Masalah umum:

- Lead bercampur dalam satu inbox.
- Sales kesulitan mengingat konteks chat lama.
- Lead penting dapat tenggelam oleh chat baru.
- Follow up bergantung pada ingatan sales.
- Status Cold/Warm/Hot sering subjektif.
- SPV kesulitan mengetahui siapa yang tidak follow up.
- Manager sulit melihat kondisi seluruh pipeline.
- Sulit mengetahui aktivitas sales terakhir terhadap sebuah lead.
- Sulit membandingkan kualitas lead antar segmentasi.
- Ketika satu nomor WhatsApp ditangani beberapa sales, sulit mengetahui sales mana yang membalas.
- Pergantian PIC membuat konteks lead mudah hilang.
- Data percakapan belum otomatis berubah menjadi insight.

Simple Lead harus membuat proses ini terstruktur tanpa membuat input manual berlebihan.

---

## 3. Positioning Produk

Simple Lead sebaiknya diposisikan sebagai:

> **AI Sales Inbox + Lead Management + Follow Up Control**

Bukan sebagai CRM generik.

Nilai utama aplikasi:

- Inbox WhatsApp terpusat.
- Lead otomatis tersegmentasi.
- Setiap balasan memiliki identitas sales internal.
- Status lead mudah dipahami.
- Aktivitas sales tercatat.
- Follow up terjadwal dan memiliki hasil.
- Sistem menghitung prioritas.
- AI memberi saran tindakan dan saran balasan.
- SPV memonitor tim.
- Manager melihat control tower marketing.

---

## 4. Platform

Semua role menggunakan **satu aplikasi PWA yang sama**.

Contoh domain:

`app.simplelead.id`

Tidak perlu membuat aplikasi terpisah untuk Sales, SPV, dan Manager.

Setelah login, backend menentukan role dan scope data pengguna. Frontend menampilkan pengalaman yang sesuai dengan role dan ukuran layar.

### 4.1 Mobile

Diprioritaskan untuk:

- Sales
- SPV

Karakter UI:

- mobile-first,
- bottom navigation,
- tombol mudah disentuh,
- satu kolom,
- informasi penting besar,
- flow cepat,
- terasa seperti aplikasi native.

### 4.2 Desktop

Diprioritaskan untuk:

- Manager Marketing
- SPV ketika membutuhkan monitoring lebih luas.

Karakter UI:

- sidebar,
- tabel dan dashboard lebih luas,
- filter,
- monitoring tim,
- analytics,
- AI insight.

### 4.3 PWA Requirements

PWA minimal mendukung:

- install to home screen,
- manifest,
- service worker,
- responsive UI,
- push notification,
- deep link dari notification ke halaman terkait,
- cache shell aplikasi,
- graceful handling ketika koneksi lambat.

**Catatan:** realtime data ketika aplikasi sedang terbuka dan push notification ketika aplikasi berada di background/closed adalah dua mekanisme berbeda. Implementasi harus memisahkan keduanya.

---

## 5. Pengguna dan Hak Akses Utama

### 5.1 Sales

Fokus: menangani lead milik sendiri.

Sales dapat:

- melihat Home miliknya,
- melihat Inbox yang menjadi scope-nya,
- membuka percakapan,
- membalas pesan,
- melihat profil lead,
- melihat AI profiling,
- melihat AI suggestion,
- mengubah temperatur lead jika memiliki permission,
- mencatat aktivitas,
- membuat follow up,
- mengisi hasil follow up,
- melihat reminder,
- melihat prioritas lead,
- melihat histori lead,
- menerima lead yang di-assign.

Sales tidak boleh:

- melihat seluruh data sales lain,
- melihat seluruh performa organisasi,
- mengubah struktur tim,
- mengubah master permission,
- menghapus audit log.

### 5.2 SPV

Fokus: menangani lead bila diperlukan dan memonitor sales dalam timnya.

SPV dapat:

- melakukan fungsi Sales untuk lead yang menjadi scope-nya,
- melihat seluruh sales di bawah timnya,
- melihat lead per sales,
- melihat lead prioritas,
- melihat follow up terlambat,
- melihat chat belum dibalas,
- melihat Hot Lead yang idle,
- melihat KPI tim,
- melihat early warning,
- reassign lead dalam scope tim jika diizinkan,
- mengambil alih lead jika diperlukan.

SPV tidak boleh secara otomatis membalas atas nama sales lain tanpa proses `Take Over` atau `Reassign`.

### 5.3 Manager Marketing

Fokus: control tower dan keputusan.

Manager dapat:

- melihat seluruh tim yang menjadi scope organisasi,
- melihat funnel,
- melihat performa segmentasi,
- melihat KPI Sales dan SPV,
- melihat lead monitoring,
- melihat inbox monitoring,
- melihat follow up monitoring,
- melihat analytics,
- melihat AI managerial insight,
- melihat early warning,
- mengelola master segmentasi bila memiliki permission,
- mengelola aturan SLA dan scoring bila memiliki permission.

---

## 6. Struktur Organisasi

Struktur minimal:

```text
Manager Marketing
|
+-- SPV A
|   +-- Sales A1
|   +-- Sales A2
|   +-- Sales A3
|
+-- SPV B
    +-- Sales B1
    +-- Sales B2
```

Sistem harus menyimpan hubungan ini sebagai data, bukan hard-code.

Setiap user memiliki minimal:

- `role`
- `team_id`
- `supervisor_id` bila relevan
- `is_active`

Scope data harus divalidasi oleh backend.

---

## 7. Konsep Data Bisnis yang Wajib Dipisahkan

### 7.1 Segmentasi

Menjawab:

> Lead ini tertarik produk apa?

Contoh:

- SAP
- SevenRent
- Bengkel
- Gym
- Absensi

Segmentasi **bukan indikator kualitas**.

### 7.2 Temperatur Lead

Menjawab:

> Seberapa kuat minat lead saat ini?

Nilai:

- Cold
- Warm
- Hot

Urutan kualitas:

`Cold < Warm < Hot`

### 7.3 Aktivitas / Tahap Interaksi

Menjawab:

> Sejauh apa proses sales telah berjalan?

Urutan utama:

`Diskusi → Zoom/Demo → Kirim Penawaran → Negosiasi`

Aktivitas dapat memiliki jenis tambahan, tetapi empat jenis di atas adalah baseline.

### 7.4 Follow Up

Menjawab:

> Kapan lead harus dihubungi lagi dan apa hasilnya?

Follow up harus mempunyai jadwal, log, hasil, dan next action.

### 7.5 Umur Lead

Menjawab:

> Sudah berapa lama sejak lead pertama kali masuk?

Umur lead tidak sama dengan `idle time`.

### 7.6 Idle Time

Menjawab:

> Sudah berapa lama tidak ada interaksi meaningful dengan lead?

Idle time lebih relevan untuk reminder dan prioritas.

### 7.7 Deal Outcome

Menjawab:

> Apakah proses akhirnya berhasil atau gagal?

Gunakan field terpisah:

- OPEN
- WON
- LOST

Jangan gunakan `Closing` sebagai temperatur.

---

## 8. Konsep Prioritas Lead

Setiap lead mempunyai **Priority Score 0–100**.

Tujuannya bukan untuk menggantikan judgement sales, tetapi untuk menyusun urutan kerja.

Baseline komponen:

| Komponen | Bobot |
|---|---:|
| Temperatur Lead | 25% |
| Aktivitas/Tahap | 30% |
| Hasil Follow Up | 25% |
| Recency / Idle Time | 10% |
| AI Buying Signal | 10% |

Kategori:

- `80–100` = Prioritas Utama
- `60–79` = Prioritas Tinggi
- `40–59` = Pantau
- `0–39` = Rendah

Detail perhitungan ada di `06-business-rule.md`.

---

## 9. AI Agent Scope

AI Agent Simple Lead minimal memiliki fungsi berikut.

### 9.1 Auto Segmentation

Membaca pesan awal dan memilih segmentasi yang paling sesuai.

Output minimal:

- segment_id,
- confidence,
- reason singkat.

Jika confidence rendah, tampilkan sebagai rekomendasi dan jangan memaksa perubahan.

### 9.2 Lead Profiling

Menghasilkan estimasi:

- ukuran perusahaan,
- kemampuan beli,
- minat beli,
- tingkat kebutuhan,
- buying signal,
- peluang closing.

Setiap hasil AI harus menyimpan:

- nilai,
- confidence,
- waktu analisis,
- model/version,
- ringkasan alasan.

### 9.3 Conversation Summary

Merangkum:

- siapa customer,
- kebutuhan,
- pain point,
- produk diminati,
- keberatan,
- keputusan yang sudah dibuat,
- aktivitas terakhir,
- komitmen customer,
- next action.

### 9.4 Suggested Reply

Memberikan opsi balasan.

Baseline:

- Profesional
- Santai
- Closing-oriented

AI tidak auto-send pada baseline MVP. User harus menekan `Gunakan`, boleh mengedit, lalu mengirim.

### 9.5 Next Best Action

Contoh:

- lanjutkan diskusi,
- jadwalkan demo,
- kirim penawaran,
- follow up besok,
- follow up setelah tanggal tertentu,
- eskalasi ke SPV.

### 9.6 Smart Reminder

AI dapat merekomendasikan follow up berdasarkan isi chat.

Contoh:

Customer:

> "Saya diskusikan dulu dengan owner."

AI:

> Rekomendasi follow up 2 hari lagi.

AI recommendation tidak boleh menghapus follow up manual yang sudah ada.

### 9.7 Early Warning

Contoh:

- Hot Lead belum dibalas.
- Negosiasi idle lebih dari batas SLA.
- Follow up terlambat.
- Buying signal tinggi tetapi belum ada aktivitas lanjutan.
- Sales memiliki terlalu banyak overdue follow up.

---

## 10. WhatsApp / Inbox Concept

Simple Lead memiliki inbox percakapan yang merepresentasikan channel WhatsApp.

Kebutuhan bisnis:

- pesan masuk tampil realtime saat aplikasi aktif,
- daftar chat menampilkan preview pesan,
- unread count,
- segmentasi,
- temperatur,
- PIC,
- waktu pesan terakhir,
- setiap balasan internal menyimpan `sent_by_user_id`,
- ketika chat dibuka, pengguna langsung melihat percakapan,
- profil lead dan AI suggestion tersedia pada layar percakapan.

> **Catatan implementasi (menyimpang dari baseline §10.1 asli):** Setelah didiskusikan, project ini
> pakai **satu nomor WA per Sales** (tiap Sales scan QR sendiri di aplikasi, lewat WAHUB — lihat
> §10.3), BUKAN satu nomor bisnis bersama. Alasannya: customer di lapangan sudah kenal & percaya ke
> nomor personal Sales masing-masing, jadi paksa migrasi ke 1 nomor bersama malah merusak trust yang
> sudah terbangun. Efeknya:
> - Masalah "siapa yang balas di 1 nomor bersama" (lihat §2, masalah #10) otomatis tidak relevan lagi
>   — jadi §10.1 di bawah ini (Multi-Agent Reply / `sender_user_id` attribution) DIPERTAHANKAN
>   apa adanya sebagai baseline (tetap dicatat siapa yang balas, berguna kalau nanti ada skenario
>   SPV take-over pegang HP Sales), tapi bukan lagi mekanisme UTAMA buat tau siapa PIC.
> - PIC lead sekarang default **implisit**: siapa pemilik nomor WA yang menerima pesan itu, dicatat
>   otomatis sebagai `LeadAssignment` tipe PRIMARY saat lead/conversation baru dibuat dari webhook
>   koneksi WA Sales tsb — bukan proses assignment manual dari awal.
> - Reassign/takeover jadi lebih berat dari sekadar ganti field PIC: riwayat chat "nempel" secara
>   fisik di nomor WA Sales lama (bukan di satu nomor bisnis yang bisa dioper). Lihat §10.3 untuk
>   detail entity `WhatsappConnection`.

### 10.1 Multi-Agent Reply

Customer melihat satu identitas bisnis **per Sales** (bukan satu identitas bisnis tunggal — lihat
catatan implementasi di atas).

Di internal, sistem harus mencatat:

- siapa yang membalas,
- waktu balasan,
- device/session bila diperlukan.

Jika PIC bukan user yang sedang membuka chat, sistem harus mengikuti aturan assignment/takeover.

### 10.2 Integration Abstraction

AI Coding Agent jangan mengikat core business logic langsung pada satu provider WhatsApp.

Gunakan abstraction seperti:

```text
MessagingProvider
- receiveWebhook()
- sendMessage()
- sendMedia()
- getDeliveryStatus()
```

Implementasi provider dapat diganti tanpa mengubah module Lead/FollowUp.

### 10.3 WhatsApp Session per Sales (WAHUB)

Provider yang dipakai: **WAHUB** (self-hosted, source di `registrasi/backend-wahub`, berbasis
`@whiskeysockets/baileys`), multi-session — 1 Sales = 1 session WAHUB. TIDAK perlu API key/client
terpisah per Sales: 1 client key (`WAHUB_API_KEY` yang sudah dipakai simple-system) bisa punya
banyak session sekaligus dibedakan dari `sessionId`, dan tiap session punya `webhookUrl` sendiri
(lihat detail di `04-database.md` §11.1 `whatsapp_connections`).

Flow onboarding Sales:

1. Admin/Manager daftarkan akun Sales (User + TeamMembership).
2. Sales (atau admin) buka halaman "Hubungkan WhatsApp", app minta WAHUB mulai session baru
   khusus Sales ini — `POST /api/sessions/start` pakai `WAHUB_API_KEY` yang sama, body
   `{ sessionId: "sales-{userId}", webhookUrl: ".../api/marketing/whatsapp/webhook?...&session=sales-{userId}" }`.
3. App tampilkan QR Code (`GET /api/sessions/qr/sales-{userId}`) sampai status `ready`.
4. Pesan masuk ke nomor Sales ini otomatis lewat webhook per-session di atas: cari/buat Lead by
   `whatsapp_number`, cari/buat Conversation terhubung ke `WhatsappConnection` Sales ini, PIC =
   Sales ini (LeadAssignment PRIMARY otomatis kalau lead baru).

Ini berjalan berdampingan dengan session "default" milik Director Assistant tanpa saling
mengganggu — beda `sessionId`, beda `webhookUrl`, sama-sama pakai `WAHUB_API_KEY` yang sama.

---

## 11. Notification Concept

Notification yang wajib dipertimbangkan:

- lead baru di-assign,
- pesan customer baru,
- follow up akan jatuh tempo,
- follow up jatuh tempo,
- follow up overdue,
- Hot Lead tidak dibalas,
- lead di-reassign,
- mention/eskalasi dari SPV,
- AI high buying signal,
- aktivitas penting berubah.

Notification harus:

- role-aware,
- scope-aware,
- deduplicated,
- menyimpan status sent/read,
- mempunyai deep link.

Contoh deep link:

`/inbox/{conversation_id}`

atau:

`/leads/{lead_id}?tab=follow-up`

---

## 12. UX Principles

### 12.1 Fokus

Satu layar memiliki satu tujuan utama.

### 12.2 Hierarki Font

Semakin penting informasi, semakin besar dan dominan.

Contoh:

- Priority Score / angka KPI: paling besar.
- Nama lead: besar.
- status/segmentasi: chip kecil.
- metadata: lebih kecil.
- timestamp: paling kecil tetapi tetap terbaca.

### 12.3 Bahasa Awam

Gunakan istilah:

- `Beranda`, bukan `Executive Overview`.
- `Lead Panas`, bila dibutuhkan sebagai helper dari `Hot`.
- `Follow Up Hari Ini`.
- `Belum Dibalas`.
- `Prioritas`.
- `Saran AI`.
- `Aktivitas Terakhir`.

Hindari jargon teknis pada UI.

### 12.4 Minimum Click

Flow paling penting:

`Inbox → Klik Chat → Percakapan + Profil + AI → Balas`

Tidak boleh memaksa user membuka halaman profil terpisah sebelum membalas.

### 12.5 Visual Direction

Baseline terakhir:

- Light Mode
- aksen Blue Neon
- semi-glassmorphism
- clean
- tidak terlalu ramai
- border tipis
- shadow lembut
- background putih / biru sangat muda
- warna status tetap semantik.

Detail visual ada di `05-ui-guideline.md`.

---

## 13. Modul Sistem

Core module:

1. Authentication
2. User & Role
3. Team / Organization
4. Lead
5. Segment
6. Conversation
7. Message
8. Assignment
9. Lead Temperature
10. Activity
11. Follow Up
12. Priority Engine
13. AI Analysis
14. Notification
15. Dashboard
16. Analytics
17. Audit Log
18. Settings

---

## 14. Arsitektur Tingkat Tinggi

Rekomendasi baseline:

```text
PWA Frontend
Next.js + TypeScript + Tailwind
        |
        | HTTPS / Realtime
        v
Application Backend
NestJS / Node.js
        |
        +-- PostgreSQL
        +-- Realtime layer
        +-- Queue/Worker
        +-- Push Notification
        +-- AI Agent Service
        +-- Messaging Provider
```

Boleh menggunakan alternatif stack selama kontrak domain dan business rule tidak berubah.

### 14.1 Prinsip Arsitektur

- Authorization harus di backend.
- Business rule tidak boleh hanya berada di frontend.
- AI process idealnya asynchronous.
- Webhook harus idempotent.
- Notification idealnya melalui queue.
- Audit log bersifat append-only.
- Enum dan master data dibedakan dengan jelas.
- Scoring rule harus configurable bila memungkinkan.

---

## 15. MVP Scope

### Wajib MVP

- login,
- role-based access,
- team hierarchy,
- lead list,
- segment,
- Cold/Warm/Hot,
- inbox,
- conversation,
- sales label per message,
- activity,
- follow up,
- follow up result,
- reminder,
- Priority Score,
- AI segmentation,
- AI summary,
- AI profiling,
- AI suggestion,
- Home Sales,
- Team Monitoring SPV,
- Dashboard Manager,
- push notification,
- audit log dasar.

### Setelah MVP

- advanced analytics,
- auto assignment rules kompleks,
- campaign,
- broadcast,
- voice transcription,
- sentiment timeline,
- custom workflow per segment,
- SLA builder,
- advanced forecasting.

---

## 16. Definition of Done Tingkat Project

Project dianggap memenuhi baseline bila:

1. Sales dapat menerima lead, membuka chat, membaca konteks, membalas, mencatat aktivitas, dan menjadwalkan follow up dari HP.
2. Setiap lead mempunyai segmentasi, temperatur, PIC, aktivitas, follow up, priority score, dan histori.
3. SPV hanya melihat tim dalam scope-nya dan dapat menemukan overdue/hot lead bermasalah.
4. Manager dapat memonitor keseluruhan funnel, tim, segmentasi, dan early warning dari desktop.
5. AI analysis tidak memblokir proses chat ketika gagal.
6. Semua perubahan penting dapat diaudit.
7. Notification mengarah ke context yang benar.
8. UI mobile nyaman pada rasio HP modern dan tidak dibuat terlalu memanjang secara artifisial.
9. Semua permission divalidasi server-side.
10. Dokumentasi enam file ini menjadi baseline domain.

---

## 17. Referensi Dokumen Lanjutan

- `02-user-flow.md` — alur detail per role dan halaman.
- `03-feature.md` — fitur dan acceptance criteria.
- `04-database.md` — struktur tabel dan relasi.
- `05-ui-guideline.md` — visual system dan komponen.
- `06-business-rule.md` — rule Cold/Warm/Hot, aktivitas, priority, follow up, SLA, dan AI.
