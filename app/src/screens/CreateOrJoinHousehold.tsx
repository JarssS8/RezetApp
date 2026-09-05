import { useState } from 'react';
import { usePrefs } from '../store/prefs';
import { useAuth } from '../data/auth';
import { Button } from '../ui/Button';
import { TextField } from '../ui/Fields';
import { OptionChip } from '../ui/Chip';
import { radius } from '../ui/tokens';

/**
 * Pantalla nueva, fuera del README original: el registro abierto (crear tu
 * propio hogar o unirte con un código) sustituye al "solo por invitación"
 * del diseño inicial — ver PLAN.md §1 y §7 para el porqué.
 */
export function CreateOrJoinHousehold() {
  const { t } = usePrefs();
  const { createHousehold, redeemInvite, error, clearError } = useAuth();
  const [mode, setMode] = useState<'create' | 'join'>('create');
  const [name, setName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const canSubmit =
    displayName.trim().length > 0 &&
    (mode === 'create' ? name.trim().length > 0 : code.trim().length > 0);

  const submit = async () => {
    if (!canSubmit || busy) return;
    setBusy(true);
    clearError();
    try {
      if (mode === 'create') await createHousehold(name.trim(), displayName.trim());
      else await redeemInvite(code.trim(), displayName.trim());
    } catch {
      // el mensaje ya queda expuesto en `error` desde AuthProvider
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      data-screen-label="Crear o unirse a un hogar"
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        padding: 24,
        background: 'radial-gradient(120% 90% at 50% -10%, var(--soft) 0%, var(--bg) 62%)',
      }}
    >
      <div style={{ width: '100%', maxWidth: 400, animation: 'rise .4s cubic-bezier(.2,.7,.2,1) both' }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontSize: 27, fontWeight: 700, letterSpacing: '-.025em' }}>{t.createOrJoinTitle}</div>
          <div style={{ marginTop: 8, fontSize: 15, color: 'var(--muted)', lineHeight: 1.5, textWrap: 'pretty' }}>
            {t.createOrJoinBody}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <OptionChip
            label={t.createHousehold}
            active={mode === 'create'}
            onClick={() => {
              setMode('create');
              clearError();
            }}
          />
          <OptionChip
            label={t.joinWithCode}
            active={mode === 'join'}
            onClick={() => {
              setMode('join');
              clearError();
            }}
          />
        </div>

        <div
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--line)',
            borderRadius: 24,
            padding: 22,
            boxShadow: 'var(--shadow-m)',
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
          }}
        >
          <label style={{ display: 'block' }}>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 6 }}>{t.yourName}</div>
            <TextField value={displayName} onChange={setDisplayName} placeholder={t.yourNamePlaceholder} />
          </label>

          {mode === 'create' ? (
            <label style={{ display: 'block' }}>
              <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 6 }}>{t.householdName}</div>
              <TextField value={name} onChange={setName} placeholder={t.householdNamePlaceholder} />
            </label>
          ) : (
            <label style={{ display: 'block' }}>
              <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 6 }}>{t.inviteCode}</div>
              <TextField
                value={code}
                onChange={(v) => setCode(v.toUpperCase())}
                placeholder={t.inviteCodePlaceholder}
              />
            </label>
          )}

          {error && (
            <div
              style={{
                fontSize: 13.5,
                color: 'var(--warn-ink)',
                background: 'var(--warnsoft)',
                borderRadius: radius.chip,
                padding: '10px 12px',
              }}
            >
              {error}
            </div>
          )}

          <Button onClick={submit} full disabled={!canSubmit || busy}>
            {mode === 'create' ? t.create : t.join}
          </Button>
        </div>
      </div>
    </div>
  );
}
