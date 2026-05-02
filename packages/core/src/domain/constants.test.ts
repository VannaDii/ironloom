import { describe, expect, it } from 'vitest';

import {
  DEVPLAT_ACTION_APPLY_AUTOFIX,
  DEVPLAT_ACTION_APPROVE_THIS,
  DEVPLAT_ACTION_AUTOFIX,
  DEVPLAT_ACTION_AUTOFIX_REVIEW,
  DEVPLAT_ACTION_CLEANUP_ARTIFACTS,
  DEVPLAT_ACTION_COMMENT_PR,
  DEVPLAT_ACTION_CREATE_PR,
  DEVPLAT_ACTION_DELETE_WORKTREE,
  DEVPLAT_ACTION_DESTRUCTIVE_CLEANUP,
  DEVPLAT_ACTION_EXECUTE_COMMAND,
  DEVPLAT_ACTION_MERGE_NOW,
  DEVPLAT_ACTION_MERGE_PR,
  DEVPLAT_ACTION_PUBLISH,
  DEVPLAT_ACTION_PUBLISH_RELEASE,
  DEVPLAT_ACTION_REBASE_ALL_DEPENDENTS,
  DEVPLAT_ACTION_REBASE_DEPENDENTS,
  DEVPLAT_ACTION_RELEASE_WORKTREE,
  DEVPLAT_ACTION_RETRY_GATES,
  DEVPLAT_ACTION_RUN_COMMAND,
  DEVPLAT_ACTION_RUN_GATES,
  DEVPLAT_ACTION_SYNC_BRANCH,
  DEVPLAT_ACTION_SYNC_WORKTREE,
  DEVPLAT_ACTION_UPDATE_PR,
  DEVPLAT_ACTION_UPDATE_SPEC,
} from './constants.js';

describe('domain constants', () => {
  const cases = [
    {
      name: 'exports shared lifecycle action constants',
      inputs: {},
      mock: () => ({}),
      assert: () => {
        expect(DEVPLAT_ACTION_APPROVE_THIS).toBe('approve-this');
        expect(DEVPLAT_ACTION_MERGE_NOW).toBe('merge-now');
        expect(DEVPLAT_ACTION_MERGE_PR).toBe('merge-pr');
        expect(DEVPLAT_ACTION_CREATE_PR).toBe('create-pr');
        expect(DEVPLAT_ACTION_UPDATE_PR).toBe('update-pr');
        expect(DEVPLAT_ACTION_COMMENT_PR).toBe('comment-pr');
        expect(DEVPLAT_ACTION_SYNC_BRANCH).toBe('sync-branch');
        expect(DEVPLAT_ACTION_REBASE_ALL_DEPENDENTS).toBe(
          'rebase-all-dependents',
        );
        expect(DEVPLAT_ACTION_REBASE_DEPENDENTS).toBe('rebase-dependents');
        expect(DEVPLAT_ACTION_SYNC_WORKTREE).toBe('sync-worktree');
        expect(DEVPLAT_ACTION_RELEASE_WORKTREE).toBe('release-worktree');
        expect(DEVPLAT_ACTION_UPDATE_SPEC).toBe('update-spec');
        expect(DEVPLAT_ACTION_PUBLISH).toBe('publish');
        expect(DEVPLAT_ACTION_PUBLISH_RELEASE).toBe('publish-release');
        expect(DEVPLAT_ACTION_EXECUTE_COMMAND).toBe('execute-command');
        expect(DEVPLAT_ACTION_RUN_COMMAND).toBe('run-command');
        expect(DEVPLAT_ACTION_RUN_GATES).toBe('run-gates');
        expect(DEVPLAT_ACTION_RETRY_GATES).toBe('retry-gates');
        expect(DEVPLAT_ACTION_AUTOFIX_REVIEW).toBe('autofix-review');
        expect(DEVPLAT_ACTION_AUTOFIX).toBe('autofix');
        expect(DEVPLAT_ACTION_APPLY_AUTOFIX).toBe('apply-autofix');
        expect(DEVPLAT_ACTION_DESTRUCTIVE_CLEANUP).toBe('destructive-cleanup');
        expect(DEVPLAT_ACTION_DELETE_WORKTREE).toBe('delete-worktree');
        expect(DEVPLAT_ACTION_CLEANUP_ARTIFACTS).toBe('cleanup-artifacts');
      },
    },
  ];

  it.each(cases)('$name', (testCase) => {
    expect.hasAssertions();
    const context = testCase.mock();

    testCase.assert(context, testCase.inputs);
  });
});
