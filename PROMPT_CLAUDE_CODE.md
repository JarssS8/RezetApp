# Cómo arrancar con Claude Code

Descomprime el paquete dentro del repositorio, en una carpeta `design/`. Así:

```
mi-repo/
  design/
    INDEX.md
    README.md
    BUILD_FROM_ZERO.md
    tokens.css
    motion.js
    RezetApp.dc.html
    app/            ← el frontend ya escrito
```

Abre Claude Code en la raíz del repo y pega el prompt de abajo. **No escribirá
código todavía**: primero te hace las preguntas, después te enseña el plan, y
solo empieza cuando le digas que sí.

---

## Prompt de arranque (pégalo tal cual)

> Tengo en `design/` un paquete de diseño completo y un frontend ya escrito.
> Quiero levantar la aplicación entera a partir de eso, pero **no escribas nada
> de código todavía**.
>
> **Paso 1 — Lee.** Lee `design/INDEX.md`, `design/BUILD_FROM_ZERO.md` completo,
> `design/README.md` secciones 0 a 5, y explora `design/app/src/` para entender
> qué está ya hecho. En `design/app/README.md` está el mapa del código y el punto
> exacto donde se conecta el backend. Cuando acabes, dime en 10 líneas qué has
> entendido que existe y qué falta: quiero comprobar que hemos entendido lo mismo
> antes de seguir.
>
> **Paso 2 — Pregúntame.** Hazme todas las preguntas que necesites para decidir
> la arquitectura. No supongas nada que puedas preguntar. Como mínimo cubre:
>
> - Backend: ¿Supabase, Firebase, un backend propio en Node, otra cosa? ¿Tengo ya
>   algo montado o partimos de cero?
> - Base de datos y hosting: ¿dónde vive, quién la administra, presupuesto.
> - Auth: ¿passkeys, email con enlace, Google/Apple? ¿Registro abierto o solo por
>   invitación? ¿Cómo se une alguien a un hogar existente?
> - Multi-usuario: ¿varias personas en el mismo hogar editan a la vez? ¿Hace
>   falta tiempo real o basta con recargar?
> - Fotos de los platos: ¿las subo yo, hay almacenamiento, qué tamaños.
> - Nativo: ¿iOS, Android o los dos? ¿Tengo cuentas de desarrollador? ¿Quiero
>   notificaciones para los temporizadores con la app cerrada?
> - Offline: ¿tiene que funcionar sin conexión en la cocina, o basta con caché.
> - Datos: ¿empiezo con los datos de demo o importo recetas de algún sitio?
> - Equipo y ritmo: ¿trabajo solo, cuánto tiempo tengo, hay fecha.
>
> Hazme las preguntas **de golpe, numeradas y agrupadas**, con tu recomendación
> por defecto en cada una y por qué, para que pueda contestar solo lo que quiera
> cambiar. Si alguna respuesta mía abre una decisión nueva, pregúntame otra vez
> antes de pasar al paso 3.
>
> **Paso 3 — Enséñame el plan.** Con mis respuestas, escríbeme un plan en
> `PLAN.md` que incluya:
>
> - Las decisiones técnicas tomadas y **qué descartaste y por qué**.
> - El árbol de carpetas final del repo.
> - El esquema de base de datos que vas a crear, tabla por tabla.
> - La lista de endpoints o funciones de servidor.
> - Los hitos en orden, cada uno con: qué entrega, cómo lo compruebo yo, y una
>   estimación honesta de esfuerzo.
> - Qué vas a reutilizar tal cual de `design/app/` y qué vas a reescribir.
> - Los riesgos: qué es lo más probable que salga mal y qué haremos si pasa.
>
> Explícame el plan en lenguaje llano, no solo en listas de archivos. Quiero
> entender **cómo** lo vas a montar, no solo qué archivos tocarás. Después
> **para y espera mi aprobación.**
>
> **Paso 4 — Solo cuando yo diga "adelante".** Ejecuta un hito por vez. Al
> terminar cada uno: dime qué hiciste, cómo lo pruebo, y espera antes de seguir
> con el siguiente. No encadenes hitos sin pasar por mí.
>
> **Reglas durante todo el proceso:**
>
> - `design/README.md` y `design/RezetApp.dc.html` son la fuente de verdad del
>   diseño. Ante cualquier duda visual, ábrelos y cópialos. No improvises valores
>   ni "mejores" el diseño por tu cuenta.
> - Los colores salen de `tokens.css`. `--accent`/`--warn` son rellenos; el texto
>   sobre fondo claro o tintado usa `--accent-ink`/`--warn-ink`; el texto encima
>   de un relleno de acento usa `--onaccent`. No hay hex sueltos en componentes.
> - Nada de librerías de componentes con tema propio (Material, Ant, Chakra,
>   Bootstrap). Los primitivos ya están en `design/app/src/ui/`.
> - Las reglas de negocio viven en `domain/`, son puras y tienen tests. No
>   dupliques esa lógica en componentes.
> - Si en algún momento el diseño y el código no cuadran, **para y pregúntame**.
>   No resuelvas la ambigüedad por tu cuenta.

---

## Después, para cada hito

Cuando quieras que avance, basta con:

> Adelante con el hito N. Lee las secciones del paquete que necesites antes de
> escribir, y cuando acabes dime cómo lo compruebo.

Y al terminar cada hito, `/clear`. El contexto largo es lo que hace que se olvide
de los tokens y empiece a inventar valores.

## Si se desvía

- Aparece un hex suelto, un radio inventado o una duración donde iba un muelle:
  hazlo corregir **antes** de seguir. En el hito siguiente ya se habrá copiado a
  diez sitios.
- Empieza a instalar una librería de UI: recuérdale la regla y hazlo revertir.
- Da un hito por terminado sin que tú lo hayas probado: no lo aceptes. Cada hito
  del plan lleva su forma de comprobarlo por algo.
