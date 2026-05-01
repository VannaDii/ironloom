import { describe, expect, it } from 'vitest';

import {
  classifyBranchConflicts,
  createBranchDependencyGraph,
  createRebaseExecutionResult,
  createRebasePlan,
  describeRebasePlan,
} from './logic.js';

describe('RebasePlan logic', () => {
  const cases = [
    {
      name: 'normalizes dependent branch lists',
      inputs: {
        plan: {
          mergedPrNumber: 42,
          baseBranch: ' main ',
          dependentBranches: ['feature/a', 'feature/a', 'feature/b'],
          rebaseRequired: false,
          conflictsExpected: false,
          updatedAt: '2026-04-04T00:00:00.000Z',
        },
      },
      mock: () => undefined,
      assert: (inputs: { plan: Parameters<typeof createRebasePlan>[0] }) => {
        const snapshot = createRebasePlan(inputs.plan);

        expect(snapshot.baseBranch).toBe('main');
        expect(snapshot.dependentBranches).toEqual(['feature/a', 'feature/b']);
        expect(snapshot.rebaseRequired).toBe(true);
        expect(snapshot.dependencyGraph?.edges).toEqual([
          { fromBranch: 'main', toBranch: 'feature/a' },
          { fromBranch: 'main', toBranch: 'feature/b' },
        ]);
        expect(describeRebasePlan(snapshot)).toContain('2 dependents');
      },
    },
    {
      name: 'keeps rebase optional when no dependents remain',
      inputs: {
        plan: {
          mergedPrNumber: 7,
          baseBranch: ' release ',
          dependentBranches: [' ', ''],
          rebaseRequired: false,
          conflictsExpected: true,
          updatedAt: '2026-04-04T00:00:00.000Z',
        },
      },
      mock: () => undefined,
      assert: (inputs: { plan: Parameters<typeof createRebasePlan>[0] }) => {
        const snapshot = createRebasePlan(inputs.plan);

        expect(snapshot.baseBranch).toBe('release');
        expect(snapshot.dependentBranches).toEqual([]);
        expect(snapshot.rebaseRequired).toBe(false);
      },
    },
    {
      name: 'derives execution state from sync results',
      inputs: {
        result: {
          plan: createRebasePlan({
            mergedPrNumber: 11,
            baseBranch: 'main',
            dependentBranches: ['feature/a'],
            rebaseRequired: true,
            conflictsExpected: false,
            updatedAt: '2026-04-04T00:00:00.000Z',
          }),
          syncMode: 'rebase',
          syncResults: [
            {
              id: 'worktree-sync-1',
              summary: 'Synced a worktree.',
              status: 'blocked',
              trace: [],
              updatedAt: '2026-04-04T00:00:00.000Z',
              taskId: 'task-1',
              branchName: 'feature/a',
              worktreePath: '/var/devplat/worktree-1',
              baseBranch: 'main',
              syncMode: 'rebase',
              changed: true,
              conflictsDetected: true,
            },
          ],
          executed: false,
          conflictsDetected: false,
        },
      },
      mock: () => undefined,
      assert: (inputs: {
        result: Parameters<typeof createRebaseExecutionResult>[0];
      }) => {
        const result = createRebaseExecutionResult(inputs.result);

        expect(result.executed).toBe(true);
        expect(result.conflictsDetected).toBe(true);
      },
    },
    {
      name: 'creates branch dependency graph without duplicate dependents',
      inputs: {
        baseBranch: ' main ',
        dependentBranches: [' feature/a ', 'feature/a', 'feature/b'],
      },
      mock: () => undefined,
      assert: (inputs: { baseBranch: string; dependentBranches: string[] }) => {
        expect(
          createBranchDependencyGraph(
            inputs.baseBranch,
            inputs.dependentBranches,
          ),
        ).toEqual({
          baseBranch: 'main',
          edges: [
            { fromBranch: 'main', toBranch: 'feature/a' },
            { fromBranch: 'main', toBranch: 'feature/b' },
          ],
        });
      },
    },
    {
      name: 'classifies branch dependencies without conflicts',
      inputs: {
        conflictsExpected: false,
        affectedBranches: [],
      },
      mock: () => undefined,
      assert: (inputs: {
        conflictsExpected: boolean;
        affectedBranches: string[];
      }) => {
        expect(classifyBranchConflicts(inputs)).toMatchObject({
          kind: 'none',
          nextAction: 'rebase-dependents',
        });
      },
    },
    {
      name: 'classifies expected branch conflicts before execution',
      inputs: {
        conflictsExpected: true,
        affectedBranches: [],
      },
      mock: () => undefined,
      assert: (inputs: {
        conflictsExpected: boolean;
        affectedBranches: string[];
      }) => {
        expect(classifyBranchConflicts(inputs)).toMatchObject({
          kind: 'expected',
          nextAction: 'run-rebase-preview',
        });
      },
    },
    {
      name: 'classifies detected branch conflicts with affected branches',
      inputs: {
        conflictsExpected: true,
        affectedBranches: [' feature/a ', 'feature/a'],
      },
      mock: () => undefined,
      assert: (inputs: {
        conflictsExpected: boolean;
        affectedBranches: string[];
      }) => {
        expect(classifyBranchConflicts(inputs)).toEqual({
          kind: 'detected',
          affectedBranches: ['feature/a'],
          nextAction: 'resolve-conflicts',
        });
      },
    },
  ];

  it.each(cases)('$name', (testCase) => {
    expect.hasAssertions();
    testCase.mock();
    testCase.assert(testCase.inputs);
  });
});
