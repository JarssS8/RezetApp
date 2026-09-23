import { useEffect, useMemo, useState } from 'react';
import { usePrefs } from '../store/prefs';
import { useData } from '../data/store';
import { dateKey, mondayOf, weekRange } from '../domain/dates';
import { Sheet } from '../ui/Sheet';
import { Row } from '../ui/Card';
import { Avatar } from '../ui/Avatar';
import { Icon } from '../ui/Icon';
import { radius, text as T } from '../ui/tokens';
import type { MemberId } from '../types';

/**
 * Hoja de turnos (§10, opcional): hoy solo asigna quién hace la compra de
 * la semana que se esté viendo en Plan (`weekOffset`) — a quién le toca
 * cocinar cada comida se asigna directamente sobre la tarjeta de esa comida
 * en `Plan.tsx`, no aquí.
 *
 * Igual que el resto de este subsistema, esta hoja no existe mientras los
 * turnos estén apagados: quien la abre (`Plan.tsx`) ya gatea el botón que
 * la abre con `household.turnsEnabled`, y aquí se repite la comprobación
 * por si el interruptor se apaga desde OTRO dispositivo mientras esta hoja
 * sigue abierta — en ese caso se cierra sola en vez de quedarse enseñando
 * una función que ya no está encendida.
 */
export function TurnsSheet({
  weekOffset,
  onClose,
  onToast,
}: {
  weekOffset: number;
  onClose: () => void;
  onToast?: (msg: string) => void;
}) {
  const { t, locale } = usePrefs();
  const { household, members, shoppingTurns, setShoppingTurn } = useData();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (household && !household.turnsEnabled) onClose();
  }, [household, onClose]);

  const weekStart = useMemo(() => dateKey(mondayOf(weekOffset)), [weekOffset]);

  // Índice construido aquí, nunca guardado como `Map` en el contrato:
  // `shoppingTurns` es el array plano que expone `Store` (ver su comentario
  // en `storeContext.ts`), y este `useMemo` es justo el sitio donde quien lo
  // consume arma su propio índice.
  const assignedMemberId = useMemo(
    () => shoppingTurns.find((s) => s.weekStart === weekStart)?.memberId ?? null,
    [shoppingTurns, weekStart],
  );

  const activeMembers = useMemo(
    () => [...members].filter((m) => m.deletedAt === null).sort((a, b) => a.sortOrder - b.sortOrder),
    [members],
  );

  const assign = async (memberId: MemberId | null) => {
    if (busy) return;
    setBusy(true);
    try {
      await setShoppingTurn(weekStart, memberId);
    } catch {
      onToast?.(t.memberActionError);
    } finally {
      setBusy(false);
    }
  };

  if (!household || !household.turnsEnabled) {
    return (
      <Sheet title={t.turnsTitle} onClose={onClose}>
        <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--muted)' }}>…</div>
      </Sheet>
    );
  }

  return (
    <Sheet title={t.turnsTitle} onClose={onClose}>
      <div style={{ paddingBottom: 6 }}>
        <div style={T.detailTitle}>{t.turnsWeekShopping}</div>
        <div style={{ marginTop: 2, fontSize: 14.5, color: 'var(--muted)' }}>{weekRange(weekOffset, locale)}</div>

        <div
          style={{
            marginTop: 18,
            background: 'var(--surface)',
            border: '1px solid var(--line)',
            borderRadius: radius.list,
            overflow: 'hidden',
            boxShadow: 'var(--shadow-s)',
          }}
        >
          {activeMembers.map((m) => {
            const active = assignedMemberId === m.id;
            return (
              <Row key={m.id} onClick={() => void assign(m.id)} style={{ opacity: busy ? 0.7 : 1 }}>
                <Avatar member={m} size={32} />
                {/* El avatar nunca lleva solo la información: siempre va con el nombre en texto. */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={T.row}>{m.displayName}</div>
                </div>
                {active && <Icon name="check" size={18} strokeWidth={2.4} />}
              </Row>
            );
          })}
          <Row onClick={() => void assign(null)} style={{ opacity: busy ? 0.7 : 1, borderBottom: 'none' }}>
            <div
              aria-hidden
              style={{
                width: 32,
                height: 32,
                flex: '0 0 32px',
                borderRadius: '50%',
                border: '1px dashed var(--line)',
                display: 'grid',
                placeItems: 'center',
                color: 'var(--muted)',
              }}
            >
              <Icon name="close" size={13} strokeWidth={2.2} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={T.row}>{t.turnsNobody}</div>
            </div>
            {assignedMemberId === null && <Icon name="check" size={18} strokeWidth={2.4} />}
          </Row>
        </div>
      </div>
    </Sheet>
  );
}
