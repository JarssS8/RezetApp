import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'
import boundaries from 'eslint-plugin-boundaries'

const config = [
  ...nextVitals,
  ...nextTs,
  { ignores: ['.next/**', 'dist/**', 'node_modules/**', 'playwright-report/**', 'test-results/**'] },
  {
    // Versión fija: evita que eslint-plugin-react intente autodetectarla vía
    // context.getFilename(), método retirado en ESLint 10 y que rompe el lint.
    settings: { react: { version: '19.2.8' } },
  },
  {
    plugins: { boundaries },
    settings: {
      'boundaries/elements': [
        { type: 'domain', pattern: 'lib/domain/**' },
        { type: 'validation', pattern: 'lib/validation/**' },
        { type: 'db', pattern: 'db/**' },
        { type: 'ai', pattern: 'lib/ai/**' },
        { type: 'integrations', pattern: 'lib/integrations/**' },
        { type: 'auth', pattern: 'lib/auth/**' },
        { type: 'events', pattern: 'lib/events/**' },
        { type: 'services', pattern: 'lib/services/**' },
        { type: 'lib', pattern: 'lib/*' },
        { type: 'components', pattern: 'components/**' },
        { type: 'app', pattern: 'app/**' },
        { type: 'scripts', pattern: 'scripts/**' },
      ],
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      'boundaries/element-types': [
        'error',
        {
          default: 'disallow',
          rules: [
            { from: 'domain', allow: ['domain'] },
            { from: 'validation', allow: ['validation', 'domain'] },
            { from: 'db', allow: ['db'] },
            { from: 'auth', allow: ['auth', 'db', 'lib'] },
            { from: 'events', allow: ['events'] },
            { from: 'ai', allow: ['ai', 'domain', 'validation', 'db', 'lib'] },
            { from: 'integrations', allow: ['integrations', 'domain', 'lib'] },
            { from: 'services', allow: ['services', 'domain', 'validation', 'db', 'ai', 'integrations', 'auth', 'events', 'lib'] },
            { from: 'lib', allow: ['lib', 'domain'] },
            { from: 'components', allow: ['components', 'domain', 'validation', 'lib', 'events'] },
            { from: 'app', allow: ['app', 'components', 'services', 'domain', 'validation', 'auth', 'events', 'lib'] },
            { from: 'scripts', allow: ['scripts', 'db', 'domain', 'lib'] },
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
