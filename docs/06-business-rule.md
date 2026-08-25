# 06 — Business Rules: Simple Lead

**Tujuan:** Mendefinisikan aturan bisnis deterministic agar implementasi tidak ambigu.

Dokumen ini adalah sumber utama untuk:

- temperatur Cold/Warm/Hot,
- stage aktivitas,
- Priority Score,
- Follow Up,
- reminder,
- assignment,
- SLA,
- AI automation,
- KPI.

---

# 1. Pemisahan Konsep

Empat konsep ini **tidak boleh dicampur**:

## 1.1 Segmentasi
Produk yang diminati.

Contoh: SevenRent.

## 1.2 Temperatur
Kualitas/minat:

`Cold < Warm < Hot`

## 1.3 Aktivitas
Tahap proses:

`Diskusi → Zoom/Demo → Kirim Penawaran → Negosiasi`

## 1.4 Outcome
Hasil akhir:

- OPEN
- WON
- LOST

Contoh valid:

```text
Segment: SevenRent
Temperature: Hot
Activity: Kirim Penawaran
Outcome: Open
```

---

# 2. Segmentasi Rule

## 2.1 Sumber

Segmentasi dapat berasal dari:

- AI,
- manual,
- rule.

## 2.2 AI Auto Apply

Baseline:

- confidence >= 0.85 → boleh auto-apply jika setting aktif.
- 0.60–0.84 → rekomendasi, user dapat confirm.
- < 0.60 → `Belum teridentifikasi` atau manual selection.

Threshold harus configurable.

## 2.3 Koreksi Manual

Manual correction selalu menang atas AI saat itu.

AI berikutnya tidak boleh mengubah manual selection secara diam-diam. AI dapat memberikan rekomendasi perubahan.

---

# 3. Temperatur Lead

## 3.1 Definisi

### Cold

Lead belum menunjukkan kebutuhan/minat yang kuat.

Contoh:

- hanya bertanya umum,
- respons sangat minim,
- belum menjelaskan kebutuhan,
- beberapa follow up tidak dijawab,
- mengatakan belum membutuhkan.

### Warm

Lead menunjukkan minat dan kebutuhan mulai jelas.

Contoh:

- bertanya fitur spesifik,
- menjelaskan kondisi usaha,
- bersedia diskusi,
- meminta detail,
- menyetujui demo,
- meminta dihubungi kembali.

### Hot

Lead menunjukkan buying intent kuat.

Contoh:

- meminta demo serius,
- meminta penawaran,
- membahas implementasi,
- membahas harga,
- membahas pembayaran,
- masuk negosiasi,
- menyebut timeline pembelian.

---

# 4. Temperature Signal Score

Agar Cold/Warm/Hot tidak subjektif, sistem memiliki **Temperature Signal Score 0–100**.

Score ini berbeda dari Priority Score.

Komponen baseline:

| Komponen | Bobot |
|---|---:|
| AI Buying Interest | 30% |
| Need Score | 20% |
| Activity Stage | 25% |
| Latest Follow Up Result | 15% |
| Customer Recency/Response | 10% |

Mapping:

- `0–39` → Cold
- `40–69` → Warm
- `70–100` → Hot

## 4.1 Automation Mode

Setting:

- `SUGGEST_ONLY`
- `AUTO_WITH_GUARDRAIL`

Baseline MVP disarankan `SUGGEST_ONLY` bila organisasi belum siap full automation.

### SUGGEST_ONLY

Sistem menampilkan:

`AI menyarankan Warm → Hot`

User confirm.

### AUTO_WITH_GUARDRAIL

Sistem boleh update otomatis jika:

- confidence >= threshold,
- tidak ada manual override lock,
- perubahan maksimal satu tingkat per event kecuali strong signal,
- event dan alasan tercatat.

---

# 5. Strong Signal

Strong signal dapat langsung merekomendasikan Hot:

- meminta quotation/penawaran,
- meminta demo untuk keputusan,
- menanyakan cara bayar,
- menanyakan implementasi setelah harga,
- menyatakan ingin membeli,
- masuk negosiasi.

AI harus tetap memberikan evidence summary.

---

# 6. Manual Override Lock

Setelah user mengubah temperature manual:

- simpan `manual_override_until`.
- baseline contoh: 24 jam atau sampai meaningful new event.
- AI tidak auto-change selama lock.
- AI tetap boleh memberi suggestion.

Nilai lock configurable.

---

# 7. Aktivitas Stage

Rank baseline:

| Stage | Rank | Normalized Score |
|---|---:|---:|
| NONE | 0 | 0 |
| DISCUSSION | 1 | 20 |
| ZOOM_DEMO | 2 | 55 |
| PROPOSAL | 3 | 75 |
| NEGOTIATION | 4 | 90 |

Jika Won, outcome digunakan terpisah.

## 7.1 Naik Stage

Jika aktivitas baru mempunyai rank lebih tinggi, `current_activity_stage` naik.

## 7.2 Aktivitas Lebih Rendah Setelah Stage Tinggi

Contoh:

Lead sudah Negosiasi lalu melakukan Diskusi.

Stage tetap Negosiasi, karena Diskusi bukan berarti pipeline mundur.

## 7.3 Menurunkan Stage

Hanya manual correction oleh user berpermission atau rule khusus.

Harus ada audit.

---

# 8. Follow Up Result Score

Baseline normalized value:

| Result | Score |
|---|---:|
| REQUEST_PROPOSAL | 100 |
| REQUEST_DEMO | 90 |
| INTERESTED | 80 |
| CALL_LATER | 65 |
| INTERNAL_DISCUSSION | 60 |
| OTHER | 50 |
| NO_RESPONSE | 30 |
| NOT_INTERESTED | 0 |

Skor dapat diubah melalui config.

Latest meaningful result digunakan pada Priority/Temperature, bukan sekadar jumlah follow up.

---

# 9. Umur Lead vs Idle Time

## 9.1 Lead Age

`now - first_contact_at`

Digunakan untuk analytics.

## 9.2 Idle Time

`now - last_interaction_at`

Digunakan untuk prioritas dan warning.

## 9.3 Meaningful Interaction

Baseline dianggap meaningful:

- customer message,
- sales reply,
- completed follow up,
- activity.

System notification tidak memperbarui last_interaction.

---

# 10. Recency Score

Baseline:

| Idle | Score |
|---|---:|
| < 24 jam | 100 |
| 1–2 hari | 80 |
| 3–4 hari | 60 |
| 5–7 hari | 40 |
| > 7 hari | 20 |

Pengecualian:

Jika lead mempunyai follow up terjadwal di masa depan atas permintaan customer, idle penalty dapat ditahan sampai waktu follow up.

Contoh:

Customer berkata:

`Hubungi saya 1 September.`

Sistem tidak boleh memberi warning `idle 7 hari` sebelum tanggal follow up jika follow up valid sudah dibuat.

---

# 11. Priority Score

Priority Score bertujuan menentukan **urutan kerja**.

Formula baseline:

```text
Priority =
TemperatureComponent * 25%
+ ActivityComponent * 30%
+ FollowUpComponent * 25%
+ RecencyComponent * 10%
+ AIBuyingSignal * 10%
```

Semua component 0–100.

## 11.1 Temperature Component

- Cold = 30
- Warm = 60
- Hot = 90

## 11.2 Activity Component

Gunakan normalized score pada stage.

## 11.3 Follow Up Component

Gunakan latest meaningful follow up result.

Jika belum ada follow up:

- baseline = 50 untuk lead baru,
- dapat disesuaikan.

## 11.4 Recency Component

Gunakan Recency Score.

## 11.5 AI Buying Signal

0–100.

Jika AI belum tersedia:

- neutral default = 50,
- jangan otomatis 0.

---

# 12. Priority Modifier

Setelah base score, terapkan modifier terbatas.

## 12.1 Follow Up Due

- jatuh tempo <= 2 jam: `+5`
- overdue: `+10`
- overdue > 24 jam: `+15`

## 12.2 Customer Waiting

Jika last message adalah customer dan belum dibalas:

- < SLA: `+5`
- lewat SLA: `+10`

## 12.3 Outcome

- WON: priority operational = 0
- LOST: priority operational = 0

## 12.4 Clamp

Final score:

`min(100, max(0, base + modifiers))`

---

# 13. Priority Level

- 80–100 = TOP / `Prioritas Utama`
- 60–79 = HIGH / `Prioritas Tinggi`
- 40–59 = MONITOR / `Pantau`
- 0–39 = LOW / `Rendah`

---

# 14. Priority Reason

Sistem harus menghasilkan alasan maksimal 3 item.

Contoh:

- `Hot`
- `Negosiasi`
- `Follow Up Terlambat`

Jangan menampilkan rumus kepada Sales pada layar utama.

---

# 15. Recalculate Priority Trigger

Wajib recalculate ketika:

- temperature berubah,
- activity dibuat/diubah,
- follow up completed,
- follow up result berubah,
- follow up menjadi overdue,
- customer message baru,
- sales message baru,
- AI buying signal baru,
- lead outcome berubah,
- assignment tidak wajib mengubah score tetapi dapat trigger refresh.

Periodic job boleh digunakan untuk recency/overdue.

---

# 16. Follow Up Rule

## 16.1 Required Data

Saat membuat:

- lead,
- PIC,
- scheduled_at,
- purpose.

## 16.2 Completion

Tidak boleh `COMPLETED` tanpa result.

## 16.3 Cancel

Cancellation harus mempunyai reason bila setting mewajibkan.

## 16.4 Next Follow Up

Jika result `CALL_LATER`, sistem harus strongly prompt untuk menentukan next follow up.

Jika result `NO_RESPONSE`, sistem dapat merekomendasikan follow up lagi sesuai sequence.

---

# 17. Reminder Rule

Baseline offset configurable.

Contoh:

- 30 menit sebelum,
- saat jatuh tempo,
- 2 jam overdue.

Jangan hard-code di UI.

## 17.1 Dedupe

Key contoh:

`FOLLOWUP:{follow_up_id}:DUE`

Satu key hanya dikirim sekali.

---

# 18. Escalation ke SPV

Contoh baseline:

### Hot Unreplied
Jika:

- temperature HOT,
- customer message belum dibalas,
- melebihi `hot_unreplied_sla`.

→ warning ke Sales dan SPV.

### Follow Up Overdue
Jika:

- overdue > escalation threshold.

→ SPV warning.

### Negotiation Idle
Jika:

- stage NEGOTIATION,
- idle melebihi SLA.

→ SPV warning.

Nilai SLA configurable.

---

# 19. Chat Belum Dibalas Rule

Conversation dianggap belum dibalas jika:

- ada inbound customer message terbaru,
- tidak ada outbound sales message setelah inbound tersebut.

System-generated message tidak dianggap sales reply kecuali dikonfigurasi.

---

# 20. Response Time KPI

Untuk setiap customer inbound yang membutuhkan reply:

`first qualifying sales outbound after inbound - inbound time`

Gunakan working-hours aware metric jika konfigurasi jam kerja diaktifkan.

Tentukan policy grouping untuk multiple inbound message berturut-turut agar tidak menghitung satu percakapan sebagai banyak keterlambatan.

Baseline:

- kelompokkan inbound berturut-turut sampai ada outbound.

---

# 21. Follow Up Discipline KPI

Formula baseline:

```text
On Time Follow Up % =
completed_on_time / total_due_follow_up * 100
```

Kecualikan:

- cancelled valid,
- future,
- follow up yang dibuat setelah due date untuk backfill bila policy tidak mengizinkan.

---

# 22. Conversion KPI

### Lead to Hot

`jumlah lead yang pernah mencapai Hot / total lead`

### Proposal Rate

`lead dengan activity Proposal / lead aktif relevan`

### Negotiation Rate

`lead dengan Negosiasi / lead dengan Proposal`

### Win Rate

`Won / (Won + Lost)`

Periode harus jelas.

---

# 23. Segment Rule

Segmentasi **tidak menambah Priority Score langsung**.

Segment dapat memengaruhi:

- SLA,
- assignment,
- AI context,
- dashboard filter.

Ini penting agar SevenRent tidak dianggap lebih baik hanya karena nama produknya.

---

# 24. Assignment Rule

## 24.1 One Primary PIC

Satu lead hanya mempunyai satu active primary PIC.

## 24.2 Reassign

Reassign wajib mencatat:

- actor,
- old PIC,
- new PIC,
- reason,
- timestamp.

## 24.3 Message Permission

User yang tidak memiliki scope tidak boleh mengirim.

Jika SPV mengambil alih, assignment/takeover harus tercatat.

---

# 25. Won Rule

Saat outcome menjadi WON:

- set won_at,
- priority operational menjadi 0,
- open follow up terkait sales process dapat ditutup/cancel,
- lead tetap searchable,
- activity history tidak dihapus,
- temperature terakhir tetap historis.

---

# 26. Lost Rule

Saat LOST:

- wajib lost reason,
- set lost_at,
- priority operational 0,
- open follow up ditutup/cancel,
- dapat direopen oleh user berpermission.

---

# 27. Reopen

Jika lead Lost kembali menghubungi:

Baseline:

- user dapat `Buka Kembali`,
- outcome OPEN,
- temperature direkomendasikan ulang,
- assignment diverifikasi,
- history lama tetap ada.

Jangan membuat lead baru untuk nomor sama secara otomatis bila masih merupakan customer yang sama, kecuali policy duplicate lead mengizinkan.

---

# 28. Duplicate Lead

Saat message dari nomor yang sudah ada:

- cari active/recent lead.
- attach conversation ke lead yang sesuai.

Jika satu nomor dapat mewakili banyak kebutuhan terpisah, gunakan rule bisnis khusus; baseline gunakan satu lead aktif per nomor per context/segment yang sedang berjalan.

AI Coding Agent harus membuat service duplicate detection terpisah, bukan hanya unique constraint nomor.

---

# 29. AI Confidence Rule

Semua AI output yang memengaruhi bisnis harus mempunyai confidence bila memungkinkan.

Jika AI error:

- simpan FAILED,
- jangan mengubah data bisnis,
- user flow tetap berjalan.

---

# 30. AI Data Rule

AI boleh menghasilkan **estimate**, bukan mengklaim fakta.

Contoh:

`Perkiraan kemampuan beli: tinggi`

bukan:

`Kemampuan beli: Rp500 juta`

kecuali customer benar-benar menyebut data tersebut.

Jika AI mengekstrak fakta eksplisit, idealnya simpan evidence/source.

---

# 31. Suggested Reply Safety

AI suggestion:

- tidak auto-send,
- user dapat edit,
- context-aware,
- jangan membuat janji harga/fitur yang tidak ada di context,
- jika data harga tidak tersedia, sarankan pertanyaan/eskalasi.

---

# 32. Notification Routing

Sales menerima:

- assigned lead,
- customer message,
- follow up reminder,
- overdue,
- AI signal terkait lead miliknya.

SPV menerima:

- escalation tim,
- reassign event,
- critical overdue,
- optional summary.

Manager menerima:

- managerial early warning,
- optional aggregate notification.

Jangan kirim semua message customer ke Manager.

---

# 33. Working Hours

Optional setting:

- timezone organisasi,
- hari kerja,
- jam mulai,
- jam selesai.

Digunakan untuk:

- response SLA,
- notification timing,
- KPI.

Jika belum diaktifkan, gunakan elapsed clock time.

---

# 34. Audit Rule

Event critical wajib audit:

- change segment,
- change temperature,
- change PIC,
- change outcome,
- update activity,
- complete/cancel follow up,
- configuration change.

Audit tidak dapat diedit oleh role biasa.

---

# 35. Permission Rule

Frontend hanya untuk UX.

Backend wajib melakukan:

1. authenticate,
2. resolve role,
3. resolve scope,
4. authorize action,
5. filter query.

Contoh:

Sales mencoba akses `/api/leads/{lead_sales_lain}` dengan URL manual harus tetap 403/404 sesuai policy.

---

# 36. Rule Versioning

Scoring dan automation harus mempunyai version.

Contoh:

`priority-v1`

Jika bobot berubah:

`priority-v2`

Snapshot lama tetap dapat dijelaskan.

---

# 37. Recommended Initial Configuration

```json
{
  "priority": {
    "temperature_weight": 0.25,
    "activity_weight": 0.30,
    "follow_up_weight": 0.25,
    "recency_weight": 0.10,
    "ai_buying_signal_weight": 0.10
  },
  "temperature": {
    "cold_max": 39,
    "warm_max": 69,
    "hot_min": 70,
    "automation_mode": "SUGGEST_ONLY"
  },
  "ai": {
    "segment_auto_apply_confidence": 0.85
  },
  "follow_up": {
    "grace_minutes": 15,
    "reminder_before_minutes": [30],
    "overdue_reminder_minutes": [0, 120]
  }
}
```

Nilai adalah baseline awal dan harus dapat disesuaikan berdasarkan data nyata.

---

# 38. Contoh Perhitungan Priority

Lead:

- Hot → 90
- Proposal → 75
- REQUEST_DEMO → 90
- idle 1 hari → 80
- AI buying signal → 85

Base:

```text
90 * 0.25 = 22.50
75 * 0.30 = 22.50
90 * 0.25 = 22.50
80 * 0.10 =  8.00
85 * 0.10 =  8.50
---------------------
Base          = 84.00
```

Jika follow up overdue:

`+10`

Final:

`94`

Level:

`Prioritas Utama`

UI reason:

`Hot • Sudah Penawaran • Follow Up Terlambat`

---

# 39. Contoh Temperature

Lead:

- AI interest 80
- Need 85
- Activity Zoom 55
- Follow Up REQUEST_DEMO 90
- Recency 100

```text
80*0.30 = 24.0
85*0.20 = 17.0
55*0.25 = 13.75
90*0.15 = 13.5
100*0.10 = 10.0
-------------------
Total = 78.25
```

Rekomendasi:

`Hot`

Jika mode SUGGEST_ONLY:

> `AI menyarankan status Hot karena customer meminta demo dan kebutuhan sudah jelas.`

User confirm.

---

# 40. Business Rule Acceptance Tests

AI Coding Agent minimal membuat test untuk:

1. Cold + Diskusi + no response tidak menghasilkan Top Priority.
2. Hot + Negotiation + overdue menghasilkan priority tinggi.
3. Segment tidak mengubah score langsung.
4. Won selalu priority operational 0.
5. Lost selalu priority operational 0.
6. Manual temperature change membuat history.
7. Follow up completed tanpa result ditolak.
8. Follow up overdue dihitung sesuai grace.
9. Customer message terbaru tanpa sales reply → unreplied.
10. Reassign menghasilkan satu active PIC.
11. Sales tidak dapat membaca lead luar scope.
12. AI failure tidak mengubah temperature.
13. Low confidence segment tidak auto-apply.
14. Activity lower rank tidak menurunkan current stage.
15. CALL_LATER mendorong next follow up.
16. Notification dedupe mencegah duplicate push.
17. Priority recompute terjadi setelah relevant event.
18. Rule version tersimpan di snapshot.
