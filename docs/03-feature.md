# 03 — Feature Specification: Simple Lead

**Tujuan:** Daftar fitur per halaman/module beserta perilaku dan acceptance criteria.

---

# 1. Authentication

## Fitur

- Login
- Logout
- Session persistence
- Role/permission fetch
- Forgot password bila diaktifkan
- Device/browser registration untuk push
- Session expiry handling

## Acceptance Criteria

- User tidak dapat membuka protected route tanpa session.
- Backend memvalidasi permission setiap request sensitif.
- Logout menghapus session lokal.
- Role tidak diambil hanya dari state frontend.

---

# 2. Beranda Sales

## Komponen

### 2.1 Header
- sapaan,
- nama user,
- notification bell.

### 2.2 KPI Harian
Maksimal 4 card utama:

- Lead Hot
- Follow Up Hari Ini
- Terlambat
- Chat Belum Dibalas

### 2.3 Kerjakan Dulu
Daftar lead berdasarkan Priority Score.

Item:

- nama,
- segment,
- temperature,
- score,
- alasan prioritas singkat,
- next action,
- CTA.

### 2.4 Quick Filter
- Hot
- Follow Up
- Belum Dibalas
- Overdue

## Acceptance Criteria

- Data hanya scope Sales.
- Klik lead membuka conversation/detail sesuai context.
- Angka berasal dari API yang konsisten dengan daftar drill down.
- Priority list diurutkan server-side.

---

# 3. Inbox

## Fitur

- list conversation,
- search,
- filter,
- unread badge,
- preview last message,
- segment chip,
- temperature chip,
- priority indicator,
- last message time,
- realtime new message.

## Filter Baseline

- Semua
- Belum Dibalas
- Prioritas
- Hot

## Acceptance Criteria

- Klik row langsung membuka conversation.
- Message baru mengubah urutan conversation.
- Unread count konsisten.
- Filter diproses server-side untuk dataset besar.
- Inbox tidak menampilkan conversation di luar scope.

---

# 4. Percakapan

## Fitur Utama

- message timeline,
- incoming/outgoing bubble,
- sender internal label,
- timestamp,
- delivery state,
- text composer,
- attachment bila fase implementasi mendukung,
- reply suggestion,
- lead profile compact,
- AI insight compact,
- quick activity,
- quick follow up,
- temperature edit,
- assignment state.

## Profil Ringkas

- nama,
- perusahaan,
- nomor,
- segment,
- PIC,
- temperature,
- activity stage,
- next follow up,
- priority.

## AI Card

- summary,
- buying signal,
- next best action,
- suggested reply CTA.

## Acceptance Criteria

- User dapat membalas tanpa keluar dari halaman.
- Message outgoing selalu menyimpan user pengirim internal.
- AI card gagal tidak memblokir chat.
- Conversation auto-scroll dengan benar.
- Message tidak diduplikasi oleh webhook/realtime.
- Status delivery dapat berubah asynchronous.

---

# 5. Lead List

## Kolom/Informasi Mobile

- nama,
- segment,
- temperature,
- current activity,
- priority,
- next follow up.

## Desktop

Tambahkan:

- PIC,
- last interaction,
- idle days,
- outcome,
- created date.

## Filter

- segment,
- temperature,
- activity stage,
- PIC,
- team,
- priority range,
- outcome,
- follow up status,
- lead age,
- idle days.

## Acceptance Criteria

- Filter dapat dikombinasikan.
- Pagination/cursor diterapkan.
- URL dapat menyimpan state filter pada desktop bila memungkinkan.
- Scope backend berlaku.

---

# 6. Lead Detail

## Section

1. Identitas
2. Segmentasi
3. Temperatur
4. Priority
5. AI Profiling
6. Aktivitas
7. Follow Up
8. Conversation Summary
9. Assignment History
10. Audit/Timeline yang user-friendly

## Quick Action

- Chat
- Tambah Aktivitas
- Buat Follow Up
- Ubah Temperatur
- Reassign bila berhak
- Won/Lost

---

# 7. Segmentasi

## Fitur

- master segment,
- nama,
- code,
- active,
- SLA optional,
- AI keywords/context optional,
- reporting label.

## Rule

Segmentasi boleh dibuat dinamis.

Jangan hard-code SevenRent/SAP/Bengkel/Gym ke enum source code jika memungkinkan.

## Acceptance Criteria

- Segment nonaktif tidak dapat dipilih untuk lead baru.
- Data historis tetap menampilkan segment lama.
- AI segmentation hanya memilih active segment.

---

# 8. Temperatur Lead

Nilai:

- COLD
- WARM
- HOT

## Fitur

- manual update,
- AI recommendation,
- reason,
- history.

## Acceptance Criteria

- Perubahan tersimpan sebagai history.
- Priority otomatis dihitung ulang.
- Manual override tidak hilang tanpa audit.
- AI recommendation mempunyai confidence.

---

# 9. Aktivitas

## Jenis Baseline

| Kode | Label |
|---|---|
| DISCUSSION | Diskusi |
| ZOOM_DEMO | Zoom / Demo |
| PROPOSAL | Kirim Penawaran |
| NEGOTIATION | Negosiasi |

Optional:

- CALL
- OFFLINE_MEETING

Outcome Won/Lost tidak disimpan sebagai aktivitas utama walaupun dapat membuat timeline event.

## Field

- lead_id
- type
- occurred_at
- actor_user_id
- note
- result
- attachment
- source

## Acceptance Criteria

- Aktivitas muncul chronological.
- Menambah aktivitas mengubah stage bila rule terpenuhi.
- Recalculate priority dijalankan.
- Perubahan activity diaudit.

---

# 10. Follow Up

## Status

- OPEN
- COMPLETED
- CANCELLED

Overdue adalah derived condition, bukan harus enum permanen.

## Field UI

- schedule date/time,
- tujuan,
- PIC,
- note,
- status,
- result,
- completed_at,
- next follow up.

## Hasil Baseline

- INTERESTED — Tertarik
- REQUEST_DEMO — Minta Demo
- REQUEST_PROPOSAL — Minta Penawaran
- INTERNAL_DISCUSSION — Diskusi Internal
- CALL_LATER — Minta Hubungi Lagi
- NO_RESPONSE — Belum Ada Jawaban
- NOT_INTERESTED — Tidak Berminat
- OTHER — Lainnya

## Acceptance Criteria

- Follow up dapat dijadwalkan.
- Notification dapat dijadwalkan.
- Completing membutuhkan result.
- Overdue dapat dihitung.
- Next follow up dapat dibuat dari completion flow.
- KPI on-time dapat dihitung.

---

# 11. Reminder

## Jenis

### Scheduled
Sebelum waktu follow up.

### Due
Ketika jatuh tempo.

### Overdue
Setelah batas.

### Smart Reminder
Rekomendasi AI.

### Escalation
Ke SPV jika memenuhi rule.

## Acceptance Criteria

- Satu event tidak menghasilkan spam notification berulang.
- Dedupe key disimpan.
- Notification dapat dimute berdasarkan preference.
- Critical team warning tidak boleh hilang karena preference Sales bila rule organisasi mewajibkannya.

---

# 12. Priority Engine

## Output

- `priority_score`
- `priority_level`
- `priority_reason[]`
- `calculated_at`
- `rule_version`

## UI

Jangan hanya menampilkan angka. Tampilkan alasan singkat:

`Hot + Negosiasi + Follow Up Hari Ini`

## Acceptance Criteria

- Deterministic untuk input yang sama.
- Rule version tercatat.
- Recalculate pada event penting.
- Nilai 0–100.
- Tidak menggunakan segment sebagai skor kualitas langsung.

---

# 13. AI Segmentation

## Input

- pesan pertama,
- beberapa pesan awal bila perlu,
- active segment catalog.

## Output

```json
{
  "segment_id": "uuid",
  "confidence": 0.91,
  "reason": "Customer membahas rental mobil dan jumlah armada."
}
```

## Acceptance Criteria

- Output tervalidasi schema.
- Confidence 0–1.
- Jika < threshold, tidak auto-apply sesuai business rule.
- User dapat koreksi.

---

# 14. AI Profiling

## Field Baseline

- company_size
- buying_power_score
- buying_interest_score
- need_score
- closing_probability
- buying_signal_score
- summary
- confidence
- evidence_summary

## Catatan

Nilai adalah estimasi, bukan fakta.

UI harus menggunakan label seperti:

`Perkiraan dari AI`

bila berpotensi dianggap data faktual.

---

# 15. AI Conversation Summary

## Output

- customer context,
- need,
- pain point,
- interested product,
- objection,
- latest commitment,
- current stage,
- next action.

## Acceptance Criteria

- Summary versioned.
- `source_message_until_id` atau timestamp disimpan agar diketahui sampai message mana summary mencakup data.
- Dapat di-refresh.
- Tidak menghapus summary lama tanpa history.

---

# 16. AI Suggested Reply

## Mode

- Profesional
- Santai
- Closing

## Fitur

- generate,
- regenerate,
- copy/use,
- edit before send.

## Acceptance Criteria

- Tidak auto-send.
- Suggestion yang digunakan dapat dilacak.
- Tidak tampil sebagai message sebelum user mengirim.
- Jika context terlalu sedikit, AI mengatakan informasi belum cukup.

---

# 17. AI Next Best Action

Contoh output:

- `CONTINUE_DISCUSSION`
- `SCHEDULE_DEMO`
- `SEND_PROPOSAL`
- `FOLLOW_UP`
- `NEGOTIATE`
- `ESCALATE`
- `WAIT_UNTIL_DATE`

Output memiliki:

- action,
- reason,
- recommended_at,
- recommended_schedule optional,
- confidence.

---

# 18. Assignment

## Fitur

- assign,
- reassign,
- take over,
- history.

## Acceptance Criteria

- Satu active primary assignment per lead.
- Semua perubahan mempunyai actor dan reason.
- User baru menerima notification.
- Scope selalu divalidasi.

---

# 19. SPV Team Dashboard

## KPI

- lead aktif,
- hot,
- overdue follow up,
- chat belum dibalas,
- priority lead,
- won,
- follow up discipline,
- response time.

## Early Warning

Card harus actionable.

Contoh:

`5 Hot Lead milik Adit belum di-follow up.`

CTA:

`Lihat Lead`

---

# 20. SPV Sales Detail

## Fitur

- KPI Sales,
- lead list,
- follow up list,
- activity log,
- overdue,
- priority,
- trend.

Tidak perlu membuat dashboard terlalu kompleks pada mobile.

---

# 21. Manager Dashboard

## KPI Baseline

- Total Lead
- Cold
- Warm
- Hot
- Open
- Won
- Lost
- Follow Up On Time
- Overdue
- Avg Response Time

## Visual

- funnel,
- segment performance,
- team performance,
- early warning,
- AI insight.

## Drill Down

Semua KPI utama harus dapat diklik ke data pembentuknya.

---

# 22. Segment Performance

## Metrik

- leads,
- temperature distribution,
- demo count/rate,
- proposal count/rate,
- negotiation count/rate,
- won,
- lost,
- conversion rate,
- average lead age,
- average time to won,
- top objections.

---

# 23. Team Performance

## Metrik

- assigned leads,
- active leads,
- hot,
- response time,
- on-time follow up,
- overdue,
- proposal,
- negotiation,
- won,
- lost.

Jangan ranking sales hanya berdasarkan jumlah chat.

---

# 24. Search

Global search desktop optional MVP; search scoped per module wajib.

Search harus case-insensitive dan mendukung:

- nama,
- perusahaan,
- phone.

Untuk dataset besar, hindari full in-memory filtering di frontend.

---

# 25. Notification Center

## Fitur

- unread/read,
- type,
- title,
- body,
- timestamp,
- deep link,
- mark all read.

---

# 26. Audit Log

Event minimum:

- lead created,
- segment changed,
- temperature changed,
- assignment changed,
- activity added/edited,
- follow up created/completed/cancelled,
- outcome changed,
- message sent,
- AI recommendation applied bila relevan,
- priority recalculated.

Audit record tidak boleh diedit oleh user biasa.

---

# 27. Settings

Tingkat Manager/Admin dengan permission.

Config:

- segment,
- follow up grace period,
- reminder offset,
- score weights,
- status automation mode,
- AI confidence threshold,
- escalation threshold,
- working hours,
- notification preference default.

---

# 28. PWA Feature

- installable,
- manifest icon,
- standalone display,
- service worker,
- web push,
- safe-area support,
- responsive breakpoints,
- offline shell,
- update notification jika versi baru tersedia.

---

# 29. Non-Functional Requirements

## Performance

Target baseline:

- halaman utama terasa responsif,
- API pagination,
- lazy load conversation lama,
- image/media tidak memblokir initial render,
- AI tidak berada pada synchronous critical path.

## Security

- HTTPS,
- secure session,
- RBAC,
- server-side scope filtering,
- input validation,
- rate limiting,
- webhook signature validation bila provider mendukung,
- secret tidak pernah dikirim ke browser,
- audit trail.

## Reliability

- webhook idempotency,
- retry queue,
- notification dedupe,
- AI retry/fallback,
- database transaction untuk perubahan critical.

## Observability

Minimal:

- structured logs,
- error tracking,
- job failure monitoring,
- webhook failure monitoring,
- AI latency/error metrics.

---

# 30. Feature Acceptance — End-to-End

Scenario harus lolos:

1. Lead WhatsApp baru masuk.
2. Lead dibuat.
3. Segment AI direkomendasikan/diterapkan.
4. Lead di-assign Sales.
5. Sales menerima notification.
6. Sales membuka Inbox.
7. Sales klik chat.
8. Sales melihat profil + AI suggestion pada halaman yang sama.
9. Sales membalas.
10. Message menyimpan sales pengirim.
11. Sales membuat aktivitas.
12. Priority berubah.
13. Sales membuat follow up.
14. Reminder dikirim.
15. Sales menyelesaikan follow up dengan hasil.
16. SPV melihat KPI tim berubah.
17. Manager melihat funnel/segment berubah.
18. Semua event penting muncul di audit/timeline.
