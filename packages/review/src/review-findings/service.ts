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

export class ReviewFindingsService {
  private readonly artifacts = new ArtifactEnvelopeService();

  public evaluate(input: ReviewFinding): ReviewFinding {
    return createReviewFinding(input);
  }

  public execute(input: ReviewFinding): ReviewFinding {
    return this.evaluate(input);
  }

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

  public explain(input: ReviewFinding): string {
    return describeReviewFinding(input);
  }
}
