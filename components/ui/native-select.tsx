'use client'

import type { ComponentProps } from 'react'
import { ChevronDownIcon } from '@/components/icons'
import { cn } from '@/lib/utils'

// Un <select> nativo, no un menú a medida: en el móvil abre la rueda del
// sistema (que es lo que quiere una app que se usa con una mano), no necesita
// portal ni JavaScript, y sigue siendo manejable por teclado, por lector de
// pantalla, por `userEvent.selectOptions` y por `page.selectOption` sin trucos.
// Todo el estilo del proyecto para listas desplegables vive aquí: catorce
// huecos que antes repetían cinco `className` distintos (revisión final de W2,
// ítem 29; revisión final de W3, ítem 24).
//
// `appearance-none` + el chevrón absoluto son lo único "a medida": la flecha
// del sistema se pinta con el color del sistema, que en el tema oscuro no
// respeta los tokens.
export type NativeSelectProps = ComponentProps<'select'>

export function NativeSelect({ className, children, ...props }: NativeSelectProps) {
  return (
    <span className="relative inline-flex items-center">
      <select
        data-slot="native-select"
        className={cn(
          'min-h-11 appearance-none rounded-sm border border-input bg-transparent py-1 pr-8 pl-2.5 text-base text-foreground transition-colors outline-none',
          'focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50',
          'disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
          'md:text-sm dark:bg-input/30',
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDownIcon size={16} className="pointer-events-none absolute right-2 text-text-2" />
    </span>
  )
}
