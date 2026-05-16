import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Repository root used when the runner is invoked from the package script.
 */
const defaultRootDirectory = resolve(import.meta.dirname, '..');

/**
 * Published OpenClaw runtime image pulled by the local latest runner.
 */
const latestOpenClawRuntimeImage =
  'ghcr.io/vannadii/devplat-openclaw-runtime:latest';

/**
 * Container name used for the local latest OpenClaw runtime.
 */
const latestOpenClawRuntimeContainerName = 'devplat-openclaw-latest';

/**
 * Host and container port used by the OpenClaw dashboard.
 */
const openClawGatewayPort = '18789';

/**
 * Default local token used when the operator has not configured one.
 */
const defaultGatewayToken = 'devplat-local';

/**
 * Environment key used to override the local gateway token.
 */
const gatewayTokenEnvironmentKey = 'OPENCLAW_GATEWAY_TOKEN';

/**
 * Environment key used to force a Docker runtime platform.
 */
const dockerPlatformEnvironmentKey = 'DEVPLAT_DOCKER_PLATFORM';

/**
 * Environment key used to override the runtime image for PR validation.
 */
const runtimeImageEnvironmentKey = 'DEVPLAT_OPENCLAW_RUNTIME_IMAGE';

/**
 * Git-ignored state directory mounted into the runtime container.
 */
const dockerStateDirectory = '.devplat/docker-state';

/**
 * Container root for persisted DevPlat runtime state.
 */
const containerStateRoot = '/var/lib/devplat';

/**
 * Container storage root for platform state.
 */
const containerStorageRoot = `${containerStateRoot}/state`;

/**
 * Container worktree root for platform worktrees.
 */
const containerWorktreeRoot = `${containerStateRoot}/worktrees`;

/**
 * Container OpenClaw home directory.
 */
const containerOpenClawHome = `${containerStateRoot}/openclaw-home`;

/**
 * Returns a non-empty environment value when present.
 */
function readOptionalEnvironmentValue(env, key) {
  const value = env[key];

  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/**
 * Returns the current POSIX uid when Node exposes it on this platform.
 */
function readCurrentUserId() {
  return typeof process.getuid === 'function' ? process.getuid() : undefined;
}

/**
 * Returns the current POSIX gid when Node exposes it on this platform.
 */
function readCurrentGroupId() {
  return typeof process.getgid === 'function' ? process.getgid() : undefined;
}

/**
 * Appends the current user mapping when uid and gid are available.
 */
function appendUserMapping(args, userId, groupId) {
  if (Number.isInteger(userId) && Number.isInteger(groupId)) {
    args.push('--user', `${userId}:${groupId}`);
  }
}

/**
 * Creates the Docker command plan for the latest OpenClaw runtime image.
 */
export function createLatestOpenClawRuntimeDockerPlan({
  env = process.env,
  groupId = readCurrentGroupId(),
  rootDirectory = defaultRootDirectory,
  userId = readCurrentUserId(),
} = {}) {
  const gatewayToken =
    readOptionalEnvironmentValue(env, gatewayTokenEnvironmentKey) ??
    defaultGatewayToken;
  const dockerPlatform = readOptionalEnvironmentValue(
    env,
    dockerPlatformEnvironmentKey,
  );
  const runtimeImage =
    readOptionalEnvironmentValue(env, runtimeImageEnvironmentKey) ??
    latestOpenClawRuntimeImage;
  const stateDirectory = resolve(rootDirectory, dockerStateDirectory);
  const args = ['run', '--rm', '--pull', 'always'];

  if (dockerPlatform !== undefined) {
    args.push('--platform', dockerPlatform);
  }

  args.push('--name', latestOpenClawRuntimeContainerName);
  appendUserMapping(args, userId, groupId);
  args.push(
    '-p',
    `${openClawGatewayPort}:${openClawGatewayPort}`,
    '-e',
    `${gatewayTokenEnvironmentKey}=${gatewayToken}`,
    '-e',
    `DEVPLAT_STORAGE_ROOT=${containerStorageRoot}`,
    '-e',
    `DEVPLAT_WORKTREE_ROOT=${containerWorktreeRoot}`,
    '-e',
    `OPENCLAW_HOME=${containerOpenClawHome}`,
    '-v',
    `${stateDirectory}:${containerStateRoot}`,
    runtimeImage,
    '--port',
    openClawGatewayPort,
    '--bind',
    'lan',
    '--auth',
    'token',
    '--token',
    gatewayToken,
    '--allow-unconfigured',
  );

  return {
    args,
    command: 'docker',
    stateDirectory,
  };
}

/**
 * Runs a command and rejects when it exits unsuccessfully.
 */
function runCommand({ args, command }) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      env: process.env,
      stdio: 'inherit',
    });

    child.on('error', (error) => {
      reject(new Error(`${command} failed to start`, { cause: error }));
    });

    child.on('exit', (code, signal) => {
      if (code === 0) {
        resolvePromise();
        return;
      }

      reject(
        new Error(
          signal === null
            ? `${command} exited with code ${code ?? 1}`
            : `${command} exited due to signal ${signal}`,
        ),
      );
    });
  });
}

/**
 * Creates local Docker state and runs the latest OpenClaw runtime image.
 */
export async function runLatestOpenClawRuntime({
  env = process.env,
  rootDirectory = process.cwd(),
} = {}) {
  const plan = createLatestOpenClawRuntimeDockerPlan({
    env,
    rootDirectory,
  });

  await mkdir(plan.stateDirectory, { recursive: true });
  await runCommand(plan);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await runLatestOpenClawRuntime();
}
