import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist', 'coverage', '**/coverage/**', 'playwright-report', 'test-results'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'max-lines': ['error', { max: 400, skipBlankLines: false, skipComments: false }],
    },
  },
  {
    files: ['**/*.test.ts', '**/*.test.tsx', '**/*.spec.ts', '**/test/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  {
    files: [
      'src/canvas/modals/TransformModal.tsx',
      'src/components/ImportButton.tsx',
      'src/engine/materializationService.test.ts',
      'src/engine/materializationService.ts',
      'src/layout/ProjectSwitcher.tsx',
      'src/report/editor/extensions/AtomicBlockNavigation.ts',
      'src/state/stores/nodesSlice.ts',
    ],
    rules: {
      // scripts/check-file-lines.mjs caps these legacy files at their current sizes.
      'max-lines': 'off',
    },
  },
  {
    files: ['scripts/**/*.{cjs,js,mjs}'],
    languageOptions: {
      globals: globals.node,
    },
  },
)

