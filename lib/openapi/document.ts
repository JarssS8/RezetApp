// El documento se escribe a mano y REUSA los esquemas zod de lib/validation: un
// OpenAPI generado por reflexión sobre app/api no sabría qué scope pide cada
// método, que es la mitad de lo que un cliente necesita saber. Lo que nunca se
// escribe a mano son los esquemas: si cambia LogCookedSchema, cambia el doc.
import { createDocument } from 'zod-openapi'
import { z } from 'zod'
import { APP_VERSION } from '@/lib/app-version'
import { LogCookedSchema } from '@/lib/validation/cooking'
import { DateRangeSchema, ErrorBodySchema, IdSchema } from '@/lib/validation/common'
import { FoodSearchSchema } from '@/lib/validation/foods'
import { MemberUpdateSchema } from '@/lib/validation/household'
import { PantryAdjustSchema, PantryItemInputSchema, PantryQuerySchema } from '@/lib/validation/pantry'
import { PlanBatchSchema, PlanEntryMoveSchema, PlanEntryPatchSchema, ProposalDecisionSchema, ProposalPayloadSchema } from '@/lib/validation/plan'
import { RecipeGetQuerySchema, RecipeImportSchema, RecipeInputSchema, RecipeSearchSchema } from '@/lib/validation/recipes'
import { ShoppingGenerateSchema, ShoppingPushSchema } from '@/lib/validation/shopping'

const json = (schema: z.ZodType) => ({ content: { 'application/json': { schema } } })
const errors = {
  '400': { description: 'Datos inválidos', ...json(ErrorBodySchema) },
  '401': { description: 'Sin token o token inválido', ...json(ErrorBodySchema) },
  '403': { description: 'Al token le faltan permisos', ...json(ErrorBodySchema) },
  '404': { description: 'No encontrado', ...json(ErrorBodySchema) },
}
const sec = (...scopes: string[]) => [{ bearerAuth: scopes }]
// OR entre scopes alternativos (cada uno vale por sí solo), a diferencia de
// `sec`, que exige todos los scopes que le pasas a la vez.
const secAny = (...scopes: string[]) => scopes.map((scope) => ({ bearerAuth: [scope] }))

// Respuestas cuya forma la fija un servicio, no un esquema de validación: se
// describen con un zod mínimo declarado aquí (nunca se usa para validar nada;
// solo para documentar) en vez de con JSON escrito a mano. Un único esquema
// para el parámetro de ruta `id` y para el cuerpo de respuesta `{ id }`: son
// la misma forma, documentarlos dos veces solo invitaba a que divergieran.
const IdObjectSchema = z.object({ id: IdSchema })
const BarcodePathSchema = z.object({ code: z.string() })
const ProposalsQuerySchema = z.object({ status: z.literal('pending').optional() })
// Alta si el cuerpo no trae id, reemplazo completo si lo trae (mismo contrato
// que app/api/v1/pantry/route.ts::PantryUpsertSchema): documentado aquí en vez
// de en lib/validation/pantry.ts porque ese fichero está congelado.
const PantryUpsertSchema = PantryItemInputSchema.extend({ id: IdSchema.optional() })
// El PATCH de una entrada admite dos formas de cuerpo (editar campos, o mover
// con date+slot): mismo contrato que app/api/v1/plan/entries/[id]/route.ts.
const PlanEntryPatchOrMoveSchema = z.union([PlanEntryPatchSchema, PlanEntryMoveSchema.omit({ entryId: true })])
// multipart/form-data no tiene esquema zod propio (no es JSON): se documenta
// con un objeto mínimo, marcando el campo como binario para Swagger UI.
const UploadBodySchema = z.object({ file: z.string().meta({ description: 'Imagen de la receta (máx. 8 MB)', override: { type: 'string', format: 'binary' } }) })

export const API_PATHS = [
  '/api/v1/recipes',
  '/api/v1/recipes/{id}',
  '/api/v1/recipes/import',
  '/api/v1/uploads',
  '/api/v1/plan',
  '/api/v1/plan/entries',
  '/api/v1/plan/entries/{id}',
  '/api/v1/plan/proposals',
  '/api/v1/plan/proposals/{id}',
  '/api/v1/pantry',
  '/api/v1/pantry/{id}',
  '/api/v1/pantry/adjust',
  '/api/v1/pantry/barcode/{code}',
  '/api/v1/foods/search',
  '/api/v1/shopping/generate',
  '/api/v1/shopping/push',
  '/api/v1/cooking/log',
  '/api/v1/household',
  '/api/v1/household/members',
  '/api/v1/household/invites',
  '/api/v1/export',
] as const

export function buildOpenApiDocument() {
  return createDocument({
    openapi: '3.1.0',
    info: {
      // Literal, no APP_NAME: package.json lo tiene en minúscula ('rezetapp')
      // y este título lo lee una persona en Swagger UI.
      title: 'RezetApp API',
      version: APP_VERSION,
      description: 'API del recetario. Autenticación por Bearer rz_… (Ajustes → Tokens de API) o por la cookie de sesión desde el propio navegador. Cero telemetría.',
    },
    servers: [{ url: process.env.APP_URL ?? 'http://localhost:3000' }],
    components: { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', description: 'Token rz_… creado en /settings/tokens' } } },
    paths: {
      '/api/v1/recipes': {
        get: {
          summary: 'Buscar recetas',
          security: sec('recipes:read'),
          requestParams: { query: RecipeSearchSchema },
          responses: { '200': { description: 'Página de resultados' }, ...errors },
        },
        post: {
          summary: 'Crear una receta',
          security: sec('recipes:write'),
          requestBody: json(RecipeInputSchema),
          responses: { '201': { description: 'Receta creada', ...json(IdObjectSchema) }, ...errors },
        },
      },
      '/api/v1/recipes/{id}': {
        get: {
          summary: 'Detalle de una receta, opcionalmente escalada a otras raciones',
          security: sec('recipes:read'),
          requestParams: { path: IdObjectSchema, query: RecipeGetQuerySchema },
          responses: { '200': { description: 'Receta con ingredientes y pasos' }, ...errors },
        },
        put: {
          summary: 'Reemplazar una receta',
          security: sec('recipes:write'),
          requestParams: { path: IdObjectSchema },
          requestBody: json(RecipeInputSchema),
          responses: { '200': { description: 'Receta actualizada', ...json(IdObjectSchema) }, ...errors },
        },
        delete: {
          summary: 'Borrar una receta (soft delete)',
          security: sec('recipes:write'),
          requestParams: { path: IdObjectSchema },
          responses: { '204': { description: 'Borrada' }, ...errors },
        },
      },
      '/api/v1/recipes/import': {
        post: {
          summary: 'Importar una receta desde URL, texto u OCR de imagen',
          description: 'Devuelve un borrador: no se guarda nada hasta que se llama a POST /api/v1/recipes con el resultado revisado.',
          security: sec('recipes:write'),
          requestBody: json(RecipeImportSchema),
          responses: { '200': { description: 'Borrador de receta' }, ...errors },
        },
      },
      '/api/v1/uploads': {
        post: {
          summary: 'Subir una imagen de receta',
          security: sec('recipes:write'),
          requestBody: { content: { 'multipart/form-data': { schema: UploadBodySchema } } },
          responses: {
            '201': { description: 'Imagen guardada', ...json(z.object({ url: z.string() })) },
            '413': { description: 'Supera los 8 MB', ...json(ErrorBodySchema) },
            ...errors,
          },
        },
      },
      '/api/v1/plan': {
        get: {
          summary: 'Plan de un rango de fechas',
          security: sec('plan:read'),
          requestParams: { query: DateRangeSchema },
          responses: { '200': { description: 'Entradas y nutrición agregada' }, ...errors },
        },
      },
      '/api/v1/plan/entries': {
        post: {
          summary: 'Añadir y quitar entradas del plan en un lote',
          security: sec('plan:write'),
          requestBody: json(PlanBatchSchema),
          responses: { '200': { description: 'Entradas añadidas y eliminadas' }, ...errors },
        },
      },
      '/api/v1/plan/entries/{id}': {
        patch: {
          summary: 'Editar o mover una entrada del plan',
          description: 'Con `date` y `slot` mueve la entrada; con el resto de campos, los actualiza.',
          security: sec('plan:write'),
          requestParams: { path: IdObjectSchema },
          requestBody: json(PlanEntryPatchOrMoveSchema),
          responses: { '200': { description: 'Entrada actualizada' }, ...errors },
        },
        delete: {
          summary: 'Quitar una entrada del plan',
          security: sec('plan:write'),
          requestParams: { path: IdObjectSchema },
          responses: { '204': { description: 'Eliminada' }, ...errors },
        },
      },
      '/api/v1/plan/proposals': {
        get: {
          summary: 'Listar propuestas de plan',
          security: sec('plan:read'),
          requestParams: { query: ProposalsQuerySchema },
          responses: { '200': { description: 'Propuestas pendientes o de cualquier estado' }, ...errors },
        },
        post: {
          summary: 'Crear una propuesta de plan',
          description: 'Mismo lote que POST /api/v1/plan/entries, pero pendiente de aprobación: no toca el plan hasta que una persona decide.',
          security: sec('plan:write'),
          requestBody: json(ProposalPayloadSchema),
          responses: { '201': { description: 'Propuesta creada', ...json(IdObjectSchema) }, ...errors },
        },
      },
      '/api/v1/plan/proposals/{id}': {
        post: {
          summary: 'Aprobar o rechazar una propuesta',
          description: 'Aplica el lote entero en una transacción si se aprueba. Exige una persona autenticada: la IA propone, la persona decide, así que un Bearer sin sesión de persona recibe 403 aunque tenga el scope.',
          security: sec('plan:write'),
          requestParams: { path: IdObjectSchema },
          requestBody: json(ProposalDecisionSchema),
          responses: { '200': { description: 'Decisión aplicada' }, ...errors },
        },
      },
      '/api/v1/pantry': {
        get: {
          summary: 'Listar la despensa',
          security: sec('pantry:read'),
          requestParams: { query: PantryQuerySchema },
          responses: { '200': { description: 'Artículos de la despensa' }, ...errors },
        },
        post: {
          summary: 'Añadir o reemplazar un artículo de la despensa',
          description: 'Sin `id`: alta. Con `id`: reemplazo completo del artículo existente.',
          security: sec('pantry:write'),
          requestBody: json(PantryUpsertSchema),
          responses: { '200': { description: 'Artículo reemplazado' }, '201': { description: 'Artículo creado' }, ...errors },
        },
      },
      '/api/v1/pantry/{id}': {
        delete: {
          summary: 'Quitar un artículo de la despensa',
          security: sec('pantry:write'),
          requestParams: { path: IdObjectSchema },
          responses: { '204': { description: 'Eliminado' }, ...errors },
        },
      },
      '/api/v1/pantry/adjust': {
        post: {
          summary: 'Ajustar la cantidad de un artículo (delta, no absoluto)',
          security: sec('pantry:write'),
          requestBody: json(PantryAdjustSchema),
          responses: { '200': { description: 'Artículo ajustado' }, ...errors },
        },
      },
      '/api/v1/pantry/barcode/{code}': {
        get: {
          summary: 'Resolver un código de barras a un alimento',
          description: 'Consulta el catálogo del hogar y, si no está, Open Food Facts; el resultado externo se cachea como alimento del hogar.',
          security: sec('pantry:read'),
          requestParams: { path: BarcodePathSchema },
          responses: { '200': { description: 'Alimento encontrado' }, ...errors },
        },
      },
      '/api/v1/foods/search': {
        get: {
          summary: 'Buscar en el catálogo de alimentos',
          description: 'Recurso transversal: acepta un token con `recipes:read` o con `pantry:read`, cualquiera de los dos basta.',
          security: secAny('recipes:read', 'pantry:read'),
          requestParams: { query: FoodSearchSchema },
          responses: { '200': { description: 'Alimentos que coinciden' }, ...errors },
        },
      },
      '/api/v1/shopping/generate': {
        post: {
          summary: 'Calcular lo que falta para un rango de fechas',
          description: 'POST con cuerpo a propósito, aunque no escribe nada: consolidar exige ver el plan y la despensa a la vez.',
          security: sec('plan:read', 'pantry:read'),
          requestBody: json(ShoppingGenerateSchema),
          responses: { '200': { description: 'Líneas de compra consolidadas' }, ...errors },
        },
      },
      '/api/v1/shopping/push': {
        post: {
          summary: 'Enviar líneas de compra a ShopList',
          security: sec('shopping:push'),
          requestBody: json(ShoppingPushSchema),
          responses: {
            '200': { description: 'Enviado a ShopList' },
            '502': { description: 'ShopList no respondió o rechazó el envío', ...json(ErrorBodySchema) },
            ...errors,
          },
        },
      },
      // Documentada por adelantado (ruling W3-R9): la ruta llega con la pista de
      // cocina (Tarea 17b). El contrato es el mismo LogCookedSchema congelado en
      // W1, así que el documento no cambiará cuando el fichero exista.
      '/api/v1/cooking/log': {
        post: {
          summary: 'Registrar una comida cocinada',
          description: 'Descuenta la despensa, registra la nutrición y marca la entrada del plan, todo en una transacción. Idempotente por entrada: repetirlo devuelve 409.',
          security: sec('cooking:write'),
          requestBody: json(LogCookedSchema),
          responses: {
            '201': { description: 'Cocinado registrado', ...json(z.object({ logId: IdSchema, entryId: IdSchema })) },
            '409': { description: 'Esa comida ya estaba cocinada', ...json(ErrorBodySchema) },
            ...errors,
          },
        },
      },
      '/api/v1/household': {
        get: {
          summary: 'Resumen del hogar',
          security: sec('household:read'),
          responses: { '200': { description: 'Hogar, miembros y ajustes visibles' }, ...errors },
        },
      },
      '/api/v1/household/members': {
        get: {
          summary: 'Listar miembros del hogar',
          security: sec('household:read'),
          responses: { '200': { description: 'Miembros con sus alérgenos y preferencias' }, ...errors },
        },
        patch: {
          summary: 'Editar alérgenos y preferencias de un miembro',
          description: 'El propietario edita a cualquiera; un miembro solo a sí mismo. Requiere una persona autenticada (rol de sesión): un token Bearer no tiene rol de hogar ni identidad propia, así que siempre recibe 403 aquí, tenga o no el scope.',
          security: sec('household:write'),
          requestBody: json(MemberUpdateSchema),
          responses: { '200': { description: 'Miembros tras la edición' }, ...errors },
        },
      },
      '/api/v1/household/invites': {
        post: {
          summary: 'Crear una invitación al hogar',
          security: sec('household:write'),
          responses: { '201': { description: 'Invitación creada' }, ...errors },
        },
      },
      '/api/v1/export': {
        get: {
          summary: 'Volcado completo del recetario del hogar',
          description: 'Sin ids internos: sirve de copia de seguridad y se puede reimportar en otra instancia.',
          security: sec('recipes:read'),
          responses: { '200': { description: 'Recetas, alimentos y sus relaciones' }, ...errors },
        },
      },
    },
  })
}
