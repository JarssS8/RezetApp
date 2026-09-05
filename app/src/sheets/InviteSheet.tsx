import { useState } from 'react';
import { usePrefs } from '../store/prefs';
import { useAuth } from '../data/auth';
import { supabase } from '../data/supabaseClient';
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
  const [busy, setBusy] = useState(false);

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

  const copy = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      onToast(t.copiedCode);
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
            <Button size="header" onClick={copy}>
              {t.copyCode}
            </Button>
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
