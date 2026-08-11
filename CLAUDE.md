# Rules for Claude in this repo

- **Auto commit & push**: setiap kali selesai melakukan perubahan kode di project ini (fitur baru, fix, refactor, dsb), langsung `git add -A`, commit dengan pesan yang jelas, dan `git push origin main` — tanpa perlu diminta atau dikonfirmasi ulang tiap kali.
  - Tetap jalankan `npx tsc --noEmit` (dan `npm run build` kalau perubahannya besar) sebelum commit untuk memastikan kondisi gabungan (termasuk perubahan lain yang mungkin sudah ada di working tree) tetap compile bersih.
  - Kalau build/type-check gagal karena sesuatu yang bukan dari perubahan sendiri dan tidak bisa diperbaiki dengan yakin, itu satu-satunya kasus yang perlu di-surface ke user dulu — selain itu langsung commit & push.
  - `git add -A` semua perubahan yang ada di working tree (bukan cuma file yang baru disentuh), karena user sering kerja paralel di luar sesi ini.
