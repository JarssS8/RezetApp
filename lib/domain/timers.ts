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

// Entre dos temporizadores solo se permite espacio, coma y/o "y"/"and" para fusionarlos.
const JOIN_RE = /^\s*(?:,\s*)?(?:(?:y|and)\s*)?$/i

// Fusiona temporizadores contiguos (solo espacio/coma/"y"/"and" entre ellos) en un único span sumando segundos.
function mergeAdjacent(spans: TimerSpan[], text: string): TimerSpan[] {
  const sorted = [...spans].sort((a, b) => a.start - b.start)
  const merged: TimerSpan[] = []
  for (const span of sorted) {
    const prev = merged[merged.length - 1]
    if (prev && JOIN_RE.test(text.slice(prev.end, span.start))) {
      merged[merged.length - 1] = { start: prev.start, end: span.end, seconds: prev.seconds + span.seconds }
    } else {
      merged.push(span)
    }
  }
  return merged
}

// Detecta "25 minutos", "1 hora y media", "8-10 min" (usa el menor), "1 h 30 min" (fusiona), etc.
export function detectTimers(stepText: string, locale: Locale): TimerSpan[] {
  const u = UNITS[locale]
  const num = String.raw`(\d+(?:[.,]\d+)?)`
  const range = String.raw`(?:\s*(?:-|–|a|to)\s*(\d+(?:[.,]\d+)?))?`
  const unit = `(${u.h}|${u.m}|${u.s})`
  const half = locale === 'es' ? String.raw`(?:\s+y\s+media)?` : String.raw`(?:\s+and\s+a\s+half)?`
  const re = new RegExp(`${num}${range}\\s*${unit}${half}(?![a-záéíóú])`, 'gi')
  const out: TimerSpan[] = []
  const text = stepText
  for (const m of text.matchAll(re)) {
    const n1 = Number((m[1] ?? '0').replace(',', '.'))
    const n2 = m[2] !== undefined ? Number(m[2].replace(',', '.')) : null
    const n = n2 !== null ? Math.min(n1, n2) : n1
    const unitWord = (m[3] ?? '').toLowerCase()
    let seconds = toSeconds(n, unitWord, locale)
    if (/\b(y media|and a half)$/i.test(m[0])) seconds += toSeconds(0.5, unitWord, locale)
    out.push({ start: m.index ?? 0, end: (m.index ?? 0) + m[0].length, seconds })
  }
  const halfHour = locale === 'es' ? /\bmedia hora\b/gi : /\bhalf an hour\b/gi
  for (const m of text.matchAll(halfHour)) out.push({ start: m.index ?? 0, end: (m.index ?? 0) + m[0].length, seconds: 1800 })
  return mergeAdjacent(out, text)
}

// Minutos redondeados de un temporizador, para mostrar "12 min" en vez del
// segundero exacto (docs/03 §1: siempre redondeado en la interfaz, nunca a mano en el componente).
export function timerMinutes(seconds: number): number {
  return Math.round(seconds / 60)
}
