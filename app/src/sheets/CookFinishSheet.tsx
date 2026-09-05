import { useMemo, useState } from 'react';
import { usePrefs } from '../store/prefs';
import { useData } from '../data/store';
import { formatQuantity } from '../domain/units';
import { Button } from '../ui/Button';
import { Sheet } from '../ui/Sheet';
import { Stepper } from '../ui/Stepper';
import { radius } from '../ui/tokens';

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
  onConfirm: (servings: number) => void;
}) {
  const { t, locale, units } = usePrefs();
  const { recipeById, shortagesFor } = useData();
  const [made, setMade] = useState(servings);
  const recipe = recipeById.get(recipeId);

  const shortages = useMemo(
    () => (recipe ? shortagesFor(recipe, made) : []),
    [recipe, made, shortagesFor],
  );

  if (!recipe) return null;

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

        <Button full size="primary" onClick={() => onConfirm(made)} style={{ borderRadius: radius.button }}>
          {t.saveCook}
        </Button>
      </div>
    </Sheet>
  );
}
