import { readdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const rootDirectory = resolve(import.meta.dirname, '..');

/** Unit entrypoint files that do not need direct sibling tests. */
const ignoredUnitFiles = new Set(['index.ts']);

/**
 * Returns true when a unit source file needs a sibling test file.
 */
function isUnitSourceFile(fileName) {
  return (
    !ignoredUnitFiles.has(fileName) &&
    fileName.endsWith('.ts') &&
    !fileName.endsWith('.test.ts') &&
    (fileName === 'logic.ts' || fileName === 'service.ts')
  );
}

/**
 * Collects sibling-test failures for one unit directory.
 */
async function collectUnitDirectoryFailures(packageName, unit, unitPath) {
  const unitStats = await stat(unitPath).catch(() => null);
  if (!unitStats?.isDirectory()) {
    return [];
  }

  const unitFiles = await readdir(unitPath);
  return unitFiles.filter(isUnitSourceFile).flatMap((fileName) => {
    const expectedTest = fileName.replace('.ts', '.test.ts');
    return unitFiles.includes(expectedTest)
      ? []
      : [`${packageName}/${unit}/${fileName} is missing ${expectedTest}`];
  });
}

/**
 * Collects sibling-test failures for one package.
 */
async function collectPackageLayoutFailures(
  repositoryPackagesDirectory,
  packageName,
) {
  const srcDirectory = resolve(repositoryPackagesDirectory, packageName, 'src');
  const units = await readdir(srcDirectory).catch(() => []);
  const failures = await Promise.all(
    units.map((unit) =>
      collectUnitDirectoryFailures(
        packageName,
        unit,
        resolve(srcDirectory, unit),
      ),
    ),
  );

  return failures.flat();
}

/**
 * Collects package source files that require missing sibling unit tests.
 */
export async function collectUnitTestLayoutFailures(
  repositoryRoot = rootDirectory,
) {
  const repositoryPackagesDirectory = resolve(repositoryRoot, 'packages');
  const packageNames = await readdir(repositoryPackagesDirectory).catch(
    () => [],
  );
  const failures = await Promise.all(
    packageNames.map((packageName) =>
      collectPackageLayoutFailures(repositoryPackagesDirectory, packageName),
    ),
  );

  return failures.flat();
}

/**
 * Collects unit-test repository layout failures.
 */
export async function collectUnitTestFailures(repositoryRoot = rootDirectory) {
  return collectUnitTestLayoutFailures(repositoryRoot);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const failures = await collectUnitTestFailures();

  if (failures.length > 0) {
    throw new Error(`Unit test violations:\n${failures.join('\n')}`);
  }

  console.log('All non-trivial units have required sibling tests.');
}
