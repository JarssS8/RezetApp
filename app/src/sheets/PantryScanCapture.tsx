import { useCallback, useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import type { IScannerControls } from '@zxing/browser';
import { usePrefs } from '../store/prefs';
import { supabase } from '../data/supabaseClient';
import { mapGeminiRecognition, mapOpenFoodFactsProduct, type OffApiResponse } from '../domain/pantryImport';
import { blobToBase64 } from '../lib/imageCapture';
import { Button } from '../ui/Button';
import type { Unit } from '../types';

type Status = 'starting' | 'scanning' | 'looking' | 'notFound' | 'photoFailed' | 'noCamera';

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
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);

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
    const cancelledRef = { current: false };
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
      if (cancelledRef.current) return;
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
      if (!cancelledRef.current) setStatus('photoFailed');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'center', padding: '4px 0' }}>
      {(status === 'starting' || status === 'scanning' || status === 'looking') && (
        <video
          ref={videoRef}
          playsInline
          style={{ width: '100%', height: 220, borderRadius: 20, objectFit: 'cover', background: 'var(--soft)' }}
        />
      )}

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
            <Button full onClick={() => setAttempt((n) => n + 1)}>
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
