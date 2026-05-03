import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const defaultRootDirectory = resolve(import.meta.dirname, '..');

/**
 * Maximum attempts to read the LCOV report after Vitest exits.
 */
const coverageReportReadAttempts = 20;

/**
 * Delay between LCOV report read attempts in milliseconds.
 */
const coverageReportReadDelayMs = 25;

/**
 * Waits before retrying generated coverage report reads.
 */
function waitForCoverageReport() {
  return new Promise((resolvePromise) => {
    setTimeout(resolvePromise, coverageReportReadDelayMs);
  });
}

/**
 * Returns true when a filesystem error means the coverage report is not ready.
 */
function isCoverageReportMissing(error) {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'ENOENT'
  );
}

/**
 * Reads the generated LCOV report from a repository root.
 */
export async function readCoverageText(rootDirectory) {
  const coveragePath = resolve(rootDirectory, 'coverage/lcov.info');
  let lastMissingError;

  for (let attempt = 1; attempt <= coverageReportReadAttempts; attempt += 1) {
    try {
      return await readFile(coveragePath, 'utf8');
    } catch (error) {
      if (!isCoverageReportMissing(error)) {
        throw error;
      }

      lastMissingError = error;
      if (attempt < coverageReportReadAttempts) {
        await waitForCoverageReport();
      }
    }
  }

  throw lastMissingError;
}

export async function collectChangedCoverageErrors({
  rootDirectory = defaultRootDirectory,
  changedFiles,
  coverageText,
  baseRef,
} = {}) {
  const resolvedChangedFiles =
    changedFiles ??
    (await collectChangedSourceFiles({ rootDirectory, baseRef }));
  const executableFiles = resolvedChangedFiles.filter(isExecutableSourceFile);

  if (executableFiles.length === 0) {
    return [];
  }

  const resolvedCoverageText =
    coverageText ?? (await readCoverageText(rootDirectory));
  const coverageRecords = normalizeCoverageRecords({
    rootDirectory,
    records: parseLcovCoverage(resolvedCoverageText),
  });

  const errors = [];
  for (const filePath of executableFiles) {
    const record = coverageRecords.get(filePath);
    if (record === undefined) {
      errors.push(
        `Changed executable source file '${filePath}' has no coverage data. Add automated unit tests before opening or updating the pull request.`,
      );
      continue;
    }

    if (record.linesFound > 0 && record.linesHit !== record.linesFound) {
      errors.push(
        formatCoverageError({
          filePath,
          metric: 'line',
          covered: record.linesHit,
          total: record.linesFound,
        }),
      );
    }

    if (
      record.functionsFound > 0 &&
      record.functionsHit !== record.functionsFound
    ) {
      errors.push(
        formatCoverageError({
          filePath,
          metric: 'function',
          covered: record.functionsHit,
          total: record.functionsFound,
        }),
      );
    }

    if (
      record.branchesFound > 0 &&
      record.branchesHit !== record.branchesFound
    ) {
      errors.push(
        formatCoverageError({
          filePath,
          metric: 'branch',
          covered: record.branchesHit,
          total: record.branchesFound,
        }),
      );
    }
  }

  return errors;
}

export function parseLcovCoverage(coverageText) {
  const records = [];
  let currentRecord = createCoverageRecord('');

  for (const rawLine of coverageText.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (line.length === 0) {
      continue;
    }

    const updatedRecord = applyLcovLine(currentRecord, line);
    if (updatedRecord !== currentRecord) {
      currentRecord = updatedRecord;
      continue;
    }

    if (isRecordTerminator(line, currentRecord)) {
      records.push(currentRecord);
      currentRecord = createCoverageRecord('');
    }
  }

  return records;
}

export function isExecutableSourceFile(filePath) {
  return (
    /^packages\/[^/]+\/src\/.+\.ts$/u.test(filePath) &&
    !filePath.endsWith('.test.ts') &&
    !filePath.endsWith('/types.ts')
  );
}

function createCoverageRecord(filePath) {
  return {
    filePath,
    linesFound: 0,
    linesHit: 0,
    functionsFound: 0,
    functionsHit: 0,
    branchesFound: 0,
    branchesHit: 0,
  };
}

function applyLcovLine(record, line) {
  if (line.startsWith('SF:')) {
    return createCoverageRecord(line.slice(3));
  }

  if (line.startsWith('DA:')) {
    return applyLineCoverage(record, line);
  }

  if (line.startsWith('FNDA:')) {
    return applyFunctionCoverage(record, line);
  }

  if (line.startsWith('BRDA:')) {
    return applyBranchCoverage(record, line);
  }

  return record;
}

function applyLineCoverage(record, line) {
  const [, hits] = line.slice(3).split(',', 2);
  record.linesFound += 1;
  if (Number(hits) > 0) {
    record.linesHit += 1;
  }

  return record;
}

function applyFunctionCoverage(record, line) {
  const [hits] = line.slice(5).split(',', 1);
  record.functionsFound += 1;
  if (Number(hits) > 0) {
    record.functionsHit += 1;
  }

  return record;
}

function applyBranchCoverage(record, line) {
  const segments = line.slice(5).split(',', 4);
  record.branchesFound += 1;
  if (segments[3] !== '-' && Number(segments[3]) > 0) {
    record.branchesHit += 1;
  }

  return record;
}

function isRecordTerminator(line, record) {
  return line === 'end_of_record' && record.filePath.length > 0;
}

function normalizeCoverageRecords({ rootDirectory, records }) {
  return new Map(
    records.map((record) => [
      normalizePath(
        record.filePath.startsWith(rootDirectory)
          ? relative(rootDirectory, record.filePath)
          : record.filePath,
      ),
      record,
    ]),
  );
}

function formatCoverageError({ filePath, metric, covered, total }) {
  return `Changed executable source file '${filePath}' must have 100% ${metric} coverage before opening or updating the pull request (${String(covered)}/${String(total)} covered).`;
}

async function collectChangedSourceFiles({ rootDirectory, baseRef }) {
  const resolvedBaseRef = await resolveBaseRef({ rootDirectory, baseRef });
  const mergeBase = await resolveMergeBase({
    rootDirectory,
    baseRef: resolvedBaseRef,
  });
  const { stdout } = await execFileAsync(
    'git',
    ['diff', '--name-only', '--diff-filter=AMR', mergeBase, 'HEAD'],
    { cwd: rootDirectory },
  );

  return stdout
    .split(/\r?\n/u)
    .map((entry) => normalizePath(entry))
    .filter((entry) => entry.length > 0);
}

async function resolveBaseRef({ rootDirectory, baseRef }) {
  if (typeof baseRef === 'string' && baseRef.trim().length > 0) {
    return baseRef.trim();
  }

  if (typeof process.env.DEVPLAT_BASE_REF === 'string') {
    return process.env.DEVPLAT_BASE_REF.trim();
  }

  if (typeof process.env.GITHUB_BASE_REF === 'string') {
    return `origin/${process.env.GITHUB_BASE_REF.trim()}`;
  }

  try {
    const { stdout } = await execFileAsync(
      'git',
      ['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD'],
      { cwd: rootDirectory },
    );
    return stdout.trim();
  } catch {
    return 'origin/main';
  }
}

async function resolveMergeBase({ rootDirectory, baseRef }) {
  const { stdout } = await execFileAsync(
    'git',
    ['merge-base', 'HEAD', baseRef],
    {
      cwd: rootDirectory,
    },
  );
  return stdout.trim();
}

function normalizePath(value) {
  return value.replaceAll('\\', '/').replace(/^\.\//u, '');
}

async function main() {
  const errors = await collectChangedCoverageErrors();

  if (errors.length > 0) {
    throw new Error(
      `Changed-file coverage violations detected:\n${errors.join('\n')}`,
    );
  }

  console.log(
    'Validated 100% automated unit-test coverage for changed executable source files.',
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
