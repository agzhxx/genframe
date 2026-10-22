import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import tseslint from 'typescript-eslint';

export default defineConfig([
  ...nextVitals,
  {
    // Typed rules catch `any` that leaks in from untyped values, not only `any` written down.
    files: ['**/*.{ts,tsx,mts}'],
    extends: [tseslint.configs.strictTypeChecked],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
  },
  {
    // The site is a static export, with no image optimizer behind next/image, and registry items
    // can't use it; the Feed's posters come in their own widths, which <picture> picks from.
    rules: { '@next/next/no-img-element': 'off' },
  },
  {
    // Registry items install into any React app, Vite included (spec 4.3).
    files: ['registry/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['next', 'next/*'],
              message: 'Registry items must work outside Next.js: take links as href plus callbacks.',
            },
          ],
        },
      ],
    },
  },
  globalIgnores([
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    '.source/**',
    'public/r/**',
    'fixtures/**',
    'playwright-report/**',
    'test-results/**',
  ]),
]);
