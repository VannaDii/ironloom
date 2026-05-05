import {
  ArtifactEnvelopeService,
  type ArtifactEnvelope,
} from '@vannadii/devplat-artifacts';

import {
  createReviewFinding,
  describeReviewFinding,
  isBlockingReviewFinding,
} from './logic.js';
import type { ReviewFinding } from './codec.js';

/** Review findings service service. */
export class ReviewFindingsService {
  /** Artifacts. */
  private readonly artifacts = new ArtifactEnvelopeService();

  /** Evaluate. */
  public evaluate(input: ReviewFinding): ReviewFinding {
    return createReviewFinding(input);
  }

  /** Executes the service operation. */
  public execute(input: ReviewFinding): ReviewFinding {
    return this.evaluate(input);
  }

  /** Converts the result to an artifact. */
  public toArtifact(input: ReviewFinding): ArtifactEnvelope<ReviewFinding> {
    const finding = createReviewFinding(input);
    return this.artifacts.execute({
      id: `artifact:${finding.findingId}`,
      artifactType: 'review-finding',
      version: 1,
      summary: `Review finding for ${finding.path}`,
      status: isBlockingReviewFinding(finding) ? 'failed' : 'review',
      trace: ['review:artifact'],
      updatedAt: finding.updatedAt,
      payload: finding,
    });
  }

  /** Describes the service result for operators. */
  public explain(input: ReviewFinding): string {
    return describeReviewFinding(input);
  }
}
