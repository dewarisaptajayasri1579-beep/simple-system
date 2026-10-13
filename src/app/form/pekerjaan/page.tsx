import { FormGate } from "@/components/form-pekerjaan/FormGate"
import { FormPekerjaanClient } from "@/components/form-pekerjaan/FormPekerjaanClient"
import { getFormPasswordHash, hasFormAccess } from "@/lib/work-price/form-gate"

/** Halaman publik (di luar AppLayout) — dibuka programmer lewat link, dikunci password bersama. */
export default async function FormPekerjaanPage() {
  const [allowed, passwordHash] = await Promise.all([hasFormAccess(), getFormPasswordHash()])

  return (
    <main className="min-h-screen flex flex-col">
      {allowed ? <FormPekerjaanClient /> : <FormGate configured={!!passwordHash} />}
    </main>
  )
}
