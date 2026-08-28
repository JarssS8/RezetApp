import { getTranslations } from 'next-intl/server'
import { BarcodeScanner } from '@/components/pantry/barcode-scanner'
import { requireHousehold } from '@/lib/auth/guards'

export default async function ScanBarcodePage() {
  const t = await getTranslations('pantry')
  await requireHousehold()

  return (
    <main>
      <h1 className="title-screen">{t('scan.title')}</h1>
      <div className="mt-4">
        <BarcodeScanner />
      </div>
    </main>
  )
}
