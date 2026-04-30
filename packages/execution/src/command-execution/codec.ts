import * as t from 'io-ts';

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
