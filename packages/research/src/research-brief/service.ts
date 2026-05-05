import {
  ArtifactEnvelopeService,
  type ArtifactEnvelope,
} from '@vannadii/devplat-artifacts';

import { createResearchBrief, describeResearchBrief } from './logic.js';
import type { ResearchBrief } from './codec.js';

/** Research brief service service. */
export class ResearchBriefService {
  /** Artifacts. */
  private readonly artifacts = new ArtifactEnvelopeService();

  /** Creates create. */
  public create(input: ResearchBrief): ResearchBrief {
    return createResearchBrief(input);
  }

  /** Executes the service operation. */
  public execute(input: ResearchBrief): ResearchBrief {
    return this.create(input);
  }

  /** Converts the result to an artifact. */
  public toArtifact(input: ResearchBrief): ArtifactEnvelope<ResearchBrief> {
    const brief = createResearchBrief(input);
    return this.artifacts.execute({
      id: `artifact:${brief.researchId}`,
      artifactType: 'research-brief',
      version: 1,
      summary: `Research brief for ${brief.topic}`,
      status: 'complete',
      trace: ['research:artifact'],
      updatedAt: brief.updatedAt,
      payload: brief,
    });
  }

  /** Describes the service result for operators. */
  public explain(input: ResearchBrief): string {
    return describeResearchBrief(input);
  }
}
