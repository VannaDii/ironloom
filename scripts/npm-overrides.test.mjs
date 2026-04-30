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
  it('makes the local discordjs opus shim behave like a missing module', () => {
    const shimPath = path.join(
      repoRoot,
      'tools',
      'npm-overrides',
      'discordjs-opus',
      'index.cjs',
    );

    expect(() => require(shimPath)).toThrowError(
      expect.objectContaining({
        code: 'MODULE_NOT_FOUND',
        message: "Cannot find module '@discordjs/opus'",
      }),
    );
  });

  it('exports the native DOMException from the local node-domexception shim', () => {
    const shimPath = path.join(
      repoRoot,
      'tools',
      'npm-overrides',
      'node-domexception',
      'index.cjs',
    );

    expect(require(shimPath)).toBe(globalThis.DOMException);
  });

  it('installs the node-domexception override as the native constructor', () => {
    expect(require('node-domexception')).toBe(globalThis.DOMException);
  });
});
