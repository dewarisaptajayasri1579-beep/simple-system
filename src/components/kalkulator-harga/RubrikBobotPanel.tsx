import React from "react"
import { Card, Table, TableBody, TableCell, TableContainer, TableHead, TableHeader, TableRow } from "@/components/ui"
import { PARAMETER_CODES, POINT_VALUE_IDR, RUBRIC } from "@/lib/work-price/rubric"

function formatRupiah(n: number): string {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n)
}

/** Rubrik bobot — ditampilkan sebagai acuan baca saja. Mengubah nilai poin di sini berarti
 *  mengubah harga SEMUA pekerjaan sekaligus, jadi sengaja tidak bisa diedit dari UI: ubah di
 *  src/lib/work-price/rubric.ts lalu jalankan scripts/calc-work-weight.ts --apply. */
export function RubrikBobotPanel() {
  return (
    <div className="space-y-4">
      <Card padding="md" variant="feature">
        <p className="text-sm font-semibold text-slate-700">
          Harga dihitung dari bobot: <span className="text-blue-700">total poin × {formatRupiah(POINT_VALUE_IDR)}</span>
        </p>
        <p className="text-xs text-slate-500 mt-1">
          Tiap pekerjaan dinilai lewat 8 parameter di bawah. Cara ini berlaku untuk kategori apa pun — termasuk request
          yang belum ada di daftar kategori.
        </p>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {PARAMETER_CODES.map((code) => (
          <div key={code}>
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-2">
              {code}. {RUBRIC[code].name}
            </h3>
            <TableContainer>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Pilihan</TableHead>
                    <TableHead className="w-20">Poin</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {RUBRIC[code].options.map((opt) => (
                    <TableRow key={opt.code}>
                      <TableCell className="text-slate-600">{opt.label}</TableCell>
                      <TableCell className="font-semibold whitespace-nowrap">{opt.points}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </div>
        ))}
      </div>
    </div>
  )
}
