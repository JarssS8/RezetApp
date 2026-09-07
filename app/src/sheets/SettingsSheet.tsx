import { useEffect, useState } from 'react';
import { usePrefs, ACCENTS } from '../store/prefs';
import { useAuth } from '../data/auth';
import { subscribeToPush, unsubscribeFromPush, isPushSubscribed } from '../data/push';
import { OptionChip } from '../ui/Chip';
import { Eyebrow } from '../ui/Card';
import { Pressable } from '../ui/Pressable';
import { Sheet } from '../ui/Sheet';
import { Icon } from '../ui/Icon';
import { radius } from '../ui/tokens';
import type { Accent, Locale, Theme, UnitSystem } from '../types';

type SettingsTab = 'appearance' | 'account';

const rowStyle = {
  height: 48,
  borderRadius: radius.input,
  background: 'var(--surface2)',
  fontSize: 15.5,
  fontWeight: 600,
  textAlign: 'left' as const,
  padding: '0 16px',
};

export function SettingsSheet({
  onClose,
  onReplayTour,
  onSignOut,
  onInvite,
  onHousehold,
  onConnectMcp,
  onToast,
}: {
  onClose: () => void;
  onReplayTour: () => void;
  onSignOut: () => void;
  /** Solo en modo real, con hogar: ausente en el modo demo. */
  onInvite?: () => void;
  /** Solo en modo real: ausente en el modo demo (no hay hogar multi-usuario real que ver). */
  onHousehold?: () => void;
  /** Solo en modo real: el server MCP necesita una cuenta/hogar de verdad. */
  onConnectMcp?: () => void;
  onToast?: (msg: string) => void;
}) {
  const { t, theme, accent, locale, units, setTheme, setAccent, setLocale, setUnits } = usePrefs();
  const { profile, registerPasskey } = useAuth();
  const [tab, setTab] = useState<SettingsTab>('appearance');
  const [notifBusy, setNotifBusy] = useState(false);
  const [notifOn, setNotifOn] = useState(false);
  const [passkeyBusy, setPasskeyBusy] = useState(false);

  useEffect(() => {
    if (!profile) return;
    void isPushSubscribed().then(setNotifOn);
  }, [profile]);

  const toggleNotifications = async () => {
    if (!profile || notifBusy) return;
    setNotifBusy(true);
    if (notifOn) {
      const ok = await unsubscribeFromPush();
      setNotifBusy(false);
      if (ok) {
        setNotifOn(false);
        onToast?.(t.notificationsDisabled);
      } else {
        onToast?.(t.notificationsError);
      }
      return;
    }
    const result = await subscribeToPush(profile.id);
    setNotifBusy(false);
    const messages = {
      subscribed: t.notificationsEnabled,
      denied: t.notificationsDenied,
      unsupported: t.notificationsUnsupported,
      error: t.notificationsError,
    } as const;
    onToast?.(messages[result]);
    if (result === 'subscribed') setNotifOn(true);
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
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <OptionChip
          label={t.settingsTabAppearance}
          active={tab === 'appearance'}
          onClick={() => setTab('appearance')}
        />
        <OptionChip label={t.settingsTabAccount} active={tab === 'account'} onClick={() => setTab('account')} />
      </div>

      {tab === 'appearance' && (
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
        </div>
      )}

      {tab === 'account' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingBottom: 6 }}>
          {profile && (
            <Pressable
              onClick={() => void toggleNotifications()}
              disabled={notifBusy}
              scale={0.98}
              style={{ ...rowStyle, opacity: notifBusy ? 0.6 : 1 }}
            >
              {notifOn ? t.disableNotifications : t.enableNotifications}
            </Pressable>
          )}
          {profile && (
            <Pressable
              onClick={() => void addPasskey()}
              disabled={passkeyBusy}
              scale={0.98}
              style={{ ...rowStyle, opacity: passkeyBusy ? 0.6 : 1 }}
            >
              {t.registerPasskey}
            </Pressable>
          )}
          {onHousehold && (
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
          )}
          {onInvite && (
            <Pressable onClick={onInvite} scale={0.98} style={rowStyle}>
              {t.inviteSomeone}
            </Pressable>
          )}
          {onConnectMcp && (
            <Pressable
              onClick={onConnectMcp}
              scale={0.98}
              style={{ ...rowStyle, display: 'flex', alignItems: 'center', gap: 10 }}
            >
              <Icon name="link" size={18} strokeWidth={1.8} />
              {t.connectAiRow}
            </Pressable>
          )}
          <Pressable onClick={onReplayTour} scale={0.98} style={rowStyle}>
            {t.replayTour}
          </Pressable>
          <Pressable
            onClick={onSignOut}
            scale={0.98}
            style={{ ...rowStyle, background: 'var(--warnsoft)', color: 'var(--warn-ink)' }}
          >
            {t.signOut}
          </Pressable>
        </div>
      )}
    </Sheet>
  );
}
