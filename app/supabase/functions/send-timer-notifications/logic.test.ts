import { describe, expect, it } from 'vitest';
import { cronAuthStatus } from './logic.ts';

// Auditoría run-3 (send-timer-notifications:fails-open-without-cron-secret):
// sin TIMER_CRON_SECRET la función aceptaba a cualquiera con la publishable
// key, que viaja en el bundle del cliente.
describe('cronAuthStatus', () => {
  it('sin secreto configurado rechaza todo con 503', () => {
    expect(cronAuthStatus(undefined, null)).toBe(503);
    expect(cronAuthStatus('', '')).toBe(503);
  });
  it('con secreto, rechaza la cabecera ausente o distinta con 401', () => {
    expect(cronAuthStatus('s3cret', null)).toBe(401);
    expect(cronAuthStatus('s3cret', 's3cre')).toBe(401);
    expect(cronAuthStatus('s3cret', 's3cret ')).toBe(401);
    expect(cronAuthStatus('s3cret', 'S3CRET')).toBe(401);
  });
  it('con la cabecera correcta deja pasar', () => {
    expect(cronAuthStatus('s3cret', 's3cret')).toBeNull();
  });
});
