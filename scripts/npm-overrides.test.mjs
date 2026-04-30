import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);

describe('npm override shims', () => {
  const cases = [
    {
      name: 'makes the local discordjs opus shim behave like a missing module',
      inputs: {
        mode: 'missing-module',
        pathSegments: ['tools', 'npm-overrides', 'discordjs-opus', 'index.cjs'],
      },
      mock: () => ({}),
      assert: (context, inputs) => {
        const shimPath = path.join(repoRoot, ...inputs.pathSegments);

        expect(() => require(shimPath)).toThrowError(
          expect.objectContaining({
            code: 'MODULE_NOT_FOUND',
            message: "Cannot find module '@discordjs/opus'",
          }),
        );
      },
    },
    {
      name: 'exports the native DOMException from the local node-domexception shim',
      inputs: {
        mode: 'local-domexception',
        pathSegments: [
          'tools',
          'npm-overrides',
          'node-domexception',
          'index.cjs',
        ],
      },
      mock: () => ({}),
      assert: (context, inputs) => {
        const shimPath = path.join(repoRoot, ...inputs.pathSegments);

        expect(require(shimPath)).toBe(globalThis.DOMException);
      },
    },
    {
      name: 'installs the node-domexception override as the native constructor',
      inputs: {
        mode: 'installed-domexception',
        packageName: 'node-domexception',
      },
      mock: () => ({}),
      assert: (context, inputs) => {
        expect(require(inputs.packageName)).toBe(globalThis.DOMException);
      },
    },
  ];

  for (const testCase of cases) {
    it(testCase.name, () => {
      expect.hasAssertions();
      const context = testCase.mock();

      testCase.assert(context, testCase.inputs);
    });
  }
});
