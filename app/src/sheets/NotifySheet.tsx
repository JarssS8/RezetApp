import { useEffect, useState } from 'react';
import { usePrefs } from '../store/prefs';
import { useData } from '../data/storeContext';
import { Sheet } from '../ui/Sheet';
import { Switch } from '../ui/Switch';
import { Card, Eyebrow, ListCard } from '../ui/Card';
import { TextField } from '../ui/Fields';
import { height, text as T } from '../ui/tokens';
import type { NotifyPref } from '../types';

/**
 * Valores por defecto del diseño (§9, migración
 * `20260921100000_rezet_notify_pref.sql`): todo encendido salvo el
 * recordatorio de registrar, y sin horas de silencio. Ninguna de las dos
 * capas de datos los expone cuando no hay fila guardada todavía — las dos
 * devuelven `notifyPref: null` a propósito (ver `storeContext.ts`) — así
 * que es esta pantalla quien tiene que aplicarlos, y tiene que ser
 * EXACTAMENTE esta lista: si difiere de la que usa `store.tsx` (demo) o de
 * los `default` de la migración (real), el usuario ve un ajuste que la base
 * no tiene guardado.
 */
const DEFAULT_NOTIFY_PREF: NotifyPref = {
  timers: true,
  expiring: true,
  cookTurn: true,
  logReminder: false,
  logReminderAt: '21:00',
  quietFrom: null,
  quietTo: null,
};

/**
 * Postgres devuelve una columna `time` como `'HH:MM:SS'`; un
 * `<input type="time">` solo entiende `'HH:MM'`. Sin este recorte, una hora
 * guardada desde la demo (`'21:00'`) y la misma hora releída de la capa real
 * (`'21:00:00'`) se verían distintas en el campo, aunque sean el mismo
 * valor — la comparación de strings fallaría en silencio.
 */
function toTimeInputValue(value: string | null): string {
  return value ? value.slice(0, 5) : '';
}

/** Fila con interruptor: `<label>` completa, así el área táctil es toda la fila (≥44px), no solo el control. */
function SwitchRow({
  title,
  hint,
  checked,
  onChange,
  disabled,
}: {
  title: string;
  hint?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 13,
        minHeight: height.touch,
        padding: '14px 15px',
        borderBottom: '1px solid var(--line)',
        cursor: disabled ? 'default' : 'pointer',
      }}
    >
      <span style={{ flex: 1, minWidth: 0 }}>
        <div style={T.row}>{title}</div>
        {hint != null && (
          <div style={{ marginTop: 3, fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.4 }}>{hint}</div>
        )}
      </span>
      <Switch checked={checked} onChange={onChange} disabled={disabled} />
    </label>
  );
}

/**
 * Hoja "Avisos": qué te notifica la app y cuándo, por miembro (diseño §9).
 * Se entra desde Ajustes. Solo la preferencia propia — un tutelado sin
 * cuenta no tiene dónde recibir un aviso (nota al pie).
 */
export function NotifySheet({
  onClose,
  onToast,
}: {
  onClose: () => void;
  onToast?: (msg: string) => void;
}) {
  const { t } = usePrefs();
  const { myMemberId, notifyPref, setNotifyPref } = useData();

  // Estado local optimista, igual que `toggleNotifications` en
  // `SettingsSheet.tsx`: se actualiza al toque, se revierte si la escritura
  // falla. Se resincroniza cuando llega (o cambia) la fila de verdad —
  // `notifyPref` puede seguir cargando en el primer render de la capa real.
  const [pref, setPref] = useState<NotifyPref>(() => notifyPref ?? DEFAULT_NOTIFY_PREF);
  /**
   * Los campos con una escritura en vuelo, no "hay alguna escritura en
   * vuelo": con un solo indicador, tocar dos interruptores seguidos
   * descartaba el segundo en silencio, y la hoja entera se quedaba
   * bloqueada mientras iba la petición del primero.
   */
  const [busyFields, setBusyFields] = useState<ReadonlySet<keyof NotifyPref>>(new Set());
  const isBusy = (field: keyof NotifyPref) => busyFields.has(field);

  useEffect(() => {
    setPref(notifyPref ?? DEFAULT_NOTIFY_PREF);
  }, [notifyPref]);

  const commit = <K extends keyof NotifyPref>(field: K, value: NotifyPref[K]) => {
    // Solo se ignora un segundo toque sobre EL MISMO campo: dos escrituras
    // de la misma columna pueden llegar desordenadas y dejar el interruptor
    // diciendo lo contrario de lo guardado. Campos distintos son columnas
    // distintas y no se pisan.
    if (!myMemberId || isBusy(field)) return;
    const prev = pref[field];
    setPref((p) => ({ ...p, [field]: value }));
    setBusyFields((b) => new Set(b).add(field));
    void setNotifyPref(myMemberId, { [field]: value })
      .catch(() => {
        // Se revierte SOLO este campo: `prev` era antes la hoja entera, así
        // que un fallo aquí tiraba por tierra lo que se hubiera cambiado en
        // otro interruptor mientras tanto.
        setPref((p) => ({ ...p, [field]: prev }));
        onToast?.(t.memberActionError);
      })
      .finally(() =>
        setBusyFields((b) => {
          const next = new Set(b);
          next.delete(field);
          return next;
        }),
      );
  };

  return (
    <Sheet title={t.notifyTitle} onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20, paddingBottom: 6 }}>
        <ListCard>
          <SwitchRow
            title={t.notifyTimers}
            hint={t.notifyTimersNever}
            checked={pref.timers}
            onChange={(v) => commit('timers', v)}
            disabled={isBusy('timers')}
          />
          <SwitchRow
            title={t.notifyExpiring}
            hint={t.notifyExpiringHint}
            checked={pref.expiring}
            onChange={(v) => commit('expiring', v)}
            disabled={isBusy('expiring')}
          />
          <SwitchRow
            title={t.notifyCookTurn}
            hint={t.notifyCookTurnHint}
            checked={pref.cookTurn}
            onChange={(v) => commit('cookTurn', v)}
            disabled={isBusy('cookTurn')}
          />
          <SwitchRow
            title={t.notifyLogReminder}
            hint={t.notifyLogReminderHint}
            checked={pref.logReminder}
            onChange={(v) => commit('logReminder', v)}
            disabled={isBusy('logReminder')}
          />
        </ListCard>

        <Card style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <Eyebrow style={{ marginBottom: 9 }}>{t.notifyQuiet}</Eyebrow>
            <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.45, textWrap: 'pretty' }}>
              {t.notifyQuietHint}
            </div>
          </div>
          {/*
           * `wrap` + una base de 140px: un `<input type="time">` tiene ancho
           * mínimo propio (las cifras más el icono del reloj), así que en una
           * pantalla estrecha dos columnas fijas se desbordaban de la tarjeta
           * o recortaban el reloj. Cuando no caben al lado, se apilan.
           */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            <label style={{ flex: '1 1 140px', minWidth: 0, display: 'block' }}>
              <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 6 }}>{t.notifyQuietFrom}</div>
              <TextField
                type="time"
                value={toTimeInputValue(pref.quietFrom)}
                onChange={(v) => commit('quietFrom', v === '' ? null : v)}
                style={{ opacity: isBusy('quietFrom') ? 0.6 : 1 }}
              />
            </label>
            <label style={{ flex: '1 1 140px', minWidth: 0, display: 'block' }}>
              <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 6 }}>{t.notifyQuietTo}</div>
              <TextField
                type="time"
                value={toTimeInputValue(pref.quietTo)}
                onChange={(v) => commit('quietTo', v === '' ? null : v)}
                style={{ opacity: isBusy('quietTo') ? 0.6 : 1 }}
              />
            </label>
          </div>
        </Card>

        <div style={{ textAlign: 'center', fontSize: 13, color: 'var(--muted)', lineHeight: 1.45 }}>
          {t.notifyWardsNote}
        </div>
      </div>
    </Sheet>
  );
}
