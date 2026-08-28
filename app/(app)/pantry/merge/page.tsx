import { getTranslations } from 'next-intl/server'
import { MergeFoodsForm } from '@/components/pantry/merge-foods-form'
import { requireHousehold } from '@/lib/auth/guards'

export default async function MergePantryFoodsPage() {
  const t = await getTranslations('pantry')
  await requireHousehold()

  return (
    <main>
      <h1 className="title-screen">{t('merge.title')}</h1>
      <p className="mt-2 text-sm text-text-2">{t('merge.hint')}</p>
      <div className="mt-4">
        <MergeFoodsForm />
      </div>
    </main>
  )
}
