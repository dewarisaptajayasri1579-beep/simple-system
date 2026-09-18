/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    unoptimized: true,
  },
  // Paket native/binary (sharp buat kompres gambar laporan WA, puppeteer-core + @sparticuz/chromium
  // buat generate PDF invoice/kwitansi, ssh2 buat SSH ke VPS lain di modul Monitoring Server) —
  // WAJIB di-exclude dari bundling Turbopack/webpack, biar cuma di-require() langsung saat runtime,
  // bukan dianalisis/di-bundle. Tanpa ini, build gagal di tahap "Collecting page data" dengan error
  // "Failed to load external module sharp-xxxx" (atau, untuk ssh2, "non-ecmascript placeable asset"
  // dari file .node binding cpu-features/crypto.js) begitu ada route yang meng-import paket ini.
  serverExternalPackages: ["sharp", "puppeteer-core", "@sparticuz/chromium", "ssh2"],
}

export default nextConfig
