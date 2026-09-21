/**
 * Claves de TanStack Query, en un solo sitio. Están aquí y no repartidas por
 * los hooks porque las invalidaciones cruzan dominios (cocinar toca despensa
 * y plan), y una clave mal escrita falla en silencio: la query no se
 * refresca y nadie se entera.
 */
export const storeKeys = {
  ingredients: (householdId: string) => ['ingredients', householdId] as const,
  recipes: (householdId: string) => ['recipes', householdId] as const,
  pantry: (householdId: string) => ['pantry', householdId] as const,
  plan: (householdId: string) => ['plan', householdId] as const,
  shopping: (householdId: string) => ['shopping', householdId] as const,
  household: (householdId: string) => ['household', householdId] as const,
  householdMembers: (householdId: string) => ['householdMembers', householdId] as const,
  members: (householdId: string) => ['members', householdId] as const,
  body: (householdId: string) => ['memberBody', householdId] as const,
  intakeShares: (householdId: string) => ['intakeShares', householdId] as const,
  intakeExtras: (householdId: string) => ['intakeExtras', householdId] as const,
  notifyPref: (householdId: string) => ['notifyPref', householdId] as const,
};
