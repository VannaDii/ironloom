import type * as t from 'io-ts';

import type {
  SpecApprovalStateCodec,
  SpecRecordCodec,
  SpecRevisionCodec,
} from './codec.js';

export type SpecApprovalState = t.TypeOf<typeof SpecApprovalStateCodec>;

export type SpecRevision = t.TypeOf<typeof SpecRevisionCodec>;

export type SpecRecord = t.TypeOf<typeof SpecRecordCodec>;
