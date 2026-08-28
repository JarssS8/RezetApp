import type { CSSProperties } from 'react'
import { RecipesIcon } from '@/components/icons'
import { cn } from '@/lib/utils'

// Ocho ángulos, no un valor continuo: se quiere variedad reconocible, no ruido.
const ANGLES = [120, 135, 160, 200, 225, 250, 290, 315] as const

// Hash estable (djb2 sobre los caracteres del id). Determinista a propósito: el
// mismo id tiene que dar el mismo degradado en el servidor y en el cliente, o
// React avisa de un desajuste de hidratación. Nada de Math.random.
//
// No es dominio (docs/03-DOMINIO no dice nada de placeholders): es presentación
// pura, así que vive con el componente que la usa y no en lib/domain.
export function placeholderAngle(id: string): number {
  let hash = 0
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) >>> 0
  return ANGLES[hash % ANGLES.length] ?? 135
}

export interface RecipePlaceholderProps {
  recipeId: string
  className?: string
}

// Receta sin foto. Hasta W6 era un rectángulo gris con un libro de 32 px, y con
// media biblioteca sin imagen la parrilla era una rejilla de clones.
export function RecipePlaceholder({ recipeId, className }: RecipePlaceholderProps) {
  return (
    <div
      aria-hidden="true"
      style={{ '--grad-food-angle': `${placeholderAngle(recipeId)}deg` } as CSSProperties}
      className={cn('flex aspect-video w-full items-center justify-center bg-(image:--grad-food) text-acc-ink/40', className)}
    >
      <RecipesIcon size={56} strokeWidth={1.4} />
    </div>
  )
}
