// Normaliza un código de barras leído por cámara o tecleado a mano. Puro: sin
// React ni DOM, así lo usan por igual el escáner (Task 16) y cualquier test.
// Reglas: quita espacios, exige 8-14 dígitos, valida el dígito de control
// EAN-13 (13 dígitos) y antepone el 0 que incrusta un UPC-A (12 dígitos) en el
// espacio de códigos EAN-13.
const DIGITS_ONLY = /^\d+$/
const MIN_LENGTH = 8
const MAX_LENGTH = 14
const EAN13_LENGTH = 13
const UPC_A_LENGTH = 12

function isValidEan13(digits: string): boolean {
  let sum = 0
  for (let i = 0; i < EAN13_LENGTH - 1; i++) {
    const digit = Number(digits[i])
    sum += i % 2 === 0 ? digit : digit * 3
  }
  const checkDigit = (10 - (sum % 10)) % 10
  return checkDigit === Number(digits[EAN13_LENGTH - 1])
}

export function normalizeBarcode(raw: string): string | null {
  const cleaned = raw.replace(/\s+/g, '')
  if (!DIGITS_ONLY.test(cleaned)) return null
  if (cleaned.length < MIN_LENGTH || cleaned.length > MAX_LENGTH) return null
  if (cleaned.length === EAN13_LENGTH && !isValidEan13(cleaned)) return null
  if (cleaned.length === UPC_A_LENGTH) return `0${cleaned}`
  return cleaned
}
