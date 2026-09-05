import { useMemo } from 'react';
import { usePrefs } from '../store/prefs';
import { useData } from '../data/store';
import { SHOPPING_GROUP_ORDER } from '../domain/shopping';
import { formatQuantity } from '../domain/units';
import { Button } from '../ui/Button';
import { CheckRow } from '../ui/CheckRow';
import { Sheet } from '../ui/Sheet';
import { radius } from '../ui/tokens';
import type { FoodGroup } from '../types';

export function ShoppingSheet({
  weekOffset,
  onClose,
  onToast,
}: {
  weekOffset: number;
  onClose: () => void;
  onToast: (message: string) => void;
}) {
  const { t, locale, units } = usePrefs();
  const { needsForWeek, shoppingChecked, toggleShoppingCheck, buyChecked } = useData();
  const needs = useMemo(() => needsForWeek(weekOffset), [needsForWeek, weekOffset]);

  const labels: Record<FoodGroup, string> = { fresco: t.fresh, seco: t.dry, conserva: t.tinned };
  const groups = SHOPPING_GROUP_ORDER.map((group) => ({
    group,
    items: needs.filter((n) => n.group === group),
  })).filter((g) => g.items.length > 0);

  const anyChecked = needs.some((n) => shoppingChecked[n.key]);

  return (
    <Sheet title={t.shoppingList} onClose={onClose}>
      <div style={{ paddingBottom: 6 }}>
        {needs.length > 0 ? (
          <>
            <div
              style={{
                fontSize: 14,
                color: 'var(--muted)',
                lineHeight: 1.5,
                marginBottom: 16,
                textWrap: 'pretty',
              }}
            >
              {t.shopIntro}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              {groups.map(({ group, items }) => (
                <div key={group}>
                  <div
                    style={{
                      fontSize: 12.5,
                      fontWeight: 650,
                      letterSpacing: '.05em',
                      textTransform: 'uppercase',
                      color: 'var(--muted)',
                      margin: '0 2px 8px',
                    }}
                  >
                    {labels[group]}
                  </div>
                  <div style={{ background: 'var(--surface2)', borderRadius: radius.button, overflow: 'hidden' }}>
                    {items.map((need) => (
                      <CheckRow
                        key={need.key}
                        size={21}
                        checked={!!shoppingChecked[need.key]}
                        onToggle={() => toggleShoppingCheck(need.key)}
                        label={need.name}
                        trailing={
                          <div
                            style={{
                              fontSize: 14.5,
                              fontWeight: 600,
                              color: 'var(--muted)',
                              fontVariantNumeric: 'tabular-nums',
                            }}
                          >
                            {formatQuantity(need.quantity, need.unit, units, locale)}
                          </div>
                        }
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 18 }}>
              <Button
                full
                size="primary"
                disabled={!anyChecked}
                onClick={() => {
                  buyChecked(needs);
                  onClose();
                  onToast(t.boughtOk);
                }}
                style={{ borderRadius: radius.button }}
              >
                {t.moveToPantry}
              </Button>
            </div>
          </>
        ) : (
          <div style={{ padding: '36px 10px', textAlign: 'center' }}>
            <div style={{ fontSize: 17, fontWeight: 650, letterSpacing: '-.02em' }}>{t.shopEmpty}</div>
            <div style={{ marginTop: 8, fontSize: 14, color: 'var(--muted)', textWrap: 'pretty' }}>
              {t.shopEmptyBody}
            </div>
          </div>
        )}
      </div>
    </Sheet>
  );
}
