import { describe, expect, it } from 'vitest';

import {
  DEVPLAT_ACTION_APPLY_AUTOFIX,
  DEVPLAT_ACTION_APPROVE_THIS,
  DEVPLAT_ACTION_AUTOFIX,
  DEVPLAT_ACTION_AUTOFIX_REVIEW,
  DEVPLAT_ACTION_BLOCK_THIS,
  DEVPLAT_ACTION_CLEANUP_ARTIFACTS,
  DEVPLAT_ACTION_CLAIM_THIS,
  DEVPLAT_ACTION_COMMENT_PR,
  DEVPLAT_ACTION_COMPLETE_THIS,
  DEVPLAT_ACTION_CREATE_PR,
  DEVPLAT_ACTION_DELETE_WORKTREE,
  DEVPLAT_ACTION_DESTRUCTIVE_CLEANUP,
  DEVPLAT_ACTION_EXECUTE_COMMAND,
  DEVPLAT_ACTION_EXPLAIN_FAILURE,
  DEVPLAT_ACTION_MERGE_NOW,
  DEVPLAT_ACTION_MERGE_PR,
  DEVPLAT_ACTION_PAUSE_THIS,
  DEVPLAT_ACTION_PUBLISH,
  DEVPLAT_ACTION_PUBLISH_RELEASE,
  DEVPLAT_ACTION_REBASE_ALL_DEPENDENTS,
  DEVPLAT_ACTION_REBASE_DEPENDENTS,
  DEVPLAT_ACTION_RELEASE_WORKTREE,
  DEVPLAT_ACTION_RESUME_THIS,
  DEVPLAT_ACTION_RETRY_GATES,
  DEVPLAT_ACTION_RUN_COMMAND,
  DEVPLAT_ACTION_RUN_GATES,
  DEVPLAT_ACTION_RUN_THIS,
  DEVPLAT_ACTION_SHOW_LAST_ARTIFACT,
  DEVPLAT_ACTION_SHOW_STATUS,
  DEVPLAT_ACTION_SYNC_BRANCH,
  DEVPLAT_ACTION_SYNC_WORKTREE,
  DEVPLAT_ACTION_UPDATE_PR,
  DEVPLAT_ACTION_UPDATE_SPEC,
  GIT_BRANCH_NAME_JSON_SCHEMA_PATTERN,
  REPOSITORY_KEY_JSON_SCHEMA_PATTERN,
} from './constants.js';

describe('domain constants', () => {
  const cases = [
    {
      name: 'exports shared lifecycle action constants',
      inputs: {},
      mock: () => ({}),
      assert: () => {
        expect(DEVPLAT_ACTION_APPROVE_THIS).toBe('approve-this');
        expect(DEVPLAT_ACTION_RUN_THIS).toBe('run-this');
        expect(DEVPLAT_ACTION_CLAIM_THIS).toBe('claim-this');
        expect(DEVPLAT_ACTION_BLOCK_THIS).toBe('block-this');
        expect(DEVPLAT_ACTION_COMPLETE_THIS).toBe('complete-this');
        expect(DEVPLAT_ACTION_PAUSE_THIS).toBe('pause-this');
        expect(DEVPLAT_ACTION_RESUME_THIS).toBe('resume-this');
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
        expect(DEVPLAT_ACTION_SHOW_STATUS).toBe('show-status');
        expect(DEVPLAT_ACTION_SHOW_LAST_ARTIFACT).toBe('show-last-artifact');
        expect(DEVPLAT_ACTION_EXPLAIN_FAILURE).toBe('explain-failure');
        expect(DEVPLAT_ACTION_AUTOFIX_REVIEW).toBe('autofix-review');
        expect(DEVPLAT_ACTION_AUTOFIX).toBe('autofix');
        expect(DEVPLAT_ACTION_APPLY_AUTOFIX).toBe('apply-autofix');
        expect(DEVPLAT_ACTION_DESTRUCTIVE_CLEANUP).toBe('destructive-cleanup');
        expect(DEVPLAT_ACTION_DELETE_WORKTREE).toBe('delete-worktree');
        expect(DEVPLAT_ACTION_CLEANUP_ARTIFACTS).toBe('cleanup-artifacts');
      },
    },
    {
      name: 'exports a Git branch JSON schema pattern aligned with codec constraints',
      inputs: {
        validBranchNames: ['main', 'release/next', 'feature/thread-aware'],
        invalidBranchNames: [
          '--upload-pack=sh',
          'invalid branch',
          'feature/../main',
          'feature/name.lock',
          '@',
        ],
      },
      mock: () => ({
        pattern: new RegExp(GIT_BRANCH_NAME_JSON_SCHEMA_PATTERN, 'u'),
      }),
      assert: (
        context: { pattern: RegExp },
        inputs: { validBranchNames: string[]; invalidBranchNames: string[] },
      ) => {
        for (const branchName of inputs.validBranchNames) {
          expect(context.pattern.test(branchName)).toBe(true);
        }

        for (const branchName of inputs.invalidBranchNames) {
          expect(context.pattern.test(branchName)).toBe(false);
        }
      },
    },
    {
      name: 'exports a repository key JSON schema pattern aligned with codec constraints',
      inputs: {
        validRepositoryKeys: ['VannaDii/devplat', 'a/b', 'owner/repo name'],
        invalidRepositoryKeys: [
          'VannaDii',
          '/devplat',
          'VannaDii/',
          'VannaDii/devplat/extra',
          ' VannaDii/devplat',
          'VannaDii/devplat ',
          'VannaDii/ devplat',
          'VannaDii /devplat',
        ],
      },
      mock: () => ({
        pattern: new RegExp(REPOSITORY_KEY_JSON_SCHEMA_PATTERN, 'u'),
      }),
      assert: (
        context: { pattern: RegExp },
        inputs: {
          validRepositoryKeys: string[];
          invalidRepositoryKeys: string[];
        },
      ) => {
        for (const repositoryKey of inputs.validRepositoryKeys) {
          expect(context.pattern.test(repositoryKey)).toBe(true);
        }

        for (const repositoryKey of inputs.invalidRepositoryKeys) {
          expect(context.pattern.test(repositoryKey)).toBe(false);
        }
      },
    },
  ];

  it.each(cases)('$name', (testCase) => {
    expect.hasAssertions();
    const context = testCase.mock();

    testCase.assert(context, testCase.inputs);
  });
});
