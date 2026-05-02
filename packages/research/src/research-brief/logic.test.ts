import { describe, expect, it } from 'vitest';

import { createResearchBrief, describeResearchBrief } from './logic.js';

describe('ResearchBrief logic', () => {
  const cases = [
    {
      name: 'normalizes research detail lists',
      inputs: {
        brief: {
          researchId: 'research-001',
          topic: '  OpenClaw Discord operations  ',
          question: '  What Discord primitives should DevPlat rely on?  ',
          constraints: ['Discord threads', 'Discord threads', 'auditable'],
          findings: ['Thread sessions already isolate context', ''],
          recommendation: '  Treat Discord as the primary control plane.  ',
          sourceUrls: [
            'https://example.com/openclaw',
            'https://example.com/openclaw',
          ],
          sourceAttributions: [
            {
              url: ' https://example.com/openclaw ',
              title: ' OpenClaw Gateway ',
              claim: ' Gateway invokes tools over HTTP. ',
              confidence: 'high',
            },
          ],
          capabilityComparisons: [
            {
              option: ' Discord commands ',
              strengths: ['thread aware', 'thread aware'],
              tradeoffs: ['operator setup'],
            },
          ],
          feasibility: {
            feasible: true,
            blockers: ['', 'missing credentials'],
            nextQuestions: ['Who approves merge?', 'Who approves merge?'],
          },
          updatedAt: '2026-04-04T00:00:00.000Z',
        },
      },
      mock: () => undefined,
      assert: (inputs: {
        brief: Parameters<typeof createResearchBrief>[0];
      }) => {
        const snapshot = createResearchBrief(inputs.brief);

        expect(snapshot.topic).toBe('OpenClaw Discord operations');
        expect(snapshot.constraints).toEqual(['Discord threads', 'auditable']);
        expect(snapshot.sourceUrls).toEqual(['https://example.com/openclaw']);
        expect(snapshot.sourceAttributions?.[0]?.claim).toBe(
          'Gateway invokes tools over HTTP.',
        );
        expect(snapshot.capabilityComparisons?.[0]?.strengths).toEqual([
          'thread aware',
        ]);
        expect(snapshot.feasibility?.blockers).toEqual(['missing credentials']);
        expect(describeResearchBrief(snapshot)).toContain('Research brief');
      },
    },
  ];

  it.each(cases)('$name', (testCase) => {
    expect.hasAssertions();
    testCase.mock();
    testCase.assert(testCase.inputs);
  });
});
