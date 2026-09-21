import { useEffect, useState } from 'react';
import { usePrefs, ACCENTS } from '../store/prefs';
import { useAuth } from '../data/auth';
import { subscribeToPush, unsubscribeFromPush, isPushSubscribed } from '../data/push';
import { OptionChip } from '../ui/Chip';
import { Eyebrow } from '../ui/Card';
import { Pressable } from '../ui/Pressable';
import { Sheet } from '../ui/Sheet';
import { Icon } from '../ui/Icon';
import { radius, tabular } from '../ui/tokens';
import type { Accent, Locale, Theme, UnitSystem } from '../types';

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
 * Una sola lista, sin pestañas — README §4.10 marca explícitamente las
 * pestañas de hogar/miembros/IA apiladas como el antipatrón a evitar aquí:
 * "van en una vista propia de Ajustes avanzados, un nivel más abajo, no en
 * la primera pantalla." Esa vista es `AccountHouseholdSheet` en modo real;
 * en demo (sin cuenta real que gestionar) la misma fila salta directa a
 * `HouseholdSheet` ("Tu hogar" — ver miembros, editarlos, tutelados), así
 * que `accountHouseholdLabel` deja que `App.tsx` rotule la fila con lo que
 * de verdad abre en cada modo.
 */
export function SettingsSheet({
  onClose,
  onReplayTour,
  onSignOut,
  onNotify,
  onAccountHousehold,
  accountHouseholdLabel,
  onToast,
}: {
  onClose: () => void;
  onReplayTour: () => void;
  onSignOut: () => void;
  /** Abre `NotifySheet`. Igual en los dos modos: la preferencia propia existe en las dos capas de datos. */
  onNotify: () => void;
  /** Presente en los dos modos: abre `AccountHouseholdSheet` en real, `HouseholdSheet` en demo. */
  onAccountHousehold?: () => void;
  /** Rótulo de la fila; por defecto `t.accountHouseholdRow` ("Cuenta y hogar"). */
  accountHouseholdLabel?: string;
  onToast?: (msg: string) => void;
}) {
  const { t, theme, accent, locale, units, showIdeas, setTheme, setAccent, setLocale, setUnits, setShowIdeas } =
    usePrefs();
  const { profile } = useAuth();
  const [notifBusy, setNotifBusy] = useState(false);
  const [notifOn, setNotifOn] = useState(false);

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

        <div>
          <Eyebrow style={{ marginBottom: 9 }}>{t.ideasRecipes}</Eyebrow>
          <div style={{ display: 'flex', gap: 8 }}>
            <OptionChip label={t.show} active={showIdeas} onClick={() => setShowIdeas(true)} />
            <OptionChip label={t.hide} active={!showIdeas} onClick={() => setShowIdeas(false)} />
          </div>
          <div style={{ marginTop: 8, fontSize: 13, color: 'var(--muted)', lineHeight: 1.45 }}>
            {t.ideasRecipesHelp}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
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
          <Pressable
            onClick={onNotify}
            scale={0.98}
            style={{ ...rowStyle, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Icon name="clock" size={18} strokeWidth={1.8} />
              {t.notifyTitle}
            </span>
            <Icon name="chevronRight" size={16} strokeWidth={2.2} />
          </Pressable>
          {onAccountHousehold && (
            <Pressable
              onClick={onAccountHousehold}
              scale={0.98}
              style={{ ...rowStyle, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Icon name="account" size={18} strokeWidth={1.8} />
                {accountHouseholdLabel ?? t.accountHouseholdRow}
              </span>
              <Icon name="chevronRight" size={16} strokeWidth={2.2} />
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

        <div style={{ textAlign: 'center', fontSize: 13, color: 'var(--muted)' }}>
          {profile ? t.settingsSynced : t.settingsLocalOnly}
        </div>

        <div style={{ textAlign: 'center', fontSize: 13.5, color: 'var(--muted)', ...tabular }}>
          {t.appVersion} {__APP_VERSION__} · {__APP_COMMIT__}
        </div>
      </div>
    </Sheet>
  );
}
