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
- TBD

### 2.2 Peran Agent
- TBD (contoh: copilot chat internal untuk sales? auto-reply ke lead? asisten follow-up? qualifier lead?)

### 2.3 Channel / Interface
- TBD (dashboard internal, WhatsApp langsung ke lead, dsb)

### 2.4 Scope Data & Aksi
- Read-only (insight/summary) vs. bisa melakukan aksi (kirim pesan, ubah status lead, buat follow-up)?
- TBD

### 2.5 Batasan & Guardrail
- TBD (approval manusia sebelum kirim pesan ke lead? role yang boleh akses?)

### 2.6 Model & Biaya
- TBD (pakai `claude-haiku-4-5` vs `claude-sonnet-5`, kapan pakai yang mana)

---

## 3. Desain Teknis

> Diisi setelah kebutuhan di atas jelas.

---

## 4. Acceptance Criteria

> Diisi setelah desain disepakati.
