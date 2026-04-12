import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const repoRootDirectory = resolve(import.meta.dirname, '..');
const temporaryRoots = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((path) => rm(path, { force: true, recursive: true })),
  );
});

describe('stage-helm-chart', () => {
  const cases = [
    {
      name: 'stages Artifact Hub metadata, README, and LICENSE into the chart output',
      inputs: {
        artifacthubChangeDescription:
          'PR #25: publish chart metadata and README',
        artifacthubChangeKind: 'changed',
        artifacthubContainsSecurityUpdates: 'false',
        artifacthubImage:
          'ghcr.io/vannadii/devplat-openclaw-runtime:0.0.0-dev.1.abcdef123456',
        artifacthubPrerelease: 'true',
      },
      mock: async () => undefined,
      assert: async ({ outputDirectory, stdout }, inputs) => {
        const chartYaml = await readFile(
          resolve(outputDirectory, 'Chart.yaml'),
          'utf8',
        );
        const valuesYaml = await readFile(
          resolve(outputDirectory, 'values.yaml'),
          'utf8',
        );
        const readme = await readFile(
          resolve(outputDirectory, 'README.md'),
          'utf8',
        );
        const license = await readFile(
          resolve(outputDirectory, 'LICENSE'),
          'utf8',
        );
        const manifest = JSON.parse(stdout);

        expect(chartYaml).toContain(
          'artifacthub.io/category: integration-delivery',
        );
        expect(chartYaml).toContain(
          `artifacthub.io/prerelease: "${inputs.artifacthubPrerelease}"`,
        );
        expect(chartYaml).toContain(
          `artifacthub.io/containsSecurityUpdates: "${inputs.artifacthubContainsSecurityUpdates}"`,
        );
        expect(chartYaml).toContain(`- kind: ${inputs.artifacthubChangeKind}`);
        expect(chartYaml).toContain(
          `description: ${JSON.stringify(inputs.artifacthubChangeDescription)}`,
        );
        expect(chartYaml).toContain(
          `image: ${JSON.stringify(inputs.artifacthubImage)}`,
        );
        expect(valuesYaml).toContain('tag: "0.0.0-dev.1.abcdef123456"');
        expect(readme).toContain('# DevPlat Helm Chart');
        expect(license).toContain('MIT License');
        expect(manifest.artifacthubImage).toBe(inputs.artifacthubImage);
      },
    },
  ];

  it.each(cases)('$name', async (testCase) => {
    const outputDirectory = await mkdtemp(
      resolve(tmpdir(), 'devplat-stage-helm-chart-'),
    );
    temporaryRoots.push(outputDirectory);

    await testCase.mock();
    const stdout = await runStageHelmChart({
      outputDirectory,
      ...testCase.inputs,
    });
    await testCase.assert({ outputDirectory, stdout }, testCase.inputs);
  });
});

async function runStageHelmChart({
  artifacthubChangeDescription,
  artifacthubChangeKind,
  artifacthubContainsSecurityUpdates,
  artifacthubImage,
  artifacthubPrerelease,
  outputDirectory,
}) {
  const { stdout } = await execFileAsync(
    process.execPath,
    [
      resolve(repoRootDirectory, 'scripts/stage-helm-chart.mjs'),
      '--out-dir',
      outputDirectory,
      '--chart-version',
      '0.0.0-dev.1',
      '--app-version',
      '0.0.0-dev.1',
      '--image-tag',
      '0.0.0-dev.1.abcdef123456',
      '--artifacthub-image',
      artifacthubImage,
      '--artifacthub-prerelease',
      artifacthubPrerelease,
      '--artifacthub-contains-security-updates',
      artifacthubContainsSecurityUpdates,
      '--artifacthub-change-kind',
      artifacthubChangeKind,
      '--artifacthub-change-description',
      artifacthubChangeDescription,
    ],
    { cwd: repoRootDirectory },
  );

  return stdout;
}
