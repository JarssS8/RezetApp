/**
 * Copy for the relay's own HTML pages, in the two languages the app ships (`app/src/i18n`).
 *
 * The browser doing the OAuth dance is the user's, not the AI client's, so `Accept-Language` is
 * the only signal available here: the Supabase session (and with it `profile.locale`) doesn't
 * exist until after the consent page has already been rendered and signed in through.
 */

export type Locale = 'es' | 'en';

const SUPPORTED: Locale[] = ['es', 'en'];

/**
 * Picks the best of the two languages we serve from an `Accept-Language` header, honouring
 * q-values rather than header order. Spanish is the fallback — it is the app's default locale.
 */
export function pickLocale(header: string | null | undefined): Locale {
  if (!header) return 'es';
  let best: { locale: Locale; q: number } | undefined;
  for (const part of header.split(',')) {
    const [tagRaw, ...params] = part.split(';');
    const tag = (tagRaw ?? '').trim().toLowerCase();
    if (!tag) continue;
    const base = tag.split('-')[0];
    const locale = SUPPORTED.find((l) => l === base);
    if (!locale) continue;
    const qParam = params.map((p) => p.trim()).find((p) => p.startsWith('q='));
    const q = qParam ? Number.parseFloat(qParam.slice(2)) : 1;
    if (!Number.isFinite(q) || q <= 0) continue;
    if (!best || q > best.q) best = { locale, q };
  }
  return best?.locale ?? 'es';
}

type Copy = {
  htmlLang: string;
  consentTitle: string;
  tagline: string;
  /** `{client}` is replaced with the OAuth client's display name. */
  heading: string;
  scope: string;
  redirectsTo: string;
  unverified: string;
  continueGoogle: string;
  continueApple: string;
  cancel: string;
  noHouseholdTitle: string;
  /** `{app}` is replaced with a link to the app. */
  noHouseholdBody: string;
  errorInvalidRequest: string;
  errorSignInFailed: string;
};

export const COPY: Record<Locale, Copy> = {
  es: {
    htmlLang: 'es',
    consentTitle: 'Conectar con Rezet',
    tagline: 'Planifica, cocina y controla tu despensa sin esfuerzo.',
    heading: '{client} quiere acceder a tu hogar de Rezet',
    scope:
      'Podrá leer y cambiar las recetas, el plan semanal, la despensa y la lista de la compra de tu hogar en tu nombre.',
    redirectsTo: 'Te llevará a',
    unverified:
      'Este cliente no está verificado: cualquiera puede registrar uno con el nombre que quiera. Continúa solo si reconoces esta dirección:',
    continueGoogle: 'Continuar con Google',
    continueApple: 'Continuar con Apple',
    cancel: 'Cancelar',
    noHouseholdTitle: 'Todavía no tienes un hogar en Rezet',
    noHouseholdBody:
      'Has iniciado sesión, pero esta cuenta no tiene ningún hogar. Abre {app}, entra con la misma cuenta, crea un hogar o únete con un código de invitación, y vuelve a conectar desde tu cliente de IA.',
    errorInvalidRequest: 'Solicitud de autorización no válida',
    errorSignInFailed: 'No se pudo iniciar sesión',
  },
  en: {
    htmlLang: 'en',
    consentTitle: 'Connect to Rezet',
    tagline: 'Plan, cook and keep your pantry straight, effortlessly.',
    heading: '{client} wants access to your Rezet household',
    scope:
      "It will be able to read and change your household's recipes, weekly plan, pantry and shopping list as you.",
    redirectsTo: 'It will redirect to',
    unverified:
      'This client is not verified: anyone can register one under any name. Continue only if you recognise this address:',
    continueGoogle: 'Continue with Google',
    continueApple: 'Continue with Apple',
    cancel: 'Cancel',
    noHouseholdTitle: "You don't have a Rezet household yet",
    noHouseholdBody:
      'You are signed in, but this account has no household. Open {app}, sign in with the same account, create or join a household, then connect again from your AI client.',
    errorInvalidRequest: 'Invalid authorization request',
    errorSignInFailed: 'Sign-in failed',
  },
};
