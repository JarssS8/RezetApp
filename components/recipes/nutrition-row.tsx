import { useLocale, useTranslations } from 'next-intl'
import { EstimatedIcon } from '@/components/icons'

export interface NutritionRowProps {
  perServingKcal: number
  totalKcal: number
  per100gKcal: number | null
  isEstimated: boolean
}

// Kcal siempre por ración, en grande; el total (para las raciones actuales) y
// el por 100 g van pequeños al lado — nunca un número suelto (docs/03 §2).
export function NutritionRow({ perServingKcal, totalKcal, per100gKcal, isEstimated }: NutritionRowProps) {
  const t = useTranslations('recipes')
  const locale = useLocale()
  const nf = new Intl.NumberFormat(locale)

  return (
    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
      <span className="flex items-baseline gap-1.5">
        <span className="tabular font-display text-3xl">{nf.format(Math.round(perServingKcal))}</span>
        <span className="text-sm text-text-2">{t('detail.kcalPerServing')}</span>
        {isEstimated ? <EstimatedIcon size={14} title={t('detail.estimated')} /> : null}
      </span>
      <span className="tabular text-xs text-text-2">
        {nf.format(Math.round(totalKcal))} {t('kcalUnit')} {t('detail.total')}
      </span>
      <span className="tabular text-xs text-text-2">
        {per100gKcal !== null ? `${nf.format(Math.round(per100gKcal))} ${t('kcalUnit')} ${t('detail.per100g')}` : '—'}
      </span>
    </div>
  )
}
