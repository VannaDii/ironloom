import type * as t from 'io-ts';

import type {
  ApprovalDecisionCodec,
  ApprovalRecordArtifactCodec,
  ApprovalRecordPayloadCodec,
  ApprovalSubjectTypeCodec,
} from './codec.js';

export type ApprovalSubjectType = t.TypeOf<typeof ApprovalSubjectTypeCodec>;

export type ApprovalDecision = t.TypeOf<typeof ApprovalDecisionCodec>;

export type ApprovalRecordPayload = t.TypeOf<typeof ApprovalRecordPayloadCodec>;

export type ApprovalRecordArtifact = t.TypeOf<
  typeof ApprovalRecordArtifactCodec
>;
