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
    ).toEqual({ name: 'Lentejas', quantity: 500, unit: 'g', kcalPer100g: null });
  });
  it('normaliza kg a gramos', () => {
    expect(
      mapOpenFoodFactsProduct({
        status: 1,
        product: { product_name: 'Arroz', product_quantity: 1.5, product_quantity_unit: 'kg' },
      }),
    ).toEqual({ name: 'Arroz', quantity: 1500, unit: 'g', kcalPer100g: null });
  });
  it('normaliza litros a mililitros', () => {
    expect(
      mapOpenFoodFactsProduct({
        status: 1,
        product: { product_name: 'Leche', product_quantity: 1, product_quantity_unit: 'l' },
      }),
    ).toEqual({ name: 'Leche', quantity: 1000, unit: 'ml', kcalPer100g: null });
  });
  it('normaliza centilitros a mililitros', () => {
    expect(
      mapOpenFoodFactsProduct({
        status: 1,
        product: { product_name: 'Refresco', product_quantity: 33, product_quantity_unit: 'cl' },
      }),
    ).toEqual({ name: 'Refresco', quantity: 330, unit: 'ml', kcalPer100g: null });
  });
  it('cae a 1 ud si el unit no se reconoce', () => {
    expect(
      mapOpenFoodFactsProduct({
        status: 1,
        product: { product_name: 'Cosa rara', product_quantity: 4, product_quantity_unit: 'oz' },
      }),
    ).toEqual({ name: 'Cosa rara', quantity: 1, unit: 'ud', kcalPer100g: null });
  });
  it('cae a 1 ud si no hay product_quantity', () => {
    expect(mapOpenFoodFactsProduct({ status: 1, product: { product_name: 'Manzana' } })).toEqual({
      name: 'Manzana',
      quantity: 1,
      unit: 'ud',
      kcalPer100g: null,
    });
  });
  it('lee energy-kcal_100g cuando viene en nutriments', () => {
    expect(
      mapOpenFoodFactsProduct({
        status: 1,
        product: {
          product_name: 'Galletas',
          product_quantity: 200,
          product_quantity_unit: 'g',
          nutriments: { 'energy-kcal_100g': 480 },
        },
      }),
    ).toEqual({ name: 'Galletas', quantity: 200, unit: 'g', kcalPer100g: 480 });
  });
  it('kcalPer100g es null si nutriments no trae el campo o tiene un tipo raro', () => {
    expect(
      mapOpenFoodFactsProduct({
        status: 1,
        product: { product_name: 'Sin datos', nutriments: {} },
      })?.kcalPer100g,
    ).toBeNull();
    expect(
      mapOpenFoodFactsProduct({
        status: 1,
        // @ts-expect-error tipo raro a propósito, para probar el saneo defensivo
        product: { product_name: 'Tipo raro', nutriments: { 'energy-kcal_100g': '480' } },
      })?.kcalPer100g,
    ).toBeNull();
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

// Auditoría run-3 (rezet-app:pantryImport:third-party-product-names-persisted-unbounded-into-mcp-context):
// el nombre viene de un tercero (Open Food Facts, que edita cualquiera, o el
// modelo leyendo una etiqueta) y acaba como nombre de ingrediente del hogar y
// en el contexto del asistente de IA. Se sanea en la frontera.
describe('saneo de nombres externos', () => {
  const off = (productName: string) =>
    mapOpenFoodFactsProduct({ status: 1, product: { product_name: productName, product_quantity: 1, product_quantity_unit: 'l' } });
  const ZWSP = String.fromCharCode(0x200b);
  const RLO = String.fromCharCode(0x202e);
  const BEL = String.fromCharCode(0x07);
  const LRI = String.fromCharCode(0x2066);
  const WJ = String.fromCharCode(0x2060);
  const ZWJ = String.fromCharCode(0x200d);

  it('quita saltos de línea, caracteres invisibles y de control, y junta espacios', () => {
    expect(off(`Leche\n\nentera${ZWSP} ${RLO}oculto${BEL}   fin`)?.name).toBe('Leche entera oculto fin');
    expect(mapGeminiRecognition({ name: `Yogur\r\n\tnatural${LRI}` })?.name).toBe('Yogur natural');
  });

  it('corta los nombres larguísimos a 120 caracteres', () => {
    expect(off('Leche ' + 'x'.repeat(4000))?.name).toHaveLength(120);
    expect(mapGeminiRecognition({ name: 'y'.repeat(500) })?.name).toHaveLength(120);
  });

  it('un nombre que solo tiene caracteres invisibles cuenta como vacío', () => {
    expect(off(`${ZWSP}${ZWJ}\n`)).toBeNull();
    expect(mapGeminiRecognition({ name: `${RLO} ${WJ}` })).toBeNull();
  });
});
