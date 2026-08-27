import { getTranslations } from 'next-intl/server'
import { PantryItemForm } from '@/components/pantry/pantry-item-form'
import { requireHousehold } from '@/lib/auth/guards'
import { getFood } from '@/lib/services/foods'
import { IdSchema } from '@/lib/validation/common'

interface AddPantryItemPageProps {
  // `name` lo añade el escáner de códigos de barras (Task 16) para el caso en
  // que el producto no resuelva a un alimento existente; esta página solo
  // necesita `foodId` para prellenar.
  searchParams: Promise<{ foodId?: string; name?: string }>
}

export default async function AddPantryItemPage({ searchParams }: AddPantryItemPageProps) {
  const t = await getTranslations('pantry')
  const ctx = await requireHousehold()
  const sp = await searchParams
  const parsedFoodId = IdSchema.safeParse(sp.foodId)
  const initialFood = parsedFoodId.success ? await getFood(ctx, parsedFoodId.data) : null
  // Sin alimento resuelto, el nombre sugerido por el escáner precarga el
  // buscador en vez de perderse.
  const initialQuery = !initialFood && sp.name ? sp.name : undefined

  return (
    <main>
      <h1 className="text-2xl">{t('add')}</h1>
      <div className="mt-4">
        <PantryItemForm initialFood={initialFood} {...(initialQuery ? { initialQuery } : {})} />
      </div>
    </main>
  )
}
