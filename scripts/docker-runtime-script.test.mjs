import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

const dockerRunLatestScriptName = 'docker:openclaw:latest';
const latestOpenClawRuntimeImage =
  'ghcr.io/vannadii/devplat-openclaw-runtime:latest';

describe('docker runtime npm scripts', () => {
  const cases = [
    {
      name: 'runs the latest OpenClaw runtime image with dashboard access',
      inputs: {
        packageUrl: new URL('../package.json', import.meta.url),
      },
      mock: async (inputs) =>
        JSON.parse(await readFile(inputs.packageUrl, 'utf8')),
      assert: async (packageJson) => {
        const script = packageJson.scripts?.[dockerRunLatestScriptName];

        expect(script).toEqual(expect.stringContaining('docker run'));
        expect(script).toEqual(expect.stringContaining('--pull always'));
        expect(script).toEqual(
          expect.stringContaining('${DEVPLAT_DOCKER_PLATFORM:+--platform}'),
        );
        expect(script).toEqual(
          expect.stringContaining(
            '${DEVPLAT_DOCKER_PLATFORM:+$DEVPLAT_DOCKER_PLATFORM}',
          ),
        );
        expect(script).toEqual(expect.stringContaining('-p 18789:18789'));
        expect(script).toEqual(
          expect.stringContaining(latestOpenClawRuntimeImage),
        );
        expect(script).toEqual(expect.stringContaining('--bind lan'));
        expect(script).toEqual(expect.stringContaining('--auth token'));
        expect(script).toEqual(expect.stringContaining('--token'));
      },
    },
  ];

  it.each(cases)('$name', async ({ inputs, mock, assert }) => {
    const context = await mock(inputs);

    await assert(context, inputs);
  });
});
