import { offsetKey } from '../domain/dates';
import { asMemberId, asProfileId } from '../types';
import type { Ingredient, Member, PantryItem, PlanEntry, Recipe } from '../types';

/**
 * Datos de arranque de la demo.
 *
 * Al conectar el backend, esto se convierte en el seed del primer hogar. Ojo:
 * aquí los ingredientes ya son entidades con id, y recetas y despensa apuntan a
 * ellos. Cruzar por nombre es un bug esperando ("Tomate" y "tomates" serían dos
 * alimentos distintos).
 */

const ing = (
  id: string,
  es: string,
  en: string,
  group: Ingredient['group'],
  defaultUnit: Ingredient['defaultUnit'],
  sensitive = false,
): Ingredient => ({ id, name: { es, en }, group, defaultUnit, sensitive });

export const INGREDIENTS: Ingredient[] = [
  ing('lentejas', 'Lentejas', 'Lentils', 'seco', 'g'),
  ing('cebolla', 'Cebolla', 'Onion', 'fresco', 'ud'),
  ing('zanahoria', 'Zanahoria', 'Carrot', 'fresco', 'ud'),
  ing('sal', 'Sal', 'Salt', 'seco', 'g', true),
  ing('pollo', 'Pechuga de pollo', 'Chicken breast', 'fresco', 'g'),
  ing('arroz', 'Arroz', 'Rice', 'seco', 'g'),
  ing('limon', 'Limón', 'Lemon', 'fresco', 'ud'),
  ing('garbanzos', 'Garbanzos cocidos', 'Cooked chickpeas', 'conserva', 'g'),
  ing('tomate', 'Tomate', 'Tomato', 'fresco', 'ud'),
  ing('aceite', 'Aceite de oliva', 'Olive oil', 'seco', 'ml'),
  ing('salmon', 'Salmón', 'Salmon', 'fresco', 'g'),
  ing('calabacin', 'Calabacín', 'Courgette', 'fresco', 'ud'),
  ing('patata', 'Patata', 'Potato', 'fresco', 'g'),
  ing('huevo', 'Huevo', 'Egg', 'fresco', 'ud'),
  ing('espinacas', 'Espinacas', 'Spinach', 'fresco', 'g'),
  ing('coco', 'Leche de coco', 'Coconut milk', 'conserva', 'ml'),
  ing('curry', 'Curry en polvo', 'Curry powder', 'seco', 'g', true),
  ing('pasta', 'Pasta', 'Pasta', 'seco', 'g'),
  ing('pesto', 'Pesto', 'Pesto', 'conserva', 'g'),
  ing('yogur', 'Yogur natural', 'Plain yogurt', 'fresco', 'g'),
  ing('avena', 'Avena', 'Oats', 'seco', 'g'),
  ing('frutos', 'Frutos rojos', 'Berries', 'fresco', 'g'),
];

export const RECIPES: Recipe[] = [
  {
    id: 'r1',
    name: { es: 'Lentejas con verduras', en: 'Lentils with vegetables' },
    photoUrl: 'https://commons.wikimedia.org/wiki/Special:FilePath/Catalan_lentil_soup.JPG?width=800',
    description: { es: 'Guiso sencillo que aguanta toda la semana.', en: 'A simple stew that keeps all week.' },
    baseServings: 2,
    minutes: 35,
    difficulty: 'easy',
    kcalPerServing: 552,
    tags: ['dieta', 'batch'],
    cookedCount: 0,
    ingredients: [
      { ingredientId: 'lentejas', quantity: 300, unit: 'g' },
      { ingredientId: 'cebolla', quantity: 1, unit: 'ud' },
      { ingredientId: 'zanahoria', quantity: 2, unit: 'ud' },
      { ingredientId: 'sal', quantity: 2, unit: 'g' },
    ],
    steps: [
      { text: { es: 'Sofríe la cebolla y la zanahoria a fuego medio.', en: 'Fry the onion and carrot over medium heat.' }, timerMinutes: 6 },
      { text: { es: 'Añade las lentejas y cubre con agua.', en: 'Add the lentils and cover with water.' } },
      { text: { es: 'Cuece 25 minutos hasta que estén tiernas.', en: 'Simmer 25 minutes until tender.' }, timerMinutes: 25 },
    ],
  },
  {
    id: 'r2',
    name: { es: 'Pollo al limón con arroz', en: 'Lemon chicken with rice' },
    photoUrl: 'https://commons.wikimedia.org/wiki/Special:FilePath/Lemonchicken.jpg?width=800',
    description: { es: 'Cena rápida de sartén, lista en 25 minutos.', en: 'Quick pan dinner, ready in 25 minutes.' },
    baseServings: 2,
    minutes: 25,
    difficulty: 'easy',
    kcalPerServing: 610,
    tags: ['rápido'],
    cookedCount: 0,
    ingredients: [
      { ingredientId: 'pollo', quantity: 400, unit: 'g' },
      { ingredientId: 'arroz', quantity: 200, unit: 'g' },
      { ingredientId: 'limon', quantity: 1, unit: 'ud' },
      { ingredientId: 'sal', quantity: 3, unit: 'g' },
    ],
    steps: [
      { text: { es: 'Cuece el arroz con sal.', en: 'Cook the rice with salt.' }, timerMinutes: 15 },
      { text: { es: 'Dora el pollo troceado 8 minutos.', en: 'Brown the diced chicken for 8 minutes.' }, timerMinutes: 8 },
      { text: { es: 'Añade el zumo de limón y mezcla con el arroz.', en: 'Add the lemon juice and toss with the rice.' } },
    ],
  },
  {
    id: 'r3',
    name: { es: 'Ensalada de garbanzos', en: 'Chickpea salad' },
    photoUrl: 'https://commons.wikimedia.org/wiki/Special:FilePath/Colorful_healthy_Chickpea_Salad_-_49859083608.jpg?width=800',
    description: { es: 'Fría, para llevar en tartera.', en: 'Cold, good for a lunchbox.' },
    baseServings: 2,
    minutes: 10,
    difficulty: 'easy',
    kcalPerServing: 430,
    tags: ['rápido', 'tartera'],
    cookedCount: 0,
    ingredients: [
      { ingredientId: 'garbanzos', quantity: 400, unit: 'g' },
      { ingredientId: 'tomate', quantity: 2, unit: 'ud' },
      { ingredientId: 'aceite', quantity: 20, unit: 'ml' },
      { ingredientId: 'sal', quantity: 2, unit: 'g' },
    ],
    steps: [
      { text: { es: 'Enjuaga los garbanzos y escúrrelos bien.', en: 'Rinse and drain the chickpeas well.' } },
      { text: { es: 'Trocea el tomate y mezcla todo con el aceite.', en: 'Dice the tomato and toss everything with the oil.' } },
    ],
  },
  {
    id: 'r4',
    name: { es: 'Salmón al horno', en: 'Baked salmon' },
    photoUrl: 'https://commons.wikimedia.org/wiki/Special:FilePath/Grilled_Salmon_(14745629127).jpg?width=800',
    description: { es: 'Bandeja única con verduras de temporada.', en: 'One tray with seasonal vegetables.' },
    baseServings: 2,
    minutes: 30,
    difficulty: 'medium',
    kcalPerServing: 580,
    tags: ['dieta'],
    cookedCount: 0,
    ingredients: [
      { ingredientId: 'salmon', quantity: 400, unit: 'g' },
      { ingredientId: 'calabacin', quantity: 1, unit: 'ud' },
      { ingredientId: 'patata', quantity: 450, unit: 'g' },
      { ingredientId: 'sal', quantity: 3, unit: 'g' },
    ],
    steps: [
      { text: { es: 'Precalienta el horno a 200°.', en: 'Preheat the oven to 200°C.' }, timerMinutes: 10 },
      { text: { es: 'Corta las verduras y ponlas en la bandeja.', en: 'Cut the vegetables and spread them on the tray.' } },
      { text: { es: 'Hornea el salmón sobre las verduras 18 minutos.', en: 'Bake the salmon over the vegetables for 18 minutes.' }, timerMinutes: 18 },
    ],
  },
  {
    id: 'r5',
    name: { es: 'Tortilla de patatas', en: 'Potato omelette' },
    photoUrl: 'https://commons.wikimedia.org/wiki/Special:FilePath/Tortilla_de_patatas.jpg?width=800',
    description: { es: 'La de siempre, con cebolla.', en: 'The classic one, with onion.' },
    baseServings: 4,
    minutes: 40,
    difficulty: 'medium',
    kcalPerServing: 495,
    tags: ['batch'],
    cookedCount: 0,
    ingredients: [
      { ingredientId: 'patata', quantity: 800, unit: 'g' },
      { ingredientId: 'huevo', quantity: 6, unit: 'ud' },
      { ingredientId: 'cebolla', quantity: 1, unit: 'ud' },
      { ingredientId: 'aceite', quantity: 80, unit: 'ml' },
      { ingredientId: 'sal', quantity: 5, unit: 'g' },
    ],
    steps: [
      { text: { es: 'Fríe la patata en láminas a fuego suave.', en: 'Fry the sliced potato over low heat.' }, timerMinutes: 20 },
      { text: { es: 'Bate los huevos y mézclalos con la patata.', en: 'Beat the eggs and mix them with the potato.' } },
      { text: { es: 'Cuaja la tortilla 4 minutos por cada lado.', en: 'Set the omelette 4 minutes per side.' }, timerMinutes: 8 },
    ],
  },
  {
    id: 'r6',
    name: { es: 'Curry de garbanzos y espinacas', en: 'Chickpea and spinach curry' },
    photoUrl: 'https://commons.wikimedia.org/wiki/Special:FilePath/Spinach-Chickpea_Curry_(3117324894).jpg?width=800',
    description: { es: 'Especiado, de una sola olla.', en: 'Spiced, one pot.' },
    baseServings: 3,
    minutes: 28,
    difficulty: 'easy',
    kcalPerServing: 520,
    tags: ['dieta', 'batch'],
    cookedCount: 0,
    ingredients: [
      { ingredientId: 'garbanzos', quantity: 500, unit: 'g' },
      { ingredientId: 'espinacas', quantity: 200, unit: 'g' },
      { ingredientId: 'coco', quantity: 200, unit: 'ml' },
      { ingredientId: 'curry', quantity: 8, unit: 'g' },
    ],
    steps: [
      { text: { es: 'Tuesta el curry 30 segundos en la olla.', en: 'Toast the curry powder for 30 seconds in the pot.' } },
      { text: { es: 'Añade garbanzos y leche de coco, y cuece 15 minutos.', en: 'Add chickpeas and coconut milk, simmer 15 minutes.' }, timerMinutes: 15 },
      { text: { es: 'Incorpora las espinacas al final.', en: 'Stir in the spinach at the end.' }, timerMinutes: 3 },
    ],
  },
  {
    id: 'r7',
    name: { es: 'Pasta al pesto', en: 'Pesto pasta' },
    photoUrl: 'https://commons.wikimedia.org/wiki/Special:FilePath/Pesto_pasta.jpg?width=800',
    description: { es: 'Quince minutos de principio a fin.', en: 'Fifteen minutes start to finish.' },
    baseServings: 2,
    minutes: 15,
    difficulty: 'easy',
    kcalPerServing: 640,
    tags: ['rápido'],
    cookedCount: 0,
    ingredients: [
      { ingredientId: 'pasta', quantity: 200, unit: 'g' },
      { ingredientId: 'pesto', quantity: 80, unit: 'g' },
      { ingredientId: 'tomate', quantity: 1, unit: 'ud' },
      { ingredientId: 'sal', quantity: 6, unit: 'g' },
    ],
    steps: [
      { text: { es: 'Cuece la pasta en agua con sal.', en: 'Boil the pasta in salted water.' }, timerMinutes: 10 },
      { text: { es: 'Mezcla con el pesto y el tomate troceado.', en: 'Toss with the pesto and diced tomato.' } },
    ],
  },
  {
    id: 'r8',
    name: { es: 'Yogur con avena y frutos rojos', en: 'Yogurt with oats and berries' },
    photoUrl: 'https://commons.wikimedia.org/wiki/Special:FilePath/Yogurt_fruit_bowl.jpg?width=800',
    description: { es: 'Desayuno de dos minutos.', en: 'A two minute breakfast.' },
    baseServings: 1,
    minutes: 5,
    difficulty: 'easy',
    kcalPerServing: 320,
    tags: ['rápido'],
    cookedCount: 0,
    ingredients: [
      { ingredientId: 'yogur', quantity: 200, unit: 'g' },
      { ingredientId: 'avena', quantity: 40, unit: 'g' },
      { ingredientId: 'frutos', quantity: 80, unit: 'g' },
    ],
    steps: [
      { text: { es: 'Mezcla el yogur con la avena.', en: 'Mix the yogurt with the oats.' } },
      { text: { es: 'Corona con los frutos rojos.', en: 'Top with the berries.' } },
    ],
  },
];

export const PANTRY: PantryItem[] = [
  { id: 'p1', ingredientId: 'lentejas', quantity: 1000, unit: 'g', location: 'cupboard', expiresInDays: null },
  { id: 'p2', ingredientId: 'arroz', quantity: 2000, unit: 'g', location: 'cupboard', expiresInDays: null },
  { id: 'p3', ingredientId: 'cebolla', quantity: 4, unit: 'ud', location: 'cupboard', expiresInDays: null },
  { id: 'p4', ingredientId: 'zanahoria', quantity: 6, unit: 'ud', location: 'fridge', expiresInDays: 5 },
  { id: 'p5', ingredientId: 'sal', quantity: 500, unit: 'g', location: 'cupboard', expiresInDays: null },
  { id: 'p6', ingredientId: 'aceite', quantity: 750, unit: 'ml', location: 'cupboard', expiresInDays: null },
  { id: 'p7', ingredientId: 'huevo', quantity: 12, unit: 'ud', location: 'fridge', expiresInDays: 9 },
  { id: 'p8', ingredientId: 'patata', quantity: 2000, unit: 'g', location: 'cupboard', expiresInDays: null },
  { id: 'p9', ingredientId: 'garbanzos', quantity: 800, unit: 'g', location: 'cupboard', expiresInDays: null },
  { id: 'p10', ingredientId: 'tomate', quantity: 4, unit: 'ud', location: 'fridge', expiresInDays: 3 },
  { id: 'p11', ingredientId: 'yogur', quantity: 500, unit: 'g', location: 'fridge', expiresInDays: 2 },
  { id: 'p12', ingredientId: 'avena', quantity: 900, unit: 'g', location: 'cupboard', expiresInDays: null },
  { id: 'p13', ingredientId: 'pasta', quantity: 500, unit: 'g', location: 'cupboard', expiresInDays: null },
];

let n = 0;
const entry = (
  dayOffset: number,
  slot: PlanEntry['slot'],
  recipeId: string,
  servings: number,
  cooked = false,
): PlanEntry => ({ id: `seed${++n}`, date: offsetKey(dayOffset), slot, recipeId, servings, cooked });

export const PLAN: PlanEntry[] = [
  entry(0, 'breakfast', 'r8', 1, true),
  entry(0, 'lunch', 'r1', 4),
  entry(0, 'dinner', 'r7', 2),
  entry(1, 'lunch', 'r2', 2),
  entry(1, 'dinner', 'r3', 2),
  entry(2, 'lunch', 'r6', 3),
  entry(2, 'dinner', 'r5', 4),
  entry(3, 'lunch', 'r1', 2),
  entry(4, 'dinner', 'r4', 2),
  entry(-1, 'lunch', 'r5', 4, true),
  entry(-1, 'dinner', 'r3', 2, true),
];

export const KCAL_TARGET = 2100;

/** Tres miembros para que la demo enseñe de qué va la personalización. */
export const MEMBERS: Member[] = [
  { id: asMemberId('demo-ana'), authUserId: asProfileId('demo-user'), isWard: false,
    displayName: 'Ana', avatarPath: null, color: 'green', sortOrder: 0, kcalTarget: 2000, deletedAt: null },
  { id: asMemberId('demo-jars'), authUserId: null, isWard: false,
    displayName: 'Jars', avatarPath: null, color: 'blue', sortOrder: 1, kcalTarget: 2500, deletedAt: null },
  { id: asMemberId('demo-nico'), authUserId: null, isWard: true,
    displayName: 'Nico', avatarPath: null, color: 'amber', sortOrder: 2, kcalTarget: 1600, deletedAt: null },
];
