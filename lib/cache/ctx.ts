import 'server-only'
import { db } from '@/db'
import type { Ctx, Locale } from '@/lib/auth/ctx'

// Contexto mínimo para una lectura cacheada. Dentro de "use cache" no hay
// cookies ni sesión, así que el Ctx se fabrica aquí con los dos únicos valores
// que el llamador extrajo antes de entrar y que por eso mismo forman parte de
// la clave: el hogar y el idioma.
//
// userId, apiTokenId, role y scopes van a null/[] a propósito. Ningún servicio
// de LECTURA los mira (verificado uno a uno: solo aparecen en escrituras y en
// los servicios por usuario de passkeys, tokens y preferencias), y así una
// entrada de caché no puede depender por accidente de quién la pidió. Si algún
// día una lectura necesitara el usuario, ese dato no se cachea: se lee fuera.
export function cacheCtx(householdId: string, locale: Locale): Ctx {
  return { db, householdId, userId: null, apiTokenId: null, role: null, locale, scopes: [] }
}

// El día UTC, que es el único con el que trabaja lib/services/pantry.ts
// (startOfDay usa Date.UTC). Se calcula en la capa de petición y viaja como
// argumento para que "caduca en 3 días" entre en la clave y ruede solo cada
// medianoche en vez de congelarse. Ruling W10-R2.
export function utcDayIso(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10)
}
