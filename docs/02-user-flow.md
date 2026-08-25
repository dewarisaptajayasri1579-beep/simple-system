# 02 — User Flow: Simple Lead

**Tujuan:** Mendefinisikan alur penggunaan aplikasi secara eksplisit.  
**Prinsip:** AI Coding Agent harus dapat mengubah setiap flow menjadi route, state, API interaction, permission check, dan acceptance test.

---

## 1. Aturan Umum Navigasi

Semua role menggunakan PWA yang sama.

Setelah login:

1. Sistem memverifikasi session.
2. Backend mengembalikan user, role, team, permission, dan scope.
3. Frontend memilih layout.
4. Mobile menggunakan bottom navigation.
5. Desktop menggunakan sidebar.
6. Route yang tidak memiliki permission tetap harus ditolak backend.

---

# 2. Flow Login

## 2.1 Normal

1. User membuka aplikasi.
2. Jika belum login, tampil halaman Login.
3. User mengisi email/username dan password.
4. Frontend mengirim credential.
5. Backend memvalidasi.
6. Jika valid:
   - create session/token,
   - return profile,
   - return role/permissions,
   - return team scope.
7. Redirect:
   - Sales → `/home`
   - SPV → `/home`
   - Manager → `/dashboard`
8. Sistem mendaftarkan device/browser untuk push notification jika user memberi izin.

## 2.2 Login Gagal

Tampilkan:

`Email/username atau password tidak sesuai.`

Jangan mengungkap apakah akun ada atau tidak.

## 2.3 User Nonaktif

Tampilkan:

`Akun Anda sedang tidak aktif. Hubungi administrator.`

---

# 3. Flow Sales — Beranda

## 3.1 Tujuan

Memberi daftar kerja hari ini, bukan dashboard dekoratif.

## 3.2 Data Utama

Urutan prioritas visual:

1. Prioritas AI / `Kerjakan Dulu`
2. Follow Up Hari Ini
3. Chat Belum Dibalas
4. Lead Hot
5. Overdue
6. Ringkasan lain

## 3.3 Flow

1. Sales membuka Beranda.
2. Sistem mengambil:
   - priority leads,
   - follow up today,
   - overdue follow up,
   - unread conversation,
   - hot lead count.
3. Tampilkan maksimal 3–5 item `Kerjakan Dulu`.
4. Sales memilih lead.
5. Sistem membuka percakapan lead.
6. Jika item adalah follow up tetapi belum mempunyai conversation, buka detail lead tab Follow Up.

## 3.4 Quick Action

Dari Beranda sales dapat:

- `Chat Sekarang`
- `Follow Up`
- `Lihat Semua`

---

# 4. Flow Sales — Inbox

## 4.1 Daftar Chat

Inbox adalah daftar conversation.

Setiap row minimal menampilkan:

- nama lead/perusahaan,
- preview pesan terakhir,
- waktu,
- unread count,
- segmentasi,
- temperatur,
- PIC bila perlu.

Filter baseline:

- Semua
- Belum Dibalas
- Prioritas
- Hot

Search:

- nama,
- perusahaan,
- nomor WhatsApp.

## 4.2 Klik Chat

**Flow yang wajib:**

`Inbox → klik item → langsung masuk Percakapan`

Jangan membuka halaman detail lead sebagai perantara.

---

# 5. Flow Sales — Percakapan

Ini adalah layar paling penting.

## 5.1 Layout

Urutan informasi:

1. Header lead.
2. Profil ringkas.
3. Saran AI.
4. Percakapan.
5. Message composer.

Pada layar kecil, Profil dan AI dapat tampil sebagai compact card di atas atau expandable section, tetapi tetap tersedia dari halaman yang sama.

## 5.2 Header

Minimal:

- nama,
- segmentasi,
- temperatur,
- priority badge,
- menu tindakan.

## 5.3 Profil Ringkas

Minimal:

- nama/perusahaan,
- kontak,
- PIC,
- produk/segmentasi,
- aktivitas terakhir,
- follow up berikutnya.

## 5.4 AI Suggestion

Menampilkan:

- summary satu-dua kalimat,
- next best action,
- tombol `Lihat Saran Balasan`.

## 5.5 Membalas

1. Sales mengetik pesan atau memilih saran AI.
2. Jika memilih saran AI:
   - teks dimasukkan ke composer,
   - tidak langsung dikirim.
3. Sales dapat mengedit.
4. Tekan Kirim.
5. Backend memvalidasi:
   - permission,
   - assignment,
   - conversation status.
6. Message disimpan dengan `sent_by_user_id`.
7. Adapter mengirim ke messaging provider.
8. UI menampilkan optimistic state.
9. Delivery status diupdate secara asynchronous.

## 5.6 Jika Bukan PIC

Sistem mengikuti rule:

- Read-only bila permission tidak memungkinkan.
- Atau tampil `Ambil Alih`.
- Atau `Minta Akses`.

Tidak boleh diam-diam mengirim sebagai PIC lain.

---

# 6. Flow Sales — Update Temperatur

1. Buka conversation atau Lead.
2. Klik chip Cold/Warm/Hot.
3. Sistem tampilkan pilihan.
4. User memilih.
5. Jika perubahan manual berbeda dengan rekomendasi AI, sistem boleh meminta alasan singkat.
6. Backend menyimpan:
   - from,
   - to,
   - changed_by,
   - change_source = MANUAL,
   - timestamp,
   - note opsional.
7. Recalculate priority.
8. Tulis audit log.

AI juga dapat menghasilkan rekomendasi perubahan, tetapi pada baseline perubahan otomatis tunduk pada business rule di `06-business-rule.md`.

---

# 7. Flow Sales — Aktivitas

## 7.1 Tambah Aktivitas

Dari conversation atau lead:

1. Tekan `Tambah Aktivitas`.
2. Pilih jenis:
   - Diskusi
   - Zoom/Demo
   - Kirim Penawaran
   - Negosiasi
   - jenis tambahan bila tersedia.
3. Isi:
   - tanggal/waktu,
   - catatan,
   - hasil singkat,
   - attachment bila relevan.
4. Simpan.
5. Backend:
   - create activity,
   - update `current_activity_stage` bila stage lebih tinggi atau sesuai rule,
   - recalculate priority,
   - trigger AI reanalysis bila perlu,
   - evaluasi follow up recommendation.
6. UI memperbarui timeline.

## 7.2 Aktivitas Tidak Boleh Hilang

Jika salah input, gunakan:

- edit dengan audit,
- atau void/cancel.

Hindari hard delete.

---

# 8. Flow Sales — Follow Up

## 8.1 Membuat Follow Up Manual

1. Dari lead/conversation tekan `Buat Follow Up`.
2. Pilih tanggal.
3. Pilih jam.
4. Isi tujuan:
   - diskusi,
   - demo,
   - cek penawaran,
   - negosiasi,
   - lainnya.
5. Tambahkan catatan.
6. Simpan.
7. Sistem schedule reminder.
8. Item muncul di Follow Up Hari Ini ketika waktunya sesuai.

## 8.2 Menyelesaikan Follow Up

1. Sales membuka follow up.
2. Tekan `Selesaikan`.
3. Wajib pilih hasil:
   - Tertarik
   - Minta Demo
   - Minta Penawaran
   - Diskusi Internal
   - Minta Hubungi Lagi
   - Belum Ada Jawaban
   - Tidak Berminat
   - Lainnya.
4. Catatan hasil opsional atau wajib sesuai setting.
5. Sistem menanyakan:
   `Perlu follow up lagi?`
6. Jika Ya:
   - pilih waktu berikutnya.
7. Simpan.
8. Backend:
   - mark completed,
   - save result,
   - calculate on_time/late,
   - recalculate priority,
   - evaluate temperature recommendation,
   - create next follow up jika ada.

## 8.3 Overdue

Follow up menjadi overdue jika:

- status masih OPEN,
- waktu jatuh tempo telah lewat,
- tidak berada dalam grace period.

Overdue harus tampil di:

- Sales Home,
- Sales Follow Up,
- SPV Team Warning,
- notification sesuai escalation policy.

---

# 9. Flow AI Suggested Reply

1. Sales membuka percakapan.
2. Sistem menampilkan cached/latest AI recommendation.
3. Sales tekan `Saran Balasan`.
4. Sistem tampil opsi:
   - Profesional,
   - Santai,
   - Closing.
5. Sales tekan `Gunakan`.
6. Teks masuk composer.
7. Sales edit bila perlu.
8. Sales kirim.
9. Sistem mencatat `ai_suggestion_id` pada message bila pesan berasal dari suggestion agar dapat dianalisis performanya.

Jika AI gagal:

- chat tetap bisa digunakan,
- tampil state `Saran AI belum tersedia`,
- tidak memblokir composer.

---

# 10. Flow Assignment

## 10.1 Lead Baru

1. Lead dibuat.
2. Sistem menjalankan assignment rule.
3. PIC ditetapkan.
4. Assignment history dibuat.
5. PIC menerima notification.

## 10.2 Reassign

SPV/Manager dengan permission:

1. Buka lead.
2. Pilih `Ganti PIC`.
3. Pilih sales.
4. Isi alasan.
5. Confirm.
6. Backend:
   - close assignment lama,
   - create assignment baru,
   - audit,
   - notification ke sales lama dan baru.

## 10.3 Take Over

1. SPV membuka lead milik Sales.
2. Tekan `Ambil Alih`.
3. Confirm.
4. Assignment berpindah atau temporary takeover sesuai konfigurasi.
5. Semua message berikut mencatat user sebenarnya.

---

# 11. Flow SPV — Home Mobile

Tujuan:

> Mengetahui apakah tim berjalan sehat hari ini.

Data utama:

- Hot Lead Tim
- Follow Up Hari Ini
- Overdue
- Chat Belum Dibalas
- Early Warning
- daftar sales yang perlu perhatian.

Flow:

1. SPV buka Home.
2. Sistem mengambil data scope team.
3. Tampilkan `Perlu Perhatian`.
4. SPV klik warning.
5. Buka filtered Team Lead List.
6. SPV dapat membuka lead.
7. Jika ingin membalas, gunakan rule Take Over.

---

# 12. Flow SPV — Team

## 12.1 Daftar Sales

Setiap sales tampil:

- nama,
- lead aktif,
- hot,
- follow up today,
- overdue,
- unread/unreplied,
- won periode berjalan,
- follow up discipline.

## 12.2 Klik Sales

Buka halaman Sales Detail.

Tab:

- Ringkasan
- Leads
- Follow Up
- Aktivitas
- KPI

## 12.3 Klik Lead

Buka lead atau conversation.

Data tetap mengikuti permission.

---

# 13. Flow SPV — Early Warning

Contoh warning:

- `3 Hot Lead belum dibalas > 2 jam`
- `5 follow up Adit overdue`
- `Negosiasi PT ABC idle 3 hari`
- `Lead priority 91 belum ada follow up`

Flow:

1. Warning dibuat oleh rule engine/AI.
2. Tampil di SPV Home.
3. SPV klik.
4. Buka daftar evidence.
5. SPV dapat:
   - reminder sales,
   - reassign,
   - take over,
   - tandai reviewed.
6. Semua tindakan diaudit.

---

# 14. Flow Manager — Dashboard Desktop

Tujuan:

> Menjawab apa yang terjadi pada marketing/sales secara keseluruhan.

Data:

- total lead,
- Cold/Warm/Hot,
- Open/Won/Lost,
- conversion,
- follow up discipline,
- overdue,
- response time,
- segment performance,
- team performance,
- AI insight.

Flow:

1. Manager login.
2. Buka Dashboard.
3. Default periode: periode yang ditentukan sistem, contoh bulan berjalan.
4. Manager dapat filter:
   - tanggal,
   - segment,
   - SPV,
   - sales,
   - source.
5. Klik KPI → drill down ke daftar lead.
6. Klik segment → Analytics Segment.
7. Klik team → Team Performance.

---

# 15. Flow Manager — Lead Monitoring

1. Buka `Lead Monitoring`.
2. Tabel menampilkan:
   - lead,
   - segment,
   - temperature,
   - activity stage,
   - PIC,
   - priority,
   - last interaction,
   - next follow up,
   - outcome.
3. Filter.
4. Sort default dapat menggunakan priority descending.
5. Klik lead → detail.
6. Manager dapat melihat timeline lengkap sesuai permission.

---

# 16. Flow Manager — Inbox Monitoring

Tujuan: monitoring, bukan wajib menjadi inbox operasional utama.

1. Manager buka Inbox Monitoring.
2. Tampilkan:
   - belum dibalas,
   - hot unread,
   - overdue response,
   - conversation aktif.
3. Klik conversation.
4. Manager dapat melihat conversation.
5. Hak reply mengikuti permission organisasi.

---

# 17. Flow Manager — Segment Performance

1. Manager memilih menu Segment.
2. Sistem tampil:
   - jumlah lead,
   - hot rate,
   - aktivitas distribution,
   - proposal rate,
   - negotiation rate,
   - won,
   - conversion.
3. Klik segment.
4. Buka detail segment.
5. Tampilkan AI summary:
   - kebutuhan dominan,
   - objection dominan,
   - alasan lost dominan,
   - aktivitas yang paling sering menghasilkan won.

---

# 18. Flow Notification

## 18.1 Ketika App Terbuka

Realtime event memperbarui UI.

## 18.2 Ketika App Background/Closed

Push notification dikirim.

## 18.3 Klik Notification

1. User tap notification.
2. PWA dibuka.
3. Session diverifikasi.
4. Permission diverifikasi.
5. Deep link dibuka.
6. Jika data sudah tidak tersedia, tampil fallback.

---

# 19. Flow AI Reanalysis

Trigger minimum:

- pesan customer baru,
- message batch tertentu,
- aktivitas dibuat,
- follow up selesai,
- hasil follow up berubah,
- temperature manual berubah,
- proposal/negotiation activity,
- explicit `Analisa Ulang`.

Proses:

1. Event masuk queue.
2. Worker membaca context.
3. AI menghasilkan structured output.
4. Validate schema.
5. Save analysis version.
6. Update derived fields yang diizinkan.
7. Recalculate score.
8. Emit realtime update.

AI failure tidak boleh rollback transaksi user.

---

# 20. Flow Won

1. User memilih `Tandai Won`.
2. Sistem meminta:
   - tanggal deal,
   - produk,
   - nilai deal opsional/bila digunakan,
   - catatan.
3. Outcome menjadi WON.
4. Follow up open terkait closing dapat ditutup/cancel sesuai rule.
5. Lead keluar dari daftar open pipeline.
6. Tetap tersedia dalam history.
7. KPI conversion diperbarui.

---

# 21. Flow Lost

1. User memilih `Tandai Lost`.
2. Wajib pilih alasan:
   - harga,
   - tidak membutuhkan,
   - memilih kompetitor,
   - tidak ada respons,
   - timing,
   - budget,
   - lainnya.
3. Outcome menjadi LOST.
4. Open follow up dicancel atau ditutup.
5. Lead tetap dapat direopen oleh user berpermission.
6. Alasan Lost masuk analytics.

---

# 22. Empty, Loading, Error Flow

Setiap halaman wajib memiliki:

### Loading
Gunakan skeleton, jangan blank screen.

### Empty
Contoh:

`Belum ada follow up hari ini.`

### Error
Contoh:

`Data belum berhasil dimuat. Coba lagi.`

### Offline
Contoh:

`Anda sedang offline. Data terakhir tetap ditampilkan.`

Jangan menampilkan stack trace kepada user.
