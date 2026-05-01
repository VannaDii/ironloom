import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/**
 * Runs one command and rejects when it exits unsuccessfully.
 */
function runCommand(label, command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: process.env,
      stdio: 'inherit',
    });

    child.on('error', (error) => {
      reject(new Error(`${label} failed to start`, { cause: error }));
    });

    child.on('exit', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          signal === null
            ? `${label} exited with code ${code ?? 1}`
            : `${label} exited due to signal ${signal}`,
        ),
      );
    });
  });
}

/**
 * Runs independent commands concurrently and terminates siblings on failure.
 */
async function runConcurrent(commands) {
  const running = commands.map(({ label, command, args }) => ({
    label,
    child: spawn(command, args, {
      env: process.env,
      stdio: 'inherit',
    }),
  }));

  const promises = running.map(
    ({ label, child }) =>
      new Promise((resolve, reject) => {
        child.on('error', (error) => {
          reject(new Error(`${label} failed to start`, { cause: error }));
        });

        child.on('exit', (code, signal) => {
          if (code === 0) {
            resolve();
            return;
          }

          reject(
            new Error(
              signal === null
                ? `${label} exited with code ${code ?? 1}`
                : `${label} exited due to signal ${signal}`,
            ),
          );
        });
      }),
  );

  try {
    await Promise.all(promises);
  } catch (error) {
    for (const { child } of running) {
      if (
        child.exitCode === null &&
        child.signalCode === null &&
        !child.killed
      ) {
        child.kill('SIGTERM');
      }
    }

    await Promise.allSettled(promises);
    throw error;
  }
}

/**
 * Creates the ordered local pre-push gate plan.
 */
export function createPrePushPlan() {
  return [
    {
      mode: 'serial',
      label: 'verify:node',
      command: 'npm',
      args: ['run', 'verify:node'],
    },
    {
      mode: 'serial',
      label: 'prepare:generated',
      command: 'npm',
      args: ['run', 'prepare:generated'],
    },
    {
      mode: 'serial',
      label: 'check:repo',
      command: 'npm',
      args: ['run', 'check:repo'],
    },
    {
      mode: 'serial',
      label: 'test:coverage:workspace',
      command: 'npm',
      args: ['run', 'test:coverage:workspace'],
    },
    {
      mode: 'serial',
      label: 'check:changed-coverage',
      command: 'npm',
      args: ['run', 'check:changed-coverage'],
    },
    {
      mode: 'serial',
      label: 'sonar:analyze:changed',
      command: 'npm',
      args: ['run', 'sonar:analyze:changed'],
    },
    {
      mode: 'concurrent',
      commands: [
        {
          label: 'build:workspace',
          command: 'npm',
          args: ['run', 'build:workspace'],
        },
        {
          label: 'docs:build',
          command: 'npm',
          args: ['run', 'docs:build'],
        },
      ],
    },
  ];
}

/**
 * Runs the complete local pre-push gate.
 */
export async function runPrePushPlan(plan = createPrePushPlan()) {
  for (const step of plan) {
    switch (step.mode) {
      case 'serial':
        await runCommand(step.label, step.command, step.args);
        break;
      case 'concurrent':
        await runConcurrent(step.commands);
        break;
      default:
        throw new Error(`Unsupported pre-push step mode: ${step.mode}`);
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await runPrePushPlan();
}
