import js from '@eslint/js';
import eslintConfigPrettier from 'eslint-config-prettier';
import sonarjs from 'eslint-plugin-sonarjs';
import globals from 'globals';
import tseslint from 'typescript-eslint';

import devplatPlugin from './scripts/eslint-devplat-rules.mjs';

const typedFiles = [
  'packages/*/src/**/*.ts',
  'packages/*/src/**/*.mts',
  'packages/*/src/**/*.cts',
];
const scriptFiles = ['scripts/**/*.ts', 'scripts/**/*.mts', 'scripts/**/*.cts'];
const typeScriptFiles = ['**/*.ts', '**/*.mts', '**/*.cts'];
const testFiles = [
  '**/*.test.ts',
  '**/*.test.mts',
  '**/*.test.cts',
  '**/*.test.mjs',
  'vitest.config.mts',
];
const noTypeAssertionSyntaxRules = {
  'no-restricted-syntax': [
    'error',
    {
      selector: 'TSAsExpression',
      message: 'Type assertions and casts are forbidden in authored code.',
    },
    {
      selector: 'TSTypeAssertion',
      message: 'Type assertions and casts are forbidden in authored code.',
    },
    {
      selector: 'TSNonNullExpression',
      message: 'Non-null assertions are forbidden in authored code.',
    },
  ],
};
const noTypeAssertionRules = {
  ...noTypeAssertionSyntaxRules,
  '@typescript-eslint/consistent-type-assertions': [
    'error',
    {
      assertionStyle: 'never',
    },
  ],
  '@typescript-eslint/no-confusing-non-null-assertion': 'error',
  '@typescript-eslint/no-extra-non-null-assertion': 'error',
  '@typescript-eslint/no-non-null-assertion': 'error',
  '@typescript-eslint/no-unnecessary-type-assertion': 'error',
};

const restrictedImportPatterns = [
  {
    group: ['@vannadii/devplat-*/src/*'],
    message: 'Deep imports across package boundaries are forbidden.',
  },
  {
    group: ['packages/*'],
    message: 'Cross-package filesystem imports are forbidden.',
  },
  {
    group: [
      '../../*/src/*',
      '../../../*/src/*',
      '../../../../*/src/*',
      '../../packages/*',
      '../../../packages/*',
    ],
    message: 'Cross-package relative imports are forbidden.',
  },
];

const typedConfigs = tseslint.configs.strictTypeChecked.map((config) => ({
  ...config,
  files: typedFiles,
  ignores: testFiles,
  languageOptions: {
    ...config.languageOptions,
    globals: {
      ...globals.node,
      ...(config.languageOptions?.globals ?? {}),
    },
    parserOptions: {
      ...config.languageOptions?.parserOptions,
      project: ['./tsconfig.eslint.json'],
      tsconfigRootDir: import.meta.dirname,
    },
  },
}));

const testConfigs = tseslint.configs.recommended.map((config) => ({
  ...config,
  files: testFiles,
  languageOptions: {
    ...config.languageOptions,
    globals: {
      ...globals.node,
      ...(config.languageOptions?.globals ?? {}),
    },
  },
}));

const scriptConfigs = tseslint.configs.strictTypeChecked.map((config) => ({
  ...config,
  files: scriptFiles,
  languageOptions: {
    ...config.languageOptions,
    globals: {
      ...globals.node,
      ...(config.languageOptions?.globals ?? {}),
    },
    parserOptions: {
      ...config.languageOptions?.parserOptions,
      project: ['./tsconfig.eslint.json'],
      tsconfigRootDir: import.meta.dirname,
    },
  },
}));

export default [
  {
    ignores: [
      'coverage/**',
      'node_modules/**',
      'packages/*/dist/**',
      'site/guide-docs/.vitepress/dist/**',
      'site/guide-docs/.vitepress/.temp/**',
      '.turbo/**',
      'openclaw-*.tgz',
    ],
  },
  {
    files: ['**/*.{js,mjs,cjs,ts,mts,cts}'],
    languageOptions: {
      globals: globals.node,
    },
  },
  js.configs.recommended,
  sonarjs.configs.recommended,
  ...typedConfigs,
  ...testConfigs,
  ...scriptConfigs,
  {
    files: testFiles,
    plugins: {
      devplat: devplatPlugin,
    },
    rules: {
      'devplat/require-structured-cases': 'error',
    },
  },
  {
    files: typeScriptFiles,
    ignores: testFiles,
    languageOptions: {
      parser: tseslint.parser,
    },
    rules: noTypeAssertionSyntaxRules,
  },
  {
    files: typedFiles,
    ignores: testFiles,
    plugins: {
      devplat: devplatPlugin,
    },
    rules: {
      ...noTypeAssertionRules,
      '@typescript-eslint/explicit-function-return-type': [
        'error',
        {
          allowExpressions: false,
          allowTypedFunctionExpressions: true,
          allowHigherOrderFunctions: false,
        },
      ],
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          args: 'all',
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          ignoreRestSiblings: false,
        },
      ],
      'no-console': 'error',
      'no-restricted-imports': [
        'error',
        {
          patterns: restrictedImportPatterns,
        },
      ],
      'devplat/package-policy-boundaries': 'error',
      'devplat/regex-governance': 'error',
      'devplat/require-authored-jsdoc': 'error',
      'devplat/require-sibling-unit-tests': 'error',
    },
  },
  {
    files: scriptFiles,
    rules: {
      ...noTypeAssertionRules,
      '@typescript-eslint/explicit-function-return-type': [
        'error',
        {
          allowExpressions: false,
          allowTypedFunctionExpressions: true,
          allowHigherOrderFunctions: false,
        },
      ],
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          args: 'all',
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          ignoreRestSiblings: false,
        },
      ],
      'no-console': 'error',
    },
  },
  {
    files: testFiles,
    rules: {
      'no-console': 'off',
    },
  },
  eslintConfigPrettier,
];
