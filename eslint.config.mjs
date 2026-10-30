import js from '@eslint/js';
import { builtinModules } from 'node:module';
import ts from 'typescript-eslint';
import vue from 'eslint-plugin-vue';
import globals from 'globals';
import prettier from 'eslint-config-prettier';
const restriction = (patterns) => ['error', { patterns }];
export default ts.config(
  {
    ignores: [
      '**/dist/**',
      '**/target/**',
      '**/resources/**',
      '**/binaries/**',
      '.cache/**',
      'node_modules/**',
      'playwright-report/**',
      'test-results/**',
    ],
  },
  js.configs.recommended,
  { files: ['**/*.mjs'], languageOptions: { globals: globals.node } },
  ...ts.configs.recommendedTypeChecked.map((c) => ({
    ...c,
    files: ['**/*.ts', '**/*.vue'],
  })),
  ...vue.configs['flat/recommended'],
  {
    files: ['**/*.ts', '**/*.vue'],
    languageOptions: {
      parserOptions: {
        parser: ts.parser,
        project: './tsconfig.json',
        extraFileExtensions: ['.vue'],
      },
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      'vue/multi-word-component-names': 'off',
    },
  },
  {
    files: [
      'apps/**/src/**/*.ts',
      'apps/**/src/**/*.vue',
      'packages/**/src/**/*.ts',
    ],
    ignores: ['**/*.test.ts', '**/components/ui/**'],
    rules: {
      'max-lines': [
        'error',
        { max: 300, skipBlankLines: true, skipComments: true },
      ],
    },
  },
  {
    files: ['packages/contracts/src/**'],
    rules: {
      'no-restricted-imports': restriction([
        'node:*',
        ...builtinModules,
        'vue',
        'pinia',
        'ai',
        '@ai-sdk/*',
        '**/providers/**',
        '@harness/providers',
        '**/desktop/**',
        '**/runtime/**',
        '@harness/runtime',
        '@tauri-apps/*',
      ]),
    },
  },
  {
    files: ['packages/providers/src/**'],
    rules: {
      'no-restricted-imports': restriction([
        '**/desktop/**',
        'vue',
        'pinia',
        '**/runtime/**',
        '@harness/runtime',
        '@tauri-apps/*',
      ]),
    },
  },
  {
    files: ['apps/desktop/src/**'],
    rules: {
      'no-restricted-imports': restriction([
        'node:*',
        ...builtinModules,
        'ai',
        '@ai-sdk/*',
        '**/providers/**',
        '@harness/providers',
        '**/runtime/**',
        '@harness/runtime',
        'better-sqlite3',
        'node-pty',
        '@modelcontextprotocol/*',
      ]),
    },
  },
  {
    files: ['apps/runtime/src/**'],
    rules: {
      'no-restricted-imports': restriction([
        'vue',
        'pinia',
        '@tauri-apps/*',
        '**/desktop/**',
      ]),
    },
  },
  {
    files: ['apps/desktop/src/components/ui/**'],
    rules: { 'vue/require-default-prop': 'off' },
  },
  prettier,
);
