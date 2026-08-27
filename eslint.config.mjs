import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'
import boundaries from 'eslint-plugin-boundaries'

const config = [
  ...nextVitals,
  ...nextTs,
  { ignores: ['.next/**', 'dist/**', 'node_modules/**', 'playwright-report/**', 'test-results/**', 'coverage/**', '.worktrees/**'] },
  {
    // Versión fija: evita que eslint-plugin-react intente autodetectarla vía
    // context.getFilename(), método retirado en ESLint 10 y que rompe el lint.
    settings: { react: { version: '19.2.8' } },
  },
  {
    plugins: { boundaries },
    settings: {
      // 'lib/*.ts' con mode: 'file' es la única forma (v7.2.0) de clasificar
      // ficheros sueltos en lib/ como elemento propio; el plugin lo marca
      // deprecated sin ofrecer aún un reemplazo no-legacy. Silenciamos solo
      // ese aviso: las otras migraciones de sintaxis v7 (dependencies/policies/
      // selectores de objeto) ya están hechas, así que esto no oculta nada más.
      'boundaries/legacy-warnings': false,
      'boundaries/elements': [
        { type: 'domain', pattern: 'lib/domain/**' },
        { type: 'validation', pattern: 'lib/validation/**' },
        { type: 'db', pattern: 'db/**' },
        { type: 'ai', pattern: 'lib/ai/**' },
        { type: 'integrations', pattern: 'lib/integrations/**' },
        { type: 'auth', pattern: 'lib/auth/**' },
        { type: 'events', pattern: 'lib/events/**' },
        { type: 'actions', pattern: 'lib/actions/**' },
        // Patrón fijado en la Tarea 13 (W3): las rutas de app/api/v1 no están
        // en DB_TEST_GLOBS, así que sus tests viven en lib/services/api-*.test.ts
        // para poder usar getTestDb() y ahí necesitan importar la propia ruta.
        // Más específico que 'services': va antes en la lista.
        { type: 'api-route-test', pattern: 'lib/services/api-*.test.ts', mode: 'file' },
        { type: 'services', pattern: 'lib/services/**' },
        { type: 'uploads', pattern: 'lib/uploads/**' },
        { type: 'mcp', pattern: 'lib/mcp/**' },
        // Tarea 18 (W3): construye el documento OpenAPI a partir de los
        // esquemas de lib/validation, algo que el elemento genérico 'lib' (solo
        // puede ver 'lib' y 'domain') no permite. Más específico que 'lib': va antes.
        { type: 'openapi', pattern: 'lib/openapi/**' },
        { type: 'lib', pattern: 'lib/*.ts', mode: 'file' },
        { type: 'lib', pattern: 'lib/*' },
        { type: 'components', pattern: 'components/**' },
        // app/api/v1/_lib vive dentro de `app` (las fronteras solo dejan
        // importar de `services` a ese elemento) pero también necesita el tipo
        // ApiScope de db/schema (Tarea 13, W3). Más específico que 'app': va antes.
        { type: 'api-lib', pattern: 'app/api/v1/_lib/**' },
        { type: 'app', pattern: 'app/**' },
        { type: 'scripts', pattern: 'scripts/**' },
      ],
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      'boundaries/dependencies': [
        'error',
        {
          default: 'disallow',
          policies: [
            { from: { element: { type: 'domain' } }, allow: { to: { element: { type: 'domain' } } } },
            {
              // 'lib' incluido: lib/net-hosts.ts (clasificación SSRF de hosts) la
              // usan tanto lib/validation/household.ts como lib/services/recipe-import.ts.
              from: { element: { type: 'validation' } },
              allow: { to: { element: { types: { anyOf: ['validation', 'domain', 'lib'] } } } },
            },
            { from: { element: { type: 'db' } }, allow: { to: { element: { type: 'db' } } } },
            {
              from: { element: { type: 'auth' } },
              allow: { to: { element: { types: { anyOf: ['auth', 'db', 'lib'] } } } },
            },
            { from: { element: { type: 'events' } }, allow: { to: { element: { type: 'events' } } } },
            {
              from: { element: { type: 'ai' } },
              allow: { to: { element: { types: { anyOf: ['ai', 'domain', 'validation', 'db', 'lib'] } } } },
            },
            {
              // 'validation' incluido: una integración traduce la respuesta
              // externa a la forma que el servicio espera (p. ej.
              // offToFoodInput -> FoodInput), sin tocar db ni services.
              from: { element: { type: 'integrations' } },
              allow: { to: { element: { types: { anyOf: ['integrations', 'domain', 'validation', 'lib'] } } } },
            },
            {
              from: { element: { type: 'actions' } },
              allow: {
                to: {
                  element: { types: { anyOf: ['actions', 'services', 'validation', 'auth', 'domain', 'events', 'lib', 'uploads'] } },
                },
              },
            },
            {
              from: { element: { type: 'services' } },
              allow: {
                to: {
                  element: {
                    types: {
                      anyOf: ['services', 'domain', 'validation', 'db', 'ai', 'integrations', 'auth', 'events', 'lib', 'uploads'],
                    },
                  },
                },
              },
            },
            {
              // Igual que 'services' pero además de 'app': estos ficheros son
              // tests que importan el route handler que prueban (Tarea 13, W3).
              from: { element: { type: 'api-route-test' } },
              allow: {
                to: {
                  element: {
                    types: {
                      anyOf: ['api-route-test', 'services', 'domain', 'validation', 'db', 'ai', 'integrations', 'auth', 'events', 'lib', 'uploads', 'app'],
                    },
                  },
                },
              },
            },
            { from: { element: { type: 'lib' } }, allow: { to: { element: { types: { anyOf: ['lib', 'domain'] } } } } },
            {
              // El documento OpenAPI reusa los esquemas zod de lib/validation
              // (Tarea 18, W3): un elemento propio, más estrecho que el genérico
              // 'lib', en vez de ampliar este último para todo lib/*.
              from: { element: { type: 'openapi' } },
              allow: { to: { element: { types: { anyOf: ['openapi', 'validation', 'domain', 'lib'] } } } },
            },
            {
              from: { element: { type: 'uploads' } },
              allow: { to: { element: { types: { anyOf: ['uploads', 'lib'] } } } },
            },
            {
              // 'db' incluido: lib/mcp/auth.ts autentica el Bearer con
              // authenticateApiToken(db, …) igual que lib/auth/guards.ts, así
              // que necesita la misma conexión (auth -> db ya está permitido).
              from: { element: { type: 'mcp' } },
              allow: { to: { element: { types: { anyOf: ['mcp', 'services', 'validation', 'auth', 'domain', 'db', 'lib'] } } } },
            },
            {
              from: { element: { type: 'components' } },
              allow: { to: { element: { types: { anyOf: ['components', 'domain', 'validation', 'lib', 'events', 'actions'] } } } },
            },
            {
              from: { element: { type: 'app' } },
              allow: {
                to: {
                  element: {
                    // 'ai' incluido: app/(app)/settings/ai/page.tsx lee el catálogo
                    // de modelos (lib/ai/models.ts, puro, sin proveedor ni DB) para
                    // decidir qué pasarle al formulario de ajustes de IA.
                    // 'api-lib' incluido: app/api/v1/**/route.ts llama a
                    // apiFailure/apiError/parseBody de app/api/v1/_lib/respond.ts.
                    // 'openapi' incluido: app/api/openapi.json/route.ts sirve el
                    // documento de lib/openapi/document.ts (Tarea 18, W3).
                    types: {
                      anyOf: ['app', 'api-lib', 'components', 'services', 'domain', 'validation', 'auth', 'events', 'lib', 'actions', 'uploads', 'ai', 'mcp', 'openapi'],
                    },
                  },
                },
              },
            },
            {
              // Igual que 'app': app/api/v1/_lib vive dentro de app porque
              // necesita 'services' (Tarea 13, W3). ApiScope se deriva del
              // duplicado de lib/validation/tokens.ts, no de db/schema, así
              // que este elemento no necesita 'db' (ronda de revisión W3-R3).
              from: { element: { type: 'api-lib' } },
              allow: {
                to: {
                  element: {
                    types: {
                      anyOf: ['api-lib', 'app', 'components', 'services', 'domain', 'validation', 'auth', 'events', 'lib', 'actions', 'uploads', 'ai', 'mcp'],
                    },
                  },
                },
              },
            },
            {
              // 'services' incluido: los scripts de migración (W4(c)) crean las
              // recetas con createRecipe, el mismo servicio que usa la interfaz,
              // para que resuelvan alimentos y nutrición igual que una receta
              // escrita a mano. La alternativa -reimplementar el alta contra db-
              // duplicaría §9.1 entera.
              from: { element: { type: 'scripts' } },
              allow: { to: { element: { types: { anyOf: ['scripts', 'db', 'domain', 'lib', 'services', 'validation', 'auth'] } } } },
            },
          ],
        },
      ],
    },
  },
  {
    files: ['lib/**', 'app/**', 'components/**', 'db/**', 'scripts/**'],
    plugins: { boundaries },
    rules: {
      'boundaries/no-unknown-files': 'error',
    },
  },
  {
    files: ['lib/domain/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                'react',
                'react-dom',
                'next',
                'next/*',
                'next-intl',
                'next-intl/*',
                'pg',
                'drizzle-orm',
                'drizzle-orm/*',
                '@/db',
                '@/db/*',
                '@/lib/services/*',
                '@/lib/ai/*',
                '@/lib/integrations/*',
                '@/lib/auth/*',
                '@/lib/events/*',
              ],
              message: 'lib/domain es puro: sin React, Next, HTTP ni base de datos.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['app/**/*.tsx', 'components/**/*.tsx'],
    rules: {
      'react/jsx-no-literals': [
        'error',
        { noStrings: true, ignoreProps: true, allowedStrings: ['·', '—', '–', '×', '%', '/', '(', ')', ':', '+', '−', '…', '&nbsp;'] },
      ],
    },
  },
  {
    // Regla I3 de la revisión W2: `result.message` es texto de servicio/zod en
    // español crudo -nunca debe pintarse tal cual en la interfaz-, salvo el
    // texto que de verdad viene de un proveedor externo (IA, ShopList), donde
    // no hay clave i18n posible. Esos dos sitios llevan su propia línea de
    // desactivación con el motivo (ver shopping-push-button.tsx).
    files: ['app/**/*.tsx', 'components/**/*.tsx'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.name='setError'] > MemberExpression[property.name='message']",
          message: 'No pintes result.message crudo: traduce por result.code con actionErrorKey (lib/actions/result.ts).',
        },
        {
          selector: "CallExpression[callee.object.name='toast'][callee.property.name='error'] > MemberExpression[property.name='message']",
          message: 'No pintes result.message crudo: traduce por result.code con actionErrorKey (lib/actions/result.ts).',
        },
      ],
    },
  },
]

export default config
