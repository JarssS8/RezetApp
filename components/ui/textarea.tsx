import * as React from "react"

import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      // Foco: SIN outline-none (auditoría W7, hallazgo 1.1) — razón completa
      // en components/ui/button.tsx. Se retira también el ring-3/ring-ring de
      // foco por el mismo motivo (doble aro); se conserva border-ring.
      className={cn(
        "flex min-h-16 w-full rounded-sm border border-input bg-transparent px-2.5 py-1.5 text-base transition-colors placeholder:text-muted-foreground focus-visible:border-ring disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
