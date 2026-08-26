// Utilidades de fechas para el plan semanal. Puras: solo trabajan con
// cadenas ISO 'YYYY-MM-DD' y aritmética en UTC (evita el salto de día que
// daría un cálculo en huso horario local cerca de medianoche).

function parseIso(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y as number, (m as number) - 1, d as number))
}

function toIso(date: Date): string {
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const d = String(date.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

// Suma (o resta, con n negativo) días a una fecha ISO.
export function addDays(iso: string, n: number): string {
  const date = parseIso(iso)
  date.setUTCDate(date.getUTCDate() + n)
  return toIso(date)
}

// Rango de la semana que contiene dateIso, empezando en weekStartsOn
// (0 = domingo, 1 = lunes, por defecto). Incluye los 7 días en `days`.
export function weekRange(dateIso: string, weekStartsOn = 1): { from: string; to: string; days: string[] } {
  const dow = parseIso(dateIso).getUTCDay()
  const diff = (dow - weekStartsOn + 7) % 7
  const from = addDays(dateIso, -diff)
  const days = Array.from({ length: 7 }, (_, i) => addDays(from, i))
  return { from, to: days[6] as string, days }
}

// Rango del mes que contiene dateIso: primer y último día de ese mes.
export function monthRange(iso: string): { from: string; to: string } {
  const date = parseIso(iso)
  const year = date.getUTCFullYear()
  const month = date.getUTCMonth()
  const from = toIso(new Date(Date.UTC(year, month, 1)))
  const to = toIso(new Date(Date.UTC(year, month + 1, 0)))
  return { from, to }
}

// Fecha de hoy en formato ISO, en la zona horaria indicada (por defecto
// Europe/Madrid; ver ronda de controlador — más adelante será por usuario).
export function todayIso(tz = 'Europe/Madrid'): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}
