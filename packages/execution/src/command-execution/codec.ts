import * as t from 'io-ts';

import type { CommandResult } from './types.js';

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
  }),
]);

export type _CommandResultExact =
  t.TypeOf<typeof CommandResultCodec> extends CommandResult
    ? CommandResult extends t.TypeOf<typeof CommandResultCodec>
      ? true
      : never
    : never;
