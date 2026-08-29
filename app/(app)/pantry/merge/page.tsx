import { getTranslations } from 'next-intl/server'
import { MergeFoodsForm } from '@/components/pantry/merge-foods-form'
import { ScreenHeader } from '@/components/ui/screen-header'
import { requireHousehold } from '@/lib/auth/guards'

export default async function MergePantryFoodsPage() {
  const t = await getTranslations('pantry')
  await requireHousehold()

  return (
    <main className="view-enter">
      {/* W8: subpantalla sin pestaña propia; vuelve a Despensa. */}
      <ScreenHeader title={t('merge.title')} backHref="/pantry" />
      <p className="mt-2 text-sm text-text-2">{t('merge.hint')}</p>
      <div className="mt-4">
        <MergeFoodsForm />
      </div>
    </main>
  )
}
