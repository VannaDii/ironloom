import type * as t from 'io-ts';

import type {
  SonarApiQualityGateStatusCodec,
  SonarBootstrapVerificationChecksCodec,
  SonarBootstrapVerificationInputCodec,
  SonarBootstrapVerificationResultCodec,
  SonarQualityGateConditionSnapshotCodec,
} from './codec.js';

export type SonarApiQualityGateStatus = t.TypeOf<
  typeof SonarApiQualityGateStatusCodec
>;

export type SonarQualityGateConditionSnapshot = t.TypeOf<
  typeof SonarQualityGateConditionSnapshotCodec
>;

export type SonarBootstrapVerificationInput = t.TypeOf<
  typeof SonarBootstrapVerificationInputCodec
>;

export type SonarBootstrapVerificationChecks = t.TypeOf<
  typeof SonarBootstrapVerificationChecksCodec
>;

export type SonarBootstrapVerificationResult = t.TypeOf<
  typeof SonarBootstrapVerificationResultCodec
>;
