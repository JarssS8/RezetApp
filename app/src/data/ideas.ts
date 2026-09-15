import { useQuery } from '@tanstack/react-query';
import type { Difficulty, Localized, Unit } from '../types';

/**
 * Catálogo Cecotec (pestaña Ideas): ficheros estáticos servidos por el mismo
 * Worker, `app/public/ideas/` — nunca Supabase. `index.json` trae lo que pide
 * la rejilla y los filtros (unos 41 KB comprimidos para 722 ideas); el
 * detalle de cada una se pide aparte, solo al abrirla. Generado por
 * `tools/cecotec/split-ideas.mjs` a partir del scraping — ver ese script para
 * cómo actualizar el catálogo.
 */
export type Appliance = 'cecofry' | 'olla-gm' | 'mambo';

export interface IdeaSummary {
  id: string;
  name: Localized;
  minutes: number | null;
  timeBucket: 'le15' | 'le30' | 'le60' | 'gt60' | null;
  difficulty: Difficulty;
  appliances: Appliance[];
  course: string;
  photoUrl: string;
}

export interface IdeaIngredient {
  ingredientId: string;
  name: Localized;
  quantity: number | null;
  unit: Unit | null;
  toTaste: boolean;
  optional: boolean;
  sensitive: boolean;
  group: Localized | null;
  note: Localized | null;
}

export interface IdeaStep {
  text: Localized;
  timerMinutes?: number;
  temperatureC?: number;
}

export interface IdeaDetail {
  id: string;
  sourceUrl: string;
  name: Localized;
  appliances: Appliance[];
  baseServings: number | null;
  servingsUnit: 'comensales' | 'unidades' | null;
  minutes: number | null;
  difficulty: Difficulty;
  photoUrl: string;
  ingredients: IdeaIngredient[];
  steps: IdeaStep[];
}

/** Forma cruda de out/cecotec-recipes.json — la que sirve <id>.json tal cual. */
interface RawIdea {
  id: string;
  sourceUrl: string;
  name: Localized;
  appliances: Appliance[];
  baseServings: number | null;
  servingsMax: number | null;
  servingsUnit: 'comensales' | 'unidades' | null;
  servingsText: string | null;
  minutes: number | null;
  timeBucket: string | null;
  difficulty: Difficulty;
  photoUrl: string;
  ingredients: Array<{
    ingredientId: string;
    quantity: number | null;
    unit: Unit | null;
    toTaste: boolean;
    optional: boolean;
    group: Localized | null;
    note: Localized | null;
  }>;
  steps: Array<{ text: Localized; timerMinutes?: number; temperatureC?: number }>;
}

interface RawIngredient {
  id: string;
  name: Localized;
  group: string;
  defaultUnit: Unit;
  sensitive: boolean;
}

let ingredientCatalogPromise: Promise<Map<string, RawIngredient>> | null = null;
/** El catálogo de 784 ingredientes de Cecotec, para resolver nombre/sensibilidad al pedir un detalle. */
function loadIdeaIngredientCatalog(): Promise<Map<string, RawIngredient>> {
  if (!ingredientCatalogPromise) {
    ingredientCatalogPromise = fetch('/ideas/ingredients.json')
      .then((r) => r.json() as Promise<RawIngredient[]>)
      .then((list) => new Map(list.map((i) => [i.id, i])));
  }
  return ingredientCatalogPromise;
}

async function fetchIdeasIndex(): Promise<IdeaSummary[]> {
  const res = await fetch('/ideas/index.json');
  if (!res.ok) throw new Error(`ideas index: HTTP ${res.status}`);
  return res.json();
}

async function fetchIdeaDetail(id: string): Promise<IdeaDetail> {
  const [res, catalog] = await Promise.all([fetch(`/ideas/${id}.json`), loadIdeaIngredientCatalog()]);
  if (!res.ok) throw new Error(`idea ${id}: HTTP ${res.status}`);
  const raw = (await res.json()) as RawIdea;
  return {
    id: raw.id,
    sourceUrl: raw.sourceUrl,
    name: raw.name,
    appliances: raw.appliances,
    baseServings: raw.baseServings,
    servingsUnit: raw.servingsUnit,
    minutes: raw.minutes,
    difficulty: raw.difficulty,
    photoUrl: raw.photoUrl,
    ingredients: raw.ingredients.map((ri) => {
      const catalogIng = catalog.get(ri.ingredientId);
      return {
        ingredientId: ri.ingredientId,
        name: catalogIng?.name ?? { es: ri.ingredientId, en: ri.ingredientId },
        quantity: ri.quantity,
        unit: ri.unit,
        toTaste: ri.toTaste,
        optional: ri.optional,
        sensitive: catalogIng?.sensitive ?? false,
        group: ri.group,
        note: ri.note,
      };
    }),
    steps: raw.steps,
  };
}

const STATIC_QUERY = { staleTime: Infinity, gcTime: Infinity } as const;

/** Un solo fetch por sesión (~41 KB comprimidos); TanStack Query lo reutiliza en cada visita a la pestaña. */
export function useIdeasIndex() {
  return useQuery({ queryKey: ['ideas-index'], queryFn: fetchIdeasIndex, ...STATIC_QUERY });
}

/** Detalle de una idea. `id === null` la desactiva (no dispara el fetch). */
export function useIdeaDetail(id: string | null) {
  return useQuery({
    queryKey: ['idea', id],
    queryFn: () => fetchIdeaDetail(id!),
    enabled: id != null,
    ...STATIC_QUERY,
  });
}
