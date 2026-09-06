import { useRef, useState } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { usePrefs } from '../store/prefs';
import { mapOpenFoodFactsProduct, type OffApiResponse } from '../domain/pantryImport';
import { Button } from '../ui/Button';
import { Icon } from '../ui/Icon';
import { TextField } from '../ui/Fields';
import { radius } from '../ui/tokens';
import type { Unit } from '../types';

type Status = 'idle' | 'looking' | 'manualEntry' | 'notFound';

async function lookupBarcode(code: string): Promise<{ name: string; quantity: number; unit: Unit } | null> {
  try {
    const res = await fetch(
      `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=product_name,quantity,product_quantity,product_quantity_unit`,
    );
    if (!res.ok) return null;
    const json = (await res.json()) as OffApiResponse;
    return mapOpenFoodFactsProduct(json);
  } catch {
    return null;
  }
}

export function PantryBarcodeCapture({
  onResult,
  onCancel,
}: {
  onResult: (item: { name: string; quantity: number; unit: Unit }) => void;
  onCancel: () => void;
}) {
  const { t } = usePrefs();
  const [status, setStatus] = useState<Status>('idle');
  const [manualCode, setManualCode] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const runLookup = async (code: string) => {
    setStatus('looking');
    const item = await lookupBarcode(code);
    if (item) onResult(item);
    else setStatus('notFound');
  };

  const onFile = async (file: File) => {
    setStatus('looking');
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.src = url;
    try {
      await img.decode();
      const reader = new BrowserMultiFormatReader();
      const result = await reader.decodeFromImageElement(img);
      await runLookup(result.getText());
    } catch {
      setStatus('manualEntry');
    } finally {
      URL.revokeObjectURL(url);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'center', padding: '12px 0' }}>
      <div
        style={{
          width: '100%',
          height: 140,
          borderRadius: radius.card,
          background: 'var(--soft)',
          border: '1px solid var(--line)',
          display: 'grid',
          placeItems: 'center',
          color: 'var(--muted)',
        }}
      >
        <Icon name="barcode" size={32} strokeWidth={1.6} />
      </div>

      {status === 'idle' && (
        <>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            capture="environment"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void onFile(file);
            }}
          />
          <Button full onClick={() => inputRef.current?.click()}>
            {t.takePhoto}
          </Button>
        </>
      )}

      {status === 'looking' && <div style={{ color: 'var(--muted)', fontSize: 14.5 }}>{t.lookingUp}</div>}

      {status === 'manualEntry' && (
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>{t.scanDecodeFailed} — {t.enterBarcodeManually}</div>
          <TextField
            value={manualCode}
            onChange={setManualCode}
            inputMode="numeric"
            placeholder="8410000000000"
          />
          <Button full onClick={() => manualCode.trim() && void runLookup(manualCode.trim())}>
            {t.add}
          </Button>
        </div>
      )}

      {status === 'notFound' && (
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
          <div style={{ fontSize: 13, color: 'var(--warn-ink)' }}>{t.scanNotFound}</div>
          <Button full onClick={onCancel}>
            {t.addManual}
          </Button>
        </div>
      )}
    </div>
  );
}
