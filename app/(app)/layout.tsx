import { BottomBar } from '@/components/nav/bottom-bar'
import { Toaster } from '@/components/ui/sonner'
import { requireSession } from '@/lib/auth/guards'

// El marco de las cinco pantallas: ancho de lectura, relleno seguro y barra
// inferior. La sesión de cocina lo cede con un `data-fullscreen` en su propia
// sección y `:has()` — no con un layout paralelo, que duplicaría la guardia de
// sesión y partiría el árbol de rutas (informe de identidad, movimiento 5:
// "el más alto riesgo de los cinco").
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireSession()
  return (
    <div className="group mx-auto min-h-dvh max-w-xl px-4 pb-24 pt-[max(1rem,env(safe-area-inset-top))] has-[[data-fullscreen]]:max-w-none has-[[data-fullscreen]]:p-0">
      {children}
      <div className="group-has-[[data-fullscreen]]:hidden">
        <BottomBar />
      </div>
      <Toaster position="top-center" />
    </div>
  )
}
