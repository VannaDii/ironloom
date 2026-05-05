import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  collectTestCaseStyleFailures,
  collectUnitTestLayoutFailures,
} from './check-unit-tests.mjs';

describe('check-unit-tests', () => {
  const cases = [
    {
      name: 'passes structured unit tests with sibling logic coverage',
      inputs: {
        files: [
          {
            path: 'packages/example/src/unit/logic.ts',
            contents: 'export const value = 1;\n',
          },
          {
            path: 'packages/example/src/unit/logic.test.ts',
            contents: [
              'const cases = [',
              '  { inputs: {}, mock: () => ({}), assert: () => undefined },',
              '];',
              "it.each(cases)('$name', () => undefined);",
            ].join('\n'),
          },
        ],
      },
      mock: async (inputs) => {
        const rootDirectory = await mkdtemp(
          join(tmpdir(), 'devplat-check-unit-tests-'),
        );

        for (const file of inputs.files) {
          const filePath = resolve(rootDirectory, file.path);
          await mkdir(resolve(filePath, '..'), { recursive: true });
          await writeFile(filePath, file.contents, 'utf8');
        }

        return { rootDirectory };
      },
      assert: async (context) => {
        expect(
          await collectUnitTestLayoutFailures(context.rootDirectory),
        ).toEqual([]);
        expect(
          await collectTestCaseStyleFailures(context.rootDirectory),
        ).toEqual([]);
      },
    },
    {
      name: 'reports missing sibling tests and missing structured case fragments',
      inputs: {
        files: [
          {
            path: 'packages/example/src/unit/service.ts',
            contents: 'export class Service {}\n',
          },
          {
            path: 'packages/example/src/unit/service.test.ts',
            contents: "it('uses an ad hoc test', () => undefined);\n",
          },
        ],
      },
      mock: async (inputs) => {
        const rootDirectory = await mkdtemp(
          join(tmpdir(), 'devplat-check-unit-tests-'),
        );

        for (const file of inputs.files) {
          const filePath = resolve(rootDirectory, file.path);
          await mkdir(resolve(filePath, '..'), { recursive: true });
          await writeFile(filePath, file.contents, 'utf8');
        }

        return { rootDirectory };
      },
      assert: async (context) => {
        const layoutFailures = await collectUnitTestLayoutFailures(
          context.rootDirectory,
        );
        const styleFailures = await collectTestCaseStyleFailures(
          context.rootDirectory,
        );

        expect(layoutFailures).toEqual([]);
        expect(styleFailures).toContain(
          'packages/example/src/unit/service.test.ts is missing const cases = [',
        );
        expect(styleFailures).toContain(
          'packages/example/src/unit/service.test.ts is missing inputs:',
        );
        expect(styleFailures).toContain(
          'packages/example/src/unit/service.test.ts is missing mock:',
        );
        expect(styleFailures).toContain(
          'packages/example/src/unit/service.test.ts is missing assert:',
        );
      },
    },
    {
      name: 'reports missing required sibling test files',
      inputs: {
        files: [
          {
            path: 'packages/example/src/unit/service.ts',
            contents: 'export class Service {}\n',
          },
        ],
      },
      mock: async (inputs) => {
        const rootDirectory = await mkdtemp(
          join(tmpdir(), 'devplat-check-unit-tests-'),
        );

        for (const file of inputs.files) {
          const filePath = resolve(rootDirectory, file.path);
          await mkdir(resolve(filePath, '..'), { recursive: true });
          await writeFile(filePath, file.contents, 'utf8');
        }

        return { rootDirectory };
      },
      assert: async (context) => {
        expect(
          await collectUnitTestLayoutFailures(context.rootDirectory),
        ).toContain('example/unit/service.ts is missing service.test.ts');
      },
    },
    {
      name: 'reports ad hoc loops over structured cases',
      inputs: {
        files: [
          {
            path: 'packages/example/src/unit/logic.ts',
            contents: 'export const value = 1;\n',
          },
          {
            path: 'packages/example/src/unit/logic.test.ts',
            contents: [
              'const cases = [',
              '  { name: "case one", inputs: {}, mock: () => ({}), assert: () => undefined },',
              '];',
              '',
              'for (const testCase of cases) {',
              '  it(testCase.name, () => {',
              '    testCase.assert(testCase.mock(testCase.inputs), testCase.inputs);',
              '  });',
              '}',
            ].join('\n'),
          },
        ],
      },
      mock: async (inputs) => {
        const rootDirectory = await mkdtemp(
          join(tmpdir(), 'devplat-check-unit-tests-'),
        );

        for (const file of inputs.files) {
          const filePath = resolve(rootDirectory, file.path);
          await mkdir(resolve(filePath, '..'), { recursive: true });
          await writeFile(filePath, file.contents, 'utf8');
        }

        return { rootDirectory };
      },
      assert: async (context) => {
        expect(
          await collectTestCaseStyleFailures(context.rootDirectory),
        ).toContain(
          "packages/example/src/unit/logic.test.ts must use it.each(cases)('$name', ...) instead of looping over cases.",
        );
      },
    },
    {
      name: 'reports structured cases without the canonical runner',
      inputs: {
        files: [
          {
            path: 'packages/example/src/unit/logic.ts',
            contents: 'export const value = 1;\n',
          },
          {
            path: 'packages/example/src/unit/logic.test.ts',
            contents: [
              'const cases = [',
              '  { name: "case one", inputs: {}, mock: () => ({}), assert: () => undefined },',
              '];',
              '',
              "it('uses one case manually', () => {",
              '  cases[0].assert(cases[0].mock(cases[0].inputs), cases[0].inputs);',
              '});',
            ].join('\n'),
          },
        ],
      },
      mock: async (inputs) => {
        const rootDirectory = await mkdtemp(
          join(tmpdir(), 'devplat-check-unit-tests-'),
        );

        for (const file of inputs.files) {
          const filePath = resolve(rootDirectory, file.path);
          await mkdir(resolve(filePath, '..'), { recursive: true });
          await writeFile(filePath, file.contents, 'utf8');
        }

        return { rootDirectory };
      },
      assert: async (context) => {
        expect(
          await collectTestCaseStyleFailures(context.rootDirectory),
        ).toContain(
          "packages/example/src/unit/logic.test.ts is missing it.each(cases)('$name', ...)",
        );
      },
    },
    {
      name: 'reports case tables that use non-canonical runner variables',
      inputs: {
        files: [
          {
            path: 'packages/example/src/unit/logic.ts',
            contents: 'export const value = 1;\n',
          },
          {
            path: 'packages/example/src/unit/logic.test.ts',
            contents: [
              'const routeCases = [',
              '  { name: "case one", inputs: {}, mock: () => ({}), assert: () => undefined },',
              '];',
              '',
              "it.each(routeCases)('$name', () => undefined);",
              '',
              'const cases = [',
              '  { name: "case two", inputs: {}, mock: () => ({}), assert: () => undefined },',
              '];',
              "it.each(cases)('$name', () => undefined);",
            ].join('\n'),
          },
        ],
      },
      mock: async (inputs) => {
        const rootDirectory = await mkdtemp(
          join(tmpdir(), 'devplat-check-unit-tests-'),
        );

        for (const file of inputs.files) {
          const filePath = resolve(rootDirectory, file.path);
          await mkdir(resolve(filePath, '..'), { recursive: true });
          await writeFile(filePath, file.contents, 'utf8');
        }

        return { rootDirectory };
      },
      assert: async (context) => {
        expect(
          await collectTestCaseStyleFailures(context.rootDirectory),
        ).toContain(
          "packages/example/src/unit/logic.test.ts must use it.each(cases)('$name', ...) instead of it.each(routeCases).",
        );
      },
    },
  ];

  it.each(cases)('$name', async (testCase) => {
    expect.hasAssertions();
    const context = await testCase.mock(testCase.inputs);

    await testCase.assert(context, testCase.inputs);
  });
});
