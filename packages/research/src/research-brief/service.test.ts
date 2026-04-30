import { describe, expect, it } from 'vitest';

import { ResearchBriefService } from './service.js';

describe('ResearchBriefService', () => {
  const cases = [
    {
      name: 'creates research artifacts from normalized briefs',
      inputs: {
        brief: {
          researchId: 'research-001',
          topic: 'Discord operations',
          question: 'How should approvals be modeled?',
          constraints: ['auditable'],
          findings: ['Use thread-aware controls'],
          recommendation: 'Use Discord components for explicit approvals.',
          sourceUrls: ['https://example.com/discord'],
          updatedAt: '2026-04-04T00:00:00.000Z',
        },
      },
      mock: () => new ResearchBriefService(),
      assert: (
        service: ResearchBriefService,
        inputs: { brief: Parameters<ResearchBriefService['execute']>[0] },
      ) => {
        const snapshot = service.execute(inputs.brief);
        const artifact = service.toArtifact(snapshot);

        expect(artifact.artifactType).toBe('research-brief');
        expect(artifact.payload).toMatchObject({ researchId: 'research-001' });
        expect(service.explain(snapshot)).toContain('Research brief');
      },
    },
  ];

  for (const testCase of cases) {
    it(testCase.name, () => {
      expect.hasAssertions();
      testCase.assert(testCase.mock(), testCase.inputs);
    });
  }
});
