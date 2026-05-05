import * as t from 'io-ts';

import {
  IsoTimestampCodec,
  LifecycleStatusCodec,
} from '@vannadii/devplat-core';

/** Codec for positive pull request number. */
export const PositivePullRequestNumberCodec = new t.Type<number, number>(
  'PositivePullRequestNumber',
  (input): input is number =>
    typeof input === 'number' && Number.isInteger(input) && input >= 1,
  (input, context) =>
    typeof input === 'number' && Number.isInteger(input) && input >= 1
      ? t.success(input)
      : t.failure(
          input,
          context,
          'pullRequestNumber must be a positive integer.',
        ),
  t.identity,
);

/** Codec for discord thread session base. */
const DiscordThreadSessionBaseCodec = t.type({
  id: t.string,
  summary: t.string,
  status: LifecycleStatusCodec,
  trace: t.array(t.string),
  updatedAt: IsoTimestampCodec,
  guildId: t.string,
  channelId: t.string,
  parentChannelId: t.string,
  threadId: t.string,
  artifactId: t.string,
});

/** Codec for discord thread kind. */
export const DiscordThreadKindCodec = t.union([
  t.literal('spec'),
  t.literal('implementation'),
  t.literal('pull-request'),
]);

/** Codec for discord thread session input. */
export const DiscordThreadSessionInputCodec = t.intersection([
  DiscordThreadSessionBaseCodec,
  t.type({
    kind: DiscordThreadKindCodec,
    specId: t.union([t.string, t.null]),
    sliceId: t.union([t.string, t.null]),
    pullRequestNumber: t.union([PositivePullRequestNumberCodec, t.null]),
  }),
]);

/** Codec for discord spec thread session. */
export const DiscordSpecThreadSessionCodec = t.intersection([
  DiscordThreadSessionBaseCodec,
  t.type({
    kind: t.literal('spec'),
    specId: t.string,
    sliceId: t.null,
    pullRequestNumber: t.null,
  }),
]);

/** Codec for discord implementation thread session. */
export const DiscordImplementationThreadSessionCodec = t.intersection([
  DiscordThreadSessionBaseCodec,
  t.type({
    kind: t.literal('implementation'),
    specId: t.union([t.string, t.null]),
    sliceId: t.string,
    pullRequestNumber: t.null,
  }),
]);

/** Codec for discord pull request thread session. */
export const DiscordPullRequestThreadSessionCodec = t.intersection([
  DiscordThreadSessionBaseCodec,
  t.type({
    kind: t.literal('pull-request'),
    specId: t.union([t.string, t.null]),
    sliceId: t.union([t.string, t.null]),
    pullRequestNumber: PositivePullRequestNumberCodec,
  }),
]);

/** Codec for discord thread session. */
export const DiscordThreadSessionCodec = t.union([
  DiscordSpecThreadSessionCodec,
  DiscordImplementationThreadSessionCodec,
  DiscordPullRequestThreadSessionCodec,
]);

/** Codec for discord thread session result. */
export const DiscordThreadSessionResultCodec = t.type({
  session: DiscordThreadSessionCodec,
  artifactId: t.string,
  persistedKey: t.string,
});

/** Discord thread kind that can own a DevPlat lifecycle session. */
export type DiscordThreadKind = t.TypeOf<typeof DiscordThreadKindCodec>;

/** Input used to create or update a Discord thread session. */
export type DiscordThreadSessionInput = t.TypeOf<
  typeof DiscordThreadSessionInputCodec
>;

/** Session bound to a specification Discord thread. */
export type DiscordSpecThreadSession = t.TypeOf<
  typeof DiscordSpecThreadSessionCodec
>;

/** Session bound to an implementation Discord thread. */
export type DiscordImplementationThreadSession = t.TypeOf<
  typeof DiscordImplementationThreadSessionCodec
>;

/** Session bound to a pull request Discord thread. */
export type DiscordPullRequestThreadSession = t.TypeOf<
  typeof DiscordPullRequestThreadSessionCodec
>;

/** Bound Discord thread session for one DevPlat lifecycle item. */
export type DiscordThreadSession = t.TypeOf<typeof DiscordThreadSessionCodec>;

/** Persisted result for a Discord thread session. */
export type DiscordThreadSessionResult = t.TypeOf<
  typeof DiscordThreadSessionResultCodec
>;
