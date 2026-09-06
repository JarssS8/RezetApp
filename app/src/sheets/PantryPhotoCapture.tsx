import { useRef, useState } from 'react';
import { usePrefs } from '../store/prefs';
import { supabase } from '../data/supabaseClient';
import { mapGeminiRecognition } from '../domain/pantryImport';
import { blobToBase64, resizeImageFile } from '../lib/imageCapture';
import { Button } from '../ui/Button';
import { Icon } from '../ui/Icon';
import { radius } from '../ui/tokens';
import type { Unit } from '../types';

type Status = 'idle' | 'looking' | 'failed';

export function PantryPhotoCapture({
  onResult,
  onCancel,
}: {
  onResult: (item: { name: string; quantity?: number; unit?: Unit; expiresOn?: string }) => void;
  onCancel: () => void;
}) {
  const { t } = usePrefs();
  const [status, setStatus] = useState<Status>('idle');
  const inputRef = useRef<HTMLInputElement>(null);

  const onFile = async (file: File) => {
    setStatus('looking');
    try {
      const { blob } = await resizeImageFile(file, 1024);
      const image = await blobToBase64(blob);
      const { data, error } = await supabase.functions.invoke('recognize-pantry-item', {
        body: { image, mimeType: 'image/jpeg' },
      });
      if (error) {
        setStatus('failed');
        return;
      }
      const recognized = mapGeminiRecognition(data);
      if (!recognized) {
        setStatus('failed');
        return;
      }
      onResult({
        name: recognized.name,
        quantity: recognized.quantity ?? undefined,
        unit: recognized.unit ?? undefined,
        expiresOn: recognized.expiresOn ?? undefined,
      });
    } catch {
      setStatus('failed');
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
        <Icon name="camera" size={32} strokeWidth={1.6} />
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

      {status === 'failed' && (
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
          <div style={{ fontSize: 13, color: 'var(--warn-ink)' }}>{t.photoRecognizeFailed}</div>
          <Button full onClick={onCancel}>
            {t.addManual}
          </Button>
        </div>
      )}
    </div>
  );
}
