import { GitHubWorkflowService } from '@vannadii/devplat-github';

import {
  canMergePullRequest,
  createPullRequestProjection,
  createPullRequestRecord,
  describePullRequestRecord,
} from './logic.js';
import type { PullRequestRecord } from './types.js';

export class PullRequestService {
  public constructor(
    private readonly github = new GitHubWorkflowService(),
    private readonly repoFullName = 'VannaDii/devplat',
  ) {}

  public create(input: PullRequestRecord): PullRequestRecord {
    return createPullRequestRecord(input);
  }

  public execute(input: PullRequestRecord): PullRequestRecord {
    return this.create(input);
  }

  public async submitUpdate(
    input: PullRequestRecord,
    actorId = 'prs-service',
  ): Promise<Awaited<ReturnType<GitHubWorkflowService['submit']>>> {
    const record = createPullRequestRecord(input);
    const projection = createPullRequestProjection(record);
    return this.github.submit(
      {
        repoFullName: this.repoFullName,
        action: 'update-pr',
        summary: record.title,
        privileged: canMergePullRequest(record),
        targetNumber: record.prNumber,
        branchName: record.branchName,
        title: record.title,
        body: projection.body,
        updatedAt: record.updatedAt,
      },
      actorId,
    );
  }

  public async submitMerge(
    input: PullRequestRecord,
    actorId = 'prs-service',
  ): Promise<Awaited<ReturnType<GitHubWorkflowService['submit']>>> {
    const record = createPullRequestRecord(input);
    const projection = createPullRequestProjection(record);
    return this.github.submit(
      {
        repoFullName: this.repoFullName,
        action: 'merge-pr',
        summary: record.title,
        privileged: canMergePullRequest(record),
        targetNumber: record.prNumber,
        branchName: record.branchName,
        title: record.title,
        body: projection.body,
        updatedAt: record.updatedAt,
      },
      actorId,
    );
  }

  public explain(input: PullRequestRecord): string {
    return describePullRequestRecord(input);
  }
}
