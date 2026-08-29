import { getTranslations } from 'next-intl/server'
import { BarcodeScanner } from '@/components/pantry/barcode-scanner'
import { ScreenHeader } from '@/components/ui/screen-header'
import { requireHousehold } from '@/lib/auth/guards'

export default async function ScanBarcodePage() {
  const t = await getTranslations('pantry')
  await requireHousehold()

  return (
    <main className="view-enter">
      {/* W8: subpantalla sin pestaña propia; vuelve a Despensa. */}
      <ScreenHeader title={t('scan.title')} backHref="/pantry" />
      <div className="mt-4">
        <BarcodeScanner />
      </div>
    </main>
  )
}
