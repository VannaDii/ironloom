import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  main,
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
      name: 'skips derived artifact signals for non-object tool details',
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
          createTool('create_slice_plan', async () =>
            createResult('created slice-plan'),
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
            artifactSignal: undefined,
            iteration: 1,
            toolName: 'create_slice_plan',
          },
        ]);
        expect(report.finalRequest.artifacts).toHaveLength(2);
      },
    },
    {
      name: 'parses plan max step flags',
      inputs: {
        argv: [
          '--plan',
          'maintenance-plan.json',
          '--max-steps',
          '3',
          '--write-plan',
          'handoff-plan.json',
        ],
      },
      mock: async () => undefined,
      assert: async (_context, inputs) => {
        expect(parseHeadlessMaintenanceRunnerArgs(inputs.argv)).toEqual({
          maxSteps: 3,
          planPath: 'maintenance-plan.json',
          writePlanPath: 'handoff-plan.json',
        });
      },
    },
    {
      name: 'rejects missing flag values and invalid max steps',
      inputs: {
        argvCases: [
          ['--plan', '--max-steps'],
          ['--max-steps'],
          ['--max-steps', 'abc'],
          ['--max-steps', '0'],
          ['--write-plan'],
          ['--write-plan', '--plan'],
          ['--json'],
        ],
      },
      mock: async () => undefined,
      assert: async (_context, inputs) => {
        for (const argv of inputs.argvCases) {
          expect(() => parseHeadlessMaintenanceRunnerArgs(argv)).toThrow();
        }
      },
    },
    {
      name: 'runs the CLI entrypoint against a plan file and reports JSON output',
      inputs: {
        plan: {
          maxSteps: 8,
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
              },
            ],
          },
        },
      },
      mock: async () => {
        const tools = [
          createTool('continue_lifecycle', async () =>
            createResult(
              createDecision({
                toolName: 'create_research_brief',
                requiresHumanApproval: false,
                blockers: [],
                missingArtifactTypes: ['research-brief'],
              }),
            ),
          ),
          createTool('create_research_brief', async (_toolCallId, params) =>
            createResult({
              researchId: params.researchId,
              updatedAt: params.updatedAt,
            }),
          ),
        ];

        return { tools };
      },
      assert: async (context, inputs) => {
        const output = [];
        const planPath = await writeTempPlan(inputs.plan);
        const handoffPath = join(dirname(planPath), 'handoff.json');

        try {
          const result = await main({
            argv: [
              '--plan',
              planPath,
              '--max-steps',
              '1',
              '--write-plan',
              handoffPath,
            ],
            tools: context.tools,
            writeOutput: (line) => output.push(line),
          });
          const handoff = JSON.parse(await readFile(handoffPath, 'utf8'));

          expect(result.exitCode).toBe(1);
          expect(result.report.status).toBe('max-steps-reached');
          expect(JSON.parse(output[0]).status).toBe('max-steps-reached');
          expect(handoff.request.artifacts).toContainEqual({
            artifactId: 'research-1',
            artifactType: 'research-brief',
            status: 'complete',
            updatedAt: fixedTimestamp,
          });
          expect(handoff.maxSteps).toBe(1);
        } finally {
          await rm(dirname(planPath), { force: true, recursive: true });
        }
      },
    },
    {
      name: 'rejects malformed CLI request plans before running tools',
      inputs: {
        plan: {
          request: {
            ...baseRequest,
            repositoryKey: 'not-a-repository-key',
          },
          toolInputs: {},
        },
      },
      mock: async () => ({
        tools: [
          createTool('continue_lifecycle', async () =>
            createResult(
              createDecision({
                toolName: 'create_research_brief',
                requiresHumanApproval: false,
                blockers: [],
                missingArtifactTypes: ['research-brief'],
              }),
            ),
          ),
        ],
      }),
      assert: async (context, inputs) => {
        const planPath = await writeTempPlan(inputs.plan);

        try {
          await expect(
            main({
              argv: ['--plan', planPath],
              tools: context.tools,
              writeOutput: () => undefined,
            }),
          ).rejects.toThrow('Maintenance plan is invalid');
        } finally {
          await rm(dirname(planPath), { force: true, recursive: true });
        }
      },
    },
    {
      name: 'rejects malformed CLI tool input entries before running tools',
      inputs: {
        plan: {
          request: baseRequest,
          toolInputs: {
            create_research_brief: {
              params: [],
            },
          },
        },
      },
      mock: async () => ({
        tools: [
          createTool('continue_lifecycle', async () =>
            createResult(
              createDecision({
                toolName: 'create_research_brief',
                requiresHumanApproval: false,
                blockers: [],
                missingArtifactTypes: ['research-brief'],
              }),
            ),
          ),
        ],
      }),
      assert: async (context, inputs) => {
        const planPath = await writeTempPlan(inputs.plan);

        try {
          await expect(
            main({
              argv: ['--plan', planPath],
              tools: context.tools,
              writeOutput: () => undefined,
            }),
          ).rejects.toThrow(
            'toolInputs.create_research_brief.params must be an object',
          );
        } finally {
          await rm(dirname(planPath), { force: true, recursive: true });
        }
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

async function writeTempPlan(plan) {
  const directory = await mkdtemp(join(tmpdir(), 'devplat-maintenance-'));
  const planPath = join(directory, 'plan.json');
  await writeFile(planPath, JSON.stringify(plan), 'utf8');

  return planPath;
}
