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
        { type: 'services', pattern: 'lib/services/**' },
        { type: 'uploads', pattern: 'lib/uploads/**' },
        { type: 'lib', pattern: 'lib/*.ts', mode: 'file' },
        { type: 'lib', pattern: 'lib/*' },
        { type: 'components', pattern: 'components/**' },
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
            { from: { element: { type: 'lib' } }, allow: { to: { element: { types: { anyOf: ['lib', 'domain'] } } } } },
            {
              from: { element: { type: 'uploads' } },
              allow: { to: { element: { types: { anyOf: ['uploads', 'lib'] } } } },
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
                    types: {
                      anyOf: ['app', 'components', 'services', 'domain', 'validation', 'auth', 'events', 'lib', 'actions', 'uploads', 'ai'],
                    },
                  },
                },
              },
            },
            {
              from: { element: { type: 'scripts' } },
              allow: { to: { element: { types: { anyOf: ['scripts', 'db', 'domain', 'lib'] } } } },
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
