import * as t from 'io-ts';

import type { GitHubActionRequest } from './types.js';

export const GitHubActionRequestCodec = t.intersection([
  t.type({
    repoFullName: t.string,
    action: t.union([
      t.literal('create-pr'),
      t.literal('update-pr'),
      t.literal('comment-pr'),
      t.literal('merge-pr'),
      t.literal('sync-branch'),
    ]),
    summary: t.string,
    privileged: t.boolean,
    updatedAt: t.string,
  }),
  t.partial({
    targetNumber: t.number,
    branchName: t.string,
    baseBranch: t.string,
    title: t.string,
    body: t.string,
    commentBody: t.string,
    expectedHeadSha: t.string,
  }),
]);

export type _GitHubActionRequestExact =
  t.TypeOf<typeof GitHubActionRequestCodec> extends GitHubActionRequest
    ? GitHubActionRequest extends t.TypeOf<typeof GitHubActionRequestCodec>
      ? true
      : never
    : never;
