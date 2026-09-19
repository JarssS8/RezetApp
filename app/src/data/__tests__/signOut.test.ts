import { describe, expect, it } from 'vitest';
import { performSignOut, type SignOutDeps } from '../signOut';

function fakeDeps(overrides: Partial<SignOutDeps> = {}) {
  const calls: string[] = [];
  const deps: SignOutDeps = {
    unsubscribePush: async () => {
      calls.push('push');
    },
    clearDeviceState: () => {
      calls.push('storage');
    },
    authSignOut: async (scope) => {
      calls.push(`auth:${scope}`);
    },
    ...overrides,
  };
  return { deps, calls };
}

describe('performSignOut', () => {
  it('cierra solo esta sesión por defecto', async () => {
    const { deps, calls } = fakeDeps();
    await performSignOut(deps, 'local');
    expect(calls).toEqual(['push', 'storage', 'auth:local']);
  });

  // Auditoría run-3 (app/src/data/auth:signOut-local-scope-leaves-mcp-grants-and-other-sessions-unrevocable):
  // la única forma de revocar un asistente IA conectado o un dispositivo prestado
  // es invalidar todas las sesiones de la cuenta en GoTrue.
  it('cierra todas las sesiones de la cuenta cuando se pide en todos los dispositivos', async () => {
    const { deps, calls } = fakeDeps();
    await performSignOut(deps, 'global');
    expect(calls).toEqual(['push', 'storage', 'auth:global']);
  });

  it('un fallo del push o del almacenamiento no impide cerrar sesión', async () => {
    const { deps, calls } = fakeDeps({
      unsubscribePush: async () => {
        throw new Error('sin service worker');
      },
      clearDeviceState: () => {
        throw new Error('storage bloqueado');
      },
    });
    await performSignOut(deps, 'global');
    expect(calls).toEqual(['auth:global']);
  });

  it('un push que nunca termina no bloquea el cierre de sesión', async () => {
    const { deps, calls } = fakeDeps({ unsubscribePush: () => new Promise(() => {}) });
    await performSignOut(deps, 'local', 10);
    expect(calls).toEqual(['storage', 'auth:local']);
  });
});
