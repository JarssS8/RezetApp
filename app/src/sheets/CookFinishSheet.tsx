import { useMemo, useState } from 'react';
import { usePrefs } from '../store/prefs';
import { useData } from '../data/store';
import { formatQuantity } from '../domain/units';
import { Button } from '../ui/Button';
import { Sheet } from '../ui/Sheet';
import { Stepper } from '../ui/Stepper';
import { Pressable } from '../ui/Pressable';
import { Avatar } from '../ui/Avatar';
import { height, radius, text as T } from '../ui/tokens';
import type { MemberId } from '../types';

/** "¿Cómo ha salido?" — cerrar esta hoja NO sale del modo cocinar. */
export function CookFinishSheet({
  recipeId,
  servings,
  onClose,
  onConfirm,
}: {
  recipeId: string;
  servings: number;
  onClose: () => void;
  onConfirm: (servings: number, shares: { memberId: MemberId; servings: number }[]) => void;
}) {
  const { t, locale, units } = usePrefs();
  const { recipeById, shortagesFor, members } = useData();
  const [made, setMade] = useState(servings);
  const recipe = recipeById.get(recipeId);

  /**
   * Solo miembros VIVOS del hogar: `finish_cook_v2` rechaza la llamada
   * entera (y con ella el descuento de despensa) si le llega un miembro
   * dado de baja o que no es de este hogar.
   */
  const aliveMembers = useMemo(
    () => members.filter((m) => m.deletedAt === null).sort((a, b) => a.sortOrder - b.sortOrder),
    [members],
  );

  /**
   * Por defecto TODOS cuentan una ración (ver `domain/intake.ts`: "cocinar
   * suma a todos sin escribir nada"). Desmarcar a alguien es la única
   * excepción que hace falta registrar, así que aquí solo se recuerda a
   * QUIÉN se ha desmarcado, no el estado de todos — un miembro que llega
   * tarde (hogar real, todavía cargando) nace marcado sin más código.
   */
  const [unmarked, setUnmarked] = useState<Set<MemberId>>(() => new Set());
  const toggleMember = (memberId: MemberId) =>
    setUnmarked((prev) => {
      const next = new Set(prev);
      if (next.has(memberId)) next.delete(memberId);
      else next.add(memberId);
      return next;
    });

  const markedCount = aliveMembers.length - unmarked.size;
  // No bloquea: el hogar decide (pudo haber sobras, o alguien comió menos).
  const sharesMismatch = aliveMembers.length > 0 && made !== markedCount;

  const shortages = useMemo(
    () => (recipe ? shortagesFor(recipe, made) : []),
    [recipe, made, shortagesFor],
  );

  if (!recipe) return null;

  const confirm = () => {
    // Solo se manda la excepción (0 raciones) de quien se ha desmarcado;
    // el resto queda implícito, igual que hace el resto de la app.
    const shares = aliveMembers
      .filter((m) => unmarked.has(m.id))
      .map((m) => ({ memberId: m.id, servings: 0 }));
    onConfirm(made, shares);
  };

  return (
    <Sheet title={t.howDidItGo} onClose={onClose}>
      <div style={{ paddingBottom: 6 }}>
        <div
          style={{
            fontSize: 15,
            color: 'var(--muted)',
            lineHeight: 1.5,
            marginBottom: 18,
            textWrap: 'pretty',
          }}
        >
          {t.finishIntro}
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 16px',
            borderRadius: radius.button,
            background: 'var(--surface2)',
            marginBottom: 12,
          }}
        >
          <div style={{ fontSize: 15.5, fontWeight: 600 }}>{t.servingsMade}</div>
          <Stepper
            value={made}
            label={t.servingsMade}
            onDecrement={() => setMade((s) => Math.max(1, s - 1))}
            onIncrement={() => setMade((s) => Math.min(24, s + 1))}
          />
        </div>

        {shortages.length > 0 && (
          <div
            style={{
              padding: '13px 15px',
              borderRadius: radius.input,
              background: 'var(--warnsoft)',
              color: 'var(--warn-ink)',
              fontSize: 13.5,
              lineHeight: 1.55,
              marginBottom: 12,
              textWrap: 'pretty',
            }}
          >
            {t.missingWarn}{' '}
            {shortages
              .map((s) => `${s.name} · ${formatQuantity(s.quantity, s.unit, units, locale)}`)
              .join(' · ')}
          </div>
        )}

        {aliveMembers.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ ...T.cardTitle, marginBottom: 8 }}>{t.countsFor}</div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {aliveMembers.map((m) => {
                const marked = !unmarked.has(m.id);
                return (
                  <Pressable
                    key={m.id}
                    onClick={() => toggleMember(m.id)}
                    ariaPressed={marked}
                    ariaLabel={marked ? `${t.countsFor} ${m.displayName}` : `${m.displayName} — ${t.didNotEat}`}
                    scale={0.99}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      minHeight: height.touch,
                      padding: '8px 10px',
                      borderRadius: radius.list,
                      background: marked ? 'var(--soft)' : 'transparent',
                      textAlign: 'left',
                    }}
                  >
                    <Avatar member={m} size={32} />
                    <div
                      style={{
                        flex: 1,
                        minWidth: 0,
                        fontSize: 15.5,
                        fontWeight: 600,
                        color: marked ? 'var(--accent-ink)' : 'var(--text)',
                      }}
                    >
                      {m.displayName}
                    </div>
                    {!marked && (
                      <div style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 600, flexShrink: 0 }}>
                        {t.didNotEat}
                      </div>
                    )}
                  </Pressable>
                );
              })}
            </div>

            {sharesMismatch && (
              <div
                style={{
                  marginTop: 8,
                  padding: '13px 15px',
                  borderRadius: radius.input,
                  background: 'var(--warnsoft)',
                  color: 'var(--warn-ink)',
                  fontSize: 13.5,
                  lineHeight: 1.55,
                  textWrap: 'pretty',
                }}
              >
                {t.sharesMismatch(made, markedCount)}
              </div>
            )}
          </div>
        )}

        <Button full size="primary" onClick={confirm} style={{ borderRadius: radius.button }}>
          {t.saveCook}
        </Button>
      </div>
    </Sheet>
  );
}
