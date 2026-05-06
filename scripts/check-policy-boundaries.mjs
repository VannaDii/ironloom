import { readdir, readFile } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Repository root used by the policy boundary checker. */
const defaultRootDirectory = resolve(import.meta.dirname, '..');

/** Package manifest dependency sections that can declare package edges. */
const dependencySections = [
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'peerDependencies',
];

/** Adapter package dependency allow-list by dependency name. */
const adapterDependencyRules = new Map([
  [
    '@vannadii/devplat-openclaw',
    {
      allowedPackages: new Set(['openclaw']),
    },
  ],
  [
    '@vannadii/devplat-discord',
    {
      allowedPackages: new Set(['discord', 'openclaw']),
    },
  ],
]);

/**
 * Collects package manifest dependency boundary violations.
 */
export async function collectPolicyBoundaryErrors({
  rootDirectory = defaultRootDirectory,
} = {}) {
  const errors = [];
  const packagesDirectory = resolve(rootDirectory, 'packages');
  const packageDirectories = await readdir(packagesDirectory, {
    withFileTypes: true,
  });

  for (const packageDirectory of packageDirectories) {
    if (!packageDirectory.isDirectory()) {
      continue;
    }

    const packageJsonPath = resolve(
      packagesDirectory,
      packageDirectory.name,
      'package.json',
    );
    await validateAdapterDependencies({
      adapterDependencyRules,
      errors,
      packageJsonPath,
      packageName: packageDirectory.name,
      rootDirectory,
    }).catch(() => undefined);
  }

  return errors;
}

/**
 * Validates one package manifest against adapter dependency allow-lists.
 */
async function validateAdapterDependencies({
  adapterDependencyRules,
  errors,
  packageJsonPath,
  packageName,
  rootDirectory,
}) {
  const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'));

  for (const sectionName of dependencySections) {
    const dependencies = packageJson[sectionName];
    if (dependencies === null || typeof dependencies !== 'object') {
      continue;
    }

    for (const dependencyName of Object.keys(dependencies)) {
      const rule = adapterDependencyRules.get(dependencyName);
      if (rule !== undefined && !rule.allowedPackages.has(packageName)) {
        errors.push(
          `${relative(rootDirectory, packageJsonPath)} may not declare adapter dependency '${dependencyName}' outside approved adapter packages.`,
        );
      }
    }
  }
}

/**
 * Runs the policy boundary checker from the command line.
 */
async function main() {
  const errors = await collectPolicyBoundaryErrors();

  if (errors.length > 0) {
    throw new Error(
      `Policy boundary violations detected:\n${errors.join('\n')}`,
    );
  }

  console.log('Validated adapter dependency policy boundaries.');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
