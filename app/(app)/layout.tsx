import { Suspense } from 'react'
import { BottomBar } from '@/components/nav/bottom-bar'
import { Toaster } from '@/components/ui/sonner'
import { requireSession } from '@/lib/auth/guards'

// El marco de las cinco pantallas: ancho de lectura, relleno seguro y barra
// inferior. La sesión de cocina lo cede con un `data-fullscreen` en su propia
// sección y `:has()` — no con un layout paralelo, que duplicaría la guardia de
// sesión y partiría el árbol de rutas (informe de identidad, movimiento 5:
// "el más alto riesgo de los cinco").
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    // Auditoría W7, hallazgo 5.4: pb-24 (96px) fijo contra una barra de 56px +
    // env(safe-area-inset-bottom) (34px en iPhone) dejaba solo 6px de holgura;
    // con el tamaño de letra del sistema al máximo la barra crece y se come
    // el último contenido. calc() con el inset en vez del número fijo.
    //
    // Auditoría W7, hallazgo 5.1: `data-wide`, mismo patrón que
    // `data-fullscreen` de arriba (un atributo en la propia pantalla, `:has()`
    // aquí) — no un layout paralelo. Solo /plan (WeekView, 7 columnas) lo
    // marca; el resto de pantallas se queda en max-w-xl de siempre.
    <div className="group mx-auto min-h-dvh max-w-xl px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] has-[[data-fullscreen]]:max-w-none has-[[data-fullscreen]]:p-0 has-[[data-wide]]:max-w-5xl">
      {/* La guardia de sesión ya no se espera en el cuerpo del layout: un
          `await` de cookies() aquí arrastra a {children} detrás de la
          petición y deja el árbol entero fuera del armazón estático
          (streaming.md, "Push dynamic access down"). Dentro de su propio
          <Suspense> hace lo mismo -redirige a /login si no hay sesión- sin
          bloquear el marco. Cada pantalla vuelve a comprobarlo por su cuenta
          con requireHousehold(): esto es red de seguridad, no la única. */}
      <Suspense fallback={null}>
        <SessionGuard />
      </Suspense>
      {children}
      <div className="group-has-[[data-fullscreen]]:hidden">
        <BottomBar />
      </div>
      <Toaster position="top-center" />
    </div>
  )
}

async function SessionGuard() {
  await requireSession()
  return null
}
