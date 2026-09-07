import { useCallback, useEffect, useRef, useState } from 'react';
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
import { ConnectMcpSheet } from './sheets/ConnectMcpSheet';
import { AccountHouseholdSheet } from './sheets/AccountHouseholdSheet';
import { HouseholdSheet } from './sheets/HouseholdSheet';
import { LeaveConfirmDialog, LeaveLastMemberDialog, LeaveLastAdminDialog } from './sheets/LeaveHouseholdDialogs';
import { DeleteIntroSheet, DeleteConfirmDialog } from './sheets/DeleteHouseholdFlow';
import {
  DeleteAccountIntroSheet,
  DeleteAccountConfirmDialog,
  DeleteAccountLastAdminDialog,
} from './sheets/DeleteAccountFlow';
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
  | { kind: 'connectMcp' }
  | { kind: 'accountHousehold' }
  | { kind: 'household' }
  | { kind: 'leaveConfirm' }
  | { kind: 'leaveLastMember' }
  | { kind: 'leaveLastAdmin' }
  | { kind: 'deleteIntro' }
  | { kind: 'deleteConfirm' }
  | { kind: 'deleteAccountIntro' }
  | { kind: 'deleteAccountConfirm' }
  | { kind: 'deleteAccountLastAdmin' }
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
  const auth = useAuth();
  const { profile } = auth;
  const { recipeById, finishCook, setHouseholdSheetOpen } = useData();
  const { message, show } = useToast();

  const [tab, setTab] = usePersistentState<Tab>('rezet.tab', 'today');
  const [weekOffset, setWeekOffset] = useState(0);
  const [push, setPush] = useState<Push>(null);
  const [sheet, setSheet] = useState<SheetState>(null);
  /** Guía repetible desde Ajustes; independiente de la de primer uso. */
  const [replayStep, setReplayStep] = useState<number | null>(null);

  /**
   * "Tu hogar" y todo el flujo de salir/eliminar que cuelga de ella
   * (`App.tsx` la cierra y abre el diálogo siguiente, así que nunca hay dos
   * a la vez, pero sí huecos con `sheet === null` entre paso y paso).
   * Mientras cualquiera de estas hojas esté abierta, se le señala a la capa
   * de datos que puede pedir la lista de miembros del hogar (hallazgo 8).
   */
  const householdFlowOpen =
    sheet?.kind === 'household' ||
    sheet?.kind === 'leaveConfirm' ||
    sheet?.kind === 'leaveLastMember' ||
    sheet?.kind === 'leaveLastAdmin' ||
    sheet?.kind === 'deleteIntro' ||
    sheet?.kind === 'deleteConfirm' ||
    sheet?.kind === 'deleteAccountIntro' ||
    sheet?.kind === 'deleteAccountConfirm' ||
    sheet?.kind === 'deleteAccountLastAdmin';
  useEffect(() => {
    setHouseholdSheetOpen(householdFlowOpen);
  }, [householdFlowOpen, setHouseholdSheetOpen]);

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

  /**
   * Éxito de salir/eliminar el hogar: la fila `profile` propia ya no
   * existe, pero la sesión sigue siendo la misma (no es un evento de
   * `onAuthStateChange`), así que nada vuelve a comprobarlo por su cuenta
   * — hay que forzar `refreshProfile()` para que `auth.status` pase a
   * `needsHousehold` y `App()` enrute a `CreateOrJoinHousehold`. Ese cambio
   * desmonta `SupabaseDataProvider`/`MainApp` enteros, así que el toast se
   * dispara primero y `refreshProfile()` se retrasa un momento para que dé
   * tiempo a verse antes de que la pantalla cambie.
   */
  const householdActionTimeoutRef = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (householdActionTimeoutRef.current != null) {
        window.clearTimeout(householdActionTimeoutRef.current);
      }
    },
    [],
  );

  const onHouseholdActionDone = useCallback(
    (toastMessage: string) => {
      setSheet(null);
      show(toastMessage);
      householdActionTimeoutRef.current = window.setTimeout(() => {
        householdActionTimeoutRef.current = null;
        void auth.refreshProfile();
      }, 900);
    },
    [show, auth],
  );

  /**
   * Éxito de `deleteAccount()`: a diferencia de salir/eliminar el hogar, la
   * cuenta de Auth entera ha desaparecido — la sesión ya no es válida en
   * absoluto, así que `refreshProfile()` (que solo releería el `profile` de
   * la sesión actual) no basta. Hace falta el cierre de sesión real de
   * verdad (`onSignOut`, que en modo real es `auth.signOut()` — ver `App()`
   * más abajo) para que la UI no se quede colgada esperando una sesión que
   * ya no existe.
   */
  const onAccountDeleted = useCallback(() => {
    setSheet(null);
    cook.endCook();
    show(t.deletedAccountToast);
    householdActionTimeoutRef.current = window.setTimeout(() => {
      householdActionTimeoutRef.current = null;
      onSignOut();
    }, 900);
  }, [show, t.deletedAccountToast, onSignOut, cook]);

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
            onNewRecipe={() => setPush({ kind: 'new' })}
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
          onAccountHousehold={demo || !onInvite ? undefined : () => setSheet({ kind: 'accountHousehold' })}
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
          onNewRecipe={() => {
            setSheet(null);
            setPush({ kind: 'new' });
          }}
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

      {sheet?.kind === 'invite' && (
        <InviteSheet onClose={() => setSheet({ kind: 'accountHousehold' })} onToast={show} />
      )}

      {sheet?.kind === 'connectMcp' && (
        <ConnectMcpSheet onClose={() => setSheet({ kind: 'accountHousehold' })} onToast={show} />
      )}

      {sheet?.kind === 'accountHousehold' && (
        <AccountHouseholdSheet
          onClose={() => setSheet(null)}
          onHousehold={() => setSheet({ kind: 'household' })}
          onInvite={() => setSheet({ kind: 'invite' })}
          onConnectMcp={() => setSheet({ kind: 'connectMcp' })}
          onDeleteAccount={() => setSheet({ kind: 'deleteAccountIntro' })}
          onToast={show}
        />
      )}

      {sheet?.kind === 'household' && (
        <HouseholdSheet
          onClose={() => setSheet({ kind: 'accountHousehold' })}
          onRequestLeave={() => setSheet({ kind: 'leaveConfirm' })}
          onRequestDelete={() => setSheet({ kind: 'deleteIntro' })}
          onToast={show}
        />
      )}

      {sheet?.kind === 'leaveConfirm' && (
        <LeaveConfirmDialog
          onCancel={() => setSheet(null)}
          onLeft={() => onHouseholdActionDone(t.leftHouseholdToast)}
          onSoleMember={() => setSheet({ kind: 'leaveLastMember' })}
          onLastAdmin={() => setSheet({ kind: 'leaveLastAdmin' })}
        />
      )}

      {sheet?.kind === 'leaveLastMember' && (
        <LeaveLastMemberDialog
          onCancel={() => setSheet(null)}
          onDeleteInstead={() => setSheet({ kind: 'deleteIntro' })}
        />
      )}

      {sheet?.kind === 'leaveLastAdmin' && (
        <LeaveLastAdminDialog
          onCancel={() => setSheet(null)}
          onGoToHousehold={() => setSheet({ kind: 'household' })}
        />
      )}

      {sheet?.kind === 'deleteIntro' && (
        <DeleteIntroSheet onClose={() => setSheet(null)} onContinue={() => setSheet({ kind: 'deleteConfirm' })} />
      )}

      {sheet?.kind === 'deleteConfirm' && (
        <DeleteConfirmDialog
          onCancel={() => setSheet(null)}
          onDeleted={() => onHouseholdActionDone(t.deletedHouseholdToast)}
        />
      )}

      {sheet?.kind === 'deleteAccountIntro' && (
        <DeleteAccountIntroSheet
          onClose={() => setSheet({ kind: 'accountHousehold' })}
          onContinue={() => setSheet({ kind: 'deleteAccountConfirm' })}
        />
      )}

      {sheet?.kind === 'deleteAccountConfirm' && (
        <DeleteAccountConfirmDialog
          onCancel={() => setSheet(null)}
          onDeleted={onAccountDeleted}
          onLastAdmin={() => setSheet({ kind: 'deleteAccountLastAdmin' })}
        />
      )}

      {sheet?.kind === 'deleteAccountLastAdmin' && (
        <DeleteAccountLastAdminDialog
          onCancel={() => setSheet(null)}
          onGoToHousehold={() => setSheet({ kind: 'household' })}
        />
      )}

      <Toast message={message} />
    </>
  );
}
