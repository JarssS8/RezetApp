import { useEffect, useState } from 'react';
import { usePrefs } from '../store/prefs';
import { useData } from '../data/storeContext';
import { stripHouseholdErrorTag } from '../data/householdErrors';
import { Button } from '../ui/Button';
import { Card, Eyebrow } from '../ui/Card';
import { Icon } from '../ui/Icon';
import { SegmentedControl } from '../ui/SegmentedControl';
import { Sheet } from '../ui/Sheet';
import { Stepper } from '../ui/Stepper';
import { TextField } from '../ui/Fields';
import { radius, text as T } from '../ui/tokens';
import { formatKcal } from '../domain/units';
import {
  FALLBACK,
  KCAL_MAX,
  KCAL_MIN,
  clampTarget,
  estimateTarget,
  type Activity,
  type BodyInput,
  type Goal,
  type Sex,
} from '../domain/nutrition';
import type { MemberId } from '../types';

/** Paso del objetivo editable — mismo criterio que tenía el stepper de `MemberSheet`. */
const KCAL_STEP = 50;

const ACTIVITIES: Activity[] = ['sedentary', 'light', 'moderate', 'active', 'very_active'];

/** El segmentado de sexo añade "prefiero no decirlo", que para la fórmula es lo mismo que `null`. */
type SexChoice = Sex | 'undisclosed';

/**
 * Hoja "Tu objetivo": datos corporales → estimación (Mifflin-St Jeor, ver
 * `domain/nutrition.ts`) → objetivo diario, editable siempre a mano.
 * Se entra desde `MemberSheet` con una fila que solo aparece si `canEdit`
 * (reutilizado allí, no recalculado aquí: si esta hoja está abierta es
 * porque ya se tenía permiso).
 */
export function MemberTargetSheet({
  memberId,
  onClose,
  onToast,
}: {
  memberId: MemberId;
  onClose: () => void;
  onToast?: (msg: string) => void;
}) {
  const { t, locale } = usePrefs();
  const { members, myMemberId, myBody, myBodyLoading, setMyBody } = useData();
  const member = members.find((m) => m.id === memberId);

  // `myBody` es SIEMPRE el cuerpo de quien tiene la sesión (ver `storeContext.ts`):
  // no hay forma de leer los datos ya guardados de un tutelado desde aquí. Para no
  // enseñar por error los datos de quien administra sobre la ficha de un tutelado
  // (y guardarlos ahí sin querer), el formulario arranca en blanco en ese caso —
  // se puede rellenar y guardar igual, con `setMyBody(memberId, …)`, solo que no
  // recuerda lo que hubiera antes.
  const isSelf = memberId === myMemberId;
  const initialBody = isSelf ? myBody : null;

  const [sexChoice, setSexChoice] = useState<SexChoice>(initialBody?.sex ?? 'undisclosed');
  const [birthYearInput, setBirthYearInput] = useState(
    initialBody?.birthYear != null ? String(initialBody.birthYear) : '',
  );
  const [heightInput, setHeightInput] = useState(
    initialBody?.heightCm != null ? String(initialBody.heightCm) : '',
  );
  const [weightInput, setWeightInput] = useState(
    initialBody?.weightKg != null ? String(initialBody.weightKg) : '',
  );
  const [activity, setActivity] = useState<Activity>(initialBody?.activity ?? 'sedentary');
  const [goal, setGoal] = useState<Goal>(initialBody?.goal ?? 'maintain');
  const [target, setTarget] = useState(member?.kcalTarget ?? FALLBACK);
  const [saving, setSaving] = useState(false);

  // La hoja puede montar antes de que `myBody` resuelva (viaja en su propia
  // consulta, aparte de `members`): los `useState` de arriba se habrían
  // clavado ya en "vacío", así que hace falta resincronizar en cuanto
  // cambie la identidad del miembro que se edita O lleguen sus datos —
  // mismo patrón que `MemberSheet.tsx`, ampliado con la llegada async.
  useEffect(() => {
    setSexChoice(initialBody?.sex ?? 'undisclosed');
    setBirthYearInput(initialBody?.birthYear != null ? String(initialBody.birthYear) : '');
    setHeightInput(initialBody?.heightCm != null ? String(initialBody.heightCm) : '');
    setWeightInput(initialBody?.weightKg != null ? String(initialBody.weightKg) : '');
    setActivity(initialBody?.activity ?? 'sedentary');
    setGoal(initialBody?.goal ?? 'maintain');
    setTarget(member?.kcalTarget ?? FALLBACK);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberId, initialBody, member?.kcalTarget]);

  if (!member) {
    return (
      <Sheet title={t.targetSheetTitle} onClose={onClose}>
        <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--muted)' }}>…</div>
      </Sheet>
    );
  }

  const parsedBirthYear = birthYearInput.trim() ? parseInt(birthYearInput, 10) : null;
  const parsedHeight = heightInput.trim() ? parseFloat(heightInput.replace(',', '.')) : null;
  const parsedWeight = weightInput.trim() ? parseFloat(weightInput.replace(',', '.')) : null;

  const bodyInput: BodyInput = {
    sex: sexChoice === 'undisclosed' ? null : sexChoice,
    birthYear: parsedBirthYear !== null && Number.isFinite(parsedBirthYear) ? parsedBirthYear : null,
    heightCm: parsedHeight !== null && Number.isFinite(parsedHeight) ? parsedHeight : null,
    weightKg: parsedWeight !== null && Number.isFinite(parsedWeight) ? parsedWeight : null,
    activity,
    goal,
  };
  // Regla 1: sin sexo declarado, con algún dato en blanco o con menos de 18
  // años, `estimateTarget` devuelve `null` — no se inventa una media entre
  // las constantes de la fórmula, se pide el número a mano.
  const estimate = estimateTarget(bodyInput, new Date());

  const activityLabel: Record<Activity, string> = {
    sedentary: t.targetActivitySedentary,
    light: t.targetActivityLight,
    moderate: t.targetActivityModerate,
    active: t.targetActivityActive,
    very_active: t.targetActivityVeryActive,
  };

  // Mientras `myBody` está en vuelo, el formulario puede llevar los valores
  // por defecto sin que exista todavía respuesta del servidor — guardar en
  // esa ventana borraría datos corporales reales con `null`. El botón ya se
  // deshabilita para esto, pero el propio `save` repite el gate: no basta
  // con resincronizar los campos si el clic llega antes de que resuelva.
  const bodyStillLoading = isSelf && myBodyLoading;

  const save = async () => {
    if (saving || bodyStillLoading) return;
    setSaving(true);
    try {
      await setMyBody(
        memberId,
        {
          sex: bodyInput.sex,
          birthYear: bodyInput.birthYear,
          heightCm: bodyInput.heightCm,
          weightKg: bodyInput.weightKg,
          activity,
          goal,
        },
        // Regla 3: el objetivo se acota SIEMPRE con `clampTarget` antes de
        // mandarlo — nunca puede llegar algo que el `check` de la base rechace.
        clampTarget(target),
      );
      onClose();
    } catch (e) {
      onToast?.(stripHouseholdErrorTag(e instanceof Error ? e.message : String(e)) || t.memberActionError);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet title={t.targetSheetTitle} onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20, paddingBottom: 6 }}>
        {/* Regla 2: el aviso de privacidad va el primero de todo, en una tarjeta visible. */}
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 12,
            padding: '14px 16px',
            borderRadius: radius.card,
            background: 'var(--soft)',
          }}
        >
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: radius.pill,
              background: 'var(--surface)',
              display: 'grid',
              placeItems: 'center',
              color: 'var(--accent-ink)',
              flex: '0 0 34px',
            }}
          >
            <Icon name="lock" size={16} strokeWidth={2} />
          </div>
          <div style={{ fontSize: 13.5, lineHeight: 1.45, color: 'var(--accent-ink)' }}>{t.targetPrivacy}</div>
        </div>

        <Card style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div>
            <Eyebrow style={{ marginBottom: 9 }}>{t.targetSex}</Eyebrow>
            <SegmentedControl
              value={sexChoice}
              onChange={setSexChoice}
              options={[
                { value: 'female', label: t.targetSexFemale },
                { value: 'male', label: t.targetSexMale },
                { value: 'undisclosed', label: t.targetSexUndisclosed },
              ]}
            />
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <label style={{ flex: 1, display: 'block' }}>
              <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 6 }}>{t.targetBirthYear}</div>
              <TextField
                value={birthYearInput}
                onChange={(v) => setBirthYearInput(v.replace(/[^\d]/g, '').slice(0, 4))}
                inputMode="numeric"
                placeholder="1991"
              />
            </label>
            <label style={{ flex: 1, display: 'block' }}>
              <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 6 }}>{t.targetHeight}</div>
              <TextField
                value={heightInput}
                onChange={(v) => setHeightInput(v.replace(/[^\d.,]/g, ''))}
                inputMode="decimal"
                placeholder="170"
              />
            </label>
            <label style={{ flex: 1, display: 'block' }}>
              <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 6 }}>{t.targetWeight}</div>
              <TextField
                value={weightInput}
                onChange={(v) => setWeightInput(v.replace(/[^\d.,]/g, ''))}
                inputMode="decimal"
                placeholder="65"
              />
            </label>
          </div>

          <label style={{ display: 'block' }}>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 6 }}>{t.targetActivity}</div>
            <select
              value={activity}
              onChange={(e) => setActivity(e.target.value as Activity)}
              style={{
                width: '100%',
                height: 50,
                border: '1px solid var(--line)',
                background: 'var(--surface2)',
                borderRadius: radius.input,
                padding: '0 14px',
                fontSize: 15,
                color: 'var(--text)',
              }}
            >
              {ACTIVITIES.map((a) => (
                <option key={a} value={a}>
                  {activityLabel[a]}
                </option>
              ))}
            </select>
          </label>

          <div>
            <Eyebrow style={{ marginBottom: 9 }}>{t.targetGoal}</Eyebrow>
            <SegmentedControl
              value={goal}
              onChange={setGoal}
              options={[
                { value: 'lose', label: t.targetGoalLose },
                { value: 'maintain', label: t.targetGoalMaintain },
                { value: 'gain', label: t.targetGoalGain },
              ]}
            />
          </div>
        </Card>

        {estimate !== null ? (
          <div style={{ background: 'var(--soft)', borderRadius: radius.hero, padding: 20, textAlign: 'center' }}>
            <Eyebrow style={{ textAlign: 'center', marginBottom: 6 }}>{t.targetEstimate}</Eyebrow>
            <div style={{ ...T.bigNumber, color: 'var(--accent-ink)' }}>
              {formatKcal(estimate, locale)} <span style={{ fontSize: 18, fontWeight: 600 }}>{t.kcal}</span>
            </div>
            <div style={{ marginTop: 8, fontSize: 13, color: 'var(--muted)', lineHeight: 1.45 }}>
              {t.targetEstimateNote}
            </div>
          </div>
        ) : (
          <div style={{ fontSize: 13.5, color: 'var(--muted)', lineHeight: 1.45, padding: '0 2px' }}>
            {t.targetManualOnly}
          </div>
        )}

        <div>
          <Eyebrow style={{ marginBottom: 9 }}>{t.targetYourTarget}</Eyebrow>
          <Stepper
            value={target}
            formatted={`${formatKcal(target, locale)} ${t.kcal}`}
            valueWidth={110}
            onDecrement={() => setTarget((v) => Math.max(KCAL_MIN, v - KCAL_STEP))}
            onIncrement={() => setTarget((v) => Math.min(KCAL_MAX, v + KCAL_STEP))}
            label={t.targetYourTarget}
          />
          <div style={{ marginTop: 8, fontSize: 12.5, color: 'var(--muted)' }}>
            {t.targetRange(formatKcal(KCAL_MIN, locale), formatKcal(KCAL_MAX, locale))}
          </div>
        </div>

        <Button
          full
          size="cta"
          disabled={saving || bodyStillLoading}
          onClick={() => void save()}
          style={{ borderRadius: radius.button }}
        >
          {t.save}
        </Button>
      </div>
    </Sheet>
  );
}
