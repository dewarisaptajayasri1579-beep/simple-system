# 05 — UI Guideline: Simple Lead

**Tujuan:** Menjadi design contract untuk AI Coding Agent agar UI tidak berubah menjadi dashboard padat dan tidak konsisten.

---

# 1. Design Principle

Simple Lead harus terasa:

- fokus,
- simple,
- modern,
- mudah dipahami orang awam,
- mobile-app-like,
- clean,
- cukup premium,
- tidak terlalu ramai.

Prinsip paling penting:

> Semakin penting informasi, semakin besar ukuran font dan semakin tinggi kontras visualnya.

Jangan membuat semua teks dan semua card mempunyai bobot visual yang sama.

---

# 2. Visual Direction

Baseline terakhir:

- **Light Mode**
- **Blue Neon accent**
- **Semi Glassmorphism**
- background putih / biru sangat muda
- glass card hanya sebagai aksen, bukan efek berlebihan
- shadow lembut
- border tipis
- gradient sangat halus.

Aplikasi tetap harus nyaman untuk penggunaan lama.

---

# 3. Warna

Rekomendasi token:

```css
--bg: #F7FAFF;
--surface: rgba(255,255,255,0.82);
--surface-solid: #FFFFFF;
--primary: #1265FF;
--primary-strong: #004DE6;
--primary-soft: #EAF2FF;
--neon-blue: #36A3FF;
--text-primary: #101828;
--text-secondary: #667085;
--text-muted: #98A2B3;
--border: rgba(18,101,255,0.12);
--shadow: rgba(16,24,40,0.08);
```

Status:

```css
--cold: #5B8DEF;
--warm: #F5A623;
--hot: #FF5A5F;
--success: #12B76A;
--danger: #F04438;
--warning: #F79009;
```

Jangan mengganti semua status menjadi biru. Warna status harus semantik.

---

# 4. Semi Glassmorphism

Gunakan pada:

- hero/priority card,
- AI card,
- floating action,
- modal tertentu.

Jangan setiap row inbox diberi blur berat.

Baseline:

```css
background: rgba(255,255,255,0.78);
backdrop-filter: blur(16px);
border: 1px solid rgba(255,255,255,0.70);
box-shadow: 0 10px 30px rgba(16,24,40,0.08);
```

Pastikan tetap ada fallback background solid.

---

# 5. Typography Hierarchy

Gunakan font sans modern yang mudah dibaca.

Contoh:

- Inter
- Plus Jakarta Sans
- system sans

## Ukuran Mobile

### Display KPI
`32–40px`, weight 700/800

Contoh:

`28`

untuk Lead Hot.

### Page Title
`22–24px`, weight 700

### Lead Name
`16–18px`, weight 600/700

### Section Title
`15–17px`, weight 600/700

### Body
`14–16px`, weight 400/500

### Metadata
`12–13px`, weight 400/500

### Badge
`11–12px`, weight 600

Jangan menggunakan font terlalu kecil untuk mengejar banyak konten.

---

# 6. Terminologi UI

Gunakan bahasa awam.

| Hindari | Gunakan |
|---|---|
| Executive Overview | Ringkasan |
| Lead Aging | Umur Lead |
| Lead Recency | Terakhir Aktif |
| Next Best Action | Saran Berikutnya |
| Activity Stage | Tahap Aktivitas |
| Unreplied Conversation | Belum Dibalas |
| High Priority Queue | Kerjakan Dulu |
| Escalation | Perlu Perhatian |
| Conversion Outcome | Hasil |
| AI Profiling | Analisa AI / Profil AI |

Istilah teknis boleh ada di dokumentasi, bukan harus di UI.

---

# 7. Mobile Device Ratio

Mockup dan implementasi harus mengikuti rasio HP modern, jangan membuat device terlalu lonjong.

Target desain utama:

- lebar logical sekitar 360–430px,
- viewport tinggi realistis sekitar 740–930px,
- responsive,
- safe-area top/bottom.

Jangan mengandalkan fixed height.

Konten panjang harus scroll natural.

---

# 8. Mobile Navigation

Sales baseline:

- Beranda
- Inbox
- Follow Up
- Leads
- Profil/More

SPV baseline:

- Beranda
- Inbox
- Tim
- Follow Up
- More

Bottom nav:

- fixed,
- safe-area aware,
- active state jelas,
- icon + label.

Maksimal 5 item.

---

# 9. Desktop Navigation

Manager:

Sidebar:

- Dashboard
- Leads
- Inbox
- Tim
- Follow Up
- Segment
- Analytics
- AI Insight
- Settings

Sidebar dapat collapse.

---

# 10. Beranda Sales Layout

Urutan:

1. Header
2. `Kerjakan Dulu`
3. KPI hari ini
4. Follow up singkat
5. Optional aktivitas terbaru

Jangan menaruh 10 grafik.

## Kerjakan Dulu Card

Harus paling menonjol.

Contoh:

```text
Kerjakan Dulu

1  PT Maju Jaya                  92
   SevenRent • Hot
   Negosiasi
   Follow Up terlambat 2 jam

   [Chat Sekarang]
```

Score besar, alasan ringkas.

---

# 11. Inbox Layout

Setiap row:

```text
[Avatar] PT Maju Jaya          09:21
         Bisa demo besok?       [2]
         SevenRent   Hot
```

Aturan:

- nama > preview > metadata,
- unread jelas,
- divider halus,
- jangan terlalu banyak chip.

Filter berbentuk pill.

---

# 12. Conversation Layout

Urutan:

1. Header
2. Profil ringkas
3. Saran AI
4. Messages
5. Composer sticky

Profil dan AI harus compact agar conversation tetap fokus.

Jika card terlalu tinggi:

- tampil compact summary,
- `Lihat Detail`.

## Bubble

Incoming:
- putih / gray soft.

Outgoing:
- primary soft blue.

Jangan pakai neon glow pada bubble.

## Sales Label

Internal label dapat tampil kecil:

`Ony • Sales`

Tidak perlu ditampilkan ke customer; ini UI internal.

---

# 13. Lead Profile Card

Jangan membuat form panjang.

Gunakan display rows:

- Produk
- PIC
- Status
- Tahap
- Follow Up

Edit via modal/sheet.

---

# 14. AI Card

Harus terlihat berbeda tetapi tidak mendominasi seluruh layar.

Gunakan:

- icon sparkle,
- border blue soft,
- gradient sangat halus.

Struktur:

```text
Saran AI

Lead terlihat serius.
Ajak demo dan kirim penawaran.

[ Lihat Saran Balasan ]
```

Jika ada score:

```text
Minat       90%
Kebutuhan   85%
```

Jangan tampil 10 score sekaligus di conversation.

Detail score ada di Lead Detail.

---

# 15. Temperature Badge

- Cold: blue-gray
- Warm: amber
- Hot: red/coral

Label harus tetap terbaca.

Jangan mengandalkan warna saja; selalu tampil teks.

---

# 16. Activity Visual

Pada Lead Detail gunakan timeline.

```text
● Diskusi
  21 Aug 09:10

● Zoom
  21 Aug 14:00

● Kirim Penawaran
  22 Aug 10:20
```

Stage terbaru lebih menonjol.

---

# 17. Follow Up Page

Top:

- Hari Ini
- Terlambat
- Selesai

Informasi utama berupa angka besar.

List:

- waktu,
- nama lead,
- tujuan,
- status temperature,
- CTA Chat.

Overdue memiliki red accent secukupnya.

---

# 18. SPV Mobile UI

SPV tidak perlu dashboard mini desktop.

Beranda:

1. Perlu Perhatian
2. Tim Hari Ini
3. Sales list
4. Follow Up Overdue

Warning dibuat actionable.

---

# 19. Manager Desktop UI

Gunakan grid 12 kolom.

Top KPI:

- 4–6 KPI, jangan 12 card.

Bagian:

1. KPI
2. Funnel
3. Segment Performance
4. Team Performance
5. Early Warning / AI Insight

Detail lain lewat drill down.

---

# 20. Table

Desktop table:

- sticky header bila panjang,
- compact tetapi readable,
- row hover,
- column priority,
- filter bar,
- pagination.

Jangan gunakan tabel untuk mobile; ubah menjadi cards/list.

---

# 21. Button

Primary:

- biru solid,
- dipakai maksimal satu CTA utama per section.

Secondary:

- white/outline.

Destructive:

- merah.

Height mobile minimal sekitar 44px.

---

# 22. Input

- label selalu jelas,
- placeholder bukan pengganti label,
- error di bawah field,
- touch target besar.

Form panjang gunakan section.

---

# 23. Modal vs Bottom Sheet

Mobile:

- quick edit → bottom sheet.
- confirmation → dialog.
- complex form → full-screen page/modal.

Desktop:

- modal atau side drawer.

---

# 24. Empty State

Contoh:

```text
Belum ada follow up hari ini.

Semua jadwal Anda sudah selesai.
```

CTA hanya jika relevan.

---

# 25. Loading

Gunakan skeleton sesuai bentuk komponen.

Jangan spinner full screen untuk data yang dapat ditampilkan bertahap.

---

# 26. Error

Gunakan bahasa:

`Data belum berhasil dimuat.`

CTA:

`Coba Lagi`

Error teknis hanya di log.

---

# 27. Offline

Banner:

`Anda sedang offline. Menampilkan data terakhir.`

Untuk message send offline, baseline disarankan:

- jangan pura-pura terkirim,
- tandai queued bila offline queue benar-benar diimplementasikan,
- jika belum ada offline send, disable dan jelaskan.

---

# 28. Notification UI

Notification Center:

- icon,
- title,
- short body,
- time,
- unread dot.

Critical warning dapat accent red/orange.

---

# 29. Accessibility

- contrast minimum memadai,
- tidak bergantung warna saja,
- touch target minimal,
- keyboard navigation desktop,
- focus ring,
- aria label icon button,
- form label.

---

# 30. Responsive Breakpoints

Baseline:

```text
< 768px     mobile
768–1199px  tablet
>= 1200px   desktop
```

Layout dapat menyesuaikan, tetapi permission berdasarkan role, bukan breakpoint.

Manager tetap dapat membuka dari HP; UI harus usable walau desktop-first.

---

# 31. Do / Don't

## Do

- satu fokus per layar,
- score penting besar,
- CTA jelas,
- bahasa sederhana,
- whitespace cukup,
- drill down.

## Don't

- semua card glow neon,
- 15 KPI di beranda,
- font 10px untuk mengejar informasi,
- istilah CRM rumit,
- chart dekoratif,
- profile page wajib sebelum chat,
- animasi berlebihan.

---

# 32. Design Acceptance Checklist

Sebelum screen dianggap selesai:

- [ ] tujuan screen jelas dalam 3 detik,
- [ ] CTA utama terlihat,
- [ ] nama lead mudah terbaca,
- [ ] status tidak hanya berbasis warna,
- [ ] font metadata masih readable,
- [ ] tidak ada horizontal scroll pada mobile,
- [ ] bottom navigation tidak menutupi content,
- [ ] safe area benar,
- [ ] loading/empty/error tersedia,
- [ ] mobile ratio realistis,
- [ ] istilah awam,
- [ ] komponen memakai design token.
