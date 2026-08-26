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
              from: { element: { type: 'validation' } },
              allow: { to: { element: { types: { anyOf: ['validation', 'domain'] } } } },
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
              from: { element: { type: 'integrations' } },
              allow: { to: { element: { types: { anyOf: ['integrations', 'domain', 'lib'] } } } },
            },
            {
              from: { element: { type: 'actions' } },
              allow: {
                to: { element: { types: { anyOf: ['actions', 'services', 'validation', 'auth', 'domain', 'events', 'lib'] } } },
              },
            },
            {
              from: { element: { type: 'services' } },
              allow: {
                to: {
                  element: {
                    types: { anyOf: ['services', 'domain', 'validation', 'db', 'ai', 'integrations', 'auth', 'events', 'lib'] },
                  },
                },
              },
            },
            { from: { element: { type: 'lib' } }, allow: { to: { element: { types: { anyOf: ['lib', 'domain'] } } } } },
            {
              from: { element: { type: 'components' } },
              allow: { to: { element: { types: { anyOf: ['components', 'domain', 'validation', 'lib', 'events', 'actions'] } } } },
            },
            {
              from: { element: { type: 'app' } },
              allow: {
                to: {
                  element: {
                    types: { anyOf: ['app', 'components', 'services', 'domain', 'validation', 'auth', 'events', 'lib', 'actions'] },
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
]

export default config
