// passwordHash TIDAK PERNAH boleh dikirim ke client — pakai select ini di semua query
// Employee yang hasilnya balik ke response API (karyawan/route.ts, [id]/route.ts).
export const EMPLOYEE_SELECT = {
  id: true,
  name: true,
  position: true,
  status: true,
  joinDate: true,
  phone: true,
  email: true,
  notes: true,
  username: true,
  createdAt: true,
  updatedAt: true,
} as const
