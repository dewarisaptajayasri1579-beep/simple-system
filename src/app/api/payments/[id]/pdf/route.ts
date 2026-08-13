import { NextResponse } from "next/server"
import chromium from "@sparticuz/chromium"
import puppeteer from "puppeteer-core"

import { prisma } from "@/lib/prisma"

/** Chromium serverless (@sparticuz/chromium) cuma tersedia di Linux — di dev Mac/Windows, set
 *  CHROME_EXECUTABLE_PATH di .env.local ke Chrome yang sudah terinstall lokal. chromium.args
 *  (--single-process, --headless=shell, dst) dituning khusus buat binary sparticuz sendiri —
 *  dipasangkan ke Chrome desktop biasa malah bikin browser hang, jadi cuma dipakai kalau
 *  benar-benar pakai binary sparticuz-nya. Sama persis dengan api/invoices/[id]/pdf/route.ts. */
async function launchBrowser() {
  const localExecutablePath = process.env.CHROME_EXECUTABLE_PATH
  if (localExecutablePath) {
    return puppeteer.launch({ executablePath: localExecutablePath, headless: true })
  }
  return puppeteer.launch({
    args: chromium.args,
    executablePath: await chromium.executablePath(),
    headless: true,
  })
}

/** Sengaja TANPA login — link PDF ini dikirim ke Client lewat WA (lihat PaymentWhatsAppButton),
 *  jadi harus bisa dibuka tanpa akun. Payment id-nya UUID (praktis tidak bisa ditebak), sama
 *  pola dengan /api/invoices/[id]/pdf.
 *
 *  PDF-nya dirender lewat headless Chromium yang membuka /payments/[id]/print, BUKAN re-implementasi
 *  layout terpisah (dulu pakai @react-pdf/renderer — gampang divergen dari tampilan "Cetak Kwitansi"
 *  di browser). Dengan Chromium asli, hasilnya dijamin identik dengan window.print() karena sumber
 *  & rendering engine-nya sama persis. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const payment = await prisma.payment.findUnique({ where: { id }, select: { paymentNumber: true } })
  if (!payment) return NextResponse.json({ error: "Pembayaran tidak ditemukan" }, { status: 404 })

  // Navigasi Chromium selalu ke loopback HTTP internal — di belakang reverse proxy Coolify,
  // request publik masuk sebagai https:// padahal Next.js di dalam container cuma dengar HTTP
  // biasa (lihat catatan yang sama di api/invoices/[id]/pdf/route.ts).
  const printUrl = `http://127.0.0.1:${process.env.PORT || 3000}/payments/${id}/print`

  const browser = await launchBrowser()
  try {
    const page = await browser.newPage()
    await page.goto(printUrl, { waitUntil: "load" })
    const buffer = await page.pdf({ printBackground: true, preferCSSPageSize: true })

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${payment.paymentNumber.replace(/\//g, "-")}.pdf"`,
        "Cache-Control": "private, max-age=60",
      },
    })
  } finally {
    await browser.close()
  }
}
