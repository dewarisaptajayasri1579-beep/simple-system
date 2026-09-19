/** Jendela nomor halaman untuk footer pagination bergaya SortableTable — maksimal `maxButtons`
 *  tombol nomor sekaligus (default 4, jadi total 6 tombol termasuk Prev/Next), geser mengikuti
 *  halaman aktif supaya tabel berpuluh-puluh halaman tidak membanjiri footer dengan tombol nomor. */
export function getPageWindow(activePage: number, totalPages: number, maxButtons = 4): number[] {
  if (totalPages <= maxButtons) return Array.from({ length: totalPages }, (_, i) => i + 1);
  let start = Math.max(1, activePage - Math.floor((maxButtons - 1) / 2));
  const end = Math.min(totalPages, start + maxButtons - 1);
  start = Math.max(1, end - maxButtons + 1);
  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
}
