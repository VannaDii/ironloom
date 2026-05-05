import {
  ArtifactEnvelopeService,
  type ArtifactEnvelope,
} from '@vannadii/devplat-artifacts';

import {
  approveSpecRecord,
  createSpecRecord,
  describeSpecRecord,
  updateSpecRecord,
} from './logic.js';
import type { SpecRecord } from './codec.js';

/** Spec record service service. */
export class SpecRecordService {
  /** Artifacts. */
  private readonly artifacts = new ArtifactEnvelopeService();

  /** Draft. */
  public draft(input: SpecRecord): SpecRecord {
    return createSpecRecord(input);
  }

  /** Approve. */
  public approve(input: SpecRecord): SpecRecord {
    return approveSpecRecord(input);
  }

  /** Update. */
  public update(input: SpecRecord): SpecRecord {
    return updateSpecRecord(input);
  }

  /** Executes the service operation. */
  public execute(input: SpecRecord): SpecRecord {
    return this.draft(input);
  }

  /** Converts the result to an artifact. */
  public toArtifact(input: SpecRecord): ArtifactEnvelope<SpecRecord> {
    const record = createSpecRecord(input);
    return this.artifacts.execute({
      id: `artifact:${record.specId}`,
      artifactType: 'spec-record',
      version: 1,
      summary: `Spec ${record.title}`,
      status: record.approvalState === 'approved' ? 'approved' : 'draft',
      trace: ['specs:artifact'],
      updatedAt: record.updatedAt,
      payload: record,
    });
  }

  /** Describes the service result for operators. */
  public explain(input: SpecRecord): string {
    return describeSpecRecord(input);
  }
}
