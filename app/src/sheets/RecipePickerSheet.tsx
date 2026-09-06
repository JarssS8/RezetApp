import { usePrefs } from '../store/prefs';
import { useData } from '../data/store';
import { addDays, mondayOf } from '../domain/dates';
import { dateKey } from '../domain/dates';
import { Button } from '../ui/Button';
import { Icon } from '../ui/Icon';
import { Pressable } from '../ui/Pressable';
import { Sheet } from '../ui/Sheet';
import { radius, tabular } from '../ui/tokens';
import type { MealSlot } from '../types';

export type PickerTarget =
  | { kind: 'slot'; date: string; slot: MealSlot }
  | { kind: 'recipe'; recipeId: string };

/**
 * Doble uso: elegir receta para un hueco, o elegir hueco para una receta.
 * Es la misma decisión vista desde los dos lados.
 */
export function RecipePickerSheet({
  target,
  weekOffset,
  onClose,
  onNewRecipe,
  onToast,
}: {
  target: PickerTarget;
  weekOffset: number;
  onClose: () => void;
  onNewRecipe: () => void;
  onToast: (message: string) => void;
}) {
  const { t, locale, loc } = usePrefs();
  const { recipes, addPlanEntry } = useData();
  const noRecipes = target.kind === 'slot' && recipes.length === 0;

  const rows =
    target.kind === 'slot'
      ? recipes.map((r) => ({
          key: r.id,
          name: loc(r.name),
          meta: `${r.minutes} min · ${r.kcalPerServing} ${t.kcal} · ${r.baseServings}×`,
          onTap: () => {
            addPlanEntry(r.id, target.date, target.slot);
            onClose();
            onToast(t.added);
          },
        }))
      : Array.from({ length: 7 }).flatMap((_, i) => {
          const day = addDays(mondayOf(weekOffset), i);
          const key = dateKey(day);
          return (['lunch', 'dinner'] as MealSlot[]).map((slot) => ({
            key: `${key}-${slot}`,
            name: day.toLocaleDateString(locale === 'es' ? 'es-ES' : 'en-US', {
              weekday: 'long',
              day: 'numeric',
            }),
            meta: t[slot],
            onTap: () => {
              addPlanEntry(target.recipeId, key, slot);
              onClose();
              onToast(t.added);
            },
          }));
        });

  return (
    <Sheet title={t.pickRecipe} onClose={onClose}>
      <div style={{ paddingBottom: 6 }}>
        {noRecipes ? (
          <div style={{ padding: '26px 10px', textAlign: 'center' }}>
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: radius.pill,
                background: 'var(--soft)',
                display: 'grid',
                placeItems: 'center',
                margin: '0 auto 14px',
                color: 'var(--accent-ink)',
              }}
            >
              <Icon name="book" size={24} strokeWidth={1.9} />
            </div>
            <div style={{ fontSize: 17, fontWeight: 650, letterSpacing: '-.02em' }}>{t.noRecipesYet}</div>
            <div
              style={{
                marginTop: 8,
                fontSize: 14,
                color: 'var(--muted)',
                maxWidth: 260,
                margin: '8px auto 0',
                lineHeight: 1.45,
              }}
            >
              {t.pickerNoRecipesBody}
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: 16 }}>
              <Button size="header" onClick={onNewRecipe} icon={<Icon name="plus" size={16} strokeWidth={2.4} />}>
                {t.newRecipe}
              </Button>
            </div>
          </div>
        ) : (
          <>
        <div style={{ fontSize: 14, color: 'var(--muted)', marginBottom: 14 }}>
          {target.kind === 'slot' ? t.pickForSlot : t.pickSlot}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {rows.map((row) => (
            <Pressable
              key={row.key}
              onClick={row.onTap}
              scale={0.985}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: 14,
                borderRadius: radius.slot,
                background: 'var(--surface2)',
                textAlign: 'left',
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15.5, fontWeight: 600, letterSpacing: '-.015em' }}>{row.name}</div>
                <div style={{ marginTop: 3, fontSize: 13, color: 'var(--muted)', ...tabular }}>{row.meta}</div>
              </div>
              <span style={{ color: 'var(--muted)', display: 'grid' }}>
                <Icon name="chevronRight" size={16} strokeWidth={2.2} />
              </span>
            </Pressable>
          ))}
        </div>
          </>
        )}
      </div>
    </Sheet>
  );
}
