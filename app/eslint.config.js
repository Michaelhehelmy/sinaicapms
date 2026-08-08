import js from '@eslint/js';
import tsParser from '@typescript-eslint/parser';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

// Flat config. Fixed T8-E-3: previously no `files` glob matched .ts/.tsx so
// every file reported "no matching configuration was supplied" and lint was a
// silent no-op. JS gets browser+node globals; TS/TSX are parsed via
// @typescript-eslint/parser with `no-undef` off (TypeScript does that check —
// avoids false positives on browser/worker globals). `.astro` is excluded (no
// astro-eslint-parser installed; Astro files are typechecked by Astro/tsc).
const projectRules = {
  'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
  'no-console': 'warn',
  'no-debugger': 'error',
  'no-duplicate-imports': 'error',
  // 'smart' allows the `x == null` idiom (null + undefined) while enforcing
  // strict equality everywhere else — see src/lib/utils.ts / DataTable.tsx.
  'eqeqeq': ['error', 'smart'],
  'no-var': 'error',
  'prefer-const': 'error',
  'no-throw-literal': 'error',
  'no-return-assign': 'error',
  'no-self-compare': 'error',
  'no-template-curly-in-string': 'warn',
};

export default [
  js.configs.recommended,
  {
    files: ['**/*.{js,mjs,cjs}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.node },
    },
    rules: projectRules,
  },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
    },
    rules: {
      ...projectRules,
      'no-undef': 'off',
      // eslint-plugin-react-hooks: registered so existing
      // `eslint-disable-next-line react-hooks/exhaustive-deps` comments stay
      // valid; the rule itself is off (kept deliberate dep omissions quiet).
      'react-hooks/exhaustive-deps': 'off',
    },
  },
  {
    plugins: {
      'react-hooks': reactHooks,
    },
  },
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      '.astro/**',
      'tests/**',
      'public/**',
      '**/*.astro',
      '**/*.stories.ts',
      '**/*.stories.tsx',
    ],
  },
];
