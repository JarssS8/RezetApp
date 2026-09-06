import { useCallback, useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import type { IScannerControls } from '@zxing/browser';
import { usePrefs } from '../store/prefs';
import { supabase } from '../data/supabaseClient';
import { mapGeminiRecognition, mapOpenFoodFactsProduct, type OffApiResponse } from '../domain/pantryImport';
import { blobToBase64 } from '../lib/imageCapture';
import { Button } from '../ui/Button';
import { Pressable } from '../ui/Pressable';
import { maxW, radius } from '../ui/tokens';
import { EASE_SHEET } from '../motion/motion';
import type { Unit } from '../types';

type Status = 'starting' | 'scanning' | 'looking' | 'notFound' | 'photoFailed' | 'noCamera';

const SCAN_TUTORIAL_SEEN_KEY = 'rezet.seenScanTutorial';

/** Barras de un código de barras, sin ilustración: solo trazos. */
function BarcodeDiagram() {
  const bars = [2, 4, 1, 3, 1, 4, 2, 1, 3, 2, 4, 1];
  return (
    <div
      style={{
        width: 112,
        height: 78,
        background: 'var(--surface)',
        borderRadius: 12,
        boxShadow: 'var(--shadow-m)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
      }}
    >
      {bars.map((w, i) => (
        <div key={i} style={{ width: w, height: 42, background: 'var(--text)' }} />
      ))}
    </div>
  );
}

/** Producto con puntos de reconocimiento alrededor: diagrama, no ilustración. */
function AiDiagram() {
  return (
    <div style={{ position: 'relative', width: 88, height: 88, display: 'grid', placeItems: 'center' }}>
      <div style={{ width: 62, height: 62, borderRadius: 16, background: 'var(--surface)', boxShadow: 'var(--shadow-m)' }} />
      <div style={{ position: 'absolute', top: 4, right: 10, width: 7, height: 7, borderRadius: 99, background: 'var(--accent)' }} />
      <div style={{ position: 'absolute', bottom: 10, left: 4, width: 6, height: 6, borderRadius: 99, background: 'var(--accent)' }} />
      <div style={{ position: 'absolute', top: 16, left: 0, width: 5, height: 5, borderRadius: 99, background: 'var(--accent)' }} />
    </div>
  );
}

/**
 * Guía de dos pasos que se ve una sola vez, la primera vez que se abre el
 * escáner: código de barras y, si no hay, reconocimiento por foto con IA.
 * Se marca vista en localStorage — no vuelve a salir salvo que se borre.
 */
function ScanTutorial({ onDone }: { onDone: () => void }) {
  const { t } = usePrefs();
  const [step, setStep] = useState(0);
  const pages = [
    { Diagram: BarcodeDiagram, title: t.scanTutorialTitle1, body: t.scanTutorialBody1 },
    { Diagram: AiDiagram, title: t.scanTutorialTitle2, body: t.scanTutorialBody2 },
  ];
  const last = step === pages.length - 1;
  const page = pages[step]!;
  const Diagram = page.Diagram;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 85, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(8,12,8,.55)' }} />
      <Pressable
        onClick={onDone}
        ariaLabel={t.skip}
        scale={0.96}
        style={{ position: 'absolute', top: 18, right: 18, padding: '8px 12px', borderRadius: 10, fontSize: 14, fontWeight: 550, color: 'rgba(255,255,255,.85)' }}
      >
        {t.skip}
      </Pressable>
      <div
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: maxW.sheet,
          margin: '0 auto',
          background: 'var(--surface)',
          borderTopLeftRadius: radius.sheet,
          borderTopRightRadius: radius.sheet,
          boxShadow: 'var(--shadow-l)',
          padding: '24px 22px 26px',
          animation: `rise .32s ${EASE_SHEET} both`,
        }}
      >
        <div
          style={{
            height: 150,
            borderRadius: radius.hero,
            background: 'var(--soft)',
            border: '1px solid var(--line)',
            display: 'grid',
            placeItems: 'center',
            marginBottom: 20,
          }}
        >
          <Diagram />
        </div>
        <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-.02em', lineHeight: 1.15 }}>{page.title}</div>
        <div style={{ marginTop: 10, fontSize: 15.5, lineHeight: 1.5, color: 'var(--muted)' }}>{page.body}</div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 7, margin: '22px 0 16px' }} aria-hidden="true">
          {pages.map((_, i) => (
            <div
              key={i}
              style={{ width: 7, height: 7, borderRadius: radius.pill, background: 'var(--accent)', opacity: i === step ? 1 : 0.3 }}
            />
          ))}
        </div>
        <Button full onClick={() => (last ? onDone() : setStep((s) => s + 1))}>
          {last ? t.gotIt : t.next}
        </Button>
      </div>
    </div>
  );
}

async function lookupBarcode(code: string): Promise<{ name: string; quantity: number; unit: Unit } | null> {
  try {
    const res = await fetch(
      `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=product_name,quantity,product_quantity,product_quantity_unit`,
    );
    if (!res.ok) return null;
    return mapOpenFoodFactsProduct((await res.json()) as OffApiResponse);
  } catch {
    return null;
  }
}

/**
 * Cámara viva unificada: decodifica código de barras en bucle sobre el
 * vídeo, con un botón manual "Reconocer por foto" (Gemini) como respaldo.
 * Sustituye a PantryBarcodeCapture + PantryPhotoCapture.
 */
export function PantryScanCapture({
  allowPhoto,
  onResult,
  onManual,
}: {
  allowPhoto: boolean;
  onResult: (item: { name: string; quantity?: number; unit?: Unit; expiresOn?: string }) => void;
  onManual: () => void;
}) {
  const { t } = usePrefs();
  const [status, setStatus] = useState<Status>('starting');
  const [attempt, setAttempt] = useState(0);
  const [showTutorial, setShowTutorial] = useState(() => {
    try {
      return !localStorage.getItem(SCAN_TUTORIAL_SEEN_KEY);
    } catch {
      return false;
    }
  });
  const dismissTutorial = () => {
    try {
      localStorage.setItem(SCAN_TUTORIAL_SEEN_KEY, '1');
    } catch {
      // localStorage puede fallar en privado/incógnito — no bloquea el escaneo.
    }
    setShowTutorial(false);
  };
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  // Vive toda la vida del componente (no del efecto de escaneo, que se
  // reinicia en cada `attempt`) — es la única señal de cancelación que le
  // hace falta a captureFrameForGemini, una acción disparada por el
  // usuario una vez, no algo que el efecto de escaneo reinicie.
  const unmountedRef = useRef(false);
  useEffect(() => () => {
    unmountedRef.current = true;
  }, []);

  const runLookup = useCallback(
    async (code: string, cancelledRef: { current: boolean }) => {
      setStatus('looking');
      const item = await lookupBarcode(code);
      if (cancelledRef.current) return;
      if (item) onResult(item);
      else setStatus('notFound');
    },
    [onResult],
  );

  useEffect(() => {
    const cancelledRef = { current: false };
    const video = videoRef.current;
    if (video) video.muted = true;
    const reader = new BrowserMultiFormatReader();
    reader
      .decodeFromConstraints(
        { video: { facingMode: { ideal: 'environment' } } },
        video ?? undefined,
        (result) => {
          if (cancelledRef.current || !result) return;
          controlsRef.current?.stop();
          void runLookup(result.getText(), cancelledRef);
        },
      )
      .then((controls) => {
        if (cancelledRef.current) {
          controls.stop();
          return;
        }
        controlsRef.current = controls;
        setStatus('scanning');
      })
      .catch(() => {
        if (!cancelledRef.current) setStatus('noCamera');
      });
    return () => {
      cancelledRef.current = true;
      controlsRef.current?.stop();
    };
  }, [attempt, runLookup]);

  const captureFrameForGemini = async () => {
    const video = videoRef.current;
    if (!video) return;
    setStatus('looking');
    controlsRef.current?.stop();
    try {
      // Se dibuja directo desde el <video> vivo, no desde un File — por eso
      // no usa resizeImageFile (que se quitó del todo en el commit
      // anterior). El resize aquí SÍ es seguro (a diferencia del código de
      // barras, que decodifica el frame de vídeo directamente, nunca una
      // copia reducida/recomprimida).
      const canvas = document.createElement('canvas');
      const maxDim = 1024;
      const scale = Math.min(1, maxDim / Math.max(video.videoWidth, video.videoHeight));
      canvas.width = video.videoWidth * scale;
      canvas.height = video.videoHeight * scale;
      canvas.getContext('2d')!.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/jpeg', 0.85),
      );
      const image = await blobToBase64(blob);
      const { data, error } = await supabase.functions.invoke('recognize-pantry-item', {
        body: { image, mimeType: 'image/jpeg' },
      });
      if (unmountedRef.current) return;
      if (error) return setStatus('photoFailed');
      const recognized = mapGeminiRecognition(data);
      if (!recognized) return setStatus('photoFailed');
      onResult({
        name: recognized.name,
        quantity: recognized.quantity ?? undefined,
        unit: recognized.unit ?? undefined,
        expiresOn: recognized.expiresOn ?? undefined,
      });
    } catch {
      if (!unmountedRef.current) setStatus('photoFailed');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'center', padding: '4px 0' }}>
      {showTutorial && <ScanTutorial onDone={dismissTutorial} />}

      {(status === 'starting' || status === 'scanning' || status === 'looking') && (
        <video
          ref={videoRef}
          playsInline
          style={{ width: '100%', height: 220, borderRadius: 20, objectFit: 'cover', background: 'var(--soft)' }}
        />
      )}

      {status === 'starting' && <div style={{ color: 'var(--muted)', fontSize: 14.5 }}>{t.lookingUp}</div>}

      {status === 'looking' && <div style={{ color: 'var(--muted)', fontSize: 14.5 }}>{t.lookingUp}</div>}

      {status === 'scanning' && allowPhoto && (
        <Button full onClick={() => void captureFrameForGemini()}>
          {t.recognizeByPhoto}
        </Button>
      )}

      {(status === 'noCamera' || status === 'notFound' || status === 'photoFailed') && (
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
          {status === 'noCamera' && <div style={{ fontSize: 13, color: 'var(--warn-ink)' }}>{t.cameraUnavailable}</div>}
          {status === 'notFound' && <div style={{ fontSize: 13, color: 'var(--warn-ink)' }}>{t.scanNotFound}</div>}
          {status === 'photoFailed' && <div style={{ fontSize: 13, color: 'var(--warn-ink)' }}>{t.photoRecognizeFailed}</div>}
          {status !== 'noCamera' && (
            <Button
              full
              onClick={() => {
                setStatus('starting');
                setAttempt((n) => n + 1);
              }}
            >
              {t.scanAgain}
            </Button>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={onManual}
        style={{ border: 0, background: 'transparent', padding: 0, fontSize: 14.5, fontWeight: 600, color: 'var(--accent-ink)' }}
      >
        {t.enterManually}
      </button>
    </div>
  );
}
