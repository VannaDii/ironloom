import * as t from 'io-ts';

import { LifecycleStatusCodec } from '@vannadii/devplat-core';

export const RebaseResultPayloadCodec = t.type({
  resultId: t.string,
  mergedPrNumber: t.number,
  baseBranch: t.string,
  branchName: t.string,
  rebased: t.boolean,
  conflictsDetected: t.boolean,
  details: t.string,
});

export const RebaseResultArtifactCodec = t.type({
  id: t.string,
  artifactType: t.literal('rebase-result'),
  version: t.literal(1),
  summary: t.string,
  status: LifecycleStatusCodec,
  trace: t.array(t.string),
  updatedAt: t.string,
  payload: RebaseResultPayloadCodec,
});
