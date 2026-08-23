/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    unoptimized: true,
  },
  // Paket native/binary (sharp buat kompres gambar laporan WA, puppeteer-core + @sparticuz/chromium
  // buat generate PDF invoice/kwitansi) — WAJIB di-exclude dari bundling Turbopack/webpack, biar
  // cuma di-require() langsung saat runtime, bukan dianalisis/di-bundle. Tanpa ini, build gagal di
  // tahap "Collecting page data" dengan error "Failed to load external module sharp-xxxx" begitu
  // ada route (mis. /api/reports/send) yang meng-import sharp.
  serverExternalPackages: ["sharp", "puppeteer-core", "@sparticuz/chromium"],
}

export default nextConfig
