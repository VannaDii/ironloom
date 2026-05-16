import { describe, expect, it } from 'vitest';

import {
  parseHeadlessMaintenanceRunnerArgs,
  runHeadlessMaintenanceLoop,
} from './headless-maintenance-runner.mjs';

const fixedTimestamp = '2026-05-16T00:00:00.000Z';

describe('headless-maintenance-runner', () => {
  const baseRequest = {
    requestId: 'maintenance-1',
    repositoryKey: 'VannaDii/devplat',
    objective: 'Dogfood the headless maintenance loop.',
    actorId: 'agent-1',
    updatedAt: fixedTimestamp,
    artifacts: [],
  };

  const cases = [
    {
      name: 'executes a supplied tool input and stops at a human approval blocker',
      inputs: {
        plan: {
          request: baseRequest,
          toolInputs: {
            create_research_brief: [
              {
                params: {
                  researchId: 'research-1',
                  topic: 'Headless maintenance',
                  question: 'How should the loop continue?',
                  constraints: ['No Discord dependency'],
                  findings: ['Use continuation decisions'],
                  recommendation: 'Run the next platform tool.',
                  sourceUrls: [],
                  updatedAt: fixedTimestamp,
                },
                artifactSignal: {
                  artifactId: 'research-1',
                  artifactType: 'research-brief',
                  status: 'complete',
                  updatedAt: fixedTimestamp,
                },
              },
            ],
          },
        },
      },
      mock: async () => {
        const executed = [];
        const tools = [
          createTool('continue_lifecycle', async (_toolCallId, params) => {
            const artifacts = Array.isArray(params.artifacts)
              ? params.artifacts
              : [];

            if (artifacts.length === 0) {
              return createResult(
                createDecision({
                  toolName: 'create_research_brief',
                  requiresHumanApproval: false,
                  blockers: [],
                  missingArtifactTypes: ['research-brief'],
                }),
              );
            }

            return createResult(
              createDecision({
                toolName: 'approve_spec_record',
                requiresHumanApproval: true,
                blockers: ['spec approval required'],
                missingArtifactTypes: [],
              }),
            );
          }),
          createTool('create_research_brief', async (toolCallId, params) => {
            executed.push({ params, toolCallId });

            return createResult({
              researchId: params.researchId,
              updatedAt: params.updatedAt,
            });
          }),
        ];

        return { executed, tools };
      },
      assert: async (context, inputs) => {
        const report = await runHeadlessMaintenanceLoop({
          ...inputs.plan,
          tools: context.tools,
        });

        expect(report.status).toBe('blocked');
        expect(report.executedSteps).toEqual([
          {
            artifactSignal: {
              artifactId: 'research-1',
              artifactType: 'research-brief',
              status: 'complete',
              updatedAt: fixedTimestamp,
            },
            iteration: 1,
            toolName: 'create_research_brief',
          },
        ]);
        expect(report.finalRequest.artifacts).toEqual([
          {
            artifactId: 'research-1',
            artifactType: 'research-brief',
            status: 'complete',
            updatedAt: fixedTimestamp,
          },
        ]);
        expect(report.decisions).toHaveLength(2);
        expect(report.blockers).toEqual(['spec approval required']);
        expect(context.executed).toHaveLength(1);
      },
    },
    {
      name: 'stops when the next platform tool has no supplied input',
      inputs: {
        plan: {
          request: baseRequest,
          toolInputs: {},
        },
      },
      mock: async () => {
        const tools = [
          createTool('continue_lifecycle', async () =>
            createResult(
              createDecision({
                toolName: 'create_slice_plan',
                requiresHumanApproval: false,
                blockers: [],
                missingArtifactTypes: ['slice-plan'],
              }),
            ),
          ),
        ];

        return { tools };
      },
      assert: async (context, inputs) => {
        const report = await runHeadlessMaintenanceLoop({
          ...inputs.plan,
          tools: context.tools,
        });

        expect(report.status).toBe('waiting-for-input');
        expect(report.executedSteps).toEqual([]);
        expect(report.nextAction.toolName).toBe('create_slice_plan');
        expect(report.nextAction.inputRequirements).toEqual(['test input']);
      },
    },
    {
      name: 'derives an artifact signal from a delegated tool result',
      inputs: {
        plan: {
          request: {
            ...baseRequest,
            artifacts: [
              {
                artifactId: 'research-1',
                artifactType: 'research-brief',
                status: 'complete',
                updatedAt: fixedTimestamp,
              },
              {
                artifactId: 'spec-1',
                artifactType: 'spec-record',
                status: 'approved',
                updatedAt: fixedTimestamp,
              },
            ],
          },
          toolInputs: {
            create_slice_plan: [
              {
                params: {
                  sliceId: 'slice-1',
                  specId: 'spec-1',
                  title: 'Runner slice',
                  dependsOn: [],
                  acceptanceCriteria: ['runner records the next artifact'],
                  doneConditions: ['loop stops at the next missing input'],
                  size: 'small',
                  updatedAt: fixedTimestamp,
                },
              },
            ],
          },
        },
      },
      mock: async () => {
        const tools = [
          createTool('continue_lifecycle', async (_toolCallId, params) => {
            const hasSlice =
              Array.isArray(params.artifacts) &&
              params.artifacts.some(
                (artifact) => artifact.artifactType === 'slice-plan',
              );

            return createResult(
              createDecision({
                toolName: hasSlice ? 'create_task_record' : 'create_slice_plan',
                requiresHumanApproval: false,
                blockers: [],
                missingArtifactTypes: hasSlice
                  ? ['task-record']
                  : ['slice-plan'],
              }),
            );
          }),
          createTool('create_slice_plan', async (_toolCallId, params) =>
            createResult({
              sliceId: params.sliceId,
              updatedAt: params.updatedAt,
            }),
          ),
        ];

        return { tools };
      },
      assert: async (context, inputs) => {
        const report = await runHeadlessMaintenanceLoop({
          ...inputs.plan,
          tools: context.tools,
        });

        expect(report.status).toBe('waiting-for-input');
        expect(report.executedSteps).toEqual([
          {
            artifactSignal: {
              artifactId: 'slice-1',
              artifactType: 'slice-plan',
              status: 'complete',
              updatedAt: fixedTimestamp,
            },
            iteration: 1,
            toolName: 'create_slice_plan',
          },
        ]);
        expect(report.finalRequest.artifacts).toContainEqual({
          artifactId: 'slice-1',
          artifactType: 'slice-plan',
          status: 'complete',
          updatedAt: fixedTimestamp,
        });
      },
    },
    {
      name: 'parses plan max step and json flags',
      inputs: {
        argv: ['--plan', 'maintenance-plan.json', '--max-steps', '3', '--json'],
      },
      mock: async () => undefined,
      assert: async (_context, inputs) => {
        expect(parseHeadlessMaintenanceRunnerArgs(inputs.argv)).toEqual({
          json: true,
          maxSteps: 3,
          planPath: 'maintenance-plan.json',
        });
      },
    },
  ];

  it.each(cases)('$name', async (testCase) => {
    const context = await testCase.mock();

    await testCase.assert(context, testCase.inputs);
  });
});

function createTool(name, execute) {
  return { name, execute };
}

function createResult(details) {
  return { details };
}

function createDecision({
  toolName,
  requiresHumanApproval,
  blockers,
  missingArtifactTypes,
}) {
  return {
    id: `decision-${toolName}`,
    summary: `Next action is ${toolName}.`,
    status: 'running',
    trace: ['test decision'],
    updatedAt: fixedTimestamp,
    requestId: 'maintenance-1',
    repositoryKey: 'VannaDii/devplat',
    objective: 'Dogfood the headless maintenance loop.',
    actorId: 'agent-1',
    artifactIds: [],
    blockers,
    nextAction: {
      kind: 'test-action',
      phase: 'research',
      routedTo: 'test-service',
      toolName,
      summary: `Run ${toolName}.`,
      reason: 'Test route.',
      requiresHumanApproval,
      artifactIds: [],
      missingArtifactTypes,
      inputRequirements: ['test input'],
    },
  };
}
