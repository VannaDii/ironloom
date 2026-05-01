import { describe, expect, it } from 'vitest';

import { ReviewFindingsService } from './service.js';
import type { ReviewFinding } from './codec.js';

type ReviewFindingsServiceCase = {
  name: string;
  inputs: {
    finding: ReviewFinding;
  };
  mock: () => {
    service: ReviewFindingsService;
  };
  assert: (
    context: { service: ReviewFindingsService },
    inputs: { finding: ReviewFinding },
  ) => void;
};

describe('ReviewFindingsService', () => {
  const cases = [
    {
      name: 'turns review findings into machine-readable artifacts',
      inputs: {
        finding: {
          findingId: 'finding-001',
          severity: 'critical',
          path: 'packages/storage/src/file-store/service.ts',
          message: 'Storage bypass detected.',
          rationale: 'Direct filesystem access must stay isolated.',
          fixRecommendation: 'Route writes through the storage service only.',
          blocking: true,
          updatedAt: '2026-04-04T00:00:00.000Z',
        },
      },
      mock: () => ({
        service: new ReviewFindingsService(),
      }),
      assert: (context, inputs) => {
        const snapshot = context.service.execute(inputs.finding);
        const artifact = context.service.toArtifact(snapshot);

        expect(artifact.status).toBe('failed');
        expect(artifact.payload).toMatchObject({ findingId: 'finding-001' });
        expect(context.service.explain(snapshot)).toContain('critical finding');
      },
    },
    {
      name: 'emits review-status artifacts for non-blocking findings',
      inputs: {
        finding: {
          findingId: 'finding-002',
          severity: 'low',
          path: 'packages/core/src/domain/logic.ts',
          message: 'Minor docs gap.',
          rationale: 'No behavioral impact.',
          fixRecommendation: 'Clarify the summary string.',
          blocking: false,
          updatedAt: '2026-04-04T00:00:00.000Z',
        },
      },
      mock: () => ({
        service: new ReviewFindingsService(),
      }),
      assert: (context, inputs) => {
        const snapshot = context.service.execute(inputs.finding);
        const artifact = context.service.toArtifact(snapshot);

        expect(artifact.status).toBe('review');
      },
    },
  ] satisfies ReviewFindingsServiceCase[];

  it.each(cases)('$name', (testCase) => {
    expect.hasAssertions();
    const context = testCase.mock();

    testCase.assert(context, testCase.inputs);
  });
});
