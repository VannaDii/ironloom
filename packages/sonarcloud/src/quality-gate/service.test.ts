import { describe, expect, it } from 'vitest';

import { SonarQualityGateService } from './service.js';
import type { SonarQualityGateResult } from './codec.js';

type SonarQualityGateServiceInputs =
  | {
      mode: 'evaluate';
      projectKey: string;
      passingOverallCoverage: number;
      passingNewCodeCoverage: number;
      failingOverallCoverage: number;
      failingNewCodeCoverage: number;
      blockingIssues: number;
    }
  | {
      mode: 'execute';
      result: SonarQualityGateResult;
    }
  | {
      mode: 'review-findings';
      result: SonarQualityGateResult;
    };

type SonarQualityGateServiceCase = {
  name: string;
  inputs: SonarQualityGateServiceInputs;
  mock: () => {
    service: SonarQualityGateService;
  };
  assert: (
    context: { service: SonarQualityGateService },
    inputs: SonarQualityGateServiceInputs,
  ) => void;
};

describe('SonarQualityGateService', () => {
  const cases = [
    {
      name: 'enforces the 90 percent coverage policy',
      inputs: {
        mode: 'evaluate',
        projectKey: 'vannadii_devplat',
        passingOverallCoverage: 95,
        passingNewCodeCoverage: 90,
        failingOverallCoverage: 89,
        failingNewCodeCoverage: 92,
        blockingIssues: 0,
      },
      mock: () => ({
        service: new SonarQualityGateService(),
      }),
      assert: (context, inputs) => {
        if (inputs.mode !== 'evaluate') {
          throw new Error('expected evaluate inputs');
        }

        const passing = context.service.evaluate(
          inputs.projectKey,
          inputs.passingOverallCoverage,
          inputs.passingNewCodeCoverage,
          inputs.blockingIssues,
        );
        const failing = context.service.evaluate(
          inputs.projectKey,
          inputs.failingOverallCoverage,
          inputs.failingNewCodeCoverage,
          inputs.blockingIssues,
        );

        expect(context.service.passes(passing)).toBe(true);
        expect(context.service.passes(failing)).toBe(false);
        expect(context.service.explain(passing)).toContain('passed');
      },
    },
    {
      name: 'covers direct execute for blocking-issue failures',
      inputs: {
        mode: 'execute',
        result: {
          projectKey: 'vannadii_devplat',
          status: 'passed',
          overallCoverage: 100,
          newCodeCoverage: 100,
          blockingIssues: 1,
          evaluatedAt: '2026-04-04T00:00:00.000Z',
        },
      },
      mock: () => ({
        service: new SonarQualityGateService(),
      }),
      assert: (context, inputs) => {
        if (inputs.mode !== 'execute') {
          throw new Error('expected execute inputs');
        }

        const result = context.service.execute(inputs.result);

        expect(result.status).toBe('failed');
      },
    },
    {
      name: 'projects Sonar quality gate issues into review findings',
      inputs: {
        mode: 'review-findings',
        result: {
          projectKey: 'vannadii_devplat',
          status: 'failed',
          overallCoverage: 100,
          newCodeCoverage: 100,
          blockingIssues: 0,
          evaluatedAt: '2026-04-04T00:00:00.000Z',
          issues: [
            {
              issueKey: 'issue-1',
              severity: 'major',
              path: 'packages/core/src/domain/logic.ts',
              message: 'Fix this',
              effortMinutes: 10,
              blocking: false,
            },
          ],
        },
      },
      mock: () => ({
        service: new SonarQualityGateService(),
      }),
      assert: (context, inputs) => {
        if (inputs.mode !== 'review-findings') {
          throw new Error('expected review-findings inputs');
        }

        const findings = context.service.toReviewFindings(inputs.result);

        expect(findings.map((finding) => finding.findingId)).toEqual([
          'sonar:issue-1',
        ]);
        expect(findings[0]?.source).toBe('sonar');
      },
    },
  ] satisfies SonarQualityGateServiceCase[];

  it.each(cases)('$name', (testCase) => {
    expect.hasAssertions();
    const context = testCase.mock();

    testCase.assert(context, testCase.inputs);
  });
});
