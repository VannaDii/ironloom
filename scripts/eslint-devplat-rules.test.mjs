import { Linter } from 'eslint';
import tseslint from 'typescript-eslint';
import { describe, expect, it } from 'vitest';

import devplatPlugin from './eslint-devplat-rules.mjs';

describe('eslint-devplat-rules', () => {
  const cases = [
    {
      name: 'requires package source JSDoc and rejects generated placeholders',
      inputs: {
        code: [
          '/** Example service service. */',
          'export class ExampleService {',
          '  public execute(): number {',
          '    return 1;',
          '  }',
          '}',
        ].join('\n'),
        filename: 'packages/example/src/unit/service.ts',
        rules: {
          'devplat/require-authored-jsdoc': 'error',
        },
      },
      mock: () => createLinter(),
      assert: (linter, inputs) => {
        const messages = lintWithDevplatRules(linter, inputs);

        expect(messages.map((message) => message.message)).toContain(
          "ExampleService has low-quality JSDoc 'service service'; remove duplicated service wording.",
        );
        expect(messages.map((message) => message.message)).toContain(
          'execute is missing JSDoc.',
        );
      },
    },
    {
      name: 'rejects non-canonical case-table runners',
      inputs: {
        code: [
          'const routeCases = [',
          '  { name: "case one", inputs: {}, mock: () => ({}), assert: () => undefined },',
          '];',
          "it.each(routeCases)('$name', () => undefined);",
          'for (const testCase of cases) {',
          '  testCase.assert();',
          '}',
        ].join('\n'),
        filename: 'packages/example/src/unit/logic.test.ts',
        rules: {
          'devplat/require-structured-cases': 'error',
        },
      },
      mock: () => createLinter(),
      assert: (linter, inputs) => {
        const messages = lintWithDevplatRules(linter, inputs);

        expect(messages.map((message) => message.message)).toContain(
          "Use it.each(cases)('$name', ...) instead of it.each(routeCases).",
        );
        expect(messages.map((message) => message.message)).toContain(
          "Use it.each(cases)('$name', ...) instead of looping over cases.",
        );
      },
    },
    {
      name: 'rejects regex placement and names outside the source constants contract',
      inputs: {
        code: [
          'export const branchPattern = /feature\\/.+/u;',
          "export const VALID_PATTERN = new RegExp('feature');",
        ].join('\n'),
        filename: 'packages/example/src/unit/logic.ts',
        rules: {
          'devplat/regex-governance': 'error',
        },
      },
      mock: () => createLinter(),
      assert: (linter, inputs) => {
        const messages = lintWithDevplatRules(linter, inputs);

        expect(messages.map((message) => message.message)).toContain(
          'Regular expressions must be defined in the owning constants.ts module.',
        );
        expect(messages).toHaveLength(2);
      },
    },
    {
      name: 'rejects package policy boundary violations',
      inputs: {
        code: [
          "import { value } from '@vannadii/devplat-discord';",
          "export const statePath = '.devplat/state';",
          '@sealed',
          'export class Example {}',
        ].join('\n'),
        filename: 'packages/research/src/unit/service.ts',
        rules: {
          'devplat/package-policy-boundaries': 'error',
        },
      },
      mock: () => createLinter(),
      assert: (linter, inputs) => {
        const messages = lintWithDevplatRules(linter, inputs);

        expect(messages.map((message) => message.message)).toContain(
          "Adapter package '@vannadii/devplat-discord' may only be imported from approved adapter source.",
        );
        expect(messages.map((message) => message.message)).toContain(
          '.devplat paths may only be accessed from packages/storage/src.',
        );
        expect(messages.map((message) => message.message)).toContain(
          'Decorators may only be used in approved OpenClaw or Discord source directories.',
        );
      },
    },
  ];

  it.each(cases)('$name', ({ inputs, mock, assert }) => {
    expect.hasAssertions();
    const linter = mock(inputs);

    assert(linter, inputs);
  });
});

function createLinter() {
  return new Linter({ configType: 'flat' });
}

function lintWithDevplatRules(linter, inputs) {
  return linter.verify(
    inputs.code,
    [
      {
        files: ['**/*.{ts,mts,cts,js,mjs,cjs}'],
        plugins: {
          devplat: devplatPlugin,
        },
        languageOptions: {
          parser: tseslint.parser,
          parserOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
          },
        },
        rules: inputs.rules,
      },
    ],
    {
      filename: inputs.filename,
    },
  );
}
