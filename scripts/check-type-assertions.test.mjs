import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { collectTypeAssertionFailures } from './check-type-assertions.mjs';

/**
 * Repository root used by the happy-path repository assertion case.
 */
const repoRootDirectory = resolve(import.meta.dirname, '..');

/**
 * Temporary fixture roots created by individual test cases.
 */
const temporaryRoots = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((rootDirectory) =>
        rm(rootDirectory, { force: true, recursive: true }),
      ),
  );
});

describe('check-type-assertions', () => {
  const cases = [
    {
      name: 'passes on the repository source files',
      inputs: {
        rootDirectory: repoRootDirectory,
      },
      mock: async ({ rootDirectory }) => rootDirectory,
      assert: (failures) => {
        expect(failures).toEqual([]);
      },
    },
    {
      name: 'fails when authored package code uses as expressions',
      inputs: {
        files: {
          'packages/core/src/example/logic.ts': `
            export function parse(value: unknown): string {
              return value as string;
            }
          `,
        },
      },
      mock: async ({ files }) => createFixtureRoot(files),
      assert: (failures) => {
        expect(failures).toEqual([
          'packages/core/src/example/logic.ts:2:22 uses a TypeScript as assertion; use codec narrowing or typed control flow instead.',
        ]);
      },
    },
    {
      name: 'fails when authored package code uses angle-bracket assertions',
      inputs: {
        files: {
          'packages/core/src/example/logic.ts': `
            export function parse(value: unknown): string {
              return <string>value;
            }
          `,
        },
      },
      mock: async ({ files }) => createFixtureRoot(files),
      assert: (failures) => {
        expect(failures).toEqual([
          'packages/core/src/example/logic.ts:2:22 uses an angle-bracket type assertion; use codec narrowing or typed control flow instead.',
        ]);
      },
    },
    {
      name: 'fails when authored package code uses non-null assertions',
      inputs: {
        files: {
          'packages/core/src/example/logic.ts': `
            export function parse(value?: string): string {
              return value!;
            }
          `,
        },
      },
      mock: async ({ files }) => createFixtureRoot(files),
      assert: (failures) => {
        expect(failures).toEqual([
          'packages/core/src/example/logic.ts:2:22 uses a non-null assertion; use explicit undefined handling instead.',
        ]);
      },
    },
    {
      name: 'allows satisfies expressions because they validate without casting',
      inputs: {
        files: {
          'packages/core/src/example/constants.ts': `
            export const values = ['approved'] satisfies readonly string[];
          `,
        },
      },
      mock: async ({ files }) => createFixtureRoot(files),
      assert: (failures) => {
        expect(failures).toEqual([]);
      },
    },
    {
      name: 'ignores test files so contract-value assertions stay local to tests',
      inputs: {
        files: {
          'packages/core/src/example/logic.test.ts': `
            import { expect, it } from 'vitest';

            const cases = [
              {
                name: 'uses assertion in a test fixture',
                inputs: {},
                mock: () => ({}),
                assert: () => expect({ value: 'x' } as { value: string }).toBeDefined(),
              },
            ];

            it.each(cases)('$name', (testCase) => {
              testCase.assert(testCase.mock(), testCase.inputs);
            });
          `,
        },
      },
      mock: async ({ files }) => createFixtureRoot(files),
      assert: (failures) => {
        expect(failures).toEqual([]);
      },
    },
  ];

  it.each(cases)('$name', async (testCase) => {
    expect.hasAssertions();
    const rootDirectory = await testCase.mock(testCase.inputs);
    const failures = await collectTypeAssertionFailures({
      rootDirectory,
    });

    testCase.assert(failures, testCase.inputs);
  });
});

/**
 * Creates one temporary repository-shaped fixture root.
 */
async function createFixtureRoot(files) {
  const rootDirectory = await mkdtemp(
    resolve(tmpdir(), 'devplat-check-type-assertions-'),
  );
  temporaryRoots.push(rootDirectory);

  for (const [relativePath, content] of Object.entries(files)) {
    const filePath = resolve(rootDirectory, relativePath);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, `${content.trim()}\n`, 'utf8');
  }

  return rootDirectory;
}
