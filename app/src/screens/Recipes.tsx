import { useMemo, useState } from 'react';
import { usePrefs } from '../store/prefs';
import { useData } from '../data/store';
import { Button } from '../ui/Button';
import { Chip } from '../ui/Chip';
import { Icon } from '../ui/Icon';
import { Pressable } from '../ui/Pressable';
import { ScreenBody, ScreenHeader, SearchField } from '../ui/Fields';
import { maxW, radius, tabular, text as T } from '../ui/tokens';

export function Recipes({
  onOpenRecipe,
  onNewRecipe,
}: {
  onOpenRecipe: (recipeId: string, servings: number) => void;
  onNewRecipe: () => void;
}) {
  const { t, loc } = usePrefs();
  const { recipes, ingredientById, coverageOf, knownTags } = useData();

  const [query, setQuery] = useState('');
  const [tag, setTag] = useState<string | null>(null);
  const [haveOnly, setHaveOnly] = useState(false);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return recipes.filter((r) => {
      if (q) {
        const inName = loc(r.name).toLowerCase().includes(q);
        const inIngredients = r.ingredients.some((ri) =>
          (ingredientById.get(ri.ingredientId)?.name.es ?? '').toLowerCase().includes(q) ||
          (ingredientById.get(ri.ingredientId)?.name.en ?? '').toLowerCase().includes(q),
        );
        if (!inName && !inIngredients) return false;
      }
      if (tag && !r.tags.includes(tag)) return false;
      if (haveOnly && !coverageOf(r, r.baseServings).full) return false;
      return true;
    });
  }, [recipes, query, tag, haveOnly, loc, ingredientById, coverageOf]);

  const reset = () => {
    setQuery('');
    setTag(null);
    setHaveOnly(false);
  };

  return (
    <ScreenBody maxWidth={maxW.recipes} label="Recetas">
      <ScreenHeader
        title={t.recipes}
        trailing={
          <Button size="header" onClick={onNewRecipe} icon={<Icon name="plus" size={16} strokeWidth={2.4} />}>
            {t.newRecipe}
          </Button>
        }
      />

      <SearchField value={query} onChange={setQuery} placeholder={t.searchRecipes} />

      <div
        style={{
          display: 'flex',
          gap: 8,
          overflowX: 'auto',
          padding: '14px 0 4px',
          scrollbarWidth: 'none',
        }}
      >
        <Chip label={t.allTags} active={!tag && !haveOnly} onClick={reset} />
        <Chip label={t.haveIngredients} active={haveOnly} onClick={() => setHaveOnly((v) => !v)} />
        {knownTags.map((tg) => (
          <Chip
            key={tg}
            label={tg}
            active={tag === tg}
            onClick={() => setTag((current) => (current === tg ? null : tg))}
          />
        ))}
      </div>

      <div style={{ margin: '8px 0 18px', fontSize: 13.5, color: 'var(--muted)' }}>
        {visible.length} {t.results}
      </div>

      {visible.length > 0 ? (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
            gap: 14,
          }}
        >
          {visible.map((r) => {
            const cov = coverageOf(r, r.baseServings);
            return (
              <Pressable
                key={r.id}
                onClick={() => onOpenRecipe(r.id, r.baseServings)}
                scale={0.985}
                style={{
                  textAlign: 'left',
                  background: 'var(--surface)',
                  border: '1px solid var(--line)',
                  borderRadius: radius.card,
                  overflow: 'hidden',
                  boxShadow: 'var(--shadow-s)',
                  display: 'block',
                }}
              >
                <div
                  style={{
                    position: 'relative',
                    height: 104,
                    background: r.photoUrl ? undefined : 'var(--soft)',
                  }}
                >
                  {r.photoUrl ? (
                    <img
                      src={r.photoUrl}
                      alt=""
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  ) : (
                    <div
                      style={{
                        position: 'absolute',
                        inset: 0,
                        display: 'flex',
                        alignItems: 'flex-end',
                        padding: 12,
                      }}
                    >
                      <div
                        style={{
                          fontSize: 32,
                          fontWeight: 700,
                          color: 'var(--accent-ink)',
                          opacity: 0.7,
                          letterSpacing: '-.04em',
                          lineHeight: 1,
                        }}
                        aria-hidden="true"
                      >
                        {loc(r.name).slice(0, 1).toUpperCase()}
                      </div>
                    </div>
                  )}
                  <div
                    style={{
                      position: 'absolute',
                      top: 12,
                      right: 12,
                      padding: '5px 10px',
                      borderRadius: radius.pill,
                      background: 'var(--surface)',
                      fontSize: 12,
                      fontWeight: 600,
                      color: 'var(--accent-ink)',
                      ...tabular,
                    }}
                  >
                    {cov.have}/{cov.total}
                  </div>
                </div>
                <div style={{ padding: 14 }}>
                  <div style={T.cardTitle}>{loc(r.name)}</div>
                  <div
                    style={{
                      marginTop: 6,
                      fontSize: 13.5,
                      color: 'var(--muted)',
                      lineHeight: 1.4,
                      height: 38,
                      overflow: 'hidden',
                      textWrap: 'pretty',
                    }}
                  >
                    {loc(r.description)}
                  </div>
                  <div
                    style={{
                      marginTop: 10,
                      display: 'flex',
                      gap: 12,
                      fontSize: 13,
                      color: 'var(--muted)',
                      ...tabular,
                    }}
                  >
                    <span>{r.minutes} min</span>
                    <span>
                      {r.kcalPerServing} {t.kcal}
                    </span>
                    <span>{t[r.difficulty]}</span>
                  </div>
                </div>
              </Pressable>
            );
          })}
        </div>
      ) : (
        <div style={{ padding: '60px 20px', textAlign: 'center' }}>
          <div style={{ fontSize: 17, fontWeight: 600, letterSpacing: '-.02em' }}>{t.noResults}</div>
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 14 }}>
            <Button variant="secondary" size="header" onClick={reset}>
              {t.resetFilters}
            </Button>
          </div>
        </div>
      )}
    </ScreenBody>
  );
}
