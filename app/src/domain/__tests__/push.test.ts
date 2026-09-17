import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { isAllowedPushEndpoint } from '../push';

const VALIDOS = [
  'https://fcm.googleapis.com/fcm/send/abc',
  'https://updates.push.services.mozilla.com/wpush/v2/abc',
  'https://xyz.notify.windows.com/w/?token=abc',
  'https://web.push.apple.com/abc',
];

const INVALIDOS = [
  'https://attacker.example/beacon',
  'http://169.254.169.254/latest/meta-data',
  'http://fcm.googleapis.com/fcm/send/abc',
  'no es una url',
  'https://evil-fcm.googleapis.com.attacker.example/x',
  'https://notfcm.googleapis.com/x',
];

describe('isAllowedPushEndpoint', () => {
  it('acepta los servicios de push reales', () => {
    for (const ok of VALIDOS) expect(isAllowedPushEndpoint(ok)).toBe(true);
  });

  it('rechaza cualquier otro host, http y hosts que solo terminan parecido', () => {
    for (const bad of INVALIDOS) expect(isAllowedPushEndpoint(bad)).toBe(false);
  });

  it('el CHECK de la migración acepta y rechaza exactamente lo mismo', () => {
    const sql = readFileSync(
      new URL('../../../supabase/migrations/20260917220300_rezet_push_endpoint_allowlist.sql', import.meta.url),
      'utf8',
    );
    const match = sql.match(/check \(endpoint ~ '([^']+)'\)/);
    expect(match).not.toBeNull();
    const re = new RegExp(match![1]!);
    for (const ok of VALIDOS) expect(re.test(ok)).toBe(true);
    for (const bad of INVALIDOS) expect(re.test(bad)).toBe(false);
  });
});
