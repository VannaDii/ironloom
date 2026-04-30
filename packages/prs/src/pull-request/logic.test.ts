import { describe, expect, it } from 'vitest';

import {
  canMergePullRequest,
  createPullRequestProjection,
  createPullRequestRecord,
  describePullRequestRecord,
} from './logic.js';
import type { PullRequestRecord } from './types.js';

describe('PullRequestRecord logic', () => {
  it('normalizes labels and computes merge readiness', () => {
    const snapshot = createPullRequestRecord({
      prNumber: 42,
      branchName: ' feature/release-flow ',
      baseBranch: ' main ',
      title: '  Release workflow hardening  ',
      labels: ['release', 'release', 'automation'],
      reviewState: 'approved',
      mergeReady: true,
      updatedAt: '2026-04-04T00:00:00.000Z',
    });

    expect(snapshot.labels).toEqual(['release', 'automation']);
    expect(canMergePullRequest(snapshot)).toBe(true);
    expect(describePullRequestRecord(snapshot)).toContain('PR #42');
  });

  it('blocks merge when review state is not approved', () => {
    const snapshot = createPullRequestRecord({
      prNumber: 7,
      branchName: 'feature/wip',
      baseBranch: 'main',
      title: 'Work in progress',
      labels: ['wip'],
      reviewState: 'review',
      mergeReady: true,
      updatedAt: '2026-04-04T00:00:00.000Z',
    });

    expect(canMergePullRequest(snapshot)).toBe(false);
  });

  it('projects PR body, validation, and artifact references', () => {
    const cases = [
      {
        inputs: {
          record: {
            prNumber: 43,
            branchName: 'feature/full-autonomy',
            baseBranch: 'main',
            title: 'feat: complete autonomous flow',
            labels: ['platform', 'platform'],
            reviewState: 'approved',
            mergeReady: true,
            updatedAt: '2026-04-05T00:00:00.000Z',
            sourceArtifactIds: ['artifact-1', 'artifact-1'],
          } satisfies PullRequestRecord,
        },
        mock: () => undefined,
        assert: (record: ReturnType<typeof createPullRequestRecord>) => {
          expect(record.projection).toEqual({
            body: 'feat: complete autonomous flow',
            checklist: ['Confirm platform'],
            riskSummary: 'Ready for merge',
            validationSummary: 'Review approved',
            artifactIds: ['artifact-1'],
          });
          expect(record.sourceArtifactIds).toEqual(['artifact-1']);
        },
      },
    ];

    for (const testCase of cases) {
      testCase.mock();
      const record = createPullRequestRecord(testCase.inputs.record);
      testCase.assert(record);
      expect(createPullRequestProjection(record).artifactIds).toEqual([
        'artifact-1',
      ]);
    }
  });
});
