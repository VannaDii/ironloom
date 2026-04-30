import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

import { format } from 'prettier';

const rootDirectory = resolve(import.meta.dirname, '..');
const packageJsonPath = resolve(
  rootDirectory,
  'packages/openclaw/package.json',
);
const configSchemaPath = resolve(
  rootDirectory,
  'packages/openclaw/schemas/plugin-config.schema.json',
);
const manifestPath = resolve(
  rootDirectory,
  'packages/openclaw/openclaw.plugin.json',
);

export async function renderOpenClawManifest() {
  const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'));
  const configSchema = JSON.parse(await readFile(configSchemaPath, 'utf8'));

  const manifest = {
    id: '@vannadii/devplat-openclaw',
    entry: './dist/index.js',
    configSchema,
    name: 'DevPlat OpenClaw Adapter',
    version: packageJson.version,
    description:
      'DevPlat capability bridge for OpenClaw with Discord-first operational flows.',
  };

  return format(`${JSON.stringify(manifest, null, 2)}\n`, {
    parser: 'json',
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const manifest = await renderOpenClawManifest();

  await writeFile(manifestPath, manifest, 'utf8');

  console.log('Generated packages/openclaw/openclaw.plugin.json');
}
