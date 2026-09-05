import { describe, expect, it } from 'vitest';
import { mapGeminiRecognition, mapOpenFoodFactsProduct } from '../pantryImport';

describe('mapOpenFoodFactsProduct', () => {
  it('devuelve null si status no es 1', () => {
    expect(mapOpenFoodFactsProduct({ status: 0 })).toBeNull();
  });
  it('devuelve null si no hay product_name', () => {
    expect(mapOpenFoodFactsProduct({ status: 1, product: {} })).toBeNull();
  });
  it('mapea gramos directo', () => {
    expect(
      mapOpenFoodFactsProduct({
        status: 1,
        product: { product_name: 'Lentejas', product_quantity: 500, product_quantity_unit: 'g' },
      }),
    ).toEqual({ name: 'Lentejas', quantity: 500, unit: 'g' });
  });
  it('normaliza kg a gramos', () => {
    expect(
      mapOpenFoodFactsProduct({
        status: 1,
        product: { product_name: 'Arroz', product_quantity: 1.5, product_quantity_unit: 'kg' },
      }),
    ).toEqual({ name: 'Arroz', quantity: 1500, unit: 'g' });
  });
  it('normaliza litros a mililitros', () => {
    expect(
      mapOpenFoodFactsProduct({
        status: 1,
        product: { product_name: 'Leche', product_quantity: 1, product_quantity_unit: 'l' },
      }),
    ).toEqual({ name: 'Leche', quantity: 1000, unit: 'ml' });
  });
  it('normaliza centilitros a mililitros', () => {
    expect(
      mapOpenFoodFactsProduct({
        status: 1,
        product: { product_name: 'Refresco', product_quantity: 33, product_quantity_unit: 'cl' },
      }),
    ).toEqual({ name: 'Refresco', quantity: 330, unit: 'ml' });
  });
  it('cae a 1 ud si el unit no se reconoce', () => {
    expect(
      mapOpenFoodFactsProduct({
        status: 1,
        product: { product_name: 'Cosa rara', product_quantity: 4, product_quantity_unit: 'oz' },
      }),
    ).toEqual({ name: 'Cosa rara', quantity: 1, unit: 'ud' });
  });
  it('cae a 1 ud si no hay product_quantity', () => {
    expect(mapOpenFoodFactsProduct({ status: 1, product: { product_name: 'Manzana' } })).toEqual({
      name: 'Manzana',
      quantity: 1,
      unit: 'ud',
    });
  });
});

describe('mapGeminiRecognition', () => {
  it('devuelve null si no es un objeto', () => {
    expect(mapGeminiRecognition('no')).toBeNull();
    expect(mapGeminiRecognition(null)).toBeNull();
    expect(mapGeminiRecognition([1, 2])).toBeNull();
  });
  it('devuelve null si no hay name', () => {
    expect(mapGeminiRecognition({ quantity: 500, unit: 'g', expiresOn: null })).toBeNull();
  });
  it('mapea un resultado completo válido', () => {
    expect(
      mapGeminiRecognition({ name: 'Yogur natural', quantity: 4, unit: 'ud', expiresOn: '2026-09-20' }),
    ).toEqual({ name: 'Yogur natural', quantity: 4, unit: 'ud', expiresOn: '2026-09-20' });
  });
  it('ignora quantity con tipo incorrecto', () => {
    expect(
      mapGeminiRecognition({ name: 'Leche', quantity: '500', unit: 'ml', expiresOn: null }),
    ).toEqual({ name: 'Leche', quantity: null, unit: 'ml', expiresOn: null });
  });
  it('ignora unit fuera de g/ml/ud', () => {
    expect(
      mapGeminiRecognition({ name: 'Leche', quantity: 1, unit: 'kg', expiresOn: null }),
    ).toEqual({ name: 'Leche', quantity: 1, unit: null, expiresOn: null });
  });
  it('ignora expiresOn con formato incorrecto', () => {
    expect(
      mapGeminiRecognition({ name: 'Leche', quantity: 1, unit: 'ud', expiresOn: '20/09/2026' }),
    ).toEqual({ name: 'Leche', quantity: 1, unit: 'ud', expiresOn: null });
  });
});
