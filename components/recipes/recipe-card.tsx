import Link from 'next/link'
import { getLocale, getTranslations } from 'next-intl/server'
import { EstimatedIcon } from '@/components/icons'
import { Card, CardContent } from '@/components/ui/card'
import type { RecipeSummary } from '@/lib/actions/recipes'
import { RecipePlaceholder } from './recipe-placeholder'

export interface RecipeCardProps {
  recipe: RecipeSummary
}

// Tarjeta de la lista de recetas: Server Component puro (sin hooks), formatea
// los números con Intl.NumberFormat del locale actual. Las kcal siempre van
// etiquetadas "por ración" (docs/03-DOMINIO §2): nunca un número suelto.
export async function RecipeCard({ recipe }: RecipeCardProps) {
  const locale = (await getLocale()) === 'en' ? 'en' : 'es'
  const t = await getTranslations('recipes')
  const nf = new Intl.NumberFormat(locale)

  return (
    <Link href={`/recipes/${recipe.id}`} className="block">
      {/* Hover de escritorio (W6.5, §6): la tarjeta se levanta y la sombra
          crece un escalón. Presión (§3): active:scale-[.98], mismo presupuesto
          --dur-2 que el hover para no mezclar dos duraciones en una tarjeta
          que solo tiene una transición declarada. */}
      <Card className="h-full transition-[transform,box-shadow] duration-(--dur-2) ease-(--ease-out) hover:-translate-y-0.5 hover:shadow-raised active:scale-[.98]">
        {recipe.imageUrl ? (
          // Imagen servida desde el volumen local (mismo origen): next/image
          // no aporta aquí (ya sale de saveImage en 1600 px máx./webp) y
          // rompería el tratamiento de esquinas del Card, pensado para un
          // <img> como primer hijo directo (ver *:[img:first-child] en card.tsx).
          // Auditoría W7, 3.1: la rejilla pinta todas las tarjetas de golpe;
          // sin next/image había que poner a mano lo que aportaba lazy-loading.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={recipe.imageUrl} alt="" loading="lazy" decoding="async" className="aspect-video w-full object-cover" />
        ) : (
          <RecipePlaceholder recipeId={recipe.id} />
        )}
        <CardContent className="flex flex-col gap-1.5">
          <h2 className="truncate font-display text-base">{recipe.title}</h2>
          <div className="tabular flex items-center gap-1 text-sm text-text-2">
            {recipe.totalMinutes !== null ? (
              <span>
                {nf.format(recipe.totalMinutes)} {t('minutes')}
              </span>
            ) : null}
            {recipe.totalMinutes !== null && recipe.kcalPerServing !== null ? <span>·</span> : null}
            {recipe.kcalPerServing !== null ? (
              <span className="inline-flex items-center gap-1">
                {nf.format(recipe.kcalPerServing)} {t('kcalUnit')}/{t('perServing')}
                {recipe.nutritionIsEstimated ? <EstimatedIcon size={12} title={t('food.estimated')} /> : null}
              </span>
            ) : null}
          </div>
          {recipe.tags.length > 0 ? (
            <ul className="flex flex-wrap gap-1">
              {recipe.tags.map((tag) => (
                <li key={tag} className="rounded-pill bg-acc-soft px-2 py-0.5 text-xs text-acc-ink">
                  {tag}
                </li>
              ))}
            </ul>
          ) : null}
        </CardContent>
      </Card>
    </Link>
  )
}
