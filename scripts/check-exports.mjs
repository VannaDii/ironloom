import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const rootDirectory = resolve(import.meta.dirname, '..');
const packagesDirectory = resolve(rootDirectory, 'packages');
const packageDirectories = (
  await readdir(packagesDirectory, {
    withFileTypes: true,
  })
)
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .toSorted((left, right) => left.localeCompare(right));

const failures = [];

for (const packageDirectoryName of packageDirectories) {
  const packageJsonPath = resolve(
    packagesDirectory,
    packageDirectoryName,
    'package.json',
  );
  let packageJson;

  try {
    packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'));
  } catch (error) {
    failures.push(
      `${packageDirectoryName}: could not read package.json (${getErrorMessage(error)})`,
    );
    continue;
  }

  const rootExport = packageJson.exports?.['.'];

  if (
    typeof rootExport !== 'object' ||
    rootExport === null ||
    Array.isArray(rootExport)
  ) {
    failures.push(`${packageDirectoryName}: exports["."] must be an object`);
    continue;
  }

  const exportKeys = Object.keys(packageJson.exports);
  if (exportKeys.length !== 1 || exportKeys[0] !== '.') {
    failures.push(
      `${packageDirectoryName}: exports map must be strict and only expose "."`,
    );
  }

  const sourceExport = rootExport.source;
  if (
    typeof sourceExport !== 'object' ||
    sourceExport === null ||
    Array.isArray(sourceExport)
  ) {
    failures.push(
      `${packageDirectoryName}: exports["."].source must be an object`,
    );
    continue;
  }

  if (sourceExport.import !== './src/index.ts') {
    failures.push(
      `${packageDirectoryName}: exports["."].source.import must be ./src/index.ts`,
    );
  }

  if (sourceExport.types !== './src/index.ts') {
    failures.push(
      `${packageDirectoryName}: exports["."].source.types must be ./src/index.ts`,
    );
  }

  if (!Array.isArray(packageJson.files) || !packageJson.files.includes('src')) {
    failures.push(
      `${packageDirectoryName}: files must include src because exports["."].source points at src/index.ts`,
    );
  }

  if (rootExport.import !== './dist/index.js') {
    failures.push(
      `${packageDirectoryName}: exports["."].import must be ./dist/index.js`,
    );
  }

  if (rootExport.types !== './dist/index.d.ts') {
    failures.push(
      `${packageDirectoryName}: exports["."].types must be ./dist/index.d.ts`,
    );
  }
}

if (failures.length > 0) {
  throw new Error(failures.join('\n'));
}

console.log(`Validated exports for ${packageDirectories.length} packages.`);

function getErrorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
