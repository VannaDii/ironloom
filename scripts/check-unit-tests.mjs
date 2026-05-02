import { readdir, readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const rootDirectory = resolve(import.meta.dirname, '..');

const ignoredUnitFiles = new Set(['index.ts']);
const ignoredDirectories = new Set([
  '.git',
  '.turbo',
  'coverage',
  'dist',
  'node_modules',
]);

function isTestFile(filePath) {
  return /\.test\.(?:mjs|mts|ts)$/u.test(filePath);
}

async function collectFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true }).catch(
    () => [],
  );
  const files = [];

  for (const entry of entries) {
    const entryPath = resolve(directory, entry.name);

    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name)) {
        files.push(...(await collectFiles(entryPath)));
      }
      continue;
    }

    if (entry.isFile()) {
      files.push(entryPath);
    }
  }

  return files;
}

function isUnitSourceFile(fileName) {
  return (
    !ignoredUnitFiles.has(fileName) &&
    fileName.endsWith('.ts') &&
    !fileName.endsWith('.test.ts') &&
    (fileName === 'logic.ts' || fileName === 'service.ts')
  );
}

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

export async function collectTestCaseStyleFailures(
  repositoryRoot = rootDirectory,
) {
  const testFiles = (await collectFiles(repositoryRoot)).filter(isTestFile);
  const failures = [];

  for (const testFile of testFiles) {
    const contents = await readFile(testFile, 'utf8');
    const relativePath = testFile.slice(repositoryRoot.length + 1);
    const requiredFragments = [
      'const cases = [',
      'inputs:',
      'mock:',
      'assert:',
    ];

    for (const fragment of requiredFragments) {
      if (!contents.includes(fragment)) {
        failures.push(`${relativePath} is missing ${fragment}`);
      }
    }
  }

  return failures;
}

export async function collectUnitTestFailures(repositoryRoot = rootDirectory) {
  return [
    ...(await collectUnitTestLayoutFailures(repositoryRoot)),
    ...(await collectTestCaseStyleFailures(repositoryRoot)),
  ];
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const failures = await collectUnitTestFailures();

  if (failures.length > 0) {
    throw new Error(`Unit test violations:\n${failures.join('\n')}`);
  }

  console.log('All non-trivial units have required structured tests.');
}
