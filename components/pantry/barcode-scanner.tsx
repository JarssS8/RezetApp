'use client'
import { useLocale, useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { FoodCorrectionDialog } from '@/components/foods/food-correction-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { lookupBarcodeAction, type FoodWithNutrition } from '@/lib/actions/foods'
import type { ActionResult } from '@/lib/actions/result'
import { normalizeBarcode } from '@/lib/barcode'

// El TS lib del proyecto (dom + dom.iterable + esnext) todavía no declara la
// Barcode Detection API: se tipa aquí lo mínimo que se usa, sin `any`.
interface DetectedBarcode {
  rawValue: string
}
interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<DetectedBarcode[]>
}
interface BarcodeDetectorConstructor {
  new (options?: { formats?: string[] }): BarcodeDetectorLike
}

const BARCODE_FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e']

export interface BarcodeScannerProps {
  // Inyectable para tests; por defecto lookupBarcodeAction real (tira de
  // lib/auth/guards, 'server-only', así que los tests sustituyen el módulo).
  lookup?: (code: string) => Promise<ActionResult<FoodWithNutrition | null>>
}

// Escáner de códigos de barras para dar de alta un alimento en la despensa
// (Task 16). Prefiere la Barcode Detection API nativa; si el navegador no la
// trae, carga @zxing/browser con import() dinámico (no engorda el bundle
// inicial). Sin cámara o sin permiso, cae a introducir el código a mano.
export function BarcodeScanner({ lookup = lookupBarcodeAction }: BarcodeScannerProps) {
  const t = useTranslations('pantry')
  const te = useTranslations('errors')
  const locale = useLocale()
  const router = useRouter()

  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [cameraError, setCameraError] = useState(false)
  const [manualOpen, setManualOpen] = useState(false)
  const [manualValue, setManualValue] = useState('')
  const [manualError, setManualError] = useState(false)
  const [busy, setBusy] = useState(false)
  const [foundName, setFoundName] = useState<string | null>(null)
  const [notFoundCode, setNotFoundCode] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)

  // Referencia siempre al gestor de código más reciente: el efecto de cámara
  // solo se engancha una vez (monta/desmonta) pero debe llamar a la versión
  // vigente de handleCode, que cierra sobre `lookup`, `router`, etc.
  const handleCodeRef = useRef<(code: string) => Promise<void>>(async () => {})

  async function handleCode(code: string) {
    if (busy) return
    setBusy(true)
    setFoundName(null)
    setNotFoundCode(null)
    try {
      const result = await lookup(code)
      if (!result.ok) {
        // Si la cámara ya detectó y paró (showManual pudiera seguir en false),
        // el fallo de búsqueda debe abrir la entrada manual junto al aviso:
        // sin esto el error quedaba huérfano o el usuario se quedaba sin forma
        // de reintentar.
        setManualOpen(true)
        setManualError(true)
        return
      }
      if (result.data) {
        setFoundName(result.data.name)
        router.push(`/pantry/add?foodId=${result.data.id}&name=${encodeURIComponent(result.data.name)}`)
        return
      }
      setNotFoundCode(code)
    } finally {
      setBusy(false)
    }
  }
  useEffect(() => {
    handleCodeRef.current = handleCode
  })

  useEffect(() => {
    let cancelled = false
    let mediaStream: MediaStream | null = null
    let zxingControls: { stop: () => void } | null = null
    let rafId: number | null = null
    let detected = false

    function stopCamera() {
      if (rafId !== null) {
        cancelAnimationFrame(rafId)
        rafId = null
      }
      if (zxingControls) {
        zxingControls.stop()
        zxingControls = null
      }
      if (mediaStream) {
        for (const track of mediaStream.getTracks()) track.stop()
        mediaStream = null
      }
      const video = videoRef.current
      if (video) video.srcObject = null
    }

    function onRawDetected(raw: string) {
      if (detected || cancelled) return
      const normalized = normalizeBarcode(raw)
      if (!normalized) return
      detected = true
      stopCamera()
      void handleCodeRef.current(normalized)
    }

    async function runNative(Ctor: BarcodeDetectorConstructor) {
      const detector = new Ctor({ formats: BARCODE_FORMATS })
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      if (cancelled) {
        for (const track of stream.getTracks()) track.stop()
        return
      }
      mediaStream = stream
      const video = videoRef.current
      if (!video) return
      video.srcObject = stream
      await video.play()
      const tick = () => {
        if (cancelled || detected) return
        detector
          .detect(video)
          .then((detections) => {
            const raw = detections[0]?.rawValue
            if (raw) onRawDetected(raw)
          })
          .catch(() => {
            // Un fallo de decodificación en un frame no es fatal: se reintenta en el siguiente.
          })
          .finally(() => {
            if (!cancelled && !detected) rafId = requestAnimationFrame(tick)
          })
      }
      rafId = requestAnimationFrame(tick)
    }

    async function runZxing() {
      const { BrowserMultiFormatReader } = await import('@zxing/browser')
      if (cancelled) return
      const reader = new BrowserMultiFormatReader()
      const video = videoRef.current
      if (!video) return
      const controls = await reader.decodeFromVideoDevice(undefined, video, (result) => {
        if (result) onRawDetected(result.getText())
      })
      if (cancelled) {
        controls.stop()
        return
      }
      zxingControls = controls
    }

    async function start() {
      try {
        if ('BarcodeDetector' in window) {
          await runNative((window as unknown as { BarcodeDetector: BarcodeDetectorConstructor }).BarcodeDetector)
        } else {
          await runZxing()
        }
      } catch {
        if (!cancelled) setCameraError(true)
      }
    }
    void start()

    return () => {
      cancelled = true
      stopCamera()
    }
  }, [])

  async function submitManual() {
    const normalized = normalizeBarcode(manualValue)
    if (!normalized) {
      setManualError(true)
      return
    }
    setManualError(false)
    await handleCode(normalized)
  }

  function handleFoodCreated(created: FoodWithNutrition) {
    setCreateOpen(false)
    router.push(`/pantry/add?foodId=${created.id}&name=${encodeURIComponent(created.name)}`)
  }

  const showManual = cameraError || manualOpen

  return (
    <div className="flex flex-col gap-4">
      {!cameraError ? (
        <div className="overflow-hidden rounded-md bg-surface-2">
          <video ref={videoRef} muted playsInline className="aspect-square w-full object-cover" />
        </div>
      ) : null}
      <p className="text-sm text-text-2">{cameraError ? t('scan.noCamera') : t('scan.hint')}</p>
      {foundName ? <p className="text-sm text-acc-ink">{t('scan.found', { name: foundName })}</p> : null}
      {notFoundCode ? (
        <div className="flex flex-col gap-2 rounded-md border border-border p-3">
          <p className="text-sm">{t('scan.notFound')}</p>
          <Button type="button" variant="secondary" onClick={() => setCreateOpen(true)}>
            {t('form.createFood')}
          </Button>
        </div>
      ) : null}
      {!cameraError ? (
        <Button type="button" variant="outline" aria-pressed={manualOpen} onClick={() => setManualOpen((v) => !v)}>
          {t('scan.manual')}
        </Button>
      ) : null}
      {showManual ? (
        <div className="flex items-center gap-2">
          <Input
            inputMode="numeric"
            pattern="[0-9]*"
            value={manualValue}
            onChange={(e) => {
              setManualValue(e.target.value)
              setManualError(false)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                void submitManual()
              }
            }}
          />
          <Button type="button" disabled={busy} onClick={() => void submitManual()}>
            {t('scan.lookup')}
          </Button>
        </div>
      ) : null}
      {showManual && manualError ? <p role="alert" className="text-xs text-warn">{te('generic')}</p> : null}
      <FoodCorrectionDialog
        food={null}
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSaved={handleFoodCreated}
        locale={locale}
        {...(notFoundCode ? { initial: { barcode: notFoundCode } } : {})}
      />
    </div>
  )
}
