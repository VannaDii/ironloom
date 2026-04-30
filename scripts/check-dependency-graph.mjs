import { readdir, readFile } from 'node:fs/promises';
import { basename, dirname, relative, resolve } from 'node:path';

const rootDirectory = resolve(import.meta.dirname, '..');
const packagesDirectory = resolve(rootDirectory, 'packages');
const importPattern = /(?:from\s+|import\s+)['"]([^'"]+)['"]/gu;

const packageDirectories = (
  await readdir(packagesDirectory, {
    withFileTypes: true,
  })
)
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .toSorted((left, right) => left.localeCompare(right));

const packageEntries = new Map();
const failures = [];

for (const packageDirectoryName of packageDirectories) {
  const packageDirectory = resolve(packagesDirectory, packageDirectoryName);
  const packageJson = await readJsonFile(
    resolve(packageDirectory, 'package.json'),
    `${packageDirectoryName}: could not read package.json`,
    failures,
  );
  const tsconfig = await readJsonFile(
    resolve(packageDirectory, 'tsconfig.json'),
    `${packageDirectoryName}: could not read tsconfig.json`,
    failures,
  );

  if (packageJson === null || tsconfig === null) {
    continue;
  }

  packageEntries.set(packageJson.name, {
    directoryName: packageDirectoryName,
    directory: packageDirectory,
    packageJson,
    tsconfig,
  });
}

const graph = new Map(
  [...packageEntries.keys()].map((packageName) => [packageName, new Set()]),
);

for (const [packageName, entry] of packageEntries) {
  const srcFiles = await collectTypeScriptFiles(
    resolve(entry.directory, 'src'),
  );
  const importedPackages = new Set();

  for (const filePath of srcFiles) {
    const fileContent = await readFile(filePath, 'utf8');
    for (const match of fileContent.matchAll(importPattern)) {
      const specifier = match[1];
      if (specifier.startsWith('@vannadii/devplat-')) {
        importedPackages.add(specifier);
        continue;
      }

      if (!specifier.startsWith('.')) {
        continue;
      }

      const resolvedSpecifierPath = resolve(dirname(filePath), specifier);
      const relativeToPackage = relative(
        entry.directory,
        resolvedSpecifierPath,
      );
      if (!relativeToPackage.startsWith('..') && relativeToPackage !== '') {
        continue;
      }

      const relativeToPackages = relative(
        packagesDirectory,
        resolvedSpecifierPath,
      );
      if (relativeToPackages.startsWith('..')) {
        continue;
      }

      failures.push(
        `${entry.directoryName}: forbidden cross-package filesystem import in ${filePath}`,
      );
    }
  }

  const declaredDependencies = new Set(
    Object.keys(entry.packageJson.dependencies ?? {}).filter((dependency) =>
      dependency.startsWith('@vannadii/devplat-'),
    ),
  );

  for (const dependency of declaredDependencies) {
    const dependencyEntry = packageEntries.get(dependency);
    if (dependencyEntry === undefined) {
      failures.push(
        `${entry.directoryName}: declares unknown workspace package ${dependency}`,
      );
      continue;
    }

    const expectedVersion = `file:../${dependencyEntry.directoryName}`;
    if (entry.packageJson.dependencies?.[dependency] !== expectedVersion) {
      failures.push(
        `${entry.directoryName}: declares ${dependency} as ${entry.packageJson.dependencies?.[dependency]} but must use ${expectedVersion}`,
      );
    }
  }

  const referencedPackages = new Set(
    (entry.tsconfig.references ?? []).map((reference) => {
      const normalizedPath = String(reference.path).replaceAll('\\', '/');
      const referencedDirectoryName = basename(normalizedPath);
      return `@vannadii/devplat-${referencedDirectoryName}`;
    }),
  );

  for (const dependency of importedPackages) {
    if (!packageEntries.has(dependency)) {
      failures.push(
        `${entry.directoryName}: imports unknown workspace package ${dependency}`,
      );
      continue;
    }

    if (!declaredDependencies.has(dependency)) {
      failures.push(
        `${entry.directoryName}: imports ${dependency} but package.json does not declare it`,
      );
    }

    if (!referencedPackages.has(dependency)) {
      failures.push(
        `${entry.directoryName}: imports ${dependency} but tsconfig references do not include it`,
      );
    }

    graph.get(packageName)?.add(dependency);
  }

  for (const dependency of referencedPackages) {
    if (!declaredDependencies.has(dependency)) {
      failures.push(
        `${entry.directoryName}: tsconfig references ${dependency} but package.json does not declare it`,
      );
    }
  }
}

const cycle = findCycle(graph);
if (cycle !== null) {
  failures.push(`circular workspace dependency: ${cycle.join(' -> ')}`);
}

if (failures.length > 0) {
  throw new Error(failures.join('\n'));
}

console.log(`Validated dependency graph for ${packageEntries.size} packages.`);

async function readJsonFile(filePath, failurePrefix, failures) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch (error) {
    failures.push(`${failurePrefix} (${getErrorMessage(error)})`);
    return null;
  }
}

async function collectTypeScriptFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const filePaths = [];

  for (const entry of entries) {
    const entryPath = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      filePaths.push(...(await collectTypeScriptFiles(entryPath)));
      continue;
    }

    if (
      entry.isFile() &&
      entry.name.endsWith('.ts') &&
      !entry.name.endsWith('.test.ts')
    ) {
      filePaths.push(entryPath);
    }
  }

  return filePaths;
}

function getErrorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function findCycle(graph) {
  const visiting = new Set();
  const visited = new Set();

  for (const node of graph.keys()) {
    const cycle = visit(node, []);
    if (cycle !== null) {
      return cycle;
    }
  }

  return null;

  function visit(node, trail) {
    if (visiting.has(node)) {
      const cycleStart = trail.indexOf(node);
      return [...trail.slice(cycleStart), node];
    }

    if (visited.has(node)) {
      return null;
    }

    visiting.add(node);
    const nextTrail = [...trail, node];

    for (const dependency of graph.get(node) ?? []) {
      const cycle = visit(dependency, nextTrail);
      if (cycle !== null) {
        return cycle;
      }
    }

    visiting.delete(node);
    visited.add(node);
    return null;
  }
}
