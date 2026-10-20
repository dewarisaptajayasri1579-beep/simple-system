"use client"

import { useEffect, useRef, useState } from "react"

export interface LevelChatMessage {
  role: "user" | "assistant"
  text: string
}

export interface LevelChatItem {
  key: string
  itemId: string
  groupName: string
  level: string | null
  label: string
  qty: number
  unitPrice: number
  alasan: string
}

export type LevelAnswerType = "radio" | "checkbox" | "text"

export const LEVEL_CHAT_MAX_QUESTIONS = 5

/** Label kategori+level — ini "hasil akhir" yang dicari di menu Blesscom. */
export function levelLabel(it: { groupName: string; level: string | null; label: string }): string {
  return it.level ? `${it.groupName} — ${it.level}` : it.label
}

/**
 * Mesin obrolan penentuan kategori & level Blesscom (POST /api/blesscom/pengajuan/analisa) —
 * state + alur tanya-jawabnya, tanpa tampilan. Dipakai dua tempat dengan UI berbeda:
 * panel penuh di menu Pengajuan Pekerjaan, dan dialog "Saran Perhitungan" di form Daftar
 * Pekerjaan. Logika alurnya satu supaya tidak kembar.
 */
export function useLevelChat() {
  const timelineRef = useRef<HTMLDivElement | null>(null)
  const lastCountRef = useRef(0)

  const [description, setDescription] = useState("")
  const [messages, setMessages] = useState<LevelChatMessage[]>([])
  const [answerType, setAnswerType] = useState<LevelAnswerType>("text")
  const [choices, setChoices] = useState<string[]>([])
  const [picked, setPicked] = useState<string[]>([])
  const [answer, setAnswer] = useState("")
  const [items, setItems] = useState<LevelChatItem[]>([])
  const [ringkasan, setRingkasan] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [maxQuestions, setMaxQuestions] = useState(LEVEL_CHAT_MAX_QUESTIONS)

  const questionsAsked = messages.filter((m) => m.role === "assistant").length
  const started = messages.length > 0

  // Scroll kontainer timeline-nya sendiri, bukan scrollIntoView() — itu ikut menggeser window.
  useEffect(() => {
    const count = messages.length + items.length + (loading ? 1 : 0)
    if (count !== lastCountRef.current) {
      lastCountRef.current = count
      const el = timelineRef.current
      if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" })
    }
  }, [messages, items, loading])

  async function sendToAi(history: LevelChatMessage[], opts: { conclude?: boolean } = {}) {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/blesscom/pengajuan/analisa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ history, maxQuestions, forceConclude: opts.conclude === true }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? "Gagal menganalisa")

      if (body.status === "tanya") {
        setMessages([...history, { role: "assistant", text: body.pertanyaan }])
        setAnswerType((body.tipeJawaban as LevelAnswerType) ?? "text")
        setChoices(body.pilihan ?? [])
        setPicked([])
        setAnswer("")
        return
      }

      setMessages([...history, { role: "assistant", text: body.ringkasan || "Selesai." }])
      setItems((body.items as Omit<LevelChatItem, "key">[]).map((it) => ({ ...it, key: crypto.randomUUID() })))
      setRingkasan(body.ringkasan ?? null)
      setChoices([])
      setDone(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menganalisa")
    } finally {
      setLoading(false)
    }
  }

  async function startChat(text?: string) {
    const first = (text ?? description).trim()
    if (!first) return
    setDescription(first)
    const history: LevelChatMessage[] = [{ role: "user", text: first }]
    setMessages(history)
    setItems([])
    setRingkasan(null)
    setDone(false)
    await sendToAi(history)
  }

  async function submitAnswer(textOverride?: string, opts: { conclude?: boolean } = {}) {
    const text = (textOverride ?? answer).trim()
    if (!text) return
    const history: LevelChatMessage[] = [...messages, { role: "user", text }]
    setMessages(history)
    setAnswer("")
    setPicked([])
    setChoices([])
    await sendToAi(history, opts)
  }

  function reset() {
    setDescription("")
    setMessages([])
    setAnswer("")
    setChoices([])
    setPicked([])
    setItems([])
    setRingkasan(null)
    setDone(false)
    setError(null)
    setMaxQuestions(LEVEL_CHAT_MAX_QUESTIONS)
    lastCountRef.current = 0
  }

  return {
    timelineRef,
    description,
    setDescription,
    messages,
    answerType,
    choices,
    picked,
    setPicked,
    answer,
    setAnswer,
    items,
    setItems,
    ringkasan,
    done,
    loading,
    error,
    setError,
    maxQuestions,
    setMaxQuestions,
    questionsAsked,
    started,
    startChat,
    submitAnswer,
    reset,
  }
}
