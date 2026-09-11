"use client"

import { usePathname } from "next/navigation"
import { useEffect, useRef } from "react"

const STORAGE_PREFIX = "list-scroll:"

/** Nyala begitu user menekan Back/Forward — browser maupun tombol Back di dalam app (itu juga
 *  lewat history). Dipakai buat membedakan "balik ke daftar" (posisi scroll harus dikembalikan)
 *  dari "buka daftar dari menu" (wajar mulai dari atas). Sengaja variabel modul, bukan state:
 *  popstate kejadian SEBELUM komponen halaman tujuan mount, jadi harus ada yang menampung. */
let cameFromHistory = false
if (typeof window !== "undefined") {
  window.addEventListener("popstate", () => {
    cameFromHistory = true
  })
}

/**
 * Kembalikan posisi scroll daftar saat user menekan Back dari halaman detail.
 *
 * Kenapa perlu manual: daftar Lead/Inbox itu client-fetch (data baru datang setelah mount, lihat
 * LeadListClient/InboxClient). Saat Back, yang pertama ter-render cuma skeleton beberapa baris,
 * jadi halaman masih pendek — restore bawaan browser/Next ke-clamp jadi 0, dan waktu datanya
 * masuk beberapa ratus ms kemudian tidak ada lagi yang mengembalikan posisinya. Makanya restore
 * di sini ditunda sampai `ready` (data sudah ter-render, tinggi halaman sudah benar).
 *
 * @param ready `true` kalau isi daftar sudah ter-render — bukan lagi skeleton/loading.
 */
export function useListScrollRestore(ready: boolean) {
  const pathname = usePathname()
  const key = STORAGE_PREFIX + pathname
  // Bendera history dibaca & dikonsumsi pas MOUNT, bukan pas `ready` — kalau ditunda, bendera
  // bisa "nyangkut" (mis. Back ke halaman yang tidak pakai hook ini) lalu kepakai keliru sama
  // daftar lain yang dibuka normal beberapa saat kemudian.
  const shouldRestore = useRef(false)
  const didRestore = useRef(false)

  useEffect(() => {
    shouldRestore.current = cameFromHistory
    cameFromHistory = false
  }, [])

  // Rekam posisi scroll terakhir. Throttle pakai rAF supaya tidak nulis sessionStorage tiap
  // pixel. Tidak perlu jaga-jaga terhadap "Next scroll ke atas saat pindah halaman": itu terjadi
  // setelah komponen ini unmount (listener sudah dilepas), jadi 0-nya tidak ikut kesimpan.
  useEffect(() => {
    let frame = 0
    const save = () => sessionStorage.setItem(key, String(window.scrollY))
    const onScroll = () => {
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        save()
      })
    }
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => {
      window.removeEventListener("scroll", onScroll)
      // Simpan sekali lagi kalau masih ada frame yang belum sempat jalan, biar geseran terakhir
      // sebelum user mengklik detail tidak hilang.
      if (frame) {
        cancelAnimationFrame(frame)
        save()
      }
    }
  }, [key])

  useEffect(() => {
    if (!ready || didRestore.current) return
    didRestore.current = true
    if (!shouldRestore.current) return

    const saved = Number(sessionStorage.getItem(key))
    if (!Number.isFinite(saved) || saved <= 0) return
    // Tunggu 1 frame supaya baris-baris daftar benar-benar sudah dilukis (tinggi halaman final),
    // kalau tidak scrollTo-nya ke-clamp ke tinggi yang masih separuh jadi.
    requestAnimationFrame(() => window.scrollTo(0, saved))
  }, [ready, key])
}
