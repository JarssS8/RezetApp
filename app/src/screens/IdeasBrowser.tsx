import { useEffect, useMemo, useState } from 'react';
import { usePrefs } from '../store/prefs';
import { useData } from '../data/storeContext';
import { useIdeasIndex, type Appliance, type IdeaSummary } from '../data/ideas';
import { Button } from '../ui/Button';
import { Chip } from '../ui/Chip';
import { Icon } from '../ui/Icon';
import { Pressable } from '../ui/Pressable';
import { SearchField } from '../ui/Fields';
import { radius, tabular, text as T } from '../ui/tokens';

type TimeFilter = 'all' | 'le15' | 'le30' | 'le60' | 'gt60';
const TIME_ORDER: Exclude<TimeFilter, 'all'>[] = ['le15', 'le30', 'le60', 'gt60'];
const APPLIANCES: Appliance[] = ['cecofry', 'olla-gm'];
// Pintar los 722 a la vez no aporta nada (el usuario nunca los recorre
// enteros) y multiplica las peticiones de imagen de golpe. Se crece de
// PAGE_SIZE en PAGE_SIZE bajo demanda.
const PAGE_SIZE = 30;

/**
 * Rejilla del catálogo Cecotec (pestaña Ideas dentro de Recetas). No muestra
 * cobertura de despensa por tarjeta a propósito: `index.json` no trae
 * ingredientes (ahí está el ahorro de los 41 KB frente a 722 detalles
 * completos) — la cobertura solo se calcula al abrir una idea, donde ya se
 * ha pedido su detalle de todos modos. Desvía la maqueta `Main.dc.html`
 * (que sí la pintaba en la tarjeta) por esa razón, decidida junto al
 * usuario al validar el reparto índice/detalle.
 */
export function IdeasBrowser({ onOpenIdea }: { onOpenIdea: (ideaId: string) => void }) {
  const { t, loc } = usePrefs();
  const { recipes } = useData();
  const { data: ideas, isLoading, isError } = useIdeasIndex();

  const [query, setQuery] = useState('');
  const [time, setTime] = useState<TimeFilter>('all');
  const [appliance, setAppliance] = useState<Appliance | null>(null);
  const [shown, setShown] = useState(PAGE_SIZE);

  const savedIdeaIds = useMemo(
    () => new Set(recipes.map((r) => r.sourceIdeaId).filter((x): x is string => Boolean(x))),
    [recipes],
  );

  const visible = useMemo(() => {
    if (!ideas) return [];
    const q = query.trim().toLowerCase();
    return ideas.filter((idea) => {
      if (q && !loc(idea.name).toLowerCase().includes(q)) return false;
      // "Hasta 30 min" incluye las de 15: cada cubo es un techo, no un rango exacto.
      if (time !== 'all') {
        const maxIndex = TIME_ORDER.indexOf(time as Exclude<TimeFilter, 'all'>);
        const ideaIndex = idea.timeBucket ? TIME_ORDER.indexOf(idea.timeBucket as (typeof TIME_ORDER)[number]) : -1;
        if (ideaIndex < 0 || ideaIndex > maxIndex) return false;
      }
      if (appliance && !idea.appliances.includes(appliance)) return false;
      return true;
    });
  }, [ideas, query, time, appliance, loc]);

  // Cambiar de filtro es en la práctica una lista nueva: siempre empieza por la primera página.
  useEffect(() => setShown(PAGE_SIZE), [query, time, appliance]);

  const page = visible.slice(0, shown);

  if (isLoading) {
    return <div style={{ padding: '40px 4px', textAlign: 'center', color: 'var(--muted)' }}>…</div>;
  }
  if (isError || !ideas) {
    return <div style={{ padding: '40px 4px', textAlign: 'center', color: 'var(--muted)' }}>{t.ideasLoadError}</div>;
  }

  return (
    <div>
      <SearchField value={query} onChange={setQuery} placeholder={t.searchIdeas} />

      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '14px 0 4px', scrollbarWidth: 'none' }}>
        <Chip label={t.allTags} active={time === 'all'} onClick={() => setTime('all')} />
        <Chip label={t.timeLe15} active={time === 'le15'} onClick={() => setTime('le15')} />
        <Chip label={t.timeLe30} active={time === 'le30'} onClick={() => setTime('le30')} />
        <Chip label={t.timeLe60} active={time === 'le60'} onClick={() => setTime('le60')} />
        <Chip label={t.timeGt60} active={time === 'gt60'} onClick={() => setTime('gt60')} />
      </div>
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '2px 0 4px', scrollbarWidth: 'none' }}>
        {APPLIANCES.map((a) => (
          <Chip
            key={a}
            label={a === 'cecofry' ? 'Cecofry' : 'Olla GM'}
            active={appliance === a}
            onClick={() => setAppliance((current) => (current === a ? null : a))}
          />
        ))}
      </div>

      <div style={{ margin: '8px 0 18px', fontSize: 13.5, color: 'var(--muted)' }}>
        {visible.length} {t.ideasResults}
      </div>

      {page.length > 0 ? (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 14 }}>
            {page.map((idea) => (
              <IdeaCard key={idea.id} idea={idea} saved={savedIdeaIds.has(idea.id)} onOpen={() => onOpenIdea(idea.id)} />
            ))}
          </div>
          {shown < visible.length && (
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: 22 }}>
              <Button variant="secondary" onClick={() => setShown((s) => s + PAGE_SIZE)}>
                {t.loadMoreIdeas(visible.length - shown)}
              </Button>
            </div>
          )}
        </>
      ) : (
        <div style={{ padding: '40px 4px', textAlign: 'center', color: 'var(--muted)', fontSize: 14.5 }}>
          {t.noResults}
        </div>
      )}
    </div>
  );
}

function IdeaCard({ idea, saved, onOpen }: { idea: IdeaSummary; saved: boolean; onOpen: () => void }) {
  const { t, loc } = usePrefs();
  const [broken, setBroken] = useState(false);
  return (
    <Pressable
      onClick={onOpen}
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
      <div style={{ position: 'relative', height: 104, background: 'var(--soft)' }}>
        {broken || !idea.photoUrl ? (
          <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', color: 'var(--accent-ink)' }}>
            <Icon name="bowl" size={26} strokeWidth={1.6} />
          </div>
        ) : (
          <img
            src={idea.photoUrl}
            alt=""
            loading="lazy"
            onError={() => setBroken(true)}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        )}
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            top: 10,
            right: 10,
            width: 32,
            height: 32,
            borderRadius: radius.pill,
            background: 'var(--glass)',
            backdropFilter: 'blur(var(--glass-blur, 12px))',
            WebkitBackdropFilter: 'blur(var(--glass-blur, 12px))',
            display: 'grid',
            placeItems: 'center',
            color: saved ? 'var(--accent-ink)' : 'var(--muted)',
          }}
        >
          <Icon name={saved ? 'check' : 'bookmark'} size={15} strokeWidth={2.2} />
        </div>
      </div>
      <div style={{ padding: 14 }}>
        <div style={T.cardTitle}>{loc(idea.name)}</div>
        <div style={{ marginTop: 10, display: 'flex', gap: 12, fontSize: 13, color: 'var(--muted)', ...tabular }}>
          {idea.minutes != null && <span>{idea.minutes} min</span>}
          <span>{t[idea.difficulty]}</span>
          <span>{idea.appliances.includes('cecofry') ? 'Cecofry' : 'Olla GM'}</span>
        </div>
      </div>
    </Pressable>
  );
}
