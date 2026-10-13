"use client"

import { usePathname, useRouter } from "next/navigation"

import { Select } from "@/components/ui"

/** Dropdown perusahaan yang cuma mengganti query param (?companyId=), bulan dipertahankan. */
export const PerusahaanSelect: React.FC<{
  companies: { id: string; name: string }[]
  value: string
  monthIso: string
}> = ({ companies, value, monthIso }) => {
  const router = useRouter()
  const pathname = usePathname()

  return (
    <Select
      label="Perusahaan"
      sizeVariant="sm"
      options={companies.map((c) => ({ value: c.id, label: c.name }))}
      value={value}
      onChange={(v) => router.push(`${pathname}?companyId=${v}&bulan=${monthIso}`)}
    />
  )
}
