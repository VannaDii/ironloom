import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { collectConstantOwnershipFailures } from './check-constants.mjs';

const repoRootDirectory = resolve(import.meta.dirname, '..');
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

describe('check-constants', () => {
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
      name: 'allows lifecycle action literals in the owning constants file',
      inputs: {
        files: {
          'packages/core/src/domain/constants.ts': `
            export const DEVPLAT_ACTION_RETRY_GATES = 'retry-gates';
          `,
          'packages/discord/src/example/logic.ts': `
            import { DEVPLAT_ACTION_RETRY_GATES } from '@vannadii/devplat-core';

            export function getAction(): string {
              return DEVPLAT_ACTION_RETRY_GATES;
            }
          `,
        },
      },
      mock: async ({ files }) => createFixtureRoot(files),
      assert: (failures) => {
        expect(failures).toEqual([]);
      },
    },
    {
      name: 'fails when shared lifecycle action literals are redefined outside core constants',
      inputs: {
        files: {
          'packages/core/src/domain/constants.ts': `
            export const DEVPLAT_ACTION_RETRY_GATES = 'retry-gates';
          `,
          'packages/discord/src/example/logic.ts': `
            export function getAction(): string {
              return 'retry-gates';
            }
          `,
        },
      },
      mock: async ({ files }) => createFixtureRoot(files),
      assert: (failures) => {
        expect(failures).toEqual([
          'packages/discord/src/example/logic.ts:2:22 duplicates shared lifecycle action literal retry-gates; import the core constant instead.',
        ]);
      },
    },
    {
      name: 'allows tests to assert stable lifecycle action values',
      inputs: {
        files: {
          'packages/core/src/domain/constants.ts': `
            export const DEVPLAT_ACTION_RETRY_GATES = 'retry-gates';
          `,
          'packages/discord/src/example/logic.test.ts': `
            import { expect, it } from 'vitest';

            const cases = [
              {
                name: 'keeps public action value stable',
                inputs: {},
                mock: () => ({}),
                assert: () => expect('retry-gates').toBe('retry-gates'),
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
    const failures = await collectConstantOwnershipFailures({
      rootDirectory,
    });

    testCase.assert(failures, testCase.inputs);
  });
});

async function createFixtureRoot(files) {
  const rootDirectory = await mkdtemp(
    resolve(tmpdir(), 'devplat-check-constants-'),
  );
  temporaryRoots.push(rootDirectory);

  for (const [relativePath, content] of Object.entries(files)) {
    const filePath = resolve(rootDirectory, relativePath);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, `${content.trim()}\n`, 'utf8');
  }

  return rootDirectory;
}
