import {
  createApprovalRecordArtifact,
  describeApprovalRecordArtifact,
} from './logic.js';
import type { ApprovalRecordArtifact } from './codec.js';

/** Approval record artifact service service. */
export class ApprovalRecordArtifactService {
  /** Executes the service operation. */
  public execute(input: ApprovalRecordArtifact): ApprovalRecordArtifact {
    return createApprovalRecordArtifact(input);
  }

  /** Describes the service result for operators. */
  public explain(input: ApprovalRecordArtifact): string {
    return describeApprovalRecordArtifact(input);
  }
}
