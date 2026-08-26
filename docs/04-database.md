# 04 — Database Design: Simple Lead

**Tujuan:** Mendefinisikan struktur data relasional yang cukup rinci untuk implementasi backend.

**Database rekomendasi:** PostgreSQL.

> Nama tabel dan field di bawah adalah baseline. AI Coding Agent boleh menyesuaikan naming convention, tetapi makna domain, relasi, constraint, dan auditability tidak boleh hilang.

---

# 1. Prinsip Database

1. Gunakan UUID atau ID yang konsisten.
2. Semua timestamp disimpan timezone-aware.
3. Gunakan `created_at`, `updated_at` pada tabel mutable.
4. Gunakan soft delete hanya jika benar-benar perlu.
5. Audit penting disimpan append-only.
6. Enum stabil boleh enum DB; master yang sering berubah gunakan table.
7. Scope organisasi harus dapat ditelusuri.
8. AI output disimpan versioned.
9. Priority score menyimpan `rule_version`.
10. Message webhook harus idempotent.

---

# 2. Entity Relationship Overview

```text
users
  |
  +-- team_memberships -- teams
  |
  +-- lead_assignments -- leads -- segments
  |                     |
  |                     +-- conversations -- messages
  |                     |
  |                     +-- lead_temperature_history
  |                     |
  |                     +-- activities
  |                     |
  |                     +-- follow_ups
  |                     |
  |                     +-- priority_snapshots
  |                     |
  |                     +-- ai_analyses
  |
  +-- notifications
  |
  +-- audit_logs
```

---

# 3. users

Menyimpan semua pengguna internal.

| Field | Type | Constraint | Keterangan |
|---|---|---|---|
| id | uuid | PK | User ID |
| full_name | varchar | not null | Nama |
| email | varchar | unique | Login/email |
| phone | varchar | nullable | Nomor internal |
| password_hash | text | not null bila local auth | Hash |
| role | enum/varchar | not null | SALES/SPV/MANAGER/ADMIN |
| is_active | boolean | default true | Status |
| avatar_url | text | nullable | Foto |
| last_login_at | timestamptz | nullable | Last login |
| created_at | timestamptz | not null | |
| updated_at | timestamptz | not null | |

Index:

- email
- role
- is_active

---

# 4. teams

| Field | Type | Keterangan |
|---|---|---|
| id | uuid PK | |
| name | varchar | Nama team |
| code | varchar unique | Code |
| manager_user_id | uuid FK users nullable | Manager owner |
| is_active | boolean | |
| created_at | timestamptz | |
| updated_at | timestamptz | |

---

# 5. team_memberships

Mendukung user pindah team dan histori bila diperlukan.

| Field | Type | Keterangan |
|---|---|---|
| id | uuid PK | |
| team_id | uuid FK teams | |
| user_id | uuid FK users | |
| membership_role | varchar | SALES/SPV/MEMBER |
| supervisor_user_id | uuid FK users nullable | Supervisor langsung |
| active_from | timestamptz | |
| active_until | timestamptz nullable | |
| is_primary | boolean | |
| created_at | timestamptz | |

Constraint:

- satu primary active membership per user bila bisnis mewajibkan.

---

# 6. segments

Master produk/segmentasi.

| Field | Type | Keterangan |
|---|---|---|
| id | uuid PK | |
| code | varchar unique | SEVENRENT, SAP, etc |
| name | varchar | Label UI |
| description | text | |
| is_active | boolean | |
| default_follow_up_hours | integer nullable | SLA segment optional |
| ai_context | text nullable | Context untuk classifier |
| created_at | timestamptz | |
| updated_at | timestamptz | |

Jangan hard delete segment yang pernah dipakai.

---

# 7. lead_sources

Optional master.

| Field | Type |
|---|---|
| id | uuid PK |
| code | varchar unique |
| name | varchar |
| is_active | boolean |

Contoh:

- WHATSAPP
- WEBSITE
- MANUAL
- ADS
- REFERRAL

---

# 8. leads

Core entity.

| Field | Type | Keterangan |
|---|---|---|
| id | uuid PK | |
| display_name | varchar | Nama lead |
| company_name | varchar nullable | Perusahaan |
| contact_name | varchar nullable | Kontak |
| whatsapp_number | varchar | Normalized phone |
| email | varchar nullable | |
| city | varchar nullable | |
| segment_id | uuid FK segments nullable | Segment aktif |
| source_id | uuid FK lead_sources nullable | |
| temperature | enum | COLD/WARM/HOT |
| temperature_source | enum | MANUAL/AI/RULE |
| outcome | enum | OPEN/WON/LOST |
| current_activity_stage | enum | NONE/DISCUSSION/ZOOM_DEMO/PROPOSAL/NEGOTIATION |
| priority_score | numeric(5,2) | 0-100 |
| priority_level | enum | LOW/MONITOR/HIGH/TOP |
| first_contact_at | timestamptz | awal |
| last_interaction_at | timestamptz nullable | meaningful interaction |
| last_customer_message_at | timestamptz nullable | |
| last_sales_message_at | timestamptz nullable | |
| won_at | timestamptz nullable | |
| lost_at | timestamptz nullable | |
| lost_reason_id | uuid nullable | |
| created_at | timestamptz | |
| updated_at | timestamptz | |

Constraint:

- priority 0–100.
- outcome WON → won_at required.
- outcome LOST → lost_at required.

Index:

- whatsapp_number
- segment_id
- temperature
- outcome
- priority_score desc
- last_interaction_at
- created_at

---

# 9. lead_segment_history

| Field | Type |
|---|---|
| id | uuid PK |
| lead_id | uuid FK |
| from_segment_id | uuid nullable |
| to_segment_id | uuid |
| source | enum MANUAL/AI/RULE |
| confidence | numeric nullable |
| reason | text nullable |
| changed_by_user_id | uuid nullable |
| created_at | timestamptz |

---

# 10. lead_temperature_history

| Field | Type |
|---|---|
| id | uuid PK |
| lead_id | uuid FK |
| from_temperature | enum nullable |
| to_temperature | enum |
| source | enum MANUAL/AI/RULE |
| score_snapshot | numeric nullable |
| confidence | numeric nullable |
| reason | text nullable |
| changed_by_user_id | uuid nullable |
| created_at | timestamptz |

---

# 11. lead_assignments

| Field | Type | Keterangan |
|---|---|---|
| id | uuid PK | |
| lead_id | uuid FK | |
| assigned_user_id | uuid FK users | PIC |
| assigned_by_user_id | uuid nullable | actor |
| assignment_type | enum | PRIMARY/TAKEOVER |
| reason | text nullable | |
| started_at | timestamptz | |
| ended_at | timestamptz nullable | |
| is_active | boolean | |
| created_at | timestamptz | |

Constraint:

- satu active PRIMARY per lead.

Index:

- lead_id, is_active
- assigned_user_id, is_active

---

# 11.1 whatsapp_connections

**Addendum (menyimpang dari baseline "satu identitas bisnis" di 01-project-overview.md §10.1
asli):** Project ini pakai **satu nomor WA per Sales** (scan QR sendiri-sendiri di aplikasi lewat
WAHUB multi-session), bukan satu nomor bisnis bersama — lihat catatan implementasi di
`01-project-overview.md` §10. Tabel ini menyimpan session WAHUB milik tiap Sales.

**Penting soal WAHUB (backend self-hosted, source: `registrasi/backend-wahub`, berbasis
`@whiskeysockets/baileys`):** TIDAK perlu API key/client terpisah per Sales. Satu client key
(`WAHUB_API_KEY` yang sudah dipakai simple-system) bisa punya banyak session sekaligus, dibedakan
lewat `sessionId` di body request — WAHUB auto-prefix jadi `{clientId}-{sessionId}`. Tiap session
punya `webhookUrl` SENDIRI (disimpan per-sessionId di WAHUB, bukan global), jadi aman jalan
berdampingan dengan session "default" milik Director Assistant tanpa saling menimpa webhook
(constraint "1 sesi cuma 1 webhook aktif" di `.env.example` tetap berlaku, tapi itu per-sessionId,
bukan per-client-key).

| Field | Type | Keterangan |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK users unique | 1 Sales = 1 koneksi WA (MVP) |
| wahub_session_id | varchar unique | Bagian LOKAL sebelum prefix, mis. `sales-{userId}` |
| phone_number | varchar nullable | Terisi setelah status ready |
| status | enum | STARTING/QR_READY/READY/FAILED/DISCONNECTED |
| webhook_registered_at | timestamptz nullable | Kapan webhook sukses didaftarkan ke WAHUB |
| last_connected_at | timestamptz nullable | |
| last_status_check_at | timestamptz nullable | |
| created_at | timestamptz | |
| updated_at | timestamptz | |

Index:

- user_id
- status

QR code sendiri TIDAK disimpan di DB (ambil live dari `GET /api/sessions/qr/{sessionId}` WAHUB
selama status `QR_READY`, bersifat transient/kadaluarsa cepat).

---

# 12. conversations

Satu lead dapat memiliki lebih dari satu conversation/channel di masa depan.

| Field | Type |
|---|---|
| id | uuid PK |
| lead_id | uuid FK |
| whatsapp_connection_id | uuid FK whatsapp_connections | Koneksi WA Sales pemilik percakapan ini |
| provider | varchar |
| provider_conversation_id | varchar nullable |
| channel | enum WHATSAPP |
| status | enum OPEN/ARCHIVED |
| last_message_at | timestamptz nullable |
| unread_customer_count | integer default 0 |
| created_at | timestamptz |
| updated_at | timestamptz |

Unique provider ID bila ada.

PIC lead (`lead_assignments` tipe PRIMARY) dibuat OTOMATIS = pemilik `whatsapp_connection_id` ini,
saat conversation/lead baru pertama kali dibuat dari webhook — bukan proses assignment manual.

---

# 13. messages

| Field | Type | Keterangan |
|---|---|---|
| id | uuid PK | |
| conversation_id | uuid FK | |
| provider_message_id | varchar nullable | idempotency |
| direction | enum | INBOUND/OUTBOUND |
| message_type | enum | TEXT/IMAGE/DOCUMENT/AUDIO/OTHER |
| body | text nullable | |
| media_url | text nullable | |
| sender_user_id | uuid FK nullable | internal sales; null untuk customer |
| sender_external_id | varchar nullable | customer/provider |
| ai_suggestion_id | uuid nullable | attribution |
| sent_at | timestamptz | |
| received_at | timestamptz nullable | |
| delivery_status | enum | QUEUED/SENT/DELIVERED/READ/FAILED |
| raw_provider_payload | jsonb nullable | optional/retention aware |
| created_at | timestamptz | |

Constraint:

- inbound → sender_user_id null.
- outbound via user → sender_user_id required.
- provider_message_id unique per provider bila tersedia.

Index:

- conversation_id, sent_at
- provider_message_id
- sender_user_id

---

# 14. activity_types

Bila ingin configurable.

| Field | Type |
|---|---|
| id | uuid PK |
| code | varchar unique |
| name | varchar |
| stage_rank | integer |
| score | integer |
| is_active | boolean |

Baseline rank:

1. DISCUSSION
2. ZOOM_DEMO
3. PROPOSAL
4. NEGOTIATION

---

# 15. activities

| Field | Type |
|---|---|
| id | uuid PK |
| lead_id | uuid FK |
| activity_type_id | uuid FK |
| actor_user_id | uuid FK |
| occurred_at | timestamptz |
| result | text nullable |
| note | text nullable |
| attachment_url | text nullable |
| source | enum MANUAL/SYSTEM/AI |
| is_void | boolean default false |
| created_at | timestamptz |
| updated_at | timestamptz |

Index:

- lead_id, occurred_at desc
- actor_user_id

---

# 16. follow_up_result_types

Master.

| Field | Type |
|---|---|
| id | uuid PK |
| code | varchar unique |
| name | varchar |
| priority_score_effect | integer |
| temperature_signal_score | integer |
| is_positive | boolean nullable |
| is_active | boolean |

Baseline:

| Code | Effect Priority |
|---|---:|
| REQUEST_PROPOSAL | +20 |
| REQUEST_DEMO | +18 |
| INTERESTED | +15 |
| CALL_LATER | +8 |
| INTERNAL_DISCUSSION | +5 |
| NO_RESPONSE | -5 |
| NOT_INTERESTED | -25 |

Nilai dapat di-config.

---

# 17. follow_ups

| Field | Type |
|---|---|
| id | uuid PK |
| lead_id | uuid FK |
| assigned_user_id | uuid FK users |
| created_by_user_id | uuid FK |
| scheduled_at | timestamptz |
| purpose | varchar |
| note | text nullable |
| status | enum OPEN/COMPLETED/CANCELLED |
| result_type_id | uuid FK nullable |
| result_note | text nullable |
| completed_at | timestamptz nullable |
| cancelled_at | timestamptz nullable |
| is_on_time | boolean nullable |
| next_follow_up_id | uuid self FK nullable |
| reminder_sent_at | timestamptz nullable |
| created_at | timestamptz |
| updated_at | timestamptz |

Derived:

`is_overdue = status=OPEN AND scheduled_at + grace < now`

Jangan wajib menyimpan overdue sebagai status.

Index:

- assigned_user_id, scheduled_at
- lead_id, scheduled_at
- status

---

# 18. ai_analyses

Versioned AI output.

| Field | Type |
|---|---|
| id | uuid PK |
| lead_id | uuid FK |
| analysis_type | enum |
| version | integer |
| model_name | varchar |
| prompt_version | varchar |
| input_until_message_id | uuid nullable |
| input_context_hash | varchar nullable |
| output_json | jsonb |
| confidence | numeric nullable |
| status | enum PENDING/SUCCESS/FAILED |
| error_code | varchar nullable |
| created_at | timestamptz |

`analysis_type`:

- SEGMENTATION
- PROFILING
- SUMMARY
- NEXT_BEST_ACTION
- BUYING_SIGNAL
- TEMPERATURE_RECOMMENDATION

---

# 19. ai_suggestions

Suggested reply.

| Field | Type |
|---|---|
| id | uuid PK |
| lead_id | uuid FK |
| conversation_id | uuid FK |
| style | enum PROFESSIONAL/CASUAL/CLOSING |
| text | text |
| model_name | varchar |
| prompt_version | varchar |
| generated_at | timestamptz |
| used_at | timestamptz nullable |
| used_by_user_id | uuid nullable |
| created_at | timestamptz |

---

# 20. priority_snapshots

Untuk audit/scoring analytics.

| Field | Type |
|---|---|
| id | uuid PK |
| lead_id | uuid FK |
| score | numeric |
| level | enum |
| component_temperature | numeric |
| component_activity | numeric |
| component_follow_up | numeric |
| component_recency | numeric |
| component_ai | numeric |
| reason_json | jsonb |
| rule_version | varchar |
| calculated_at | timestamptz |

`leads.priority_score` menyimpan nilai terbaru untuk query cepat.

---

# 21. lost_reasons

| Field | Type |
|---|---|
| id | uuid PK |
| code | varchar unique |
| name | varchar |
| is_active | boolean |

Contoh:

- PRICE
- BUDGET
- COMPETITOR
- NO_NEED
- NO_RESPONSE
- TIMING
- OTHER

---

# 22. notifications

| Field | Type |
|---|---|
| id | uuid PK |
| user_id | uuid FK |
| type | varchar |
| title | varchar |
| body | text |
| entity_type | varchar nullable |
| entity_id | uuid nullable |
| deep_link | text nullable |
| dedupe_key | varchar nullable |
| scheduled_at | timestamptz nullable |
| sent_at | timestamptz nullable |
| read_at | timestamptz nullable |
| status | enum PENDING/SENT/FAILED/READ |
| created_at | timestamptz |

Unique `dedupe_key` untuk tipe yang perlu dedupe.

---

# 23. push_subscriptions

Untuk PWA Web Push.

| Field | Type |
|---|---|
| id | uuid PK |
| user_id | uuid FK |
| endpoint | text |
| p256dh | text nullable |
| auth | text nullable |
| user_agent | text nullable |
| device_name | varchar nullable |
| is_active | boolean |
| last_used_at | timestamptz nullable |
| created_at | timestamptz |
| updated_at | timestamptz |

Catatan: format dapat menyesuaikan provider push yang dipilih.

---

# 24. audit_logs

Append-only.

| Field | Type |
|---|---|
| id | uuid PK |
| actor_user_id | uuid nullable |
| action | varchar |
| entity_type | varchar |
| entity_id | uuid nullable |
| before_json | jsonb nullable |
| after_json | jsonb nullable |
| metadata_json | jsonb nullable |
| ip_address | inet nullable |
| created_at | timestamptz |

Tidak boleh menyediakan edit/delete biasa.

---

# 25. system_settings

| Field | Type |
|---|---|
| key | varchar PK |
| value_json | jsonb |
| description | text |
| updated_by_user_id | uuid |
| updated_at | timestamptz |

Contoh key:

- `priority.weights`
- `follow_up.grace_minutes`
- `follow_up.reminder_offsets`
- `temperature.automation_mode`
- `ai.segment_confidence_auto_apply`
- `sla.hot_unreplied_minutes`
- `sla.negotiation_idle_hours`

---

# 26. Optional: webhooks

Untuk idempotency/debug provider.

| Field | Type |
|---|---|
| id | uuid PK |
| provider | varchar |
| provider_event_id | varchar |
| event_type | varchar |
| payload | jsonb |
| received_at | timestamptz |
| processed_at | timestamptz nullable |
| processing_status | enum |
| error | text nullable |

Unique provider + provider_event_id.

---

# 27. Derived Fields

Jangan selalu simpan sebagai sumber kebenaran jika dapat dihitung.

### Lead Age

`now - first_contact_at`

### Idle Time

`now - last_interaction_at`

### Follow Up Overdue

`OPEN && now > scheduled_at + grace_period`

### Chat Belum Dibalas

Baseline:

`last_customer_message_at > last_sales_message_at`

dengan aturan tambahan bila message system tidak dianggap reply.

---

# 28. Transaction Boundaries

Gunakan transaction untuk:

### Reassign
- close assignment lama,
- create assignment baru,
- update lead PIC cache bila ada,
- audit.

### Complete Follow Up
- update follow up,
- create next follow up optional,
- update last interaction bila dianggap meaningful,
- audit.

### Won/Lost
- update lead outcome,
- close/cancel relevant follow up,
- audit.

Message provider sending tidak harus berada dalam transaction DB karena external I/O; gunakan outbox/queue pattern bila dibutuhkan.

---

# 29. Data Retention dan Privacy

Karena conversation dapat mengandung data customer:

- batasi akses berdasarkan role,
- tentukan retention raw provider payload,
- media URL sebaiknya signed/private,
- hindari menyimpan secret provider,
- log aplikasi tidak boleh mencetak full token,
- audit akses sensitif bila diperlukan.

---

# 30. Seed Data Minimum

Buat seed untuk development:

### Roles
- SALES
- SPV
- MANAGER

### Segment
- SevenRent
- SAP
- Absensi
- Bengkel
- Gym
- Custom Application

### Activity Type
- Diskusi
- Zoom/Demo
- Kirim Penawaran
- Negosiasi

### Follow Up Result
Semua baseline result.

### Lost Reason
Semua baseline lost reason.

### Users
- 1 Manager
- 2 SPV
- 3 Sales per SPV

### Leads
Minimal 20 lead dengan variasi status dan aktivitas agar dashboard dapat diuji.

---

# 31. Query Penting

Backend harus mampu efisien menjalankan:

- priority leads by sales,
- overdue follow up by team,
- unread/unreplied conversation,
- hot idle leads,
- lead funnel per segment,
- KPI per sales/team,
- latest AI analysis,
- conversation message pagination,
- assignment scope.

Index harus dirancang mengikuti query tersebut.
