import type { Locale, TimerSpan } from './types'

const UNITS: Record<Locale, { h: string; m: string; s: string }> = {
  es: { h: 'h|hora|horas', m: 'min|mins|minuto|minutos', s: 's|seg|segs|segundo|segundos' },
  en: { h: 'h|hr|hrs|hour|hours', m: 'min|mins|minute|minutes', s: 's|sec|secs|second|seconds' },
}

function toSeconds(n: number, unit: string, locale: Locale): number {
  const u = UNITS[locale]
  if (new RegExp(`^(${u.h})$`).test(unit)) return n * 3600
  if (new RegExp(`^(${u.m})$`).test(unit)) return n * 60
  return n
}

// Detecta "25 minutos", "1 hora y media", "8-10 min", "20 to 25 minutes". En rangos se usa el menor.
export function detectTimers(stepText: string, locale: Locale): TimerSpan[] {
  const u = UNITS[locale]
  const num = String.raw`(\d+(?:[.,]\d+)?)`
  const range = String.raw`(?:\s*(?:-|–|a|to)\s*\d+(?:[.,]\d+)?)?`
  const unit = `(${u.h}|${u.m}|${u.s})`
  const half = locale === 'es' ? String.raw`(?:\s+y\s+media)?` : String.raw`(?:\s+and\s+a\s+half)?`
  const re = new RegExp(`${num}${range}\\s*${unit}${half}(?![a-záéíóú])`, 'gi')
  const out: TimerSpan[] = []
  const text = stepText
  for (const m of text.matchAll(re)) {
    const n = Number((m[1] ?? '0').replace(',', '.'))
    const unitWord = (m[2] ?? '').toLowerCase()
    let seconds = toSeconds(n, unitWord, locale)
    if (/\b(y media|and a half)$/i.test(m[0])) seconds += toSeconds(0.5, unitWord, locale)
    out.push({ start: m.index ?? 0, end: (m.index ?? 0) + m[0].length, seconds })
  }
  const halfHour = locale === 'es' ? /\bmedia hora\b/gi : /\bhalf an hour\b/gi
  for (const m of text.matchAll(halfHour)) out.push({ start: m.index ?? 0, end: (m.index ?? 0) + m[0].length, seconds: 1800 })
  return out.sort((a, b) => a.start - b.start)
}
