import type * as t from 'io-ts';

import type {
  DiscordApprovalActionCodec,
  DiscordApprovalRequestCodec,
  DiscordApprovalResultCodec,
} from './codec.js';

export type DiscordApprovalAction = t.TypeOf<typeof DiscordApprovalActionCodec>;

export type DiscordApprovalRequest = t.TypeOf<
  typeof DiscordApprovalRequestCodec
>;

export type DiscordApprovalResult = t.TypeOf<typeof DiscordApprovalResultCodec>;
