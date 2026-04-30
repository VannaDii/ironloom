export interface CommandResult {
  command: string;
  args: string[];
  exitCode: number;
  timedOut: boolean;
  stdout: string;
  stderr: string;
  durationMs: number;
  attempts?: number;
  truncated?: boolean;
}

export interface CommandExecutionOptions {
  cwd?: string;
  env?: Record<string, string>;
  timeoutMs?: number;
  maxOutputBytes?: number;
  retry?: {
    attempts: number;
  };
}
