import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { promisify } from 'node:util';

import { describe, expect, it } from 'vitest';

import {
  createOrUpdateTags,
  deriveReleaseTags,
  parseArgs,
  resolveSingleReleaseVersion,
} from './tag-release-lines.mjs';

const execFileAsync = promisify(execFile);
const testTempDirectory = resolve(import.meta.dirname, '..', '.tmp');

describe('tag-release-lines', () => {
  const cases = [
    {
      name: 'parses explicit root and dry-run flags',
      inputs: {
        argv: ['--dry-run', '--root', 'release-root'],
      },
      mock: ({ argv }) => parseArgs(argv),
      assert: (options) => {
        expect(options).toEqual({
          dryRun: true,
          rootDirectory: 'release-root',
        });
      },
    },
    {
      name: 'rejects root flags without a value',
      inputs: {
        argv: ['--root'],
      },
      mock:
        ({ argv }) =>
        () =>
          parseArgs(argv),
      assert: (run) => {
        expect(run).toThrow('--root requires a directory value.');
      },
    },
    {
      name: 'derives major minor and patch tags from a stable version',
      inputs: {
        version: '2.3.4',
      },
      mock: ({ version }) => deriveReleaseTags(version),
      assert: (tags) => {
        expect(tags).toEqual({
          major: 'v2',
          minor: 'v2.3',
          patch: 'v2.3.4',
        });
      },
    },
    {
      name: 'rejects prerelease versions for stable release-line tags',
      inputs: {
        version: '2.3.4-dev.1',
      },
      mock:
        ({ version }) =>
        () =>
          deriveReleaseTags(version),
      assert: (run) => {
        expect(run).toThrow('Release version must be a stable semver version');
      },
    },
    {
      name: 'selects one shared public DevPlat package version',
      inputs: {
        packages: [
          {
            name: '@vannadii/devplat-core',
            version: '1.2.3',
          },
          {
            name: '@vannadii/devplat-openclaw',
            version: '1.2.3',
          },
          {
            name: 'devplat',
            private: true,
            version: '0.0.0',
          },
        ],
      },
      mock: ({ packages }) => resolveSingleReleaseVersion(packages),
      assert: (version) => {
        expect(version).toBe('1.2.3');
      },
    },
    {
      name: 'rejects split public DevPlat package versions',
      inputs: {
        packages: [
          {
            name: '@vannadii/devplat-core',
            version: '1.2.3',
          },
          {
            name: '@vannadii/devplat-openclaw',
            version: '1.2.4',
          },
        ],
      },
      mock:
        ({ packages }) =>
        () =>
          resolveSingleReleaseVersion(packages),
      assert: (run) => {
        expect(run).toThrow('DevPlat packages must share one release version');
      },
    },
  ];

  it.each(cases)('$name', (testCase) => {
    const result = testCase.mock(testCase.inputs);
    testCase.assert(result);
  });

  it('returns dry-run output without pushing tags', async () => {
    const rootDirectory = await createReleaseRoot();
    try {
      const result = await createOrUpdateTags({
        rootDirectory,
        dryRun: true,
      });

      expect(result).toEqual({
        version: '1.2.3',
        headSha: expect.stringMatching(/^[0-9a-f]{40}$/u),
        tags: {
          major: 'v1',
          minor: 'v1.2',
          patch: 'v1.2.3',
        },
        pushed: false,
      });
    } finally {
      await rm(rootDirectory, { recursive: true, force: true });
    }
  });

  it('rejects moving an existing patch tag to a different commit', async () => {
    const rootDirectory = await createReleaseRoot();
    try {
      const initialHead = await git(rootDirectory, ['rev-parse', 'HEAD']);
      await git(rootDirectory, ['tag', 'v1.2.3']);
      await writeFile(resolve(rootDirectory, 'README.md'), 'release update\n');
      await git(rootDirectory, ['add', 'README.md']);
      await git(rootDirectory, ['commit', '-m', 'release update']);
      const newHead = await git(rootDirectory, ['rev-parse', 'HEAD']);

      await expect(
        createOrUpdateTags({
          rootDirectory,
          dryRun: false,
        }),
      ).rejects.toThrow(
        `v1.2.3 already exists at ${initialHead}; refusing to move an immutable patch release tag to ${newHead}.`,
      );
    } finally {
      await rm(rootDirectory, { recursive: true, force: true });
    }
  });
});

async function createReleaseRoot() {
  await mkdir(testTempDirectory, { recursive: true });
  const rootDirectory = await mkdtemp(
    resolve(testTempDirectory, 'release-tags-'),
  );
  await mkdir(resolve(rootDirectory, 'packages/core'), { recursive: true });
  await writeFile(
    resolve(rootDirectory, 'packages/core/package.json'),
    `${JSON.stringify(
      {
        name: '@vannadii/devplat-core',
        version: '1.2.3',
      },
      null,
      2,
    )}\n`,
  );
  await git(rootDirectory, ['init']);
  await git(rootDirectory, ['add', '.']);
  await git(rootDirectory, ['commit', '-m', 'initial release']);

  return rootDirectory;
}

async function git(rootDirectory, args) {
  const { stdout } = await execFileAsync(
    'git',
    [
      '-c',
      'user.name=DevPlat Tests',
      '-c',
      'user.email=devplat-tests@example.com',
      '-c',
      'commit.gpgsign=false',
      '-c',
      'tag.gpgSign=false',
      ...args,
    ],
    {
      cwd: rootDirectory,
      env: {
        ...process.env,
        GIT_CONFIG_GLOBAL: '/dev/null',
        GIT_CONFIG_NOSYSTEM: '1',
      },
    },
  );

  return stdout.trim();
}
