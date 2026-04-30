import { describe, expect, it } from 'vitest';

import {
  deriveReleaseTags,
  resolveSingleReleaseVersion,
} from './tag-release-lines.mjs';

describe('tag-release-lines', () => {
  const cases = [
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
});
