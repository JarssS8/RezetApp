import { usePrefs } from '../store/prefs';
import { useData } from '../data/store';
import { addDays, mondayOf } from '../domain/dates';
import { dateKey } from '../domain/dates';
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
  onToast,
}: {
  target: PickerTarget;
  weekOffset: number;
  onClose: () => void;
  onToast: (message: string) => void;
}) {
  const { t, locale, loc } = usePrefs();
  const { recipes, addPlanEntry } = useData();

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
      </div>
    </Sheet>
  );
}
