import { useState } from 'react';
import { usePrefs } from '../store/prefs';
import { useAuth } from '../data/auth';
import { useData } from '../data/storeContext';
import { extractKomprappToken } from '../domain/komprappToken';
import { Sheet } from '../ui/Sheet';
import { Button } from '../ui/Button';
import { TextField } from '../ui/Fields';
import { radius, tabular } from '../ui/tokens';

// Espejo del formato que exige `set_komprapp_list_token` en el servidor
// (tras lower/trim del token) — ver
// app/supabase/migrations/20260917063503_add_komprapp_list_token.sql.
const KOMPRAPP_TOKEN_RE = /^[a-z0-9-]{3,64}$/;

/**
 * Vincula la lista de la compra de komprapp del hogar (README §4.10). La RPC
 * `set_komprapp_list_token` rechaza la llamada si quien la hace no es
 * administrador del hogar — aquí deshabilitamos guardar/desvincular para
 * quien no lo es, en vez de dejar que llegue a la RPC y se entere solo al
 * fallar (la RPC no distingue el error con un código, solo un string plano).
 */
export function KomprappLinkSheet({
  onClose,
  onToast,
}: {
  onClose: () => void;
  onToast: (msg: string) => void;
}) {
  const { t } = usePrefs();
  const { profile } = useAuth();
  const { household, setKomprappListToken } = useData();
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);

  const linked = household?.komprappListToken ?? null;
  const amIAdmin = household?.members.find((m) => m.id === profile?.id)?.isAdmin ?? false;

  const save = async () => {
    const token = extractKomprappToken(draft);
    if (!token || busy || !amIAdmin) return;
    // Mismo formato que exige la RPC `set_komprapp_list_token` en el
    // servidor (tras lower/trim) — comprobarlo aquí evita una llamada de
    // red que el servidor solo va a rechazar, sin ningún aviso para quien
    // pegó algo mal formado.
    if (!KOMPRAPP_TOKEN_RE.test(token)) {
      onToast(t.komprappLinkError);
      return;
    }
    setBusy(true);
    try {
      await setKomprappListToken(token);
      setDraft('');
      onToast(t.komprappLinkSaved);
    } catch {
      onToast(t.komprappLinkError);
    } finally {
      setBusy(false);
    }
  };

  const unlink = async () => {
    if (busy || !amIAdmin) return;
    setBusy(true);
    try {
      await setKomprappListToken(null);
      onToast(t.komprappLinkUnlinked);
    } catch {
      onToast(t.komprappLinkError);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet title={t.komprappLinkSheetTitle} onClose={onClose}>
      <div style={{ paddingBottom: 6 }}>
        <div style={{ fontSize: 15, color: 'var(--muted)', lineHeight: 1.5, marginBottom: 18, textWrap: 'pretty' }}>
          {t.komprappLinkSheetBody}
        </div>

        {linked && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              padding: '14px 16px',
              borderRadius: radius.button,
              background: 'var(--soft)',
              marginBottom: 18,
            }}
          >
            <div style={{ fontSize: 14, color: 'var(--muted)' }}>
              {t.komprappLinkCurrentLabel}: <span style={{ ...tabular, color: 'var(--text)', fontWeight: 650 }}>{linked}</span>
            </div>
            <Button size="header" variant="secondary" onClick={() => void unlink()} disabled={busy || !amIAdmin}>
              {t.komprappLinkUnlink}
            </Button>
          </div>
        )}

        <TextField
          value={draft}
          onChange={setDraft}
          placeholder={t.komprappLinkPlaceholder}
          style={{ marginBottom: 14 }}
        />
        <Button full onClick={() => void save()} disabled={busy || !draft.trim() || !amIAdmin}>
          {t.komprappLinkSave}
        </Button>

        <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.4, marginTop: 18 }}>
          {amIAdmin ? t.komprappLinkNote : t.komprappLinkAdminOnly}
        </div>
      </div>
    </Sheet>
  );
}
