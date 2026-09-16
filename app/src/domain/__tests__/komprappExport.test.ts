import { describe, expect, it } from 'vitest';
import { buildKomprappImportUrl, KOMPRAPP_BASE_URL, toKomprappItem } from '../komprappExport';

describe('toKomprappItem', () => {
  it('mapea gramos y mililitros redondeando hacia arriba (nunca comprar de menos)', () => {
    expect(toKomprappItem({ name: 'Tomate', quantity: 500, unit: 'g' })).toEqual({
      name: 'Tomate',
      quantity: 500,
      unit: 'g',
    });
    expect(toKomprappItem({ name: 'Leche', quantity: 200, unit: 'ml' })).toEqual({
      name: 'Leche',
      quantity: 200,
      unit: 'ml',
    });
    // shoppingNeeds() no redondea el gap (escalado con exponente 0.55 +
    // resta de despensa) — 333.3 g debe llegar a komprapp como 334, no 333.
    expect(toKomprappItem({ name: 'Harina', quantity: 333.3, unit: 'g' })).toEqual({
      name: 'Harina',
      quantity: 334,
      unit: 'g',
    });
  });

  it('mapea unidad suelta (ud) a paq redondeando hacia arriba', () => {
    expect(toKomprappItem({ name: 'Huevos', quantity: 6, unit: 'ud' })).toEqual({
      name: 'Huevos',
      quantity: 6,
      unit: 'paq',
    });
    // 0.7 ud sin redondear llegaría a komprapp como 0 (su normalizeQty hace
    // Math.floor y convierte <=0 en cadena vacía) — el item desaparecería
    // en silencio. Redondeado hacia arriba a 1 antes de mandarlo.
    expect(toKomprappItem({ name: 'Aguacate', quantity: 0.7, unit: 'ud' })).toEqual({
      name: 'Aguacate',
      quantity: 1,
      unit: 'paq',
    });
  });

  it('funde tbsp en el nombre porque komprapp no tiene esa unidad, redondeado hacia arriba', () => {
    expect(toKomprappItem({ name: 'Sal', quantity: 2, unit: 'tbsp' })).toEqual({
      name: 'Sal (2 cucharadas)',
      quantity: null,
      unit: null,
    });
    expect(toKomprappItem({ name: 'Aceite', quantity: 1.4, unit: 'tbsp' })).toEqual({
      name: 'Aceite (2 cucharadas)',
      quantity: null,
      unit: null,
    });
  });

  it('usa singular "cucharada" cuando la cantidad redondeada es 1', () => {
    expect(toKomprappItem({ name: 'Aceite', quantity: 1, unit: 'tbsp' })).toEqual({
      name: 'Aceite (1 cucharada)',
      quantity: null,
      unit: null,
    });
  });
});

describe('buildKomprappImportUrl', () => {
  it('construye una URL con el payload en base64url bajo /#/import/', () => {
    const url = buildKomprappImportUrl([{ name: 'Tomate', quantity: 500, unit: 'g' }], KOMPRAPP_BASE_URL);
    expect(url.startsWith(`${KOMPRAPP_BASE_URL}/#/import/`)).toBe(true);
    const payload = url.split('/#/import/')[1];
    // base64url: sin '+', '/' ni '=' de relleno
    expect(payload).not.toMatch(/[+/=]/);
    const json = JSON.parse(
      Buffer.from(payload!.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'),
    );
    expect(json).toEqual({ v: 1, items: [{ name: 'Tomate', quantity: 500, unit: 'g' }] });
  });

  // Fixture dorado: el mismo objeto y el mismo base64url están hardcodeados
  // también en el test de `import-core.js` (komprapp, Task 3). Si algún día
  // cambia el formato del payload en un lado y no en el otro, este test (o
  // su gemelo del otro repo) lo detecta.
  it('produce exactamente el payload del fixture dorado compartido con komprapp', () => {
    const url = buildKomprappImportUrl([{ name: 'Piña', quantity: 1, unit: 'ud' }], KOMPRAPP_BASE_URL);
    const payload = url.split('/#/import/')[1];
    expect(payload).toBe('eyJ2IjoxLCJpdGVtcyI6W3sibmFtZSI6IlBpw7FhIiwicXVhbnRpdHkiOjEsInVuaXQiOiJwYXEifV19');
  });

  it('soporta nombres con acentos/eñes sin corromper el UTF-8', () => {
    const url = buildKomprappImportUrl([{ name: 'Piña colada', quantity: 1, unit: 'ud' }], KOMPRAPP_BASE_URL);
    const payload = url.split('/#/import/')[1];
    const json = JSON.parse(
      Buffer.from(payload!.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'),
    );
    expect(json.items[0].name).toBe('Piña colada');
  });
});
