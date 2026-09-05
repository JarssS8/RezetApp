import { useState } from 'react';
import { usePrefs, ACCENTS } from '../store/prefs';
import { useAuth } from '../data/auth';
import { subscribeToPush } from '../data/push';
import { OptionChip } from '../ui/Chip';
import { Eyebrow } from '../ui/Card';
import { Pressable } from '../ui/Pressable';
import { Sheet } from '../ui/Sheet';
import { radius } from '../ui/tokens';
import type { Accent, Locale, Theme, UnitSystem } from '../types';

export function SettingsSheet({
  onClose,
  onReplayTour,
  onSignOut,
  onInvite,
  onToast,
}: {
  onClose: () => void;
  onReplayTour: () => void;
  onSignOut: () => void;
  /** Solo en modo real, con hogar: ausente en el modo demo. */
  onInvite?: () => void;
  onToast?: (msg: string) => void;
}) {
  const { t, theme, accent, locale, units, setTheme, setAccent, setLocale, setUnits } = usePrefs();
  const { profile, registerPasskey } = useAuth();
  const [notifBusy, setNotifBusy] = useState(false);
  const [passkeyBusy, setPasskeyBusy] = useState(false);

  const enableNotifications = async () => {
    if (!profile || notifBusy) return;
    setNotifBusy(true);
    const result = await subscribeToPush(profile.id);
    setNotifBusy(false);
    const messages = {
      subscribed: t.notificationsEnabled,
      denied: t.notificationsDenied,
      unsupported: t.notificationsUnsupported,
      error: t.notificationsError,
    } as const;
    onToast?.(messages[result]);
  };

  const addPasskey = async () => {
    if (passkeyBusy) return;
    setPasskeyBusy(true);
    const result = await registerPasskey();
    setPasskeyBusy(false);
    onToast?.(result === 'ok' ? t.passkeyRegistered : t.passkeyRegisterError);
  };

  const themes: Array<[Theme, string]> = [
    ['system', t.system],
    ['light', t.light],
    ['dark', t.dark],
  ];
  const locales: Array<[Locale, string]> = [
    ['es', 'Español'],
    ['en', 'English'],
  ];
  const unitOptions: Array<[UnitSystem, string]> = [
    ['metric', t.metric],
    ['imperial', t.imperial],
  ];

  return (
    <Sheet title={t.settings} onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 22, paddingBottom: 6 }}>
        <div>
          <Eyebrow style={{ marginBottom: 9 }}>{t.appearance}</Eyebrow>
          <div style={{ display: 'flex', gap: 8 }}>
            {themes.map(([id, label]) => (
              <OptionChip key={id} label={label} active={theme === id} onClick={() => setTheme(id)} />
            ))}
          </div>
          <div style={{ display: 'flex', gap: 12, marginTop: 14, flexWrap: 'wrap' }}>
            {(Object.keys(ACCENTS) as Accent[]).map((key) => (
              <Pressable
                key={key}
                onClick={() => setAccent(key)}
                ariaLabel={key}
                scale={0.9}
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: radius.pill,
                  background: ACCENTS[key],
                  border: `2px solid ${accent === key ? 'var(--text)' : 'transparent'}`,
                }}
              />
            ))}
          </div>
        </div>

        <div>
          <Eyebrow style={{ marginBottom: 9 }}>{t.language}</Eyebrow>
          <div style={{ display: 'flex', gap: 8 }}>
            {locales.map(([id, label]) => (
              <OptionChip key={id} label={label} active={locale === id} onClick={() => setLocale(id)} />
            ))}
          </div>
        </div>

        <div>
          <Eyebrow style={{ marginBottom: 9 }}>{t.units}</Eyebrow>
          <div style={{ display: 'flex', gap: 8 }}>
            {unitOptions.map(([id, label]) => (
              <OptionChip key={id} label={label} active={units === id} onClick={() => setUnits(id)} />
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {profile && (
            <Pressable
              onClick={() => void addPasskey()}
              disabled={passkeyBusy}
              scale={0.98}
              style={{
                height: 48,
                borderRadius: radius.input,
                background: 'var(--surface2)',
                fontSize: 15.5,
                fontWeight: 600,
                textAlign: 'left',
                padding: '0 16px',
                opacity: passkeyBusy ? 0.6 : 1,
              }}
            >
              {t.registerPasskey}
            </Pressable>
          )}
          {profile && (
            <Pressable
              onClick={() => void enableNotifications()}
              disabled={notifBusy}
              scale={0.98}
              style={{
                height: 48,
                borderRadius: radius.input,
                background: 'var(--surface2)',
                fontSize: 15.5,
                fontWeight: 600,
                textAlign: 'left',
                padding: '0 16px',
                opacity: notifBusy ? 0.6 : 1,
              }}
            >
              {t.enableNotifications}
            </Pressable>
          )}
          {onInvite && (
            <Pressable
              onClick={onInvite}
              scale={0.98}
              style={{
                height: 48,
                borderRadius: radius.input,
                background: 'var(--surface2)',
                fontSize: 15.5,
                fontWeight: 600,
                textAlign: 'left',
                padding: '0 16px',
              }}
            >
              {t.inviteSomeone}
            </Pressable>
          )}
          <Pressable
            onClick={onReplayTour}
            scale={0.98}
            style={{
              height: 48,
              borderRadius: radius.input,
              background: 'var(--surface2)',
              fontSize: 15.5,
              fontWeight: 600,
              textAlign: 'left',
              padding: '0 16px',
            }}
          >
            {t.replayTour}
          </Pressable>
          <Pressable
            onClick={onSignOut}
            scale={0.98}
            style={{
              height: 48,
              borderRadius: radius.input,
              background: 'var(--warnsoft)',
              color: 'var(--warn-ink)',
              fontSize: 15.5,
              fontWeight: 600,
              textAlign: 'left',
              padding: '0 16px',
            }}
          >
            {t.signOut}
          </Pressable>
        </div>
      </div>
    </Sheet>
  );
}
