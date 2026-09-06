import { describe, expect, it } from 'vitest';
import { addDays, dateKey, daysUntil, resolveExpiry, shortMonthDate } from '../dates';

describe('daysUntil', () => {
  it('es 0 para la fecha de hoy', () => {
    expect(daysUntil(dateKey(new Date()))).toBe(0);
  });
  it('es positivo para una fecha futura', () => {
    expect(daysUntil(dateKey(addDays(new Date(), 5)))).toBe(5);
  });
  it('es negativo para una fecha pasada', () => {
    expect(daysUntil(dateKey(addDays(new Date(), -3)))).toBe(-3);
  });
});

describe('resolveExpiry', () => {
  it('null en, null fuera', () => {
    expect(resolveExpiry(null)).toBeNull();
  });
  it('delega en daysUntil cuando hay fecha', () => {
    const future = dateKey(addDays(new Date(), 2));
    expect(resolveExpiry(future)).toBe(2);
  });
});

describe('shortMonthDate', () => {
  it('día y mes largo, sin año ni día de la semana', () => {
    expect(shortMonthDate('2026-09-12', 'es')).toBe('12 de septiembre');
  });
  it('en inglés', () => {
    expect(shortMonthDate('2026-09-12', 'en')).toBe('September 12');
  });
});
