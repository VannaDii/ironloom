import { describe, expect, it } from 'vitest';

import {
  createReviewFindingFromSonarIssue,
  createReviewFindingsFromSonarQualityGate,
  createSonarQualityGateResult,
  describeSonarQualityGateResult,
  isQualityGatePassing,
  normalizeSonarIssue,
} from './logic.js';
import type { NormalizedSonarIssue, SonarQualityGateResult } from './codec.js';

type SonarQualityGateLogicInputs =
  | {
      mode: 'passing-thresholds';
      result: SonarQualityGateResult;
    }
  | {
      mode: 'normalize-issues';
      result: SonarQualityGateResult;
      issue: NormalizedSonarIssue;
    }
  | {
      mode: 'review-finding';
      result: SonarQualityGateResult;
    }
  | {
      mode: 'severity-mapping';
      issues: NormalizedSonarIssue[];
    };

type SonarQualityGateLogicCase = {
  name: string;
  inputs: SonarQualityGateLogicInputs;
  mock: () => undefined;
  assert: (inputs: SonarQualityGateLogicInputs) => void;
};

describe('SonarQualityGateResult logic', () => {
  const cases = [
    {
      name: 'evaluates coverage thresholds and blocking issues',
      inputs: {
        mode: 'passing-thresholds',
        result: {
          projectKey: 'vannadii_devplat',
          status: 'failed',
          overallCoverage: 92,
          newCodeCoverage: 91,
          blockingIssues: 0,
          evaluatedAt: '2026-04-04T00:00:00.000Z',
        },
      },
      mock: () => undefined,
      assert: (inputs) => {
        if (inputs.mode !== 'passing-thresholds') {
          throw new Error('expected passing-thresholds inputs');
        }

        const snapshot = createSonarQualityGateResult(inputs.result);

        expect(snapshot.status).toBe('passed');
        expect(isQualityGatePassing(snapshot)).toBe(true);
        expect(describeSonarQualityGateResult(snapshot)).toContain('passed');
      },
    },
    {
      name: 'normalizes Sonar issues and derives blocking counts',
      inputs: {
        mode: 'normalize-issues',
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
        },
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
      assert: (inputs) => {
        if (inputs.mode !== 'normalize-issues') {
          throw new Error('expected normalize-issues inputs');
        }

        const result = createSonarQualityGateResult(inputs.result);
        const issue = normalizeSonarIssue(inputs.issue);

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
        expect(issue.effortMinutes).toBe(12);
      },
    },
    {
      name: 'projects normalized Sonar issues into review findings',
      inputs: {
        mode: 'review-finding',
        result: {
          projectKey: 'vannadii_devplat',
          status: 'failed',
          overallCoverage: 95,
          newCodeCoverage: 95,
          blockingIssues: 0,
          evaluatedAt: '2026-04-05T00:00:00.000Z',
          issues: [
            {
              issueKey: 'issue-3',
              severity: 'blocker',
              path: 'packages/openclaw/src/tool-surfaces/service.ts',
              message: 'Policy bypass',
              effortMinutes: 30,
              blocking: false,
            },
          ],
        },
      },
      mock: () => undefined,
      assert: (inputs) => {
        if (inputs.mode !== 'review-finding') {
          throw new Error('expected review-finding inputs');
        }

        const findings = createReviewFindingsFromSonarQualityGate(
          inputs.result,
        );

        expect(findings).toEqual([
          {
            findingId: 'sonar:issue-3',
            severity: 'critical',
            path: 'packages/openclaw/src/tool-surfaces/service.ts',
            message: 'Policy bypass',
            rationale:
              'Sonar issue issue-3 reported blocker severity with 30 minutes of estimated effort.',
            fixRecommendation:
              'Resolve the Sonar finding in packages/openclaw/src/tool-surfaces/service.ts: Policy bypass',
            blocking: true,
            updatedAt: '2026-04-05T00:00:00.000Z',
            source: 'sonar',
          },
        ]);
      },
    },
    {
      name: 'returns no review findings when the quality gate has no issues',
      inputs: {
        mode: 'review-finding',
        result: {
          projectKey: 'vannadii_devplat',
          status: 'passed',
          overallCoverage: 95,
          newCodeCoverage: 95,
          blockingIssues: 0,
          evaluatedAt: '2026-04-05T00:00:00.000Z',
        },
      },
      mock: () => undefined,
      assert: (inputs) => {
        if (inputs.mode !== 'review-finding') {
          throw new Error('expected review-finding inputs');
        }

        expect(createReviewFindingsFromSonarQualityGate(inputs.result)).toEqual(
          [],
        );
      },
    },
    {
      name: 'maps Sonar severities into review severity bands',
      inputs: {
        mode: 'severity-mapping',
        issues: [
          {
            issueKey: 'info-issue',
            severity: 'info',
            path: 'info.ts',
            message: 'info',
            effortMinutes: 1,
            blocking: false,
          },
          {
            issueKey: 'major-issue',
            severity: 'major',
            path: 'major.ts',
            message: 'major',
            effortMinutes: 2,
            blocking: false,
          },
          {
            issueKey: 'critical-issue',
            severity: 'critical',
            path: 'critical.ts',
            message: 'critical',
            effortMinutes: 3,
            blocking: false,
          },
        ],
      },
      mock: () => undefined,
      assert: (inputs) => {
        if (inputs.mode !== 'severity-mapping') {
          throw new Error('expected severity-mapping inputs');
        }

        const findings = inputs.issues.map((issue) =>
          createReviewFindingFromSonarIssue(issue, '2026-04-05T00:00:00.000Z'),
        );

        expect(findings.map((finding) => finding.severity)).toEqual([
          'low',
          'medium',
          'high',
        ]);
      },
    },
  ] satisfies SonarQualityGateLogicCase[];

  it.each(cases)('$name', (testCase) => {
    expect.hasAssertions();
    testCase.mock();

    testCase.assert(testCase.inputs);
  });
});
