import {
  ArtifactEnvelopeService,
  type ArtifactEnvelope,
} from '@vannadii/devplat-artifacts';

import { createResearchBrief, describeResearchBrief } from './logic.js';
import type { ResearchBrief } from './codec.js';

export class ResearchBriefService {
  private readonly artifacts = new ArtifactEnvelopeService();

  public create(input: ResearchBrief): ResearchBrief {
    return createResearchBrief(input);
  }

  public execute(input: ResearchBrief): ResearchBrief {
    return this.create(input);
  }

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

  public explain(input: ResearchBrief): string {
    return describeResearchBrief(input);
  }
}
