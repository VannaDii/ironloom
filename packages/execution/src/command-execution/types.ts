import type * as t from 'io-ts';

import type {
  CommandExecutionPolicyCodec,
  CommandResultCodec,
} from './codec.js';

export type CommandExecutionPolicy = t.TypeOf<
  typeof CommandExecutionPolicyCodec
>;

export type CommandRetryPolicy = CommandExecutionPolicy['retry'];

export type CommandTruncationPolicy = NonNullable<
  CommandExecutionPolicy['truncation']
>;

export type CommandResult = t.TypeOf<typeof CommandResultCodec>;

export interface CommandExecutionOptions {
  cwd?: string;
  env?: Record<string, string>;
  timeoutMs?: number;
  maxOutputBytes?: number;
  retry?: {
    attempts: number;
  };
}
