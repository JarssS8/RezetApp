import { useState } from 'react';
import { usePrefs } from '../store/prefs';
import { useAuth } from '../data/auth';
import { Eyebrow } from '../ui/Card';
import { Pressable } from '../ui/Pressable';
import { Sheet } from '../ui/Sheet';
import { Icon } from '../ui/Icon';
import { radius } from '../ui/tokens';

const rowStyle = {
  height: 48,
  borderRadius: radius.input,
  background: 'var(--surface2)',
  fontSize: 15.5,
  fontWeight: 600,
  textAlign: 'left' as const,
  padding: '0 16px',
};

/**
 * Un nivel por debajo de Ajustes (README §4.10) — todo lo que Ajustes
 * plano no debe cargar: passkey, cerrar sesión en todos los dispositivos
 * (la única forma de revocar un asistente IA conectado), conectar un asistente IA, gestión del
 * hogar (que a su vez abre `HouseholdSheet`), invitar, y "Eliminar cuenta"
 * al fondo bajo su propia zona de riesgo, separada del resto.
 */
export function AccountHouseholdSheet({
  onClose,
  onHousehold,
  onInvite,
  onConnectMcp,
  onKomprappLink,
  onDeleteAccount,
  onSignOutEverywhere,
  onToast,
}: {
  onClose: () => void;
  onHousehold: () => void;
  onInvite: () => void;
  onConnectMcp: () => void;
  onKomprappLink: () => void;
  onDeleteAccount: () => void;
  /** Pide confirmación (la abre `App.tsx`) y cierra todas las sesiones, asistentes IA incluidos. */
  onSignOutEverywhere: () => void;
  onToast?: (msg: string) => void;
}) {
  const { t } = usePrefs();
  const { registerPasskey, profile } = useAuth();
  const [passkeyBusy, setPasskeyBusy] = useState(false);

  const addPasskey = async () => {
    if (passkeyBusy) return;
    setPasskeyBusy(true);
    const result = await registerPasskey();
    setPasskeyBusy(false);
    onToast?.(result === 'ok' ? t.passkeyRegistered : t.passkeyRegisterError);
  };

  return (
    <Sheet title={t.accountHouseholdSheetTitle} onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20, paddingBottom: 6 }}>
        <div>
          <Eyebrow style={{ marginBottom: 9 }}>{t.accountHouseholdSecurity}</Eyebrow>
          <Pressable
            onClick={() => void addPasskey()}
            disabled={passkeyBusy}
            scale={0.98}
            style={{ ...rowStyle, opacity: passkeyBusy ? 0.6 : 1 }}
          >
            {t.registerPasskey}
          </Pressable>
          <Pressable
            onClick={onSignOutEverywhere}
            scale={0.98}
            style={{
              ...rowStyle,
              height: 'auto',
              minHeight: 48,
              padding: '9px 16px',
              marginTop: 8,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start',
              justifyContent: 'center',
              gap: 2,
            }}
          >
            <span>{t.signOutEverywhereRow}</span>
            <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--muted)' }}>{t.signOutEverywhereHint}</span>
          </Pressable>
        </div>

        <div>
          <Eyebrow style={{ marginBottom: 9 }}>{t.accountHouseholdConnect}</Eyebrow>
          <Pressable
            onClick={onConnectMcp}
            scale={0.98}
            style={{ ...rowStyle, display: 'flex', alignItems: 'center', gap: 10 }}
          >
            <Icon name="link" size={18} strokeWidth={1.8} />
            {t.connectAiRow}
          </Pressable>
          <Pressable
            onClick={onKomprappLink}
            scale={0.98}
            style={{ ...rowStyle, display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}
          >
            <Icon name="link" size={18} strokeWidth={1.8} />
            {t.komprappLinkRow}
          </Pressable>
        </div>

        <div>
          <Eyebrow style={{ marginBottom: 9 }}>{t.accountHouseholdHousehold}</Eyebrow>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Pressable
              onClick={onHousehold}
              scale={0.98}
              style={{ ...rowStyle, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Icon name="home" size={18} strokeWidth={1.8} />
                {t.householdRow}
              </span>
              <Icon name="chevronRight" size={16} strokeWidth={2.2} />
            </Pressable>
            {profile?.isAdmin && (
              <Pressable onClick={onInvite} scale={0.98} style={rowStyle}>
                {t.inviteSomeone}
              </Pressable>
            )}
          </div>
        </div>

        <div style={{ marginTop: 8 }}>
          <Eyebrow style={{ marginBottom: 9, color: 'var(--warn-ink)' }}>{t.dangerZoneLabel}</Eyebrow>
          <Pressable
            onClick={onDeleteAccount}
            scale={0.98}
            style={{ ...rowStyle, background: 'var(--warnsoft)', color: 'var(--warn-ink)' }}
          >
            {t.deleteAccountRow}
          </Pressable>
        </div>
      </div>
    </Sheet>
  );
}
