/**
 * Escalas del diseño. Están aquí para que no haya números mágicos repartidos
 * por los componentes; los colores viven en `styles/tokens.css`.
 */

export const radius = {
  sheet: 26,
  hero: 22,
  card: 20,
  list: 18,
  button: 16,
  slot: 15,
  input: 14,
  chip: 13,
  stepper: 11,
  check: 7,
  pill: 99,
} as const;

export const height = {
  cta: 54,
  primary: 52,
  secondary: 48,
  input: 46,
  header: 42,
  touch: 44,
  chip: 34,
  stepper: 32,
  segment: 38,
} as const;

export const screen = {
  padX: 20,
  padTop: 34,
  padBottomMobile: 120,
} as const;

export const maxW = {
  today: 600,
  recipes: 1080,
  plan: 1180,
  pantry: 700,
  detail: 620,
  form: 560,
  cook: 620,
  sheet: 620,
} as const;

/** Tracking dependiente del tamaño: nunca un valor global. */
export const text = {
  screenTitle: { fontSize: 34, fontWeight: 700, letterSpacing: '-.03em', lineHeight: 1 },
  detailTitle: { fontSize: 29, fontWeight: 700, letterSpacing: '-.03em', lineHeight: 1.1 },
  onboardTitle: { fontSize: 27, fontWeight: 700, letterSpacing: '-.025em', lineHeight: 1.15 },
  cookStep: { fontSize: 26, fontWeight: 650, letterSpacing: '-.026em', lineHeight: 1.28 },
  bigNumber: { fontSize: 30, fontWeight: 700, letterSpacing: '-.03em', lineHeight: 1 },
  timer: { fontSize: 38, fontWeight: 700, letterSpacing: '-.03em' },
  sheetTitle: { fontSize: 20, fontWeight: 700, letterSpacing: '-.024em' },
  cardTitle: { fontSize: 16.5, fontWeight: 600, letterSpacing: '-.018em', lineHeight: 1.25 },
  body: { fontSize: 16, letterSpacing: '-.01em', lineHeight: 1.5 },
  row: { fontSize: 15.5, fontWeight: 550, letterSpacing: '-.012em' },
  secondary: { fontSize: 14.5, letterSpacing: '-.005em', lineHeight: 1.5 },
  meta: { fontSize: 13.5 },
  micro: { fontSize: 12.5 },
} as const;

export const tabular = { fontVariantNumeric: 'tabular-nums' } as const;

/** Barra o cabecera translúcida: el contenido pasa por debajo. */
export const glass = {
  background: 'var(--glass)',
  backdropFilter: 'blur(var(--glass-blur, 22px)) saturate(180%)',
  WebkitBackdropFilter: 'blur(var(--glass-blur, 22px)) saturate(180%)',
} as const;

export const glassHeader = {
  background: 'var(--glass)',
  backdropFilter: 'blur(var(--glass-blur, 20px)) saturate(180%)',
  WebkitBackdropFilter: 'blur(var(--glass-blur, 20px)) saturate(180%)',
} as const;
