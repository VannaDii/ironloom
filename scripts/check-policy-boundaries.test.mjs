import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { collectPolicyBoundaryErrors } from './check-policy-boundaries.mjs';

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

describe('check-policy-boundaries', () => {
  const cases = [
    {
      name: 'passes on the repository source files',
      inputs: {
        rootDirectory: repoRootDirectory,
      },
      mock: async ({ rootDirectory }) => rootDirectory,
      assert: (errors) => {
        expect(errors).toEqual([]);
      },
    },
    {
      name: 'fails when a non-adapter package declares an adapter dependency',
      inputs: {
        files: {
          'packages/core/package.json': `
            {
              "name": "@vannadii/devplat-core",
              "version": "0.0.0",
              "dependencies": {
                "@vannadii/devplat-discord": "0.0.0"
              }
            }
          `,
        },
      },
      mock: async ({ files }) => createFixtureRoot(files),
      assert: (errors) => {
        expect(
          errors.some(
            (error) =>
              error.includes('packages/core/package.json') &&
              error.includes('@vannadii/devplat-discord'),
          ),
        ).toBe(true);
      },
    },
    {
      name: 'allows packages without adapter manifest dependencies',
      inputs: {
        files: {
          'packages/core/package.json': `
            {
              "name": "@vannadii/devplat-core",
              "version": "0.0.0",
              "dependencies": {
                "@vannadii/devplat-config": "0.0.0"
              }
            }
          `,
        },
      },
      mock: async ({ files }) => createFixtureRoot(files),
      assert: (errors) => {
        expect(errors).toEqual([]);
      },
    },
    {
      name: 'allows the OpenClaw adapter to depend on the Discord control plane',
      inputs: {
        files: {
          'packages/openclaw/package.json': `
            {
              "name": "@vannadii/devplat-openclaw",
              "version": "0.0.0",
              "dependencies": {
                "@vannadii/devplat-discord": "0.0.0"
              }
            }
          `,
        },
      },
      mock: async ({ files }) => createFixtureRoot(files),
      assert: (errors) => {
        expect(errors).toEqual([]);
      },
    },
  ];

  it.each(cases)('$name', async (testCase) => {
    const rootDirectory = await testCase.mock(testCase.inputs);
    const outcome = await collectPolicyBoundaryErrors({ rootDirectory });
    testCase.assert(outcome);
  });
});

async function createFixtureRoot(files) {
  const rootDirectory = await mkdtemp(
    resolve(tmpdir(), 'devplat-check-policy-boundaries-'),
  );
  temporaryRoots.push(rootDirectory);

  for (const [relativePath, content] of Object.entries(files)) {
    const filePath = resolve(rootDirectory, relativePath);
    await writeDirectory(dirname(filePath));
    await writeFile(filePath, `${content.trim()}\n`, 'utf8');
  }

  return rootDirectory;
}

async function writeDirectory(directoryPath) {
  await mkdir(directoryPath, { recursive: true });
}
