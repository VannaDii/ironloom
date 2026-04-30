import { describe, expect, it } from 'vitest';

import {
  createReviewFinding,
  createReviewSummary,
  describeReviewFinding,
  isBlockingReviewFinding,
} from './logic.js';
import type { ReviewFinding } from './types.js';

describe('ReviewFinding logic', () => {
  const cases = [
    {
      name: 'elevates high-severity findings to blocking',
      inputs: {
        finding: {
          findingId: 'finding-001',
          severity: 'high',
          path: 'packages/openclaw/src/index.ts',
          message: '  Transport validation is too weak.  ',
          rationale: '  Invalid inputs would reach the adapter.  ',
          fixRecommendation: '  Decode inputs with io-ts before dispatch.  ',
          blocking: false,
          updatedAt: '2026-04-04T00:00:00.000Z',
        },
      },
      mock: () => undefined,
      assert: (inputs: {
        finding: Parameters<typeof createReviewFinding>[0];
      }) => {
        const snapshot = createReviewFinding(inputs.finding);

        expect(snapshot.blocking).toBe(true);
        expect(isBlockingReviewFinding(snapshot)).toBe(true);
        expect(describeReviewFinding(snapshot)).toContain('high finding');
      },
    },
    {
      name: 'keeps low-severity findings non-blocking when explicitly safe',
      inputs: {
        finding: {
          findingId: 'finding-002',
          severity: 'low',
          path: 'packages/core/src/domain/logic.ts',
          message: '  Minor docs gap  ',
          rationale: '  This does not change behavior.  ',
          fixRecommendation: '  Clarify the summary string.  ',
          blocking: false,
          updatedAt: '2026-04-04T00:00:00.000Z',
        },
      },
      mock: () => undefined,
      assert: (inputs: {
        finding: Parameters<typeof createReviewFinding>[0];
      }) => {
        const snapshot = createReviewFinding(inputs.finding);

        expect(isBlockingReviewFinding(snapshot)).toBe(false);
      },
    },
    {
      name: 'normalizes spec conformance summaries for review findings',
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
      assert: (inputs: { finding: ReviewFinding }) => {
        const finding = createReviewFinding(inputs.finding);

        expect(finding.source).toBe('automated');
        expect(finding.specConformance).toEqual({
          specId: 'spec-001',
          satisfiedCriteria: ['Gate passes'],
          missingCriteria: ['Audit artifact'],
        });
      },
    },
    {
      name: 'summarizes spec-vs-implementation review outcomes',
      inputs: {
        findings: [
          {
            findingId: 'finding-004',
            severity: 'critical',
            path: 'packages/prs/src/pull-request/logic.ts',
            message: 'Missing PR projection',
            rationale: 'The spec requires validation status in the PR body.',
            fixRecommendation: 'Add projection coverage.',
            blocking: false,
            updatedAt: '2026-04-05T00:00:00.000Z',
            source: 'automated',
            specConformance: {
              specId: 'spec-001',
              satisfiedCriteria: ['Checks run'],
              missingCriteria: ['PR body projection'],
            },
          } satisfies ReviewFinding,
        ],
      },
      mock: () => undefined,
      assert: (inputs: { findings: ReviewFinding[] }) => {
        const summary = createReviewSummary({
          summaryId: 'summary-1',
          specId: 'spec-001',
          findings: inputs.findings,
          updatedAt: '2026-04-05T00:00:00.000Z',
        });

        expect(summary.blockingFindingIds).toEqual(['finding-004']);
        expect(summary.missingCriteria).toEqual(['PR body projection']);
        expect(summary.implementationMatchesSpec).toBe(false);
      },
    },
    {
      name: 'summarizes empty review findings as matching the spec',
      inputs: {
        findings: [],
      },
      mock: () => undefined,
      assert: (inputs: { findings: ReviewFinding[] }) => {
        const summary = createReviewSummary({
          summaryId: 'summary-1',
          specId: 'spec-001',
          findings: inputs.findings,
          updatedAt: '2026-04-05T00:00:00.000Z',
        });

        expect(summary.implementationMatchesSpec).toBe(true);
        expect(summary.findingIds).toEqual([]);
      },
    },
    {
      name: 'summarizes satisfied nonblocking findings as matching the spec',
      inputs: {
        findings: [
          {
            findingId: 'finding-005',
            severity: 'low',
            path: 'packages/specs/src/spec-record/logic.ts',
            message: 'Criterion is implemented',
            rationale: 'The implementation covers the requested path.',
            fixRecommendation: 'No change required.',
            blocking: false,
            updatedAt: '2026-04-05T00:00:00.000Z',
            specConformance: {
              specId: 'spec-001',
              satisfiedCriteria: ['Audit artifact'],
              missingCriteria: [],
            },
          } satisfies ReviewFinding,
        ],
      },
      mock: () => undefined,
      assert: (inputs: { findings: ReviewFinding[] }) => {
        const summary = createReviewSummary({
          summaryId: 'summary-2',
          specId: 'spec-001',
          findings: inputs.findings,
          updatedAt: '2026-04-05T00:00:00.000Z',
        });

        expect(summary.satisfiedCriteria).toEqual(['Audit artifact']);
        expect(summary.implementationMatchesSpec).toBe(true);
      },
    },
  ];

  for (const testCase of cases) {
    it(testCase.name, () => {
      expect.hasAssertions();
      testCase.mock();
      testCase.assert(testCase.inputs);
    });
  }
});
