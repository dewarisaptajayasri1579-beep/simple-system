# syntax=docker/dockerfile:1
#
# Build image untuk Coolify (Build strategy: Dockerfile).
#
# Alasan dibikin multi-stage: `npm ci` jadi layer tersendiri yang cache-nya HANYA hangus kalau
# package-lock.json / schema Prisma berubah — bukan tiap kali ada perubahan kode. Build pack
# otomatis (Nixpacks/Railpack) juga menebak-nebak paket sistem apa yang perlu dipasang; di sini
# semuanya eksplisit.
#
# CATATAN PENTING — JANGAN pakai `output: "standalone"` di next.config.
# Sudah dicoba & diukur (14 Okt 2026): standalone memang memangkas runtime dari ±840 MB jadi
# ±170 MB, TAPI Next 16.2.6 tidak menyalin `instrumentation.js` (beserta node-cron dkk) ke
# .next/standalone — artinya SEMUA cron mati diam-diam: laporan WA pagi/sore, backup database
# ke R2, auto-invoice termin project, reminder follow-up. Jadi image ini sengaja menjalankan
# `next start` seperti sebelumnya, dengan node_modules produksi ikut dibawa.
#
# `next build` TIDAK butuh database (sudah diverifikasi dengan DATABASE_URL palsu) — tidak ada
# secret yang perlu dikirim saat build; semua env diisi Coolify saat runtime.
#
# KENAPA `npm ci` CUMA SEKALI (tidak ada stage prod-deps terpisah):
# Diukur dari deploy nyata 14 Okt 2026 — di VPS ini tahap install makan ±10 menit, sementara
# `next build` ±5 menit (lokal cuma 44 detik; mesinnya memang load 6-7 dari 8 core). Menjalankan
# `npm ci --omit=dev` lagi cuma buat memangkas image 969 MB -> 841 MB (13%) berarti menambah satu
# install penuh lagi — jauh lebih mahal daripada manfaatnya. `npm prune --omit=dev` juga tidak
# dipakai karena berisiko menghapus node_modules/.prisma (Prisma Client hasil generate) yang tidak
# terdaftar di lockfile.

FROM node:22-bookworm-slim AS base
ENV NEXT_TELEMETRY_DISABLED=1
# openssl dibutuhkan Prisma engine di semua stage.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# ---------- deps: seluruh dependency (termasuk dev) buat build ----------
FROM base AS deps
WORKDIR /app
# prisma/ disalin duluan karena postinstall menjalankan `prisma generate` dan butuh schema-nya.
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

# ---------- builder ----------
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NODE_ENV=production
RUN npm run build

# ---------- runner ----------
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    TZ=Asia/Jakarta
# Lib di bawah dibutuhkan Chromium bawaan @sparticuz/chromium buat generate PDF invoice/kwitansi
# (lihat api/invoices/[id]/pdf). Tanpa ini aplikasi tetap jalan TAPI cetak PDF gagal saat
# runtime — jangan dipangkas tanpa mengetes cetak PDF dulu.
RUN apt-get update && apt-get install -y --no-install-recommends \
      tzdata fonts-liberation \
      libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \
      libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 \
      libgbm1 libasound2 libpango-1.0-0 libcairo2 libexpat1 \
  && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/next.config.mjs ./next.config.mjs
COPY --from=builder /app/prisma ./prisma

EXPOSE 3000
CMD ["npm", "run", "start"]
