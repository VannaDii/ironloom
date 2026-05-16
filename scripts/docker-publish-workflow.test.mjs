import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const repoRootDirectory = resolve(import.meta.dirname, '..');
const runtimeImagePlatforms = 'platforms: linux/amd64,linux/arm64/v8';

describe('docker runtime publish workflows', () => {
  const cases = [
    {
      name: 'publishes PR runtime images as a multi-platform manifest',
      inputs: {
        workflowPath: resolve(repoRootDirectory, '.github/workflows/ci.yml'),
      },
      mock: async ({ workflowPath }) => ({
        workflow: await readFile(workflowPath, 'utf8'),
      }),
      assert: ({ workflow }) => {
        expect(workflow).toContain('docker/setup-qemu-action@v4');
        expect(workflow).toContain('docker/setup-buildx-action@v4');
        expect(workflow).toContain(runtimeImagePlatforms);
      },
    },
    {
      name: 'publishes release runtime images as a multi-platform manifest',
      inputs: {
        workflowPath: resolve(
          repoRootDirectory,
          '.github/workflows/docker-publish.yml',
        ),
      },
      mock: async ({ workflowPath }) => ({
        workflow: await readFile(workflowPath, 'utf8'),
      }),
      assert: ({ workflow }) => {
        expect(workflow).toContain('docker/setup-qemu-action@v4');
        expect(workflow).toContain('docker/setup-buildx-action@v4');
        expect(workflow).toContain(runtimeImagePlatforms);
      },
    },
  ];

  it.each(cases)('$name', async ({ inputs, mock, assert }) => {
    const context = await mock(inputs);

    await assert(context, inputs);
  });
});
