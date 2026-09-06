import { useCallback, useState } from 'react';
import { useIsWide } from './hooks/useMediaQuery';
import { usePersistentState, useToast } from './hooks/usePersistentState';
import { usePrefs } from './store/prefs';
import { useAuth } from './data/auth';
import { DataProvider } from './data/store';
import { SupabaseDataProvider } from './data/supabaseStore';
import { useData } from './data/storeContext';
import { haptics } from './motion/motion';
import { AppShell, type Tab } from './app/AppShell';
import { Login } from './screens/Login';
import { CreateOrJoinHousehold } from './screens/CreateOrJoinHousehold';
import { Onboarding } from './screens/Onboarding';
import { Today } from './screens/Today';
import { Recipes } from './screens/Recipes';
import { RecipeDetail } from './screens/RecipeDetail';
import { RecipeForm } from './screens/RecipeForm';
import { Plan } from './screens/Plan';
import { Pantry } from './screens/Pantry';
import { Cook } from './screens/Cook';
import { useCookSession } from './screens/useCookSession';
import { useCookTimerSync } from './data/useCookTimerSync';
import { SettingsSheet } from './sheets/SettingsSheet';
import { ShoppingSheet } from './sheets/ShoppingSheet';
import { PantryAddSheet } from './sheets/PantryAddSheet';
import { RecipePickerSheet, type PickerTarget } from './sheets/RecipePickerSheet';
import { CookFinishSheet } from './sheets/CookFinishSheet';
import { InviteSheet } from './sheets/InviteSheet';
import { Toast } from './ui/Fields';
import type { MealSlot } from './types';

type Push =
  | { kind: 'recipe'; recipeId: string; servings: number }
  | { kind: 'new' }
  | { kind: 'edit'; recipeId: string }
  | null;
type SheetState =
  | { kind: 'settings' }
  | { kind: 'shopping' }
  | { kind: 'pantryAdd' }
  | { kind: 'picker'; target: PickerTarget }
  | { kind: 'finish' }
  | { kind: 'invite' }
  | null;

/**
 * Punto de entrada real. Decide entre demo (local, sin cuenta), login/alta
 * real (Supabase Auth) y, una vez dentro, monta el `DataProvider` que toque
 * — el resto de la app (`MainApp`) no sabe cuál de los dos está debajo.
 */
export function App() {
  const [demo, setDemo] = useState(false);
  const auth = useAuth();

  if (demo) {
    return (
      <DataProvider>
        <MainApp
          demo
          onSignOut={() => setDemo(false)}
          onInvite={undefined}
        />
      </DataProvider>
    );
  }

  if (auth.status === 'loading') {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', color: 'var(--muted)' }}>…</div>
    );
  }

  if (auth.status === 'signedOut') {
    return (
      <Login
        onGoogle={auth.signInWithGoogle}
        onApple={auth.signInWithApple}
        onPasskey={auth.signInWithPasskey}
        onDemo={() => setDemo(true)}
        error={auth.error}
      />
    );
  }

  if (auth.status === 'needsHousehold') {
    return <CreateOrJoinHousehold />;
  }

  // status === 'ready': hay sesión y hogar.
  const profile = auth.profile!;

  if (!profile.onboardedAt) {
    return <FirstOnboarding householdId={profile.householdId} />;
  }

  return (
    <SupabaseDataProvider householdId={profile.householdId}>
      <MainApp demo={false} onSignOut={() => void auth.signOut()} onInvite />
    </SupabaseDataProvider>
  );
}

/** Guía de 3 pasos que solo se ve una vez de verdad: marca `onboarded_at` al terminar. */
function FirstOnboarding({ householdId }: { householdId: string }) {
  const { t } = usePrefs();
  const { markOnboarded } = useAuth();
  const [step, setStep] = useState(0);

  return (
    <SupabaseDataProvider householdId={householdId}>
      <Onboarding
        step={step}
        onNext={() => {
          if (step >= t.onboarding.length - 1) void markOnboarded();
          else setStep((s) => s + 1);
        }}
        onSkip={() => void markOnboarded()}
      />
    </SupabaseDataProvider>
  );
}

/**
 * La app en sí. Idéntica en modo demo y modo real: solo lee `useData()`,
 * sin saber si detrás hay `localStorage` o Supabase.
 */
function MainApp({
  demo,
  onSignOut,
  onInvite,
}: {
  demo: boolean;
  onSignOut: () => void;
  onInvite?: true;
}) {
  const isWide = useIsWide();
  const { t } = usePrefs();
  const { profile } = useAuth();
  const { recipeById, finishCook } = useData();
  const { message, show } = useToast();

  const [tab, setTab] = usePersistentState<Tab>('rezet.tab', 'today');
  const [weekOffset, setWeekOffset] = useState(0);
  const [push, setPush] = useState<Push>(null);
  const [sheet, setSheet] = useState<SheetState>(null);
  /** Guía repetible desde Ajustes; independiente de la de primer uso. */
  const [replayStep, setReplayStep] = useState<number | null>(null);

  const cook = useCookSession();
  const cookSession = cook.session;
  useCookTimerSync(cookSession, demo, profile);

  const openRecipe = useCallback(
    (recipeId: string, servings: number) => setPush({ kind: 'recipe', recipeId, servings }),
    [],
  );

  const startCook = useCallback(
    (recipeId: string, servings: number, planEntryId: string | null) => {
      const recipe = recipeById.get(recipeId);
      if (!recipe) return;
      cook.startCook(recipe, servings, planEntryId);
      setPush(null);
      setSheet(null);
    },
    [cook, recipeById],
  );

  const confirmCook = useCallback(
    (servings: number) => {
      if (!cookSession) return;
      void finishCook({
        recipeId: cookSession.recipeId,
        servings,
        planEntryId: cookSession.planEntryId,
      });
      setSheet(null);
      cook.endCook();
      haptics.cookSaved();
      show(t.cookSaved);
    },
    [cookSession, finishCook, cook, show, t.cookSaved],
  );

  if (replayStep !== null) {
    return (
      <Onboarding
        step={replayStep}
        onNext={() =>
          setReplayStep((s) => (s! >= t.onboarding.length - 1 ? null : (s ?? 0) + 1))
        }
        onSkip={() => setReplayStep(null)}
      />
    );
  }

  return (
    <>
      <AppShell tab={tab} onTab={setTab} isWide={isWide} onOpenSettings={() => setSheet({ kind: 'settings' })}>
        {tab === 'today' && (
          <Today
            isWide={isWide}
            onOpenRecipe={openRecipe}
            onCook={startCook}
            onGoPlan={() => setTab('plan')}
            onOpenSettings={() => setSheet({ kind: 'settings' })}
          />
        )}
        {tab === 'recipes' && (
          <Recipes onOpenRecipe={openRecipe} onNewRecipe={() => setPush({ kind: 'new' })} />
        )}
        {tab === 'plan' && (
          <Plan
            weekOffset={weekOffset}
            onWeekOffset={setWeekOffset}
            onOpenShopping={() => setSheet({ kind: 'shopping' })}
            onOpenRecipe={openRecipe}
            onPickForSlot={(date: string, slot: MealSlot) =>
              setSheet({ kind: 'picker', target: { kind: 'slot', date, slot } })
            }
            onToast={show}
          />
        )}
        {tab === 'pantry' && <Pantry onAdd={() => setSheet({ kind: 'pantryAdd' })} />}
      </AppShell>

      {push?.kind === 'recipe' && (
        <RecipeDetail
          recipeId={push.recipeId}
          initialServings={push.servings}
          onClose={() => setPush(null)}
          onCook={(recipeId, servings) => startCook(recipeId, servings, null)}
          onAddToPlan={(recipeId) =>
            setSheet({ kind: 'picker', target: { kind: 'recipe', recipeId } })
          }
          onEdit={(recipeId) => setPush({ kind: 'edit', recipeId })}
        />
      )}

      {(push?.kind === 'new' || push?.kind === 'edit') && (
        <RecipeForm
          recipe={push.kind === 'edit' ? recipeById.get(push.recipeId) : undefined}
          onClose={() => setPush(null)}
          onSaved={(recipeId) => {
            setPush({ kind: 'recipe', recipeId, servings: recipeById.get(recipeId)?.baseServings ?? 2 });
            show(t.savedRecipe);
          }}
        />
      )}

      {cookSession && (
        <Cook session={cookSession} cook={cook} onFinish={() => setSheet({ kind: 'finish' })} />
      )}

      {sheet?.kind === 'settings' && (
        <SettingsSheet
          onClose={() => setSheet(null)}
          onReplayTour={() => {
            setSheet(null);
            setReplayStep(0);
          }}
          onSignOut={() => {
            setSheet(null);
            cook.endCook();
            onSignOut();
          }}
          onInvite={demo || !onInvite ? undefined : () => setSheet({ kind: 'invite' })}
          onToast={show}
        />
      )}

      {sheet?.kind === 'shopping' && (
        <ShoppingSheet weekOffset={weekOffset} onClose={() => setSheet(null)} onToast={show} />
      )}

      {sheet?.kind === 'pantryAdd' && (
        <PantryAddSheet onClose={() => setSheet(null)} onToast={show} allowPhoto={!demo} />
      )}

      {sheet?.kind === 'picker' && (
        <RecipePickerSheet
          target={sheet.target}
          weekOffset={weekOffset}
          onClose={() => setSheet(null)}
          onToast={show}
        />
      )}

      {sheet?.kind === 'finish' && cookSession && (
        <CookFinishSheet
          recipeId={cookSession.recipeId}
          servings={cookSession.servings}
          onClose={() => setSheet(null)}
          onConfirm={confirmCook}
        />
      )}

      {sheet?.kind === 'invite' && <InviteSheet onClose={() => setSheet(null)} onToast={show} />}

      <Toast message={message} />
    </>
  );
}
