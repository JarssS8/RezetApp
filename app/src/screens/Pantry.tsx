import { useMemo, useState } from 'react';
import { usePrefs } from '../store/prefs';
import { useData } from '../data/store';
import { formatQuantity, pantryStep } from '../domain/units';
import { Button } from '../ui/Button';
import { Card, ListCard, Row, SectionHeader } from '../ui/Card';
import { Icon } from '../ui/Icon';
import { Pressable } from '../ui/Pressable';
import { ScreenBody, ScreenHeader, SearchField } from '../ui/Fields';
import { Stepper } from '../ui/Stepper';
import { maxW, radius, text as T } from '../ui/tokens';
import type { PantryLoc } from '../types';

const LOCATIONS: PantryLoc[] = ['cupboard', 'fridge', 'freezer'];

export function Pantry({ onAdd }: { onAdd: () => void }) {
  const { t, locale, units, loc } = usePrefs();
  const { pantry, ingredientById, pantryBump, pantryDelete } = useData();
  const [query, setQuery] = useState('');

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = pantry.filter((p) => {
      if (!q) return true;
      const ing = ingredientById.get(p.ingredientId);
      return ing ? loc(ing.name).toLowerCase().includes(q) : false;
    });
    return LOCATIONS.map((location) => ({
      location,
      items: filtered.filter((p) => p.location === location),
    })).filter((g) => g.items.length > 0);
  }, [pantry, query, ingredientById, loc]);

  return (
    <ScreenBody maxWidth={maxW.pantry} label="Despensa">
      <ScreenHeader
        title={t.pantry}
        trailing={
          <Button size="header" onClick={onAdd} icon={<Icon name="plus" size={16} strokeWidth={2.4} />}>
            {t.add}
          </Button>
        }
      />

      <div style={{ marginBottom: 20 }}>
        <SearchField value={query} onChange={setQuery} placeholder={t.searchPantry} />
      </div>

      {groups.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          {groups.map((group) => (
            <div key={group.location}>
              <SectionHeader label={t[group.location]} trailing={group.items.length} />
              <ListCard>
                {group.items.map((item) => {
                  const ing = ingredientById.get(item.ingredientId);
                  const soon = item.expiresInDays != null && item.expiresInDays <= 3;
                  const step = pantryStep(item.unit);
                  return (
                    <Row key={item.id} style={{ padding: '13px 14px' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={T.row}>{ing ? loc(ing.name) : '—'}</div>
                        <div
                          style={{
                            marginTop: 3,
                            fontSize: 12.5,
                            color: soon ? 'var(--warn-ink)' : 'var(--muted)',
                          }}
                        >
                          {item.expiresInDays == null
                            ? t.noDate
                            : item.expiresInDays < 0
                              ? t.expired
                              : `${t.expiresIn} ${item.expiresInDays} ${t.days}`}
                        </div>
                      </div>
                      <Stepper
                        size="sm"
                        value={item.quantity}
                        valueWidth={64}
                        label={ing ? loc(ing.name) : t.pantry}
                        formatted={formatQuantity(item.quantity, item.unit, units, locale)}
                        onDecrement={() => pantryBump(item.id, -step)}
                        onIncrement={() => pantryBump(item.id, step)}
                      />
                      <Pressable
                        onClick={() => pantryDelete(item.id)}
                        ariaLabel={`${t.pantry} — ${ing ? loc(ing.name) : ''}`}
                        scale={0.9}
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: 9,
                          display: 'grid',
                          placeItems: 'center',
                          color: 'var(--muted)',
                        }}
                      >
                        <Icon name="trash" size={15} strokeWidth={1.9} />
                      </Pressable>
                    </Row>
                  );
                })}
              </ListCard>
            </div>
          ))}
        </div>
      ) : (
        <Card dashed style={{ padding: '44px 24px', textAlign: 'center', borderRadius: radius.hero }}>
          <div style={{ fontSize: 18, fontWeight: 650, letterSpacing: '-.02em' }}>{t.pantryEmpty}</div>
          <div
            style={{
              marginTop: 8,
              fontSize: 14.5,
              color: 'var(--muted)',
              maxWidth: 280,
              margin: '8px auto 0',
              lineHeight: 1.5,
              textWrap: 'pretty',
            }}
          >
            {t.pantryEmptyBody}
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 18 }}>
            <Button onClick={onAdd} size="header">
              {t.add}
            </Button>
          </div>
        </Card>
      )}
    </ScreenBody>
  );
}
