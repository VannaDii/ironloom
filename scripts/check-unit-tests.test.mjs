import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  collectUnitTestFailures,
  collectUnitTestLayoutFailures,
} from './check-unit-tests.mjs';

describe('check-unit-tests', () => {
  const cases = [
    {
      name: 'passes when unit sources have sibling tests',
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
      },
    },
    {
      name: 'passes layout when the sibling test exists',
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
        expect(await collectUnitTestFailures(context.rootDirectory)).toEqual(
          [],
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
  ];

  it.each(cases)('$name', async (testCase) => {
    expect.hasAssertions();
    const context = await testCase.mock(testCase.inputs);

    await testCase.assert(context, testCase.inputs);
  });
});
