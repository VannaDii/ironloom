import { describe, expect, it } from 'vitest';

import {
  canMergePullRequest,
  createPullRequestProjection,
  createPullRequestRecord,
  describePullRequestRecord,
} from './logic.js';
import type { PullRequestRecord } from './codec.js';

type PullRequestLogicInputs = {
  record: PullRequestRecord;
};

type PullRequestLogicCase = {
  name: string;
  inputs: PullRequestLogicInputs;
  mock: () => void;
  assert: (record: PullRequestRecord) => void;
};

describe('PullRequestRecord logic', () => {
  const cases = [
    {
      name: 'normalizes labels and computes merge readiness',
      inputs: {
        record: {
          prNumber: 42,
          branchName: ' feature/release-flow ',
          baseBranch: ' main ',
          title: '  Release workflow hardening  ',
          labels: ['release', 'release', 'automation'],
          reviewState: 'approved',
          mergeReady: true,
          updatedAt: '2026-04-04T00:00:00.000Z',
        },
      },
      mock: () => undefined,
      assert: (record) => {
        expect(record.labels).toEqual(['release', 'automation']);
        expect(canMergePullRequest(record)).toBe(true);
        expect(describePullRequestRecord(record)).toContain('PR #42');
      },
    },
    {
      name: 'blocks merge when review state is not approved',
      inputs: {
        record: {
          prNumber: 7,
          branchName: 'feature/wip',
          baseBranch: 'main',
          title: 'Work in progress',
          labels: ['wip'],
          reviewState: 'review',
          mergeReady: true,
          updatedAt: '2026-04-04T00:00:00.000Z',
        },
      },
      mock: () => undefined,
      assert: (record) => {
        expect(canMergePullRequest(record)).toBe(false);
        expect(record.projection.validationSummary).toBe('Review pending');
      },
    },
    {
      name: 'projects PR body, validation, and artifact references',
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
        },
      },
      mock: () => undefined,
      assert: (record) => {
        expect(record.projection.checklist).toEqual(['Confirm platform']);
        expect(record.projection.riskSummary).toBe('Ready for merge');
        expect(record.projection.validationSummary).toBe('Review approved');
        expect(record.projection.artifactIds).toEqual(['artifact-1']);
        expect(record.projection.body).toContain('## Artifacts');
        expect(record.sourceArtifactIds).toEqual(['artifact-1']);
        expect(createPullRequestProjection(record).artifactIds).toEqual([
          'artifact-1',
        ]);
      },
    },
    {
      name: 'projects review and remediation blockers into PR status',
      inputs: {
        record: {
          prNumber: 44,
          branchName: 'feature/review-remediation',
          baseBranch: 'main',
          title: 'feat: project review remediation status',
          labels: ['platform'],
          reviewState: 'approved',
          mergeReady: true,
          updatedAt: '2026-04-06T00:00:00.000Z',
          reviewProjection: {
            summaryId: ' review-summary-1 ',
            findingIds: [' finding-1 ', 'finding-1', 'finding-2'],
            blockingFindingIds: [' finding-2 '],
            missingCriteria: [' PR body projection '],
            implementationMatchesSpec: false,
          },
          remediationProjection: {
            planId: ' remediation-1 ',
            successfulActions: ['update body', 'update body'],
            failedActions: [],
            artifactIds: ['remediation-artifact-1', 'remediation-artifact-1'],
            unresolvedFindingIds: [' finding-2 '],
            complete: false,
            nextAction: ' retry remediation ',
          },
          sourceArtifactIds: ['artifact-1'],
        },
      },
      mock: () => undefined,
      assert: (record) => {
        expect(canMergePullRequest(record)).toBe(false);
        expect(record.reviewProjection?.summaryId).toBe('review-summary-1');
        expect(record.remediationProjection?.planId).toBe('remediation-1');
        expect(record.remediationProjection?.nextAction).toBe(
          'retry remediation',
        );
        expect(record.projection.riskSummary).toBe(
          'Merge blocked by 1 review findings',
        );
        expect(record.projection.validationSummary).toBe(
          'Review blocked: 1 blocking findings, 1 missing criteria; Remediation pending: 1 unresolved findings',
        );
        expect(record.projection.checklist).toEqual([
          'Confirm platform',
          'Resolve blocking finding finding-2',
          'Satisfy spec criterion PR body projection',
          'Resolve remediation finding finding-2',
        ]);
        expect(record.projection.artifactIds).toEqual([
          'artifact-1',
          'remediation-artifact-1',
          'review-summary-1',
          'remediation-1',
        ]);
        expect(record.projection.body).toContain('## Review Evidence');
        expect(record.projection.body).toContain('finding-2');
      },
    },
    {
      name: 'keeps merge ready when review and remediation projections are clear',
      inputs: {
        record: {
          prNumber: 45,
          branchName: 'feature/clear-pr',
          baseBranch: 'main',
          title: 'feat: complete clear PR',
          labels: ['platform'],
          reviewState: 'approved',
          mergeReady: true,
          updatedAt: '2026-04-07T00:00:00.000Z',
          reviewProjection: {
            summaryId: 'review-summary-2',
            findingIds: [],
            blockingFindingIds: [],
            missingCriteria: [],
            implementationMatchesSpec: true,
          },
          remediationProjection: {
            planId: 'remediation-2',
            successfulActions: ['verified'],
            failedActions: [],
            artifactIds: ['remediation-artifact-2'],
            unresolvedFindingIds: [],
            complete: true,
          },
        },
      },
      mock: () => undefined,
      assert: (record) => {
        expect(canMergePullRequest(record)).toBe(true);
        expect(record.projection.validationSummary).toBe(
          'Review approved: 0 findings, no blocking findings; Remediation complete: 1 actions applied',
        );
        expect(record.projection.checklist).toContain(
          'Confirm remediation is complete',
        );
      },
    },
    {
      name: 'blocks merge for unresolved remediation after review clears',
      inputs: {
        record: {
          prNumber: 46,
          branchName: 'feature/remediation-only',
          baseBranch: 'main',
          title: 'feat: block unresolved remediation',
          labels: ['platform'],
          reviewState: 'approved',
          mergeReady: true,
          updatedAt: '2026-04-08T00:00:00.000Z',
          reviewProjection: {
            summaryId: 'review-summary-3',
            findingIds: ['finding-3'],
            blockingFindingIds: [],
            missingCriteria: [],
            implementationMatchesSpec: true,
          },
          remediationProjection: {
            planId: 'remediation-3',
            successfulActions: [],
            failedActions: ['verify gates'],
            artifactIds: [],
            unresolvedFindingIds: ['finding-3'],
            complete: false,
            nextAction: ' ',
          },
          projection: {
            body: ' custom body ',
            checklist: [' custom checklist ', 'custom checklist'],
            riskSummary: ' custom risk ',
            validationSummary: ' custom validation ',
            artifactIds: [' custom-artifact ', 'custom-artifact'],
          },
        },
      },
      mock: () => undefined,
      assert: (record) => {
        expect(canMergePullRequest(record)).toBe(false);
        expect(record.remediationProjection?.nextAction).toBeUndefined();
        expect(record.projection).toEqual({
          body: 'custom body',
          checklist: ['custom checklist'],
          riskSummary: 'custom risk',
          validationSummary: 'custom validation',
          artifactIds: ['custom-artifact'],
        });
        expect(createPullRequestProjection(record).riskSummary).toBe(
          'Merge blocked by 1 unresolved remediation findings',
        );
      },
    },
    {
      name: 'renders empty checklist and evidence sections deterministically',
      inputs: {
        record: {
          prNumber: 47,
          branchName: 'feature/no-checklist',
          baseBranch: 'main',
          title: 'feat: no checklist inputs',
          labels: [],
          reviewState: 'approved',
          mergeReady: true,
          updatedAt: '2026-04-09T00:00:00.000Z',
        },
      },
      mock: () => undefined,
      assert: (record) => {
        expect(record.projection.checklist).toEqual([]);
        expect(record.projection.body).toContain(
          '- [x] No open checklist items',
        );
        expect(record.projection.body).toContain('- None');
      },
    },
  ] satisfies PullRequestLogicCase[];

  it.each(cases)('$name', (testCase) => {
    expect.hasAssertions();
    testCase.mock();

    testCase.assert(createPullRequestRecord(testCase.inputs.record));
  });

  describe('rejects unsafe branch refs before projection', () => {
    const cases = [
      {
        name: 'rejects unsafe pull request branch refs',
        inputs: {
          record: {
            prNumber: 48,
            branchName: '--upload-pack=sh',
            baseBranch: 'main',
            title: 'feat: reject unsafe branch refs',
            labels: [],
            reviewState: 'review',
            mergeReady: false,
            updatedAt: '2026-04-10T00:00:00.000Z',
          },
        },
        mock: () => undefined,
        assert: (inputs: PullRequestLogicInputs) => {
          expect(() => createPullRequestRecord(inputs.record)).toThrow(
            'Git branch name',
          );
        },
      },
      {
        name: 'rejects unsafe pull request base refs',
        inputs: {
          record: {
            prNumber: 49,
            branchName: 'feature/safe',
            baseBranch: 'feature..bad',
            title: 'feat: reject unsafe base refs',
            labels: [],
            reviewState: 'review',
            mergeReady: false,
            updatedAt: '2026-04-10T00:00:00.000Z',
          },
        },
        mock: () => undefined,
        assert: (inputs: PullRequestLogicInputs) => {
          expect(() => createPullRequestRecord(inputs.record)).toThrow(
            'Git branch name',
          );
        },
      },
    ] satisfies {
      name: string;
      inputs: PullRequestLogicInputs;
      mock: () => void;
      assert: (inputs: PullRequestLogicInputs) => void;
    }[];

    it.each(cases)('$name', (testCase) => {
      expect.hasAssertions();
      testCase.mock();

      testCase.assert(testCase.inputs);
    });
  });
});
