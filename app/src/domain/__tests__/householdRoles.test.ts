import { describe, expect, it } from 'vitest';
import { memberActions } from '../householdRoles';

// Espejo en cliente de las reglas de promote_admin / demote_admin / remove_member
// (20260919100100_rezet_remove_member_demote_admin.sql): decide qué botones ve
// cada fila de "Tu hogar". El servidor sigue siendo quien decide de verdad.
describe('memberActions', () => {
  it('un admin puede ascender o quitar a un miembro que no es admin', () => {
    expect(memberActions({ viewerIsAdmin: true, isSelf: false, memberIsAdmin: false })).toEqual({
      promote: true,
      demote: false,
      remove: true,
    });
  });

  it('un admin solo puede quitarle el rol a otro admin, no expulsarlo directamente', () => {
    expect(memberActions({ viewerIsAdmin: true, isSelf: false, memberIsAdmin: true })).toEqual({
      promote: false,
      demote: true,
      remove: false,
    });
  });

  it('nadie gestiona su propia fila desde aquí (para eso está Salir del hogar)', () => {
    expect(memberActions({ viewerIsAdmin: true, isSelf: true, memberIsAdmin: true })).toEqual({
      promote: false,
      demote: false,
      remove: false,
    });
  });

  it('quien no es admin no ve ninguna acción', () => {
    expect(memberActions({ viewerIsAdmin: false, isSelf: false, memberIsAdmin: false })).toEqual({
      promote: false,
      demote: false,
      remove: false,
    });
  });
});
