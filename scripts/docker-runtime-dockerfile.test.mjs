import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const repoRootDirectory = resolve(import.meta.dirname, '..');
const runtimeDockerfilePath = resolve(
  repoRootDirectory,
  'docker/openclaw-runtime/Dockerfile',
);

describe('openclaw runtime Dockerfile', () => {
  const cases = [
    {
      name: 'builds workspace output on the build platform before target runtime assembly',
      inputs: {
        dockerfilePath: runtimeDockerfilePath,
      },
      mock: async ({ dockerfilePath }) => ({
        dockerfile: await readFile(dockerfilePath, 'utf8'),
      }),
      assert: ({ dockerfile }) => {
        expect(dockerfile).toContain(
          'FROM --platform=$BUILDPLATFORM node:${NODE_VERSION}-alpine${ALPINE_VERSION} AS node-base',
        );
        expect(dockerfile).toContain('FROM node-base AS build');
        expect(dockerfile).toContain('AS production-dependencies');
        expect(dockerfile).toContain('npm ci --omit=dev --ignore-scripts');
        expect(dockerfile).toContain(
          'COPY --from=production-dependencies /workspace/node_modules ./node_modules',
        );
      },
    },
  ];

  it.each(cases)('$name', async ({ inputs, mock, assert }) => {
    const context = await mock(inputs);

    await assert(context, inputs);
  });
});
