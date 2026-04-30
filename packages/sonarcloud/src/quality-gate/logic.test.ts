import { describe, expect, it } from 'vitest';

import {
  createSonarQualityGateResult,
  describeSonarQualityGateResult,
  isQualityGatePassing,
  normalizeSonarIssue,
} from './logic.js';
import type { SonarQualityGateResult } from './types.js';

describe('SonarQualityGateResult logic', () => {
  it('evaluates coverage thresholds and blocking issues', () => {
    const snapshot = createSonarQualityGateResult({
      projectKey: 'vannadii_devplat',
      status: 'failed',
      overallCoverage: 92,
      newCodeCoverage: 91,
      blockingIssues: 0,
      evaluatedAt: '2026-04-04T00:00:00.000Z',
    });

    expect(snapshot.status).toBe('passed');
    expect(isQualityGatePassing(snapshot)).toBe(true);
    expect(describeSonarQualityGateResult(snapshot)).toContain('passed');
  });

  it('normalizes Sonar issues and derives blocking counts', () => {
    const cases = [
      {
        inputs: {
          result: {
            projectKey: 'vannadii_devplat',
            status: 'passed',
            overallCoverage: 95,
            newCodeCoverage: 95,
            blockingIssues: 0,
            evaluatedAt: '2026-04-05T00:00:00.000Z',
            issues: [
              {
                issueKey: ' issue-1 ',
                severity: 'critical',
                path: ' packages/core/src/domain/logic.ts ',
                message: ' Fix this ',
                effortMinutes: -5,
                blocking: false,
              },
            ],
          } satisfies SonarQualityGateResult,
        },
        mock: () => undefined,
        assert: (result: ReturnType<typeof createSonarQualityGateResult>) => {
          expect(result.status).toBe('failed');
          expect(result.blockingIssues).toBe(1);
          expect(result.nextAction).toBe('review-sonar');
          expect(result.issues).toEqual([
            {
              issueKey: 'issue-1',
              severity: 'critical',
              path: 'packages/core/src/domain/logic.ts',
              message: 'Fix this',
              effortMinutes: 0,
              blocking: true,
            },
          ]);
        },
      },
    ];

    for (const testCase of cases) {
      testCase.mock();
      testCase.assert(createSonarQualityGateResult(testCase.inputs.result));
    }

    const issueCases = [
      {
        inputs: {
          issue: {
            issueKey: 'issue-2',
            severity: 'minor',
            path: 'file.ts',
            message: 'msg',
            effortMinutes: 12.8,
            blocking: false,
          },
        },
        mock: () => undefined,
        assert: (issue: ReturnType<typeof normalizeSonarIssue>) => {
          expect(issue.effortMinutes).toBe(12);
        },
      },
    ];

    for (const testCase of issueCases) {
      testCase.mock();
      testCase.assert(normalizeSonarIssue(testCase.inputs.issue));
    }
  });
});
