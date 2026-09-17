import { describe, expect, it } from 'vitest';
import { extractKomprappToken } from '../komprappToken';

describe('extractKomprappToken', () => {
  it('extrae el token de un enlace completo con hash /#/s/<token>', () => {
    expect(extractKomprappToken('https://shop.jarsss8.es/#/s/abc-def-ghi')).toBe('abc-def-ghi');
  });

  it('extrae el token de un enlace con /shared/<token>', () => {
    expect(extractKomprappToken('https://shop.jarsss8.es/shared/xyz-123-456')).toBe('xyz-123-456');
  });

  it('acepta un token pelado, sin URL alrededor', () => {
    expect(extractKomprappToken('abc-def-ghi')).toBe('abc-def-ghi');
  });

  it('normaliza a minúsculas', () => {
    expect(extractKomprappToken('ABC-DEF-GHI')).toBe('abc-def-ghi');
  });

  it('recorta espacios en los extremos', () => {
    expect(extractKomprappToken('  abc-def-ghi  ')).toBe('abc-def-ghi');
  });

  it('devuelve cadena vacía si la entrada está vacía o es solo espacios', () => {
    expect(extractKomprappToken('')).toBe('');
    expect(extractKomprappToken('   ')).toBe('');
  });
});
