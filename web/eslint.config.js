// ESLint flat config. Formatting is Prettier's job (eslint-config-prettier turns off style rules).
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'tests/fixtures/**', '*.tsbuildinfo'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Browser app, Workers and their tests (tests run in Node).
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser, ...globals.worker } },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      // Control characters are matched on purpose: previews, file names and labels are sanitized.
      'no-control-regex': 'off',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
    },
  },
  {
    // Playwright tests and config run in Node.
    files: ['tests/e2e/**/*.ts', 'playwright.config.ts'],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    files: ['src/**/*.test.ts'],
    languageOptions: { globals: { ...globals.node } },
    rules: { '@typescript-eslint/no-explicit-any': 'off', '@typescript-eslint/no-non-null-assertion': 'off' },
  },
  {
    // Static server, its test and the Node-side fixture harness.
    files: ['*.{js,mjs}', 'scripts/*.mjs', 'tests/**/*.mjs'],
    languageOptions: { globals: { ...globals.node } },
    rules: { 'no-control-regex': 'off' },
  },
  {
    // Playwright browser_run_code functions: a single arrow-function expression with `page`,
    // whose page.evaluate callbacks run in the browser.
    files: ['tests/*-acceptance.js'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: { 'no-unused-expressions': 'off', '@typescript-eslint/no-unused-expressions': 'off' },
  },
  prettier,
);
