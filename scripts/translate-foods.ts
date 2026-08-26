import fs from 'node:fs'
import path from 'node:path'
import { createOpenAI } from '@ai-sdk/openai'
import { generateObject } from 'ai'
import { z } from 'zod'
import type { FoodSeed, Translation } from './build-foods-seed'

// Genera entradas que faltan en foods-translations.json usando un modelo local (llama-server u Ollama, API compatible con OpenAI).
// Uso: AI_LOCAL_BASE_URL=http://localhost:8080/v1 AI_LOCAL_MODEL=qwen3-8b pnpm tsx scripts/translate-foods.ts
// Las entradas existentes se respetan siempre: la revisión manual manda.

const TranslationSchema = z.object({
  nameEs: z.string().min(2),
  aliases: z.array(z.string()).max(6),
  gramsPerCup: z.number().positive().nullable(),
  gramsPerTbsp: z.number().positive().nullable(),
  gramsPerUnit: z.number().positive().nullable(),
  densityGPerMl: z.number().positive().nullable(),
  allergens: z.array(z.enum(['gluten', 'lactose', 'egg', 'fish', 'shellfish', 'nuts', 'peanut', 'soy', 'sesame', 'celery', 'mustard', 'sulphites', 'lupin', 'mollusc'])),
  seasonalMonths: z.array(z.number().int().min(1).max(12)),
})

async function main(): Promise<void> {
  const seedDir = path.join(process.cwd(), 'db', 'seed')
  const foods = JSON.parse(fs.readFileSync(path.join(seedDir, 'foods.json'), 'utf8')) as FoodSeed[]
  const file = path.join(seedDir, 'foods-translations.json')
  const translations = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, Translation>
  const provider = createOpenAI({ baseURL: process.env.AI_LOCAL_BASE_URL ?? 'http://localhost:8080/v1', apiKey: 'ollama' })
  const model = provider(process.env.AI_LOCAL_MODEL ?? 'qwen3-8b')
  let done = 0
  for (const f of foods) {
    if (translations[f.sourceRef]) continue
    const { object } = await generateObject({
      model,
      schema: TranslationSchema,
      prompt: `Alimento de la base USDA: "${f.nameEn}". Devuelve el nombre en español de España tal como lo escribiría alguien en una receta (singular, sin marca), hasta 6 alias comunes (incluye el inglés corto), gramos por taza y por cucharada si tiene sentido, gramos por unidad si se compra por piezas (una cebolla, un huevo), densidad g/ml solo para líquidos, alérgenos de la lista de 14 de la UE y meses de temporada en España (vacío si no aplica).`,
    })
    translations[f.sourceRef] = object
    done += 1
    fs.writeFileSync(file, JSON.stringify(translations, null, 2) + '\n')
    console.log(`${done}: ${f.nameEn} → ${object.nameEs}`)
  }
}

main()
