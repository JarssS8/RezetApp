import { describe, expect, it } from 'vitest';
import {
  ACTIVITY_FACTOR,
  KCAL_MAX,
  KCAL_MIN,
  ageFrom,
  bmr,
  clampTarget,
  estimateTarget,
} from '../nutrition';

const HOY = new Date('2026-09-21T10:00:00Z');

describe('nutrition', () => {
  it('la edad sale del año de nacimiento', () => {
    expect(ageFrom(1991, HOY)).toBe(35);
    expect(ageFrom(2026, HOY)).toBe(0);
  });

  it('Mifflin-St Jeor: las dos constantes del sexo', () => {
    // 10·62 + 6,25·168 − 5·35 + 5 = 620 + 1050 − 175 + 5
    expect(bmr('male', 62, 168, 35)).toBeCloseTo(1500, 5);
    // …y −161 en vez de +5
    expect(bmr('female', 62, 168, 35)).toBeCloseTo(1334, 5);
  });

  it('el objetivo aplica actividad y ajuste, y redondea a 50', () => {
    const t = estimateTarget(
      { sex: 'female', birthYear: 1991, heightCm: 168, weightKg: 62, activity: 'light', goal: 'maintain' },
      HOY,
    );
    // 1334 × 1,375 = 1834,25 → 1850
    expect(t).toBe(1850);
    expect(ACTIVITY_FACTOR.light).toBe(1.375);
  });

  it('bajar quita un 15 % y subir añade un 10 %', () => {
    const base = { sex: 'male', birthYear: 1991, heightCm: 180, weightKg: 80, activity: 'sedentary' } as const;
    const mantener = estimateTarget({ ...base, goal: 'maintain' }, HOY)!;
    const bajar = estimateTarget({ ...base, goal: 'lose' }, HOY)!;
    const subir = estimateTarget({ ...base, goal: 'gain' }, HOY)!;
    expect(bajar).toBeLessThan(mantener);
    expect(subir).toBeGreaterThan(mantener);
    expect(bajar / mantener).toBeCloseTo(0.85, 1);
  });

  it('sin sexo declarado no hay estimación: se pide el número', () => {
    expect(
      estimateTarget(
        { sex: null, birthYear: 1991, heightCm: 168, weightKg: 62, activity: 'light', goal: 'maintain' },
        HOY,
      ),
    ).toBeNull();
  });

  it('con menos de 18 años tampoco: la fórmula está validada en adultos', () => {
    expect(
      estimateTarget(
        { sex: 'male', birthYear: 2012, heightCm: 150, weightKg: 42, activity: 'light', goal: 'maintain' },
        HOY,
      ),
    ).toBeNull();
  });

  it('falta cualquier medida y no hay estimación', () => {
    expect(
      estimateTarget(
        { sex: 'male', birthYear: 1991, heightCm: null, weightKg: 62, activity: 'light', goal: 'maintain' },
        HOY,
      ),
    ).toBeNull();
  });

  it('la estimación no se sale de un rango sensato', () => {
    const enorme = estimateTarget(
      { sex: 'male', birthYear: 1991, heightCm: 250, weightKg: 400, activity: 'very_active', goal: 'gain' },
      HOY,
    );
    expect(enorme).toBeLessThanOrEqual(4500);
    const minimo = estimateTarget(
      { sex: 'female', birthYear: 1950, heightCm: 140, weightKg: 35, activity: 'sedentary', goal: 'lose' },
      HOY,
    );
    expect(minimo).toBeGreaterThanOrEqual(1200);
  });

  it('el número escrito a mano se acota a lo que acepta la base de datos', () => {
    expect(clampTarget(99999)).toBe(KCAL_MAX);
    expect(clampTarget(3)).toBe(KCAL_MIN);
    expect(clampTarget(1837)).toBe(1850);
    expect(clampTarget(Number.NaN)).toBe(2100);
  });

  it('los cinco factores de actividad son los estándar', () => {
    expect(ACTIVITY_FACTOR).toEqual({
      sedentary: 1.2,
      light: 1.375,
      moderate: 1.55,
      active: 1.725,
      very_active: 1.9,
    });
  });

  it('a los 18 ya se estima, a los 17 todavía no', () => {
    const base = { sex: 'male', heightCm: 175, weightKg: 70, activity: 'light', goal: 'maintain' } as const;
    // HOY es 2026: nacido en 2008 cumple 18 este año, nacido en 2009 cumple 17.
    expect(estimateTarget({ ...base, birthYear: 2008 }, HOY)).not.toBeNull();
    expect(estimateTarget({ ...base, birthYear: 2009 }, HOY)).toBeNull();
  });

  it('falta el peso o el año y tampoco hay estimación', () => {
    const base = { sex: 'female', birthYear: 1991, heightCm: 168, weightKg: 62, activity: 'light', goal: 'maintain' } as const;
    expect(estimateTarget({ ...base, weightKg: null }, HOY)).toBeNull();
    expect(estimateTarget({ ...base, birthYear: null }, HOY)).toBeNull();
  });
});
