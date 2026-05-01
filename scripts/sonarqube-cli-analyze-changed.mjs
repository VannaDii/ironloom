import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const defaultRootDirectory = resolve(import.meta.dirname, '..');
const defaultDiffFilter = 'ACMRT';
const defaultHeadRef = 'HEAD';
const defaultProjectKey = 'vannadii_devplat';
const defaultSonarCommand = 'sonar';
const defaultOutputFormat = 'text';
const defaultSqaaMode = 'disabled';
const installScriptUrl =
  'https://raw.githubusercontent.com/SonarSource/sonarqube-cli/refs/heads/master/user-scripts/install.sh';
const windowsInstallScriptUrl =
  'https://raw.githubusercontent.com/SonarSource/sonarqube-cli/refs/heads/master/user-scripts/install.ps1';
const a3sInactiveMessage =
  'A3S analysis is not activated for this organization';
const sqaaDisabledReason =
  'SQAA/A3S analysis is not enabled for this run. Set SONAR_A3S_ENABLED=true or pass --sqaa enabled to run it.';
const truthyEnvValues = ['1', 'true', 'yes', 'enabled'];

/**
 * Splits command output into non-empty lines without using platform-specific parsing.
 */
function splitNonEmptyLines(value) {
  return value
    .replaceAll('\r\n', '\n')
    .replaceAll('\r', '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/**
 * Normalizes git paths so Sonar receives repository-relative POSIX paths.
 */
function normalizePath(value) {
  let normalized = value.replaceAll('\\', '/');

  while (normalized.startsWith('./')) {
    normalized = normalized.slice(2);
  }

  return normalized;
}

/**
 * Creates the SonarQube CLI invocations required for changed-file analysis.
 */
export function createSonarChangedFileCommands({
  branch,
  changedFiles,
  project,
  sonarCommand = defaultSonarCommand,
  sqaaEnabled = false,
}) {
  const normalizedFiles = changedFiles.map(normalizePath);
  const commands = [];

  if (normalizedFiles.length === 0) {
    return commands;
  }

  commands.push({
    args: ['analyze', 'secrets', ...normalizedFiles],
    label: 'sonar analyze secrets',
    command: sonarCommand,
  });

  if (sqaaEnabled) {
    for (const file of normalizedFiles) {
      commands.push({
        args: [
          'analyze',
          'sqaa',
          '--file',
          file,
          ...(branch === undefined ? [] : ['--branch', branch]),
          ...(project === undefined ? [] : ['--project', project]),
        ],
        label: `sonar analyze sqaa ${file}`,
        command: sonarCommand,
      });
    }
  }

  return commands;
}

/**
 * Resolves the git base ref used for changed-file selection.
 */
export async function resolveBaseRef({
  baseRef,
  env = process.env,
  execFileImpl = execFileAsync,
  rootDirectory = defaultRootDirectory,
} = {}) {
  if (typeof baseRef === 'string' && baseRef.trim().length > 0) {
    return baseRef.trim();
  }

  if (typeof env.DEVPLAT_BASE_REF === 'string' && env.DEVPLAT_BASE_REF.trim()) {
    return env.DEVPLAT_BASE_REF.trim();
  }

  if (typeof env.GITHUB_BASE_REF === 'string' && env.GITHUB_BASE_REF.trim()) {
    return `origin/${env.GITHUB_BASE_REF.trim()}`;
  }

  try {
    const { stdout } = await execFileImpl(
      'git',
      ['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD'],
      { cwd: rootDirectory },
    );
    const resolved = stdout.trim();

    return resolved.length === 0 ? 'origin/main' : resolved;
  } catch {
    return 'origin/main';
  }
}

/**
 * Resolves the merge base between the selected base and head refs.
 */
export async function resolveMergeBase({
  baseRef,
  execFileImpl = execFileAsync,
  headRef = defaultHeadRef,
  rootDirectory = defaultRootDirectory,
}) {
  const { stdout } = await execFileImpl(
    'git',
    ['merge-base', headRef, baseRef],
    { cwd: rootDirectory },
  );

  return stdout.trim();
}

/**
 * Collects repository-relative files changed between the merge base and head ref.
 */
export async function collectChangedFiles({
  baseRef,
  env = process.env,
  execFileImpl = execFileAsync,
  headRef = defaultHeadRef,
  rootDirectory = defaultRootDirectory,
} = {}) {
  const resolvedBaseRef = await resolveBaseRef({
    baseRef,
    env,
    execFileImpl,
    rootDirectory,
  });
  const mergeBase = await resolveMergeBase({
    baseRef: resolvedBaseRef,
    execFileImpl,
    headRef,
    rootDirectory,
  });
  const { stdout } = await execFileImpl(
    'git',
    [
      'diff',
      '--name-only',
      `--diff-filter=${defaultDiffFilter}`,
      mergeBase,
      headRef,
    ],
    { cwd: rootDirectory },
  );

  return splitNonEmptyLines(stdout).map(normalizePath);
}

/**
 * Resolves the current branch name for SonarQube analysis context.
 */
export async function resolveCurrentBranch({
  branch,
  env = process.env,
  execFileImpl = execFileAsync,
  rootDirectory = defaultRootDirectory,
} = {}) {
  if (typeof branch === 'string' && branch.trim().length > 0) {
    return branch.trim();
  }

  if (typeof env.GITHUB_HEAD_REF === 'string' && env.GITHUB_HEAD_REF.trim()) {
    return env.GITHUB_HEAD_REF.trim();
  }

  if (typeof env.GITHUB_REF_NAME === 'string' && env.GITHUB_REF_NAME.trim()) {
    return env.GITHUB_REF_NAME.trim();
  }

  const { stdout } = await execFileImpl('git', ['branch', '--show-current'], {
    cwd: rootDirectory,
  });
  const resolved = stdout.trim();

  return resolved.length === 0 ? undefined : resolved;
}

/**
 * Runs one external command and streams its output through the current process.
 */
async function runExternalCommand(command, args, { rootDirectory }) {
  return execFileAsync(command, args, {
    cwd: rootDirectory,
    env: process.env,
    maxBuffer: 32 * 1024 * 1024,
  });
}

/**
 * Converts command output values into stable plain strings for reports.
 */
function stringifyCommandOutput(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Extracts readable command output from a failed SonarQube CLI invocation.
 */
function readCommandFailureOutput(error) {
  return [
    stringifyCommandOutput(error.stdout),
    stringifyCommandOutput(error.stderr),
    stringifyCommandOutput(error.message),
  ]
    .filter((value) => value.length > 0)
    .join('\n');
}

/**
 * Classifies failures that should produce a useful report instead of raw stack noise.
 */
export function classifySonarAnalysisFailure(error) {
  const output = readCommandFailureOutput(error);

  if (output.includes(a3sInactiveMessage)) {
    return {
      reason: a3sInactiveMessage,
      status: 'skipped',
    };
  }

  return {
    reason: output.length === 0 ? 'SonarQube CLI command failed.' : output,
    status: 'failed',
  };
}

/**
 * Resolves whether SQAA/A3S analysis is configured for this run.
 */
export function resolveSqaaEnabled({ env = process.env, sqaaMode } = {}) {
  switch (sqaaMode) {
    case 'disabled':
      return false;
    case 'enabled':
      return true;
    case undefined:
      break;
    default:
      throw new Error(`Unsupported SonarQube SQAA mode: ${sqaaMode}`);
  }

  return [
    env.SONAR_A3S_ENABLED,
    env.DEVPLAT_SONAR_A3S_ENABLED,
    env.SONAR_SQAA_ENABLED,
    env.DEVPLAT_SONAR_SQAA_ENABLED,
  ].some((value) => isTruthyEnvValue(value));
}

/**
 * Interprets environment flag strings without accepting arbitrary text.
 */
function isTruthyEnvValue(value) {
  return (
    typeof value === 'string' &&
    truthyEnvValues.includes(value.trim().toLowerCase())
  );
}

/**
 * Runs one SonarQube analysis command and returns an auditable result.
 */
async function runSonarAnalysisCommand(command, { rootDirectory, runCommand }) {
  try {
    const output = await runCommand(command.command, command.args, {
      rootDirectory,
    });

    return {
      args: command.args,
      command: command.command,
      label: command.label,
      status: 'passed',
      stderr: stringifyCommandOutput(output?.stderr),
      stdout: stringifyCommandOutput(output?.stdout),
    };
  } catch (error) {
    const classified = classifySonarAnalysisFailure(error);

    return {
      args: command.args,
      command: command.command,
      label: command.label,
      reason: classified.reason,
      status: classified.status,
    };
  }
}

/**
 * Creates the SonarQube CLI installer command for the current operating system.
 */
export function createSonarCliInstallCommand(platform = process.platform) {
  switch (platform) {
    case 'darwin':
    case 'linux':
      return {
        args: ['-o-', installScriptUrl],
        command: 'curl',
        inputCommand: 'bash',
        label: 'SonarQube CLI installer',
      };
    case 'win32':
      return {
        args: [
          '-NoProfile',
          '-ExecutionPolicy',
          'Bypass',
          '-Command',
          `irm ${windowsInstallScriptUrl} | iex`,
        ],
        command: 'powershell',
        label: 'SonarQube CLI installer',
      };
    default:
      throw new Error(
        `Unsupported SonarQube CLI installer platform: ${platform}`,
      );
  }
}

/**
 * Runs a shell-pipeline command while keeping platform branching testable.
 */
async function runPipelineInstallCommand(command, { rootDirectory }) {
  const first = await execFileAsync(command.command, command.args, {
    cwd: rootDirectory,
    env: process.env,
    maxBuffer: 32 * 1024 * 1024,
  });

  await execFileAsync(command.inputCommand, [], {
    cwd: rootDirectory,
    env: process.env,
    input: first.stdout,
    maxBuffer: 32 * 1024 * 1024,
  });
}

/**
 * Runs the SonarQube CLI installer for the current platform.
 */
export async function installSonarCli({
  platform = process.platform,
  rootDirectory = defaultRootDirectory,
  runCommand,
} = {}) {
  const command = createSonarCliInstallCommand(platform);
  const resolvedRunner =
    runCommand ??
    (command.inputCommand === undefined
      ? runExternalCommand
      : runPipelineInstallCommand);

  console.log(`Running ${command.label}`);
  await resolvedRunner(command.command, command.args, {
    inputCommand: command.inputCommand,
    rootDirectory,
  });

  return command;
}

/**
 * Runs SonarQube CLI security and SQAA analysis for changed files.
 */
export async function runSonarChangedFileAnalysis({
  baseRef,
  branch,
  changedFiles,
  env = process.env,
  execFileImpl = execFileAsync,
  headRef = defaultHeadRef,
  project,
  rootDirectory = defaultRootDirectory,
  runCommand = runExternalCommand,
  sonarCommand = defaultSonarCommand,
  sqaaMode,
} = {}) {
  const resolvedChangedFiles =
    changedFiles ??
    (await collectChangedFiles({
      baseRef,
      env,
      execFileImpl,
      headRef,
      rootDirectory,
    }));
  const resolvedBranch = await resolveCurrentBranch({
    branch,
    env,
    execFileImpl,
    rootDirectory,
  });
  const resolvedProject = project ?? env.SONAR_PROJECT_KEY ?? defaultProjectKey;
  const sqaaEnabled = resolveSqaaEnabled({ env, sqaaMode });
  const commands = createSonarChangedFileCommands({
    branch: resolvedBranch,
    changedFiles: resolvedChangedFiles,
    project: resolvedProject,
    sonarCommand,
    sqaaEnabled,
  });
  const results = await Promise.all(
    commands.map((command) =>
      runSonarAnalysisCommand(command, { rootDirectory, runCommand }),
    ),
  );
  const resolvedResults =
    resolvedChangedFiles.length === 0 || sqaaEnabled
      ? results
      : [...results, createSkippedSqaaResult({ sonarCommand })];

  return {
    branch: resolvedBranch,
    changedFiles: resolvedChangedFiles,
    commands,
    project: resolvedProject,
    results: resolvedResults,
    sqaaEnabled,
    status: summarizeSonarAnalysisStatus(resolvedResults),
  };
}

/**
 * Creates a report entry for intentionally skipped SQAA analysis.
 */
function createSkippedSqaaResult({ sonarCommand }) {
  return {
    args: ['analyze', 'sqaa'],
    command: sonarCommand,
    label: 'sonar analyze sqaa',
    reason: sqaaDisabledReason,
    status: 'skipped',
  };
}

/**
 * Collapses per-command analysis results into the report-level status.
 */
export function summarizeSonarAnalysisStatus(results) {
  if (results.some((result) => result.status === 'failed')) {
    return 'failed';
  }

  if (results.some((result) => result.status === 'skipped')) {
    return 'skipped';
  }

  return 'passed';
}

/**
 * Formats the changed-file analysis report for humans or agent tooling.
 */
export function formatSonarChangedFileReport(
  report,
  format = defaultOutputFormat,
) {
  switch (format) {
    case 'json':
      return JSON.stringify(report, undefined, 2);
    case 'text':
      return [
        `SonarQube CLI changed-file analysis: ${report.status}`,
        `Project: ${report.project}`,
        `Branch: ${report.branch ?? 'unresolved'}`,
        `Changed files: ${String(report.changedFiles.length)}`,
        `SQAA/A3S enabled: ${String(report.sqaaEnabled)}`,
        '',
        ...formatSonarResultLines(report.results),
      ].join('\n');
    default:
      throw new Error(`Unsupported SonarQube report format: ${format}`);
  }
}

/**
 * Formats individual command results for the plain-text report.
 */
function formatSonarResultLines(results) {
  if (results.length === 0) {
    return ['No changed files to analyze.'];
  }

  return results.flatMap((result) => {
    const base = `${formatSonarStatusIcon(result.status)} ${result.status}: ${
      result.label
    }`;

    return result.reason === undefined ? [base] : [base, `  ${result.reason}`];
  });
}

/**
 * Maps SonarQube result states to compact console markers.
 */
function formatSonarStatusIcon(status) {
  switch (status) {
    case 'failed':
      return 'FAIL';
    case 'passed':
      return 'PASS';
    case 'skipped':
      return 'SKIP';
    default:
      return 'INFO';
  }
}

/**
 * Parses CLI flags for the changed-file SonarQube analysis wrapper.
 */
export function parseSonarChangedFileArgs(argv) {
  const parsed = {
    headRef: defaultHeadRef,
    outputFormat: defaultOutputFormat,
    project: defaultProjectKey,
    sonarCommand: defaultSonarCommand,
    sqaaMode: defaultSqaaMode,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    switch (token) {
      case '--base':
        parsed.baseRef = argv[index + 1];
        index += 1;
        break;
      case '--branch':
        parsed.branch = argv[index + 1];
        index += 1;
        break;
      case '--head':
        parsed.headRef = argv[index + 1] ?? defaultHeadRef;
        index += 1;
        break;
      case '--json':
        parsed.outputFormat = 'json';
        break;
      case '--format':
        parsed.outputFormat = argv[index + 1] ?? defaultOutputFormat;
        index += 1;
        break;
      case '--project':
        parsed.project = argv[index + 1];
        index += 1;
        break;
      case '--sonar-command':
        parsed.sonarCommand = argv[index + 1] ?? defaultSonarCommand;
        index += 1;
        break;
      case '--sqaa':
        parsed.sqaaMode = argv[index + 1] ?? defaultSqaaMode;
        index += 1;
        break;
      default:
        throw new Error(
          `Unknown SonarQube changed-file analysis option: ${token}`,
        );
    }
  }

  return parsed;
}

/**
 * Parses the top-level SonarQube helper command.
 */
export function parseSonarCliHelperArgs(argv) {
  const [command = 'analyze', ...rest] = argv;

  switch (command) {
    case 'analyze':
      return {
        command,
        options: parseSonarChangedFileArgs(rest),
      };
    case 'install':
      return {
        command,
        options: {},
      };
    default:
      throw new Error(`Unknown SonarQube helper command: ${command}`);
  }
}

/**
 * Runs the command-line entrypoint.
 */
async function main() {
  const parsed = parseSonarCliHelperArgs(process.argv.slice(2));

  switch (parsed.command) {
    case 'install':
      await installSonarCli(parsed.options);
      return;
    case 'analyze':
      break;
  }

  const options = parsed.options;
  const report = await runSonarChangedFileAnalysis(options);
  const output = formatSonarChangedFileReport(report, options.outputFormat);

  console.log(output);

  if (report.status === 'failed') {
    process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
