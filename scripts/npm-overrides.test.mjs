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

  it('keeps prism-media on the documented opusscript fallback', () => {
    const discordVoiceRoot = path.dirname(
      path.dirname(require.resolve('@discordjs/voice')),
    );
    const prismOpusPath = path.join(
      discordVoiceRoot,
      'node_modules',
      'prism-media',
      'src',
      'opus',
      'Opus.js',
    );
    const { Encoder } = require(prismOpusPath);
    const encoder = new Encoder({ rate: 48_000, channels: 2, frameSize: 960 });

    expect(Encoder.type).toBe('opusscript');
    encoder.destroy();
  });

  it('installs the node-domexception override as the native constructor', () => {
    expect(require('node-domexception')).toBe(globalThis.DOMException);
  });
});
