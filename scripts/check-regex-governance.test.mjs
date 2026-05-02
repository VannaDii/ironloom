import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { collectRegexGovernanceFailures } from './check-regex-governance.mjs';

/**
 * Repository root used by the repository conformance case.
 */
const repoRootDirectory = resolve(import.meta.dirname, '..');

/**
 * Temporary fixture roots created by individual cases.
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

describe('check-regex-governance', () => {
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
      name: 'allows named regex patterns in constants files with test references',
      inputs: {
        files: {
          'packages/core/src/domain/constants.ts': `
            export const SAFE_BRANCH_PATTERN = /^[a-z0-9-]+$/u;
          `,
          'packages/core/src/domain/logic.test.ts': `
            import { expect, it } from 'vitest';
            import { SAFE_BRANCH_PATTERN } from './constants.js';

            const cases = [
              {
                name: 'matches safe branch names',
                inputs: { value: 'feature-1' },
                mock: ({ value }) => SAFE_BRANCH_PATTERN.test(value),
                assert: (matched) => expect(matched).toBe(true),
              },
            ];

            it.each(cases)('$name', (testCase) => {
              testCase.assert(testCase.mock(testCase.inputs), testCase.inputs);
            });
          `,
        },
      },
      mock: async ({ files }) => createFixtureRoot(files),
      assert: (failures) => {
        expect(failures).toEqual([]);
      },
    },
    {
      name: 'fails regex literals outside constants files',
      inputs: {
        files: {
          'packages/core/src/domain/logic.ts': `
            export function isSafe(value: string): boolean {
              return /^[a-z0-9-]+$/u.test(value);
            }
          `,
        },
      },
      mock: async ({ files }) => createFixtureRoot(files),
      assert: (failures) => {
        expect(failures).toEqual([
          'packages/core/src/domain/logic.ts:2:22 defines a regular expression outside constants.ts; move it to the owning constants module and test it directly.',
        ]);
      },
    },
    {
      name: 'fails RegExp constructors outside constants files',
      inputs: {
        files: {
          'packages/core/src/domain/logic.ts': `
            export function createPattern(): RegExp {
              return new RegExp('[a-z]+', 'u');
            }
          `,
        },
      },
      mock: async ({ files }) => createFixtureRoot(files),
      assert: (failures) => {
        expect(failures).toEqual([
          'packages/core/src/domain/logic.ts:2:22 defines a regular expression outside constants.ts; move it to the owning constants module and test it directly.',
        ]);
      },
    },
    {
      name: 'fails unnamed regex constants',
      inputs: {
        files: {
          'packages/core/src/domain/constants.ts': `
            export const branchRegex = /^[a-z0-9-]+$/u;
          `,
          'packages/core/src/domain/logic.test.ts': `
            import { expect, it } from 'vitest';
            import { branchRegex } from './constants.js';

            const cases = [
              {
                name: 'matches safe branch names',
                inputs: { value: 'feature-1' },
                mock: ({ value }) => branchRegex.test(value),
                assert: (matched) => expect(matched).toBe(true),
              },
            ];

            it.each(cases)('$name', (testCase) => {
              testCase.assert(testCase.mock(testCase.inputs), testCase.inputs);
            });
          `,
        },
      },
      mock: async ({ files }) => createFixtureRoot(files),
      assert: (failures) => {
        expect(failures).toEqual([
          'packages/core/src/domain/constants.ts:1:14 defines regex constant branchRegex without a PATTERN suffix.',
        ]);
      },
    },
    {
      name: 'fails named regex constants without package test references',
      inputs: {
        files: {
          'packages/core/src/domain/constants.ts': `
            export const SAFE_BRANCH_PATTERN = /^[a-z0-9-]+$/u;
          `,
        },
      },
      mock: async ({ files }) => createFixtureRoot(files),
      assert: (failures) => {
        expect(failures).toEqual([
          'packages/core/src/domain/constants.ts:1:14 defines regex constant SAFE_BRANCH_PATTERN without a package test reference.',
        ]);
      },
    },
    {
      name: 'ignores test-local regex assertions',
      inputs: {
        files: {
          'packages/core/src/domain/logic.test.ts': `
            import { expect, it } from 'vitest';

            const cases = [
              {
                name: 'uses regex inside a test assertion',
                inputs: { value: 'Bearer token' },
                mock: ({ value }) => value,
                assert: (value) => expect(value).toMatch(/^Bearer /u),
              },
            ];

            it.each(cases)('$name', (testCase) => {
              testCase.assert(testCase.mock(testCase.inputs), testCase.inputs);
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
    const failures = await collectRegexGovernanceFailures({
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
    resolve(tmpdir(), 'devplat-check-regex-governance-'),
  );
  temporaryRoots.push(rootDirectory);

  for (const [relativePath, content] of Object.entries(files)) {
    const filePath = resolve(rootDirectory, relativePath);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, `${content.trim()}\n`, 'utf8');
  }

  return rootDirectory;
}
