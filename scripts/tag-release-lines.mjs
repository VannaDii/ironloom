import { execFile } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const defaultRootDirectory = resolve(import.meta.dirname, '..');

export function deriveReleaseTags(version) {
  const match =
    /^(?<major>0|[1-9]\d*)\.(?<minor>0|[1-9]\d*)\.(?<patch>0|[1-9]\d*)$/u.exec(
      version,
    );
  if (match?.groups === undefined) {
    throw new Error(
      `Release version must be a stable semver version: ${version}`,
    );
  }

  const { major, minor, patch } = match.groups;
  return {
    major: `v${major}`,
    minor: `v${major}.${minor}`,
    patch: `v${major}.${minor}.${patch}`,
  };
}

export function resolveSingleReleaseVersion(packages) {
  const versions = new Map();
  for (const packageJson of packages) {
    if (packageJson.private === true) {
      continue;
    }

    if (
      typeof packageJson.name !== 'string' ||
      !packageJson.name.startsWith('@vannadii/devplat-')
    ) {
      continue;
    }

    const packagesForVersion = versions.get(packageJson.version) ?? [];
    packagesForVersion.push(packageJson.name);
    versions.set(packageJson.version, packagesForVersion);
  }

  if (versions.size === 0) {
    throw new Error(
      'No public DevPlat packages were found for release tagging.',
    );
  }

  if (versions.size > 1) {
    const versionSummary = [...versions.entries()]
      .map(
        ([version, packageNames]) =>
          `${version}: ${packageNames.toSorted((left, right) => left.localeCompare(right)).join(', ')}`,
      )
      .join('\n');
    throw new Error(
      `DevPlat packages must share one release version before tagging:\n${versionSummary}`,
    );
  }

  const [version] = versions.keys();
  return version;
}

export async function discoverWorkspacePackageJsons(rootDirectory) {
  const packagesDirectory = resolve(rootDirectory, 'packages');
  const entries = await readdir(packagesDirectory, { withFileTypes: true });
  const packages = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) =>
        JSON.parse(
          await readFile(
            resolve(packagesDirectory, entry.name, 'package.json'),
            'utf8',
          ),
        ),
      ),
  );

  return packages;
}

async function runGit(rootDirectory, args) {
  const { stdout } = await execFileAsync('git', args, {
    cwd: rootDirectory,
    env: process.env,
  });
  return stdout.trim();
}

async function readTagTarget(rootDirectory, tagName) {
  try {
    return await runGit(rootDirectory, ['rev-list', '-n', '1', tagName]);
  } catch {
    return null;
  }
}

async function createOrUpdateTags({ rootDirectory, dryRun }) {
  const packages = await discoverWorkspacePackageJsons(rootDirectory);
  const version = resolveSingleReleaseVersion(packages);
  const tags = deriveReleaseTags(version);
  const headSha = await runGit(rootDirectory, ['rev-parse', 'HEAD']);
  const existingPatchTarget = await readTagTarget(rootDirectory, tags.patch);

  if (existingPatchTarget !== null && existingPatchTarget !== headSha) {
    throw new Error(
      `${tags.patch} already exists at ${existingPatchTarget}; refusing to move an immutable patch release tag to ${headSha}.`,
    );
  }

  if (dryRun) {
    return {
      version,
      headSha,
      tags,
      pushed: false,
    };
  }

  if (existingPatchTarget === null) {
    await runGit(rootDirectory, ['tag', tags.patch]);
    await runGit(rootDirectory, ['push', 'origin', `refs/tags/${tags.patch}`]);
  }

  await runGit(rootDirectory, ['tag', '-f', tags.major]);
  await runGit(rootDirectory, ['tag', '-f', tags.minor]);
  await runGit(rootDirectory, [
    'push',
    '--force',
    'origin',
    `refs/tags/${tags.major}`,
    `refs/tags/${tags.minor}`,
  ]);

  return {
    version,
    headSha,
    tags,
    pushed: true,
  };
}

function parseArgs(argv) {
  const args = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--dry-run') {
      args.set('--dry-run', 'true');
      continue;
    }

    if (arg === '--root') {
      args.set('--root', argv[index + 1] ?? '');
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return {
    dryRun: args.get('--dry-run') === 'true',
    rootDirectory: args.get('--root') ?? defaultRootDirectory,
  };
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const result = await createOrUpdateTags(options);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
