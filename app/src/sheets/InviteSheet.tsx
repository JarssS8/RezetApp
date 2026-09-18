import { useCallback, useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { usePrefs } from '../store/prefs';
import { useAuth } from '../data/auth';
import { supabase } from '../data/supabaseClient';
import { inviteUrl } from '../data/pendingInvite';
import { REZET_NOT_ADMIN, stripHouseholdErrorTag } from '../data/householdErrors';
import { Sheet } from '../ui/Sheet';
import { Button } from '../ui/Button';
import { Pressable } from '../ui/Pressable';
import { Icon } from '../ui/Icon';
import { Eyebrow } from '../ui/Card';
import { radius, tabular } from '../ui/tokens';

interface PendingInvite {
  id: string;
  code: string;
  expiresAt: string;
}

/** Hoja nueva: genera un código de `household_invite` para el hogar actual. */
export function InviteSheet({
  onClose,
  onToast,
}: {
  onClose: () => void;
  onToast: (msg: string) => void;
}) {
  const { t, locale } = usePrefs();
  const { profile } = useAuth();
  const [code, setCode] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<PendingInvite[]>([]);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  // Diseño §3.2: quien administra este hogar ve las invitaciones pendientes
  // y puede anularlas. RLS ya acota `household_invite` al hogar propio
  // (`household_invite_select`), así que no hace falta filtrar por
  // `household_id` aquí — solo por "pendiente de verdad" (sin usar y sin
  // caducar), que PostgREST no sabe expresar como `expires_at > now()`
  // directo: se compara contra el instante de la petición.
  const loadPending = useCallback(async () => {
    const { data, error } = await supabase
      .from('household_invite')
      .select('id, code, expires_at')
      .is('used_at', null)
      .gt('expires_at', new Date().toISOString())
      .order('expires_at', { ascending: false });
    if (error) return;
    setPending(
      (data ?? []).map((row) => ({
        id: row.id as string,
        code: row.code as string,
        expiresAt: row.expires_at as string,
      })),
    );
  }, []);

  useEffect(() => {
    void loadPending();
  }, [loadPending]);

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
    // El código y la caducidad los fija el servidor (create_invite): antes se
    // insertaba en la tabla y el cliente podía elegir ambos. Desde esta
    // versión, además, solo un administrador puede llamarla.
    const { data, error } = await supabase.rpc('create_invite');
    setBusy(false);
    if (error) {
      onToast(
        error.message.startsWith(REZET_NOT_ADMIN) ? t.inviteNotAdminError : stripHouseholdErrorTag(error.message),
      );
      return;
    }
    if (data) {
      setCode(data as string);
      void loadPending();
    }
  };

  const revoke = async (id: string) => {
    if (revokingId) return;
    setRevokingId(id);
    const { error } = await supabase.rpc('revoke_invite', { p_id: id });
    setRevokingId(null);
    if (error) {
      onToast(
        error.message.startsWith(REZET_NOT_ADMIN) ? t.inviteNotAdminError : stripHouseholdErrorTag(error.message),
      );
      return;
    }
    onToast(t.inviteRevoked);
    void loadPending();
  };

  const copyText = async (value: string, message: string) => {
    try {
      await navigator.clipboard.writeText(value);
      onToast(message);
    } catch {
      /* portapapeles no disponible en este navegador */
    }
  };

  const fmtExpiry = (iso: string) =>
    new Date(iso).toLocaleDateString(locale === 'es' ? 'es-ES' : 'en-US', {
      day: 'numeric',
      month: 'short',
    });

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

        {pending.length > 0 && (
          <div style={{ marginTop: 24 }}>
            <Eyebrow style={{ marginBottom: 9 }}>{t.pendingInvitesTitle}</Eyebrow>
            <div>
              {pending.map((invite, i) => (
                <div key={invite.id}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', minHeight: 44 }}>
                    <div style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 650, ...tabular }}>
                      {invite.code}
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--muted)', flexShrink: 0 }}>
                      {t.inviteExpiresOn(fmtExpiry(invite.expiresAt))}
                    </div>
                    <Pressable
                      onClick={() => void revoke(invite.id)}
                      disabled={revokingId !== null}
                      scale={0.9}
                      ariaLabel={t.revokeInvite}
                      style={{
                        flexShrink: 0,
                        width: 34,
                        height: 34,
                        borderRadius: radius.pill,
                        background: 'var(--warnsoft)',
                        color: 'var(--warn-ink)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        opacity: revokingId !== null && revokingId !== invite.id ? 0.6 : 1,
                      }}
                    >
                      <Icon name="trash" size={16} strokeWidth={2} />
                    </Pressable>
                  </div>
                  {i < pending.length - 1 && (
                    <div style={{ height: 1, background: 'var(--line)' }} />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Sheet>
  );
}
