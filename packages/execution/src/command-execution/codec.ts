import * as t from 'io-ts';

/** Codec for command execution policy. */
export const CommandExecutionPolicyCodec = t.intersection([
  t.type({
    retry: t.type({
      attempts: t.number,
      retryableExitCodes: t.array(t.number),
    }),
  }),
  t.partial({
    truncation: t.type({
      maxOutputBytes: t.number,
      mode: t.literal('bytes'),
    }),
    timeoutMs: t.number,
  }),
]);

/** Codec for command result. */
export const CommandResultCodec = t.intersection([
  t.type({
    command: t.string,
    args: t.array(t.string),
    exitCode: t.number,
    timedOut: t.boolean,
    stdout: t.string,
    stderr: t.string,
    durationMs: t.number,
  }),
  t.partial({
    attempts: t.number,
    truncated: t.boolean,
    policy: CommandExecutionPolicyCodec,
  }),
]);

/** Codec for command execution options. */
export const CommandExecutionOptionsCodec = t.partial({
  cwd: t.string,
  env: t.record(t.string, t.string),
  timeoutMs: t.number,
  maxOutputBytes: t.number,
  retry: t.intersection([
    t.type({
      attempts: t.number,
    }),
    t.partial({
      retryableExitCodes: t.array(t.number),
    }),
  ]),
});

/** Policy for retries, truncation, and timeout handling. */
export type CommandExecutionPolicy = t.TypeOf<
  typeof CommandExecutionPolicyCodec
>;

/** Retry policy used by command execution. */
export type CommandRetryPolicy = CommandExecutionPolicy['retry'];

/** Truncation policy used by command execution. */
export type CommandTruncationPolicy = NonNullable<
  CommandExecutionPolicy['truncation']
>;

/** Result returned by command execution. */
export type CommandResult = t.TypeOf<typeof CommandResultCodec>;

/** Options accepted by command execution. */
export type CommandExecutionOptions = t.TypeOf<
  typeof CommandExecutionOptionsCodec
>;
