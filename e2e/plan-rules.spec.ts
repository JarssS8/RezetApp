import { expect, test } from '@playwright/test'
import { registerHousehold } from './helpers/session'

// Recorrido completo del autorrelleno sin IA: receta → regla → propuesta →
// la propuesta llega marcada como "de tus reglas" (source='rules').
test('el hogar autorrellena la semana con sus reglas', async ({ page }) => {
  await registerHousehold(page, 'Cris')

  // La regla por defecto que añade el formulario es "sin carne" para todos
  // los días y huecos (day y slot a null en plan-rules-form.tsx): sin ninguna
  // receta vegetariana en el recetario, el autorrelleno no tendría ninguna
  // candidata y proposeWeekFromRules fallaría con 'validation'. Se marca la
  // receta con la etiqueta "Vegetariano" (slugify -> 'vegetariano', uno de
  // VEGETARIAN_TAG_SLUGS) para que la regla la deje pasar.
  await page.goto('/recipes/new')
  await page.getByLabel(/^título|^title/i).fill('Lentejas de la abuela')
  await page.getByLabel(/^etiquetas|^tags/i).fill('Vegetariano')
  await page.getByLabel(/^etiquetas|^tags/i).press('Enter')
  await page.getByLabel(/ingredientes|ingredients/i).fill('300 g de lentejas')
  await page.getByLabel(/^pasos$|^steps$/i).fill('Cuece 40 minutos')
  await page.getByRole('button', { name: /guardar receta|save recipe/i }).click()
  await expect(page).toHaveURL(/\/recipes\/[0-9a-f-]{36}$/)

  // La regla no depende de la receta recién creada (el dominio elige entre
  // todo el recetario del hogar); basta con guardar una regla cualquiera para
  // probar que el autorrelleno funciona sin proveedor de IA. El navegador de
  // e2e negocia su propio idioma (Accept-Language) contra resolveLocale, así
  // que cada texto de interfaz se busca en ambos idiomas.
  await page.goto('/settings/household')
  await page.getByRole('button', { name: /añadir regla|add rule/i }).click()
  await page.getByRole('button', { name: /guardar reglas|save rules/i }).click()
  await expect(page.getByText(/reglas guardadas|rules saved/i)).toBeVisible()

  await page.goto('/today')
  await page.getByRole('button', { name: /autorrellenar semana|autofill week/i }).click()
  await expect(page).toHaveURL(/\/plan\/proposals/)
  await expect(page.getByText(/de tus reglas|from your rules/i)).toBeVisible()
})
