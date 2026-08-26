# 06 · Integración con ShopList

**RezetApp no lleva lista de la compra.** Ya existe: ShopList, una PWA en producción
en `shop.jarsss8.es`, con React 18 sin bundler, Supabase, realtime, apps nativas
con Capacitor y unas 400 palabras clave de autocategorización.

RezetApp calcula qué hace falta y lo empuja allí.

## Arquitectura

```
RezetApp                Edge Function            ShopList
calcula qué falta  →   import-items         →   es dueño de la compra
(consolida, resta      (valida, escribe con     (realtime, categorías,
 la despensa)           service role)            apps nativas)
```

Ninguna app conoce el modelo de datos de la otra. Entre ellas hay un contrato de
tres campos: `name`, `quantity`, `store`.

## El esquema real de ShopList

Tabla `products`:

| Columna | Tipo | Nota |
|---|---|---|
| `id` | uuid | generado en cliente, 1:1 con el id local |
| `list_id` | uuid | FK a `lists` |
| `name` | text | **texto plano** |
| `quantity` | text nullable | ver la trampa de abajo |
| `category` | text | una de sus 31 categorías |
| `is_purchased` | bool | |
| `is_archived` | bool | soft delete para el historial |
| `store_name` | text nullable | |
| `added_at` | timestamptz | en local es epoch ms |

Tabla `lists`: `id`, `name` (**JSON `{es,en}` serializado**), `token`, `owner_id`,
`stores` (text[]).
Tabla `history_logs`: `id`, `list_id`, `action`, `item_name`,
`performed_by_name`, `performed_by_avatar`, `created_at`.

## Las tres trampas

### 1. `quantity` no tiene unidades y las destruye

`normalizeQty()` hace `s.match(/-?\d+/)` y devuelve un entero. Le mandes lo que le
mandes, `"300 g"` se convierte en `300` y `"1 l"` en `1`.

Tiene sentido en su app, donde `quantity` significa "cuántos cojo", no "cuánto
pesa". Pero RezetApp produce lo segundo. **Es la restricción que define la
integración.**

**Solución elegida:** la unidad va dentro del nombre.
`name: "Lentejas pardinas · 300 g"`, `quantity: null`.
Las unidades que sí se cuentan por piezas (`ud`, `bote`, `paquete`) van en
`quantity` como entero.

Solución mejor a medio plazo: añadir una columna `unit` a `products` en ShopList.
Requiere tocar sus adaptadores y su interfaz.

### 2. `lists.name` es JSON, `products.name` es texto plano

La integración solo toca `products`, así que manda string plano siempre. Pero si
algún día se crean listas desde RezetApp, hay que serializar `{es,en}`.

### 3. La categoría automática se calcula en el cliente

`autoCategoryFor()` corre en el navegador dentro de `addItem`. Una fila insertada
desde fuera con `category: null` pasa por `productDbToLocal`, que hace
`row.category || 'otros'`, y acaba sin clasificar.

**Arreglo, una línea en `src/supabase.jsx` de ShopList:**

```js
category: row.category || window.autoCategoryFor?.(row.name) || 'otros',
```

Con eso cualquier cosa que entre desde fuera hereda sus 31 categorías y sus ~400
palabras clave, y RezetApp **no manda categoría nunca**.

## Por qué Edge Function y no escribir directo

La RLS de ShopList es permisiva (`USING (true) WITH CHECK (true)`), así que la
anon key —que es pública, va en `config.js`— puede escribir en cualquier lista.
Meterla en un segundo sitio amplía la superficie.

Con la Edge Function, RezetApp lleva un secreto propio, revocable por separado y
sin acceso a nada más. Y ShopList sigue siendo dueño de su modelo: el día que
cambie `products`, se toca la función y RezetApp ni se entera.

## El cliente en RezetApp

`lib/integrations/shoplist.ts`:

*Nota: Los identificadores reales van en inglés: `ShoppingLine`, `toShopListItem`, `pushToShopList`. La configuración vive por hogar (cifrada) con fallback a las variables de entorno.*

```ts
type Linea = { alimento: string; cantidad: number | null; unidad: string | null }

const PIEZAS = new Set(['ud', 'uds', 'unidad', 'unidades', 'bote', 'botes', 'paquete'])

function aItem(l: Linea) {
  if (l.cantidad && l.unidad && PIEZAS.has(l.unidad))
    return { name: l.alimento, quantity: Math.ceil(l.cantidad) }
  if (l.cantidad && l.unidad)
    return { name: `${l.alimento} · ${fmt(l.cantidad)} ${l.unidad}`, quantity: null }
  return { name: l.alimento, quantity: null }
}

export async function enviarACompra(lineas: Linea[]) {
  const res = await fetch(`${process.env.SHOPLIST_FN_URL}/import-items`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.SHOPLIST_IMPORT_SECRET}`,
    },
    body: JSON.stringify({
      source: 'RezetApp',
      listToken: process.env.SHOPLIST_LIST_TOKEN,
      items: lineas.map(aItem),   // sin category: que la infiera ShopList
    }),
  })
  if (!res.ok) throw new Error(`ShopList: ${res.status} ${await res.text()}`)
  return res.json() as Promise<{ ok: true; inserted: number }>
}
```

Variables de entorno: `SHOPLIST_FN_URL`, `SHOPLIST_IMPORT_SECRET`,
`SHOPLIST_LIST_TOKEN`. Todas opcionales — si faltan, el botón de enviar se
oculta y RezetApp funciona igual.

## La Edge Function (va en el repo de ShopList)

`supabase/functions/import-items/index.ts`. Usa `_shared/cors.ts`, que ya existe
allí para `delete-account`. Valida el bearer, busca la lista por `token`, inserta
en `products` con service role, y registra en `history_logs` con
`performed_by_name: 'RezetApp'` para que aparezca firmado en el historial.
Límite de 100 ítems por llamada.

## Enlace profundo

Para el botón "Abrir en ShopList": `https://shop.jarsss8.es/#/s/<token>` — es el
formato que ShopList ya usa para compartir listas.

## Lo que se hereda gratis

Realtime entre miembros, 31 categorías automáticas, apps nativas iOS y Android,
tiendas y pasillos, historial con autor, Google OAuth y modo invitado, offline en
el súper, bilingüe. Reconstruir eso serían semanas.
