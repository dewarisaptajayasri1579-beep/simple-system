# Training Cika — Log Simulasi

**Tujuan:** Transkrip latihan roleplay untuk mengkalibrasi persona & aturan jawab Cika (lihat `docs/07-ai-agent-marketing.md`), sebelum dituangkan jadi system prompt/guardrail final.

**Format tiap sesi:**
- **Pesan Lead** — diambil dari pesan inbound ASLI di database (lead outcome `OPEN`, belum closing), sudah disaring dari info sensitif (link, email, kredensial).
- **Jawaban Cika** — dijawab langsung oleh user (berperan sebagai Cika) dalam sesi diskusi ini.
- **Catatan** — insight/aturan yang bisa ditarik dari contoh itu.

**Sumber data:** query read-only ke `Message` (`direction=INBOUND`, `messageType=TEXT`, lead `outcome=OPEN`), difilter buang yang mengandung URL/email/kata kunci kredensial. Segmen yang ketemu di sample: SevenRent, Bengkel, Rental, dan banyak yang belum punya segmen (`TANPA_SEGMEN`).

---

## Sesi 1

