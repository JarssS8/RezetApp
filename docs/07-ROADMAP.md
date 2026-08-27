# 07 · Hoja de ruta

Construirlo todo de golpe es cómo mueren estos proyectos. Este orden hace que haya
algo usable pronto y que cada fase se apoye en la anterior.

Se ejecuta en oleadas paralelas (ver spec §17). El MCP mínimo se adelanta a W2
para conservar el feedback temprano.

Las secciones «Fase 0…5» de abajo son la narrativa original; **el contenido
real de cada oleada es el de §17 del spec**. En particular, el esquema de
Drizzle, los passkeys y `lib/domain` NO están en W0 (hecho): llegan en W1.

## Fase 0 · El esqueleto

Aburrido, y lo único que no se puede añadir después sin dolor.

- Proyecto Next.js 16 + TypeScript + Tailwind v4 + shadcn/ui
- Tokens de `design-tokens.css` aplicados y verificados en claro y oscuro
- Esquema completo de Drizzle con `household_id` en todo, aunque la interfaz no lo
  use aún. Migración inicial
- Auth con passkeys. Invitación al hogar por enlace
- `docker compose up` que arranca a la primera: app + Postgres, sin S3 ni SMTP
- i18n con las cadenas ya separadas (`es`, `en`)
- `lib/domain` creado con los tests de escalado y nutrición, aunque la interfaz
  todavía no los use

**Listo cuando:** `docker compose up` levanta la app, puedes registrarte con
passkey, crear un hogar e invitar a alguien.

## Fase 1 · Recetas que escalan

- CRUD de recetas con ingredientes y pasos
- Ingredientes asignados a pasos
- **Selector de raciones con escalado no lineal y su aviso**
- Conversión de unidades, fracciones bonitas
- Kilocalorías por ración y por 100 g
- Búsqueda full-text
- Importar por URL (schema.org) y desde texto pegado
- Modo cocina básico: un paso por pantalla, wake lock
- Notas personales y contador de veces cocinada
- Exportar todo en JSON

**Listo cuando:** ya sustituye a tu método actual de guardar recetas. Ese es el
listón para pasar de fase, no una lista de tareas marcadas.

**Hecha en W2**: `/recipes` sustituye al método anterior de guardar recetas.

## Fase 2 · El MCP

- Endpoint `/mcp` con las doce herramientas del perfil básico
- Tokens con nombre y alcance
- OpenAPI publicado
- Los cuatro prompts MCP
- Barandilla de crear-sí-borrar-no

Va pronto **a propósito**: es la parte con más riesgo de decepcionar. Cuanto antes
sepas si el flujo te convence, mejor. Conéctalo a un cliente MCP de escritorio y úsalo una
semana entera antes de seguir.

**Hecha en W3**: las doce herramientas del perfil básico y las del completo
(salvo `merge_foods`, W4), los cuatro prompts, el recurso `household://context`,
tokens con alcance y perfil, `openapi.json` y Swagger autoalojado en
`/api/docs`, conexión documentada en `docs/05-MCP.md`.

## Fase 3 · Plan

- Calendario semanal y mensual con arrastrar y soltar
- Varias comidas por hueco
- Sobras como comida planificable
- Presupuesto de tiempo por día
- Sincronización en vivo entre el hogar (SSE)
- Propuesta de la IA en diff, con aprobar y descartar

Aquí entra tu pareja como usuaria real, que es cuando aparecen los problemas de
verdad.

**Hecha en W2** salvo el presupuesto de tiempo por día (W4).

## Fase 4 · Despensa y el bucle

- Inventario con ubicaciones y caducidades
- **Descuento automático al marcar cocinado**
- Open Food Facts y USDA sembradas
- Escaneo de código de barras
- Sugerir recetas por lo que caduca
- Consolidación y **envío a ShopList**

El bucle se cierra aquí. Es cuando el agente pasa de sugerir en abstracto a
sugerir con conocimiento de causa.

**Hecha en W2**; el descuento automático al marcar cocinado (`log_cooked`, modo
cocina y Hoy) llegó en W3. Queda la siembra de USDA (solo Open Food Facts).

## Fase 5 · Lo que la hace tuya

- Reglas de autorrelleno del plan ("lunes sin carne")
- Evitar repetición reciente
- Temporizadores detectados en el texto de los pasos
- Importar desde foto, PDF y vídeo
- Migración desde Mealie y Tandoor
- Etiquetas jerárquicas y colecciones como filtros guardados
- Fusionar alimentos y unidades duplicados
- Alérgenos por miembro
- Estadísticas de plan frente a realidad
- Modo pared para tablet
- Lectura en voz alta de los pasos
- Notificaciones push de caducidad
- PWA instalable, y luego APK con Capacitor

Nada de esto es imprescindible, y todo esto es lo que haría que alguien eligiera
RezetApp frente a Mealie.

**Hecha en W4** salvo lo que el spec deja fuera: importar desde vídeo (sin
especificar), el APK con Capacitor (se queda en PWA por ahora) y el tiempo de
paso a paso ya venía de W3. Los temporizadores, la voz, el modo pared, la
importación por foto/PDF, Mealie/Tandoor, etiquetas y colecciones, fusión de
alimentos, alérgenos, estadísticas, push y PWA están en `main`.

## Lo que va a doler

Cuatro cosas, dichas de antemano:

1. **La base de datos de alimentos.** Ver `docs/03-DOMINIO.md` §4.
2. **El parser de ingredientes en español.** Ver §5 del mismo.
3. **Los modelos locales pequeños eligen mal las herramientas.** Ver `docs/05-MCP.md`.
4. **El descuento de despensa.** Si no funciona bien, la despensa se desactualiza
   en tres días y todo el sistema pierde el sentido.
