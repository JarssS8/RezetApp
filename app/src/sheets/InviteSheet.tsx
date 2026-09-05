import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { usePrefs } from '../store/prefs';
import { useAuth } from '../data/auth';
import { supabase } from '../data/supabaseClient';
import { inviteUrl } from '../data/pendingInvite';
import { Sheet } from '../ui/Sheet';
import { Button } from '../ui/Button';
import { radius, tabular } from '../ui/tokens';

/** Hoja nueva: genera un código de `household_invite` para el hogar actual. */
export function InviteSheet({
  onClose,
  onToast,
}: {
  onClose: () => void;
  onToast: (msg: string) => void;
}) {
  const { t } = usePrefs();
  const { profile } = useAuth();
  const [code, setCode] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!code) {
      setQr(null);
      return;
    }
    let cancelled = false;
    // Fondo/tinta fijos a propósito: un QR necesita alto contraste real para
    // escanear bien, así que no sigue el tema claro/oscuro de la app.
    QRCode.toDataURL(inviteUrl(code), { width: 220, margin: 1, color: { dark: '#1a1a1a', light: '#ffffff' } })
      .then((url) => {
        if (!cancelled) setQr(url);
      })
      .catch(() => {
        if (!cancelled) setQr(null);
      });
    return () => {
      cancelled = true;
    };
  }, [code]);

  const generate = async () => {
    if (!profile || busy) return;
    setBusy(true);
    const { data, error } = await supabase
      .from('household_invite')
      .insert({ household_id: profile.householdId })
      .select('code')
      .single();
    setBusy(false);
    if (!error && data) setCode(data.code as string);
  };

  const copyText = async (value: string, message: string) => {
    try {
      await navigator.clipboard.writeText(value);
      onToast(message);
    } catch {
      /* portapapeles no disponible en este navegador */
    }
  };

  return (
    <Sheet title={t.inviteSheetTitle} onClose={onClose}>
      <div style={{ paddingBottom: 6 }}>
        <div style={{ fontSize: 15, color: 'var(--muted)', lineHeight: 1.5, marginBottom: 18, textWrap: 'pretty' }}>
          {t.inviteSheetBody}
        </div>

        {code ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                padding: '16px 18px',
                borderRadius: radius.button,
                background: 'var(--soft)',
              }}
            >
              <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '.04em', ...tabular }}>{code}</div>
              <Button size="header" onClick={() => void copyText(code, t.copiedCode)}>
                {t.copyCode}
              </Button>
            </div>

            <Button
              full
              variant="secondary"
              onClick={() => void copyText(inviteUrl(code), t.copiedLink)}
            >
              {t.copyLink}
            </Button>

            {qr && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, marginTop: 4 }}>
                <div
                  style={{
                    padding: 12,
                    borderRadius: radius.button,
                    background: '#ffffff',
                    boxShadow: 'var(--shadow-s)',
                  }}
                >
                  <img src={qr} width={220} height={220} alt="" style={{ display: 'block' }} />
                </div>
                <div style={{ fontSize: 13, color: 'var(--muted)' }}>{t.scanToJoin}</div>
              </div>
            )}
          </div>
        ) : (
          <Button full onClick={generate} disabled={busy}>
            {t.generateInvite}
          </Button>
        )}
      </div>
    </Sheet>
  );
}
