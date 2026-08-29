import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  // Presión (W6.5, ruling W6-R5): active:scale-[.98] se suma al empuje de 1px
  // que ya había. transition-all se cambia por la lista explícita que de
  // verdad se anima (transform, sombra del foco/aria-invalid, color de fondo
  // y de borde), con duración de token (--dur-1): "transition-all" sin
  // duración tirada de la escala por defecto de Tailwind, que no es ninguno
  // de los tres presupuestos del informe de animaciones.
  //
  // Foco (auditoría W7, hallazgo 1.1): SIN outline-none. Tailwind v4 emite
  // sus utilidades en la capa `utilities`, posterior a `base`, así que el
  // outline-none de aquí ganaba siempre al `:focus-visible { outline: 2px
  // solid var(--acc) }` global (globals.css) sin importar especificidad — el
  // contorno de foco no se pintaba nunca. Al quitarlo, ese outline vuelve a
  // mandar. Se retira también el `ring-3 ring-ring/50` de foco: con el
  // outline activo, el ring (caja translúcida pegada al borde) sumaba un
  // tercer trazo alrededor del control (borde + ring + outline con offset) y
  // se veía como doble aro. Se conserva `focus-visible:border-ring` (1px, sin
  // solaparse con el outline) como refuerzo de color en el propio borde.
  "group/button inline-flex min-h-11 shrink-0 items-center justify-center rounded-sm border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-[transform,box-shadow,background-color,border-color] duration-(--dur-1) ease-(--ease-out) select-none focus-visible:border-ring active:scale-[.98] active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/80",
        // aria-pressed (auditoría W7, hallazgo 1.5): modo pared, escáner y
        // saltar comida ya marcaban `aria-pressed` pero `buttonVariants` solo
        // pintaba `aria-expanded` — el estado activo era visualmente idéntico
        // al apagado. Mismos tokens que la píldora de seleccionado
        // (--acc-soft/--acc-ink/--acc-line, ver pill-selected en globals.css).
        outline:
          "border-border bg-background hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground aria-pressed:border-[--acc-line] aria-pressed:bg-[--acc-soft] aria-pressed:text-[--acc-ink] dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)] aria-expanded:bg-secondary aria-expanded:text-secondary-foreground",
        ghost:
          "hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground aria-pressed:border-[--acc-line] aria-pressed:bg-[--acc-soft] aria-pressed:text-[--acc-ink] dark:hover:bg-muted/50",
        // Auditoría W7, hallazgo 1.2: `text-destructive` (--danger crudo) sobre
        // estos fondos translúcidos suspendía AA en los cuatro estados menos
        // uno (reposo claro 4,69 justo, hover claro 4,02, reposo oscuro 3,83,
        // hover oscuro 3,25). `text-danger-ink` arregla claro entero y sube
        // oscuro, pero el fondo /20-/30 oscuro seguía sin llegar a 4,5:1 con
        // cualquier tinta razonable: se baja también su opacidad (/12-/16,
        // igual que se hizo con el ring de foco) para que el par cumpla AA de
        // verdad en los dos temas, no solo sobre el papel.
        destructive:
          "bg-destructive/10 text-danger-ink hover:bg-destructive/20 focus-visible:border-destructive/40 dark:bg-destructive/12 dark:hover:bg-destructive/16",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "gap-1.5 px-4 has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3",
        xs: "gap-1 px-2 text-xs has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "gap-1 px-2.5 text-[0.8rem] has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "gap-1.5 px-4 has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3",
        icon: "min-w-11 px-0",
        "icon-xs": "min-w-11 px-0 [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "min-w-11 px-0",
        "icon-lg": "min-w-11 px-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
