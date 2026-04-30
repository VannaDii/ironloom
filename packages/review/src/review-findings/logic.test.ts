import { describe, expect, it } from 'vitest';

import {
  createReviewFinding,
  describeReviewFinding,
  isBlockingReviewFinding,
} from './logic.js';
import type { ReviewFinding } from './types.js';

describe('ReviewFinding logic', () => {
  it('elevates high-severity findings to blocking', () => {
    const snapshot = createReviewFinding({
      findingId: 'finding-001',
      severity: 'high',
      path: 'packages/openclaw/src/index.ts',
      message: '  Transport validation is too weak.  ',
      rationale: '  Invalid inputs would reach the adapter.  ',
      fixRecommendation: '  Decode inputs with io-ts before dispatch.  ',
      blocking: false,
      updatedAt: '2026-04-04T00:00:00.000Z',
    });

    expect(snapshot.blocking).toBe(true);
    expect(isBlockingReviewFinding(snapshot)).toBe(true);
    expect(describeReviewFinding(snapshot)).toContain('high finding');
  });

  it('keeps low-severity findings non-blocking when explicitly safe', () => {
    const snapshot = createReviewFinding({
      findingId: 'finding-002',
      severity: 'low',
      path: 'packages/core/src/domain/logic.ts',
      message: '  Minor docs gap  ',
      rationale: '  This does not change behavior.  ',
      fixRecommendation: '  Clarify the summary string.  ',
      blocking: false,
      updatedAt: '2026-04-04T00:00:00.000Z',
    });

    expect(isBlockingReviewFinding(snapshot)).toBe(false);
  });

  it('normalizes spec conformance summaries for review findings', () => {
    const cases = [
      {
        inputs: {
          finding: {
            findingId: 'finding-003',
            severity: 'medium',
            path: ' packages/specs/src/spec-record/logic.ts ',
            message: ' Missing acceptance criterion ',
            rationale: ' One spec criterion is not implemented ',
            fixRecommendation: ' Add the missing implementation path ',
            blocking: false,
            updatedAt: '2026-04-05T00:00:00.000Z',
            source: 'automated',
            specConformance: {
              specId: ' spec-001 ',
              satisfiedCriteria: ['Gate passes', 'Gate passes'],
              missingCriteria: ['Audit artifact'],
            },
          } satisfies ReviewFinding,
        },
        mock: () => undefined,
        assert: (finding: ReturnType<typeof createReviewFinding>) => {
          expect(finding.source).toBe('automated');
          expect(finding.specConformance).toEqual({
            specId: 'spec-001',
            satisfiedCriteria: ['Gate passes'],
            missingCriteria: ['Audit artifact'],
          });
        },
      },
    ];

    for (const testCase of cases) {
      testCase.mock();
      testCase.assert(createReviewFinding(testCase.inputs.finding));
    }
  });
});
