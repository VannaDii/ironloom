import { access, readdir, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { relative, resolve } from 'node:path';

const rootDirectory = resolve(import.meta.dirname, '..');
const packagesDirectory = resolve(rootDirectory, 'packages');
const rootReadmePath = resolve(rootDirectory, 'README.md');
const packageDirectories = (
  await readdir(packagesDirectory, {
    withFileTypes: true,
  })
)
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .toSorted((left, right) => left.localeCompare(right));

const requiredScripts = ['build', 'clean', 'lint', 'typecheck', 'test'];

const failures = [];

try {
  const rootReadme = await readFile(rootReadmePath, 'utf8');
  if (!rootReadme.includes('```mermaid')) {
    failures.push('README.md must include a Mermaid system flow diagram');
  }
} catch (error) {
  failures.push(`could not read README.md (${getErrorMessage(error)})`);
}

for (const packageDirectoryName of packageDirectories) {
  const packageDirectory = resolve(packagesDirectory, packageDirectoryName);
  const packageJsonPath = resolve(packageDirectory, 'package.json');
  const readmePath = resolve(packageDirectory, 'README.md');
  const tsconfigPath = resolve(packageDirectory, 'tsconfig.json');
  const srcIndexPath = resolve(packageDirectory, 'src/index.ts');
  let packageJson;

  for (const filePath of [
    packageJsonPath,
    readmePath,
    tsconfigPath,
    srcIndexPath,
  ]) {
    try {
      await access(filePath, constants.F_OK);
    } catch {
      failures.push(
        `${packageDirectoryName}: missing ${relative(rootDirectory, filePath)}`,
      );
    }
  }

  try {
    packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'));
  } catch (error) {
    failures.push(
      `${packageDirectoryName}: could not read package.json (${getErrorMessage(error)})`,
    );
    continue;
  }

  try {
    const readme = await readFile(readmePath, 'utf8');
    if (!readme.includes('## Real-World Flow')) {
      failures.push(
        `${packageDirectoryName}: README.md must include a Real-World Flow section`,
      );
    }
    if (!readme.includes('```mermaid')) {
      failures.push(
        `${packageDirectoryName}: README.md must include a Mermaid diagram`,
      );
    }
  } catch (error) {
    failures.push(
      `${packageDirectoryName}: could not read README.md (${getErrorMessage(error)})`,
    );
  }

  if (typeof packageJson.name !== 'string' || packageJson.name.length === 0) {
    failures.push(`${packageDirectoryName}: package.json must define name`);
  }

  if (
    typeof packageJson.version !== 'string' ||
    packageJson.version.length === 0
  ) {
    failures.push(`${packageDirectoryName}: package.json must define version`);
  }

  if (packageJson.type !== 'module') {
    failures.push(`${packageDirectoryName}: package.json type must be module`);
  }

  if (packageJson.main !== './dist/index.js') {
    failures.push(`${packageDirectoryName}: main must be ./dist/index.js`);
  }

  if (packageJson.types !== './dist/index.d.ts') {
    failures.push(`${packageDirectoryName}: types must be ./dist/index.d.ts`);
  }

  if (
    !Array.isArray(packageJson.files) ||
    !packageJson.files.includes('dist')
  ) {
    failures.push(`${packageDirectoryName}: files must include dist`);
  }

  if (
    packageJson.repository?.directory !== `packages/${packageDirectoryName}`
  ) {
    failures.push(
      `${packageDirectoryName}: repository.directory must be packages/${packageDirectoryName}`,
    );
  }

  for (const scriptName of requiredScripts) {
    if (typeof packageJson.scripts?.[scriptName] !== 'string') {
      failures.push(`${packageDirectoryName}: missing ${scriptName} script`);
    }
  }

  let tsconfig;

  try {
    tsconfig = JSON.parse(await readFile(tsconfigPath, 'utf8'));
  } catch (error) {
    failures.push(
      `${packageDirectoryName}: could not read tsconfig.json (${getErrorMessage(error)})`,
    );
    continue;
  }

  if (tsconfig.extends !== '../../tsconfig.base.json') {
    failures.push(
      `${packageDirectoryName}: tsconfig.json must extend ../../tsconfig.base.json`,
    );
  }
}

if (failures.length > 0) {
  throw new Error(failures.join('\n'));
}

console.log(`Validated ${packageDirectories.length} package directories.`);

function getErrorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
