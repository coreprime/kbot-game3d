import js from '@eslint/js'
import globals from 'globals'

// Standalone ESLint flat config for @coreprime/kbot-game3d.
export default [
  {
    // Generated / build output — third-party or generated artifacts that
    // fail any rule looking at code shape.
    ignores: ['dist/**', 'generated/**', 'pack-verify/**', 'examples/**'],
  },
  js.configs.recommended,
  {
    // Node-side tooling and tests run under Node, not a browser.
    files: ['scripts/**/*.mjs', 'test/**/*.mjs', 'test/**/*.js'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: { ...globals.node, ...globals.browser },
    },
  },
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: { ...globals.browser },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-empty': ['warn', { allowEmptyCatch: true }],
    },
  },
]
