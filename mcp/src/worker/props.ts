export interface RezetProps {
  v: 1;
  userId: string;
  householdId: string;
  locale: 'es' | 'en';
  provider: 'google' | 'apple';
  sb: { accessToken: string; refreshToken: string; expiresAt: number };
}

export function isRezetProps(p: unknown): p is RezetProps {
  if (typeof p !== 'object' || p === null) return false;
  const o = p as Record<string, unknown>;
  if (o.v !== 1) return false;
  if (typeof o.userId !== 'string') return false;
  if (typeof o.householdId !== 'string') return false;
  if (o.locale !== 'es' && o.locale !== 'en') return false;
  if (o.provider !== 'google' && o.provider !== 'apple') return false;
  if (typeof o.sb !== 'object' || o.sb === null) return false;
  const sb = o.sb as Record<string, unknown>;
  if (typeof sb.accessToken !== 'string') return false;
  if (typeof sb.refreshToken !== 'string') return false;
  if (typeof sb.expiresAt !== 'number') return false;
  return true;
}
