import { TelemetryEventService } from '@vannadii/devplat-observability';
import { DecisionPolicyService } from '@vannadii/devplat-policy';

import {
  createGitHubActionRequest,
  createGitHubIssueSpecLink,
  createGitHubPullRequestState,
  createGitHubRepositoryState,
  createGitHubRestRequest,
  describeGitHubActionRequest,
  isPrivilegedGitHubAction,
} from './logic.js';
import type {
  GitHubActionDecision,
  GitHubActionRequest,
  GitHubIssueSpecLink,
  GitHubPullRequestState,
  GitHubRepositoryState,
  GitHubSubmissionMode,
  GitHubSubmissionReceipt,
} from './types.js';

export interface GitHubRestTransport {
  submit(input: GitHubActionRequest): Promise<GitHubSubmissionReceipt>;
}

export class GitHubRestApiTransport implements GitHubRestTransport {
  public constructor(
    private readonly token = process.env['GITHUB_TOKEN'] ?? '',
    private readonly baseUrl = process.env['GITHUB_API_BASE_URL'] ??
      'https://api.github.com',
    private readonly fetchImpl = fetch,
    private readonly mode: GitHubSubmissionMode = token.trim().length > 0
      ? 'live'
      : 'dry-run',
  ) {}

  public async submit(
    input: GitHubActionRequest,
  ): Promise<GitHubSubmissionReceipt> {
    if (this.mode === 'dry-run') {
      const request = createGitHubActionRequest(input);
      return {
        method: 'POST',
        endpoint: `dry-run:${request.action}`,
        statusCode: 0,
        responseBody: {
          dryRun: true,
          repoFullName: request.repoFullName,
          targetNumber: request.targetNumber ?? null,
          branchName: request.branchName ?? null,
        },
      };
    }

    if (this.token.trim().length === 0) {
      throw new Error('GITHUB_TOKEN is required for GitHub API submission.');
    }

    const request = createGitHubRestRequest(input);
    const response = await this.fetchImpl(
      `${this.baseUrl}${request.endpoint}`,
      {
        method: request.method,
        headers: {
          accept: 'application/vnd.github+json',
          authorization: `Bearer ${this.token}`,
          'content-type': 'application/json',
          'x-github-api-version': '2022-11-28',
        },
        body: JSON.stringify(request.body),
      },
    );
    const responseBody: unknown = await response.json().catch(() => null);

    return {
      method: request.method,
      endpoint: request.endpoint,
      statusCode: response.status,
      responseBody,
    };
  }
}

export class GitHubWorkflowService {
  public constructor(
    private readonly policy = new DecisionPolicyService(),
    private readonly telemetry = new TelemetryEventService(),
    private readonly transport: GitHubRestTransport = new GitHubRestApiTransport(),
  ) {}

  public prepare(input: GitHubActionRequest): GitHubActionRequest {
    return createGitHubActionRequest(input);
  }

  public normalizeRepositoryState(
    input: GitHubRepositoryState,
  ): GitHubRepositoryState {
    return createGitHubRepositoryState(input);
  }

  public normalizePullRequestState(
    input: GitHubPullRequestState,
  ): GitHubPullRequestState {
    return createGitHubPullRequestState(input);
  }

  public linkIssueToSpecPr(input: GitHubIssueSpecLink): GitHubIssueSpecLink {
    return createGitHubIssueSpecLink(input);
  }

  public async submit(
    input: GitHubActionRequest,
    actorId = 'github-service',
  ): Promise<GitHubActionDecision> {
    const request = createGitHubActionRequest(input);
    const decision = this.policy.evaluateControlAction(
      request.action,
      isPrivilegedGitHubAction(request),
    );

    await this.telemetry.record({
      id: `telemetry:${request.action}:${String(Date.now())}`,
      summary: request.summary,
      status: decision.allowed ? 'approved' : 'blocked',
      trace: ['github:workflow'],
      updatedAt: request.updatedAt,
      actorId,
      action: `github:${request.action}`,
      scope: 'github',
      details: {
        repoFullName: request.repoFullName,
        targetNumber: request.targetNumber ?? null,
        branchName: request.branchName ?? null,
      },
    });

    if (!decision.allowed) {
      return {
        request,
        allowed: decision.allowed,
        policyDecisionId: decision.id,
        submitted: false,
      };
    }

    const receipt = await this.transport.submit(request);

    return {
      request,
      allowed: decision.allowed,
      policyDecisionId: decision.id,
      submitted: true,
      receipt,
    };
  }

  public explain(input: GitHubActionRequest): string {
    return describeGitHubActionRequest(input);
  }
}
