import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { FileStoreService } from '@vannadii/devplat-storage';

import {
  createApproveSpecRecordTool,
  createAllocateWorktreeTool,
  createApprovalRecordTool,
  createArtifactEnvelopeTool,
  createAuditLogTool,
  createBindDiscordThreadTool,
  createClaimTaskTool,
  createExecuteRebaseDependentsTool,
  createEvaluateSlicePlanReadinessTool,
  createExecuteCommandTool,
  createEvaluatePolicyActionTool,
  createEvaluateSonarQualityGateTool,
  createMergeDecisionTool,
  createOpenClawPluginConfigTool,
  createReleaseWorktreeTool,
  createRemediationPlanTool,
  createRememberMemoryEntryTool,
  createRecordTelemetryEventTool,
  createReadStoredRecordTool,
  createRebaseResultTool,
  createReviewFindingTool,
  createHandleDiscordApprovalTool,
  createHandleDiscordControlTool,
  createListStoredRecordsTool,
  createOpenDiscordThreadTool,
  createResolveRuntimeConfigTool,
  createPlanRebaseDependentsTool,
  createPullRequestRecordTool,
  createResearchBriefTool,
  createRunGatesTool,
  createRunSupervisorStepTool,
  createSlicePlanTool,
  createSpecRecordTool,
  createStoreRecordTool,
  createGitHubActionRequestTool,
  createSubmitGitHubActionTool,
  createSubmitPullRequestMergeTool,
  createSubmitPullRequestUpdateTool,
  createSyncWorktreeTool,
  createTaskRecordTool,
  createUpdateTaskTool,
  createUpdateSpecRecordTool,
  createValidateArtifactTool,
  createVerifySonarBootstrapTool,
} from './service.js';

afterEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
});

describe('tool surface service', () => {
  it('creates OpenClaw-compatible tool definitions', async () => {
    const tool = createRunGatesTool({
      async run(gateNames, summary) {
        return {
          id: 'gate-run-report',
          summary,
          status: 'complete',
          trace: ['gates:passed'],
          updatedAt: '2026-04-04T00:00:00.000Z',
          passed: true,
          results: gateNames.map((gateName) => ({
            name: gateName,
            success: true,
            detail: `${gateName} -> exit 0`,
          })),
        };
      },
    });
    expect(tool.name).toBe('run_gates');
    const result = await tool.execute('tool-call-1', {
      gateNames: ['lint'],
      summary: 'run lint',
    });
    expect(result.details).toMatchObject({
      passed: true,
      results: [{ name: 'lint', success: true }],
    });
  });

  it('fails closed when a generated tool schema is not a JSON object', async () => {
    vi.resetModules();
    vi.doMock('node:fs', () => ({
      readFileSync() {
        return '[]';
      },
    }));

    const serviceModule = await import('./service.js');

    expect(() => serviceModule.createRunGatesTool()).toThrow(
      'Schema tool-run-gates-params.schema.json must contain a JSON object.',
    );
  });

  it('creates research brief artifacts from valid tool input', async () => {
    const result = await createResearchBriefTool().execute('tool-call-r1', {
      researchId: 'research-1',
      topic: ' Discord-first workflows ',
      question: 'What should Phase 0 expose?',
      constraints: ['auditability', 'auditability'],
      findings: ['thread isolation'],
      recommendation: 'Expose thread-aware tools.',
      sourceUrls: ['https://example.com/openclaw'],
      updatedAt: '2026-04-04T00:00:00.000Z',
    });

    expect(result.details).toMatchObject({
      artifactType: 'research-brief',
      payload: { topic: 'Discord-first workflows' },
    });
  });

  it('returns decode failures for invalid research brief input', async () => {
    const result = await createResearchBriefTool().execute('tool-call-r2', {
      researchId: 'research-1',
    });

    expect(result.details).toMatchObject({ status: 'failed' });
  });

  it('creates spec record artifacts from valid tool input', async () => {
    const result = await createSpecRecordTool().execute('tool-call-s1', {
      specId: 'spec-1',
      researchId: 'research-1',
      title: ' Discord approval flow ',
      objective: 'Add explicit approval routing.',
      acceptanceCriteria: ['policy check', 'audit artifact'],
      approvalState: 'review',
      version: 1,
      updatedAt: '2026-04-04T00:00:00.000Z',
    });

    expect(result.details).toMatchObject({
      artifactType: 'spec-record',
      payload: { title: 'Discord approval flow' },
    });
  });

  it('returns decode failures for invalid spec record input', async () => {
    const result = await createSpecRecordTool().execute('tool-call-s2', {
      specId: 'spec-1',
    });

    expect(result.details).toMatchObject({ status: 'failed' });
  });

  it('approves spec record artifacts from valid tool input', async () => {
    const result = await createApproveSpecRecordTool().execute('tool-call-s3', {
      specId: 'spec-1',
      researchId: 'research-1',
      title: ' Discord approval flow ',
      objective: 'Add explicit approval routing.',
      acceptanceCriteria: ['policy check', 'audit artifact'],
      approvalState: 'review',
      version: 1,
      updatedAt: '2026-04-04T00:00:00.000Z',
    });

    expect(result.details).toMatchObject({
      artifactType: 'spec-record',
      status: 'approved',
      payload: {
        title: 'Discord approval flow',
        approvalState: 'approved',
      },
    });
  });

  it('returns decode failures for invalid spec approval input', async () => {
    const result = await createApproveSpecRecordTool().execute('tool-call-s4', {
      specId: 'spec-1',
    });

    expect(result.details).toMatchObject({ status: 'failed' });
  });

  it('updates spec records from valid tool input', async () => {
    const result = await createUpdateSpecRecordTool().execute('tool-call-s5', {
      specId: 'spec-1',
      researchId: 'research-1',
      title: ' Discord approval flow ',
      objective: 'Add explicit approval routing.',
      acceptanceCriteria: ['policy check', 'audit artifact'],
      approvalState: 'approved',
      version: 2,
      updatedAt: '2026-04-04T00:00:00.000Z',
    });

    expect(result.details).toMatchObject({
      artifactType: 'spec-record',
      payload: {
        approvalState: 'review',
        version: 3,
      },
    });
  });

  it('returns decode failures for invalid spec revision input', async () => {
    const result = await createUpdateSpecRecordTool().execute('tool-call-s6', {
      specId: 'spec-1',
    });

    expect(result.details).toMatchObject({ status: 'failed' });
  });

  it('creates slice plans from valid tool input', async () => {
    const result = await createSlicePlanTool().execute('tool-call-sl1', {
      sliceId: 'slice-1',
      specId: 'spec-1',
      title: ' Wire Discord controls ',
      dependsOn: ['slice-0'],
      acceptanceCriteria: ['control persisted'],
      doneConditions: ['tests pass'],
      size: 'small',
      updatedAt: '2026-04-04T00:00:00.000Z',
    });

    expect(result.details).toMatchObject({
      sliceId: 'slice-1',
      title: 'Wire Discord controls',
    });
  });

  it('returns decode failures for invalid slice plan input', async () => {
    const result = await createSlicePlanTool().execute('tool-call-sl2', {
      sliceId: 'slice-1',
    });

    expect(result.details).toMatchObject({ status: 'failed' });
  });

  it('evaluates slice plan readiness from valid tool input', async () => {
    const result = await createEvaluateSlicePlanReadinessTool().execute(
      'tool-call-sl3',
      {
        plan: {
          sliceId: 'slice-2',
          specId: 'spec-1',
          title: ' Wire Discord controls ',
          dependsOn: ['slice-0', 'slice-1'],
          acceptanceCriteria: ['control persisted'],
          doneConditions: ['tests pass'],
          size: 'small',
          updatedAt: '2026-04-04T00:00:00.000Z',
        },
        completedSliceIds: ['slice-0', 'slice-1'],
      },
    );

    expect(result.details).toMatchObject({
      ready: true,
      completedSliceIds: ['slice-0', 'slice-1'],
      plan: {
        title: 'Wire Discord controls',
      },
    });
  });

  it('returns decode failures for invalid slice readiness input', async () => {
    const result = await createEvaluateSlicePlanReadinessTool().execute(
      'tool-call-sl4',
      {
        completedSliceIds: ['slice-0'],
      },
    );

    expect(result.details).toMatchObject({ status: 'failed' });
  });

  it('resolves runtime config from valid tool input', async () => {
    const result = await createResolveRuntimeConfigTool().execute(
      'tool-call-cfg1',
      {
        env: {
          GITHUB_OWNER: 'VannaDii',
          GITHUB_REPO: 'devplat',
          DISCORD_API_BASE_URL: 'https://discord.com/api/v10',
          DISCORD_APPLICATION_ID: 'application-1',
          DISCORD_PUBLIC_KEY: 'public-key-1',
          DISCORD_BOT_TOKEN: 'bot-token-1',
          DISCORD_DEFAULT_GUILD_ID: 'guild-1',
          DISCORD_SPEC_CHANNEL_ID: 'spec-1',
          DISCORD_IMPLEMENTATION_CHANNEL_ID: 'impl-1',
          DISCORD_PULL_REQUEST_CHANNEL_ID: 'pr-1',
          DISCORD_AUDIT_CHANNEL_ID: 'audit-1',
          DISCORD_PROJECT_MANAGEMENT_CHANNEL_ID: 'pm-1',
          OPENCLAW_PLUGIN_ID: '@vannadii/devplat-openclaw',
          SONAR_ORGANIZATION: 'vannadii',
          SONAR_PROJECT_KEY: 'vannadii_devplat',
        },
      },
    );

    expect(result.details).toMatchObject({
      githubOwner: 'VannaDii',
      githubRepo: 'devplat',
      discord: {
        apiBaseUrl: 'https://discord.com/api/v10',
        apiVersion: 'v10',
        applicationId: 'application-1',
        categoryName: 'devplat',
        publicKey: '[redacted]',
        botToken: '[redacted]',
        installScopes: ['bot', 'applications.commands'],
        defaultGuildId: 'guild-1',
        specChannelId: 'spec-1',
        requiredPermissions: [
          'ViewChannel',
          'SendMessages',
          'CreatePublicThreads',
          'CreatePrivateThreads',
          'SendMessagesInThreads',
          'ManageThreads',
          'ReadMessageHistory',
        ],
      },
      sonar: {
        projectKey: 'vannadii_devplat',
        minimumCoverage: 90,
      },
    });
  });

  it('returns decode failures for invalid runtime config input', async () => {
    const result = await createResolveRuntimeConfigTool().execute(
      'tool-call-cfg2',
      {
        env: {
          GITHUB_OWNER: 42,
        },
      },
    );

    expect(result.details).toMatchObject({ status: 'failed' });
  });

  it('creates OpenClaw plugin config from valid runtime config', async () => {
    const result = await createOpenClawPluginConfigTool().execute(
      'tool-call-cfg3',
      {
        id: 'devplat-config',
        summary: 'Runtime config',
        status: 'approved',
        trace: ['config:resolved'],
        updatedAt: '2026-04-04T00:00:00.000Z',
        githubOwner: 'VannaDii',
        githubRepo: 'devplat',
        repository: {
          owner: 'VannaDii',
          repo: 'devplat',
          defaultBranch: 'main',
          repositoryKey: 'VannaDii/devplat',
        },
        github: {
          apiBaseUrl: 'https://api.github.com',
          webBaseUrl: 'https://github.com',
          tokenEnvironmentVariable: 'GITHUB_TOKEN',
        },
        storage: {
          rootDirectory: '.devplat',
          layoutVersion: 1,
          artifactDirectory: '.devplat/artifacts',
          indexDirectory: '.devplat/indexes',
          auditLogDirectory: '.devplat/audit',
        },
        worktrees: {
          rootDirectory: '.devplat/worktrees',
          baseBranch: 'main',
          syncStrategy: 'rebase-or-fast-forward',
        },
        deployment: {
          target: 'local-docker',
          dockerImageRepository: 'ghcr.io/vannadii/devplat-openclaw-runtime',
          dockerImageTag: 'latest',
          helmReleaseName: 'devplat',
          helmNamespace: 'devplat',
          helmChartPath: 'deploy/helm/devplat',
          stateMountPath: '/var/lib/devplat',
        },
        discord: {
          apiBaseUrl: 'https://discord.com/api/v10',
          apiVersion: 'v10',
          applicationId: 'application-1',
          categoryName: 'devplat',
          publicKey: '[redacted]',
          botToken: '[redacted]',
          installScopes: ['bot', 'applications.commands'],
          requiredPermissions: [
            'ViewChannel',
            'SendMessages',
            'CreatePublicThreads',
            'CreatePrivateThreads',
            'SendMessagesInThreads',
            'ManageThreads',
            'ReadMessageHistory',
          ],
          defaultGuildId: 'guild-1',
          specChannelId: 'spec-1',
          implementationChannelId: 'impl-1',
          pullRequestChannelId: 'pr-1',
          auditChannelId: 'audit-1',
          projectManagementChannelId: 'pm-1',
          threadBindingMode: 'inherit-parent',
          interactionTransport: 'gateway',
          gatewayUrl: 'wss://gateway.discord.gg/?v=10&encoding=json',
          gatewayIntents: 0,
        },
        openclaw: {
          pluginId: '@vannadii/devplat-openclaw',
          gateway: {
            bind: 'loopback',
            port: 18789,
            authMode: 'token',
          },
          actionGates: {
            approveThis: true,
            mergeNow: false,
            retryGates: true,
            rebaseAllDependents: true,
          },
        },
        sonar: {
          organization: 'vannadii',
          projectKey: 'vannadii_devplat',
          minimumCoverage: 90,
        },
      },
    );

    expect(result.details).toMatchObject({
      id: '@vannadii/devplat-openclaw:config',
      apiVersion: 'v10',
      categoryName: 'devplat',
      defaultGuildId: 'guild-1',
      specChannelId: 'spec-1',
      implementationChannelId: 'impl-1',
      pullRequestChannelId: 'pr-1',
      auditChannelId: 'audit-1',
      projectManagementChannelId: 'pm-1',
      actionGates: {
        approveThis: true,
        mergeNow: false,
        retryGates: true,
        rebaseAllDependents: true,
      },
    });
  });

  it('returns decode failures for invalid OpenClaw plugin config input', async () => {
    const result = await createOpenClawPluginConfigTool().execute(
      'tool-call-cfg4',
      {
        id: 'devplat-config',
      },
    );

    expect(result.details).toMatchObject({ status: 'failed' });
  });

  it('creates artifact envelopes from valid tool input', async () => {
    const result = await createArtifactEnvelopeTool().execute('tool-call-ae1', {
      id: 'artifact-generic-1',
      artifactType: 'audit-log',
      version: 1,
      summary: ' Generic audit artifact ',
      status: 'approved',
      trace: [],
      updatedAt: '2026-04-04T00:00:00.000Z',
      payload: {
        actorId: 'operator-1',
      },
    });

    expect(result.details).toMatchObject({
      id: 'artifact-generic-1',
      artifactType: 'audit-log',
      summary: 'Generic audit artifact',
      trace: ['artifact:audit-log'],
    });
  });

  it('returns decode failures for invalid artifact envelope input', async () => {
    const result = await createArtifactEnvelopeTool().execute('tool-call-ae2', {
      id: 'artifact-generic-1',
    });

    expect(result.details).toMatchObject({ status: 'failed' });
  });

  it('creates approval record artifacts from valid tool input', async () => {
    const result = await createApprovalRecordTool().execute('tool-call-ap1', {
      id: 'artifact-approval-1',
      artifactType: 'approval-record',
      version: 1,
      summary: ' Approve slice ',
      status: 'approved',
      trace: [],
      updatedAt: '2026-04-04T00:00:00.000Z',
      payload: {
        approvalId: ' approval-1 ',
        subjectType: 'slice',
        subjectId: ' slice-1 ',
        actorId: ' operator-1 ',
        decision: 'approved',
        rationale: ' Ready to proceed ',
      },
    });

    expect(result.details).toMatchObject({
      artifactType: 'approval-record',
      summary: 'Approve slice',
      payload: {
        approvalId: 'approval-1',
        subjectId: 'slice-1',
        actorId: 'operator-1',
      },
    });
  });

  it('creates audit log artifacts from valid tool input', async () => {
    const result = await createAuditLogTool().execute('tool-call-al1', {
      id: 'artifact-audit-1',
      artifactType: 'audit-log',
      version: 1,
      summary: ' Retry gates ',
      status: 'complete',
      trace: [],
      updatedAt: '2026-04-04T00:00:00.000Z',
      payload: {
        auditId: ' audit-1 ',
        actorId: ' operator-1 ',
        action: 'retry-gates',
        scope: 'discord',
        details: {
          threadId: 'thread-1',
        },
      },
    });

    expect(result.details).toMatchObject({
      artifactType: 'audit-log',
      summary: 'Retry gates',
      payload: {
        auditId: 'audit-1',
        actorId: 'operator-1',
      },
    });
  });

  it('creates merge decision artifacts from valid tool input', async () => {
    const result = await createMergeDecisionTool().execute('tool-call-md1', {
      id: 'artifact-merge-1',
      artifactType: 'merge-decision',
      version: 1,
      summary: ' Merge decision ',
      status: 'approved',
      trace: [],
      updatedAt: '2026-04-04T00:00:00.000Z',
      payload: {
        decisionId: ' merge-1 ',
        prNumber: 42,
        actorId: ' operator-1 ',
        mergeStrategy: 'squash',
        approved: true,
        rationale: ' Ready to merge ',
        blockingFindings: [' none '],
      },
    });

    expect(result.details).toMatchObject({
      artifactType: 'merge-decision',
      summary: 'Merge decision',
      payload: {
        decisionId: 'merge-1',
        actorId: 'operator-1',
        blockingFindings: ['none'],
      },
    });
  });

  it('creates rebase result artifacts from valid tool input', async () => {
    const result = await createRebaseResultTool().execute('tool-call-rb1', {
      id: 'artifact-rebase-1',
      artifactType: 'rebase-result',
      version: 1,
      summary: ' Rebase result ',
      status: 'complete',
      trace: [],
      updatedAt: '2026-04-04T00:00:00.000Z',
      payload: {
        resultId: ' rebase-1 ',
        mergedPrNumber: 42,
        baseBranch: ' main ',
        branchName: ' feature/x ',
        rebased: true,
        conflictsDetected: false,
        details: ' Rebased cleanly ',
      },
    });

    expect(result.details).toMatchObject({
      artifactType: 'rebase-result',
      summary: 'Rebase result',
      payload: {
        resultId: 'rebase-1',
        baseBranch: 'main',
        branchName: 'feature/x',
      },
    });
  });

  it('returns decode failures for invalid approval record input', async () => {
    const result = await createApprovalRecordTool().execute('tool-call-ap2', {
      id: 'artifact-approval-2',
    });

    expect(result.details).toMatchObject({ status: 'failed' });
  });

  it('returns decode failures for invalid audit log input', async () => {
    const result = await createAuditLogTool().execute('tool-call-al2', {
      id: 'artifact-audit-2',
    });

    expect(result.details).toMatchObject({ status: 'failed' });
  });

  it('returns decode failures for invalid merge decision input', async () => {
    const result = await createMergeDecisionTool().execute('tool-call-md2', {
      id: 'artifact-merge-2',
    });

    expect(result.details).toMatchObject({ status: 'failed' });
  });

  it('returns decode failures for invalid rebase result input', async () => {
    const result = await createRebaseResultTool().execute('tool-call-rb2', {
      id: 'artifact-rebase-2',
    });

    expect(result.details).toMatchObject({ status: 'failed' });
  });

  it('executes commands from valid non-privileged tool input', async () => {
    const result = await createExecuteCommandTool().execute('tool-call-ex1', {
      command: process.execPath,
      args: [
        '-e',
        'process.stdout.write(process.env.DEVPLAT_TEST_VALUE ?? "")',
      ],
      actorId: 'operator-1',
      privileged: false,
      env: {
        DEVPLAT_TEST_VALUE: 'ok',
      },
    });

    expect(result.details).toMatchObject({
      allowed: true,
      policyDecisionId: 'policy-execute-command',
      result: {
        exitCode: 0,
        stdout: 'ok',
      },
    });
  });

  it('blocks privileged command execution requests', async () => {
    const result = await createExecuteCommandTool().execute('tool-call-ex2', {
      command: process.execPath,
      args: ['-e', 'process.stdout.write("blocked")'],
      actorId: 'operator-1',
      privileged: true,
    });

    expect(result.details).toMatchObject({
      allowed: false,
      policyDecisionId: 'policy-execute-command',
      request: {
        command: process.execPath,
      },
    });
  });

  it('rejects absolute cwd values for command execution', async () => {
    const result = await createExecuteCommandTool().execute('tool-call-ex3', {
      command: process.execPath,
      args: ['-e', 'process.stdout.write("bad")'],
      actorId: 'operator-1',
      privileged: false,
      cwd: process.cwd(),
    });

    expect(result.details).toMatchObject({
      status: 'failed',
      error: 'cwd must be a relative repository path.',
    });
  });

  it('accepts blank cwd values for command execution', async () => {
    const result = await createExecuteCommandTool().execute('tool-call-ex5', {
      command: process.execPath,
      args: ['-e', 'process.stdout.write("blank-cwd")'],
      actorId: 'operator-1',
      privileged: false,
      cwd: '   ',
    });

    expect(result.details).toMatchObject({
      allowed: true,
      request: {
        cwd: null,
        timeoutMs: null,
      },
      result: {
        exitCode: 0,
        stdout: 'blank-cwd',
        timedOut: false,
      },
    });
  });

  it('rejects cwd traversal outside the repository root', async () => {
    const result = await createExecuteCommandTool().execute('tool-call-ex6', {
      command: process.execPath,
      args: ['-e', 'process.stdout.write("bad")'],
      actorId: 'operator-1',
      privileged: false,
      cwd: '../outside',
    });

    expect(result.details).toMatchObject({
      status: 'failed',
      error: 'cwd must stay within the repository root.',
    });
  });

  it('records failed command execution results when timeouts are exceeded', async () => {
    const result = await createExecuteCommandTool({
      commandExecutionService: {
        async execute() {
          return {
            command: process.execPath,
            args: ['-e', 'setTimeout(() => {}, 1_000)'],
            cwd: 'packages',
            exitCode: 124,
            stdout: '',
            stderr: '',
            timedOut: true,
          };
        },
      },
      telemetryEventService: {
        async record() {
          return {
            id: 'telemetry-1',
            summary: 'Executed timeout command',
            status: 'failed',
            trace: ['openclaw:execute-command'],
            updatedAt: '2026-04-05T00:00:00.000Z',
            actorId: 'operator-1',
            action: 'execute-command',
            scope: 'supervisor',
            details: {
              timedOut: true,
            },
          };
        },
      },
    }).execute('tool-call-ex7', {
      command: process.execPath,
      args: ['-e', 'setTimeout(() => {}, 1_000)'],
      actorId: 'operator-1',
      privileged: false,
      cwd: 'packages',
      timeoutMs: 25,
    });

    expect(result.details).toMatchObject({
      allowed: true,
      request: {
        cwd: 'packages',
        timeoutMs: 25,
      },
      result: {
        exitCode: 124,
        timedOut: true,
      },
    });
  });

  it('returns decode failures for invalid command execution input', async () => {
    const result = await createExecuteCommandTool().execute('tool-call-ex4', {
      command: process.execPath,
      args: ['-e', 'process.stdout.write("bad")'],
      privileged: false,
    });

    expect(result.details).toMatchObject({ status: 'failed' });
  });

  it('returns decode failures for invalid run_gates input', async () => {
    const result = await createRunGatesTool().execute('tool-call-2', {
      gateNames: 'lint',
      summary: 'run lint',
    });

    expect(result.details).toMatchObject({ status: 'failed' });
  });

  it('allocates worktrees from valid tool input', async () => {
    const result = await createAllocateWorktreeTool().execute('tool-call-3', {
      taskId: 'task-1',
      branchName: 'feature/task-1',
    });

    expect(result.details).toMatchObject({ taskId: 'task-1' });
  });

  it('syncs worktrees from valid tool input', async () => {
    const result = await createSyncWorktreeTool().execute('tool-call-3a', {
      allocation: {
        id: 'worktree-task-1',
        summary: 'allocated worktree',
        status: 'approved',
        trace: [],
        updatedAt: '2026-04-04T00:00:00.000Z',
        taskId: 'task-1',
        branchName: 'feature/task-1',
        worktreePath: '.worktrees/feature/task-1',
      },
      baseBranch: 'main',
      syncMode: 'fast-forward',
    });

    expect(result.details).toMatchObject({
      taskId: 'task-1',
      baseBranch: 'main',
      syncMode: 'fast-forward',
    });
  });

  it('releases worktrees from valid tool input', async () => {
    const result = await createReleaseWorktreeTool().execute('tool-call-3b', {
      allocation: {
        id: 'worktree-task-1',
        summary: 'allocated worktree',
        status: 'approved',
        trace: [],
        updatedAt: '2026-04-04T00:00:00.000Z',
        taskId: 'task-1',
        branchName: 'feature/task-1',
        worktreePath: '.worktrees/feature/task-1',
      },
      releaseMode: 'delete',
    });

    expect(result.details).toMatchObject({
      taskId: 'task-1',
      releaseMode: 'delete',
      released: true,
    });
  });

  it('returns decode failures for invalid worktree release input', async () => {
    const result = await createReleaseWorktreeTool().execute('tool-call-3c', {
      allocation: {
        id: 'worktree-task-1',
      },
    });

    expect(result.details).toMatchObject({ status: 'failed' });
  });

  it('binds Discord threads from valid tool input', async () => {
    const result = await createBindDiscordThreadTool().execute(
      'tool-call-db1',
      {
        id: 'binding-1',
        summary: 'Bind spec thread',
        status: 'approved',
        trace: [],
        updatedAt: '2026-04-04T00:00:00.000Z',
        guildId: 'guild-1',
        channelId: 'channel-1',
        kind: 'spec',
        threadBindingMode: 'inherit-parent',
        threadId: 'thread-1',
        parentChannelId: 'channel-1',
        actorId: 'operator-1',
      },
    );

    expect(result.details).toMatchObject({
      threadId: 'thread-1',
      routingKey: 'guild-1:spec:thread-1',
    });
  });

  it('returns decode failures for invalid Discord binding input', async () => {
    const result = await createBindDiscordThreadTool().execute(
      'tool-call-db2',
      {
        id: 'binding-1',
      },
    );

    expect(result.details).toMatchObject({ status: 'failed' });
  });

  it('opens Discord thread sessions from valid tool input', async () => {
    const result = await createOpenDiscordThreadTool().execute(
      'tool-call-dt1',
      {
        id: 'session-1',
        summary: 'Spec thread',
        status: 'approved',
        trace: [],
        updatedAt: '2026-04-04T00:00:00.000Z',
        guildId: 'guild-1',
        channelId: 'channel-1',
        parentChannelId: 'parent-1',
        threadId: 'thread-1',
        kind: 'spec',
        specId: 'spec-1',
        sliceId: null,
        pullRequestNumber: null,
        artifactId: 'artifact-1',
        actorId: 'operator-1',
      },
    );

    expect(result.details).toMatchObject({
      artifactId: 'artifact-1',
      persistedKey: 'session-1',
    });
  });

  it('opens implementation Discord thread sessions from valid tool input', async () => {
    const result = await createOpenDiscordThreadTool().execute(
      'tool-call-dt1b',
      {
        id: 'session-1b',
        summary: 'Implementation thread',
        status: 'running',
        trace: [],
        updatedAt: '2026-04-04T00:00:00.000Z',
        guildId: 'guild-1',
        channelId: 'channel-1b',
        parentChannelId: 'parent-1b',
        threadId: 'thread-1b',
        kind: 'implementation',
        specId: 'spec-1',
        sliceId: 'slice-1',
        pullRequestNumber: null,
        artifactId: 'artifact-1b',
        actorId: 'operator-1',
      },
    );

    expect(result.details).toMatchObject({
      artifactId: 'artifact-1b',
      persistedKey: 'session-1b',
    });
  });

  it('opens pull-request Discord thread sessions from valid tool input', async () => {
    const result = await createOpenDiscordThreadTool().execute(
      'tool-call-dt1c',
      {
        id: 'session-1c',
        summary: 'Pull request thread',
        status: 'review',
        trace: [],
        updatedAt: '2026-04-04T00:00:00.000Z',
        guildId: 'guild-1',
        channelId: 'channel-1c',
        parentChannelId: 'parent-1c',
        threadId: 'thread-1c',
        kind: 'pull-request',
        specId: null,
        sliceId: null,
        pullRequestNumber: 14,
        artifactId: 'artifact-1c',
        actorId: 'operator-1',
      },
    );

    expect(result.details).toMatchObject({
      artifactId: 'artifact-1c',
      persistedKey: 'session-1c',
    });
  });

  it('returns decode failures for invalid Discord thread input', async () => {
    const result = await createOpenDiscordThreadTool().execute(
      'tool-call-dt2',
      {
        id: 'session-1',
      },
    );

    expect(result.details).toMatchObject({ status: 'failed' });
  });

  it('returns decode failures for invalid worktree input', async () => {
    const result = await createAllocateWorktreeTool().execute('tool-call-4', {
      taskId: 'task-1',
    });

    expect(result.details).toMatchObject({ status: 'failed' });
  });

  it('returns decode failures for invalid worktree sync input', async () => {
    const result = await createSyncWorktreeTool().execute('tool-call-4a', {
      allocation: {
        id: 'worktree-task-1',
      },
    });

    expect(result.details).toMatchObject({ status: 'failed' });
  });

  it('claims queued tasks from valid tool input', async () => {
    const result = await createClaimTaskTool().execute('tool-call-5', {
      taskId: 'task-1',
      sliceId: 'slice-1',
      threadId: 'thread-1',
      assigneeId: 'worker-1',
    });

    expect(result.details).toMatchObject({
      status: 'claimed',
      assigneeId: 'worker-1',
    });
  });

  it('returns decode failures for invalid claim input', async () => {
    const result = await createClaimTaskTool().execute('tool-call-6', {
      taskId: 'task-1',
      sliceId: 'slice-1',
      threadId: 'thread-1',
    });

    expect(result.details).toMatchObject({ status: 'failed' });
  });

  it('handles Discord approvals from valid tool input', async () => {
    const result = await createHandleDiscordApprovalTool().execute(
      'tool-call-da1',
      {
        id: 'approval-1',
        summary: 'Approve this',
        status: 'review',
        trace: [],
        updatedAt: '2026-04-04T00:00:00.000Z',
        actorId: 'operator-1',
        channelId: 'channel-1',
        threadId: 'thread-1',
        action: 'approve',
        artifactId: 'artifact-1',
        privileged: true,
      },
    );

    expect(result.details).toMatchObject({
      allowed: false,
      policyDecisionId: 'policy-approve-this',
    });
  });

  it('returns decode failures for invalid Discord approval input', async () => {
    const result = await createHandleDiscordApprovalTool().execute(
      'tool-call-da2',
      {
        id: 'approval-1',
      },
    );

    expect(result.details).toMatchObject({ status: 'failed' });
  });

  it('handles Discord control requests and operator interactions from valid tool input', async () => {
    const cases = [
      {
        name: 'delegates normalized control requests to the action handler',
        inputs: {
          params: {
            id: 'control-1',
            summary: 'Retry gates',
            status: 'review',
            trace: [],
            updatedAt: '2026-04-04T00:00:00.000Z',
            actorId: 'operator-1',
            threadId: 'thread-1',
            channelId: 'channel-1',
            action: 'retry-gates',
            privileged: false,
          },
        },
        mock: () => ({
          tool: createHandleDiscordControlTool({
            discordControlPlaneService: {
              async handleAction(input) {
                return {
                  request: input,
                  policyDecisionId: 'policy-retry-gates',
                  allowed: true,
                  persistedKey: input.id,
                  failedClosed: false,
                };
              },
              async handleInteraction() {
                throw new Error('Unexpected interaction handler call.');
              },
            },
          }),
        }),
        assert: async (context, inputs) => {
          const result = await context.tool.execute(
            'tool-call-dc1',
            inputs.params,
          );

          expect(result.details).toMatchObject({
            allowed: true,
            failedClosed: false,
            policyDecisionId: 'policy-retry-gates',
          });
        },
      },
      {
        name: 'delegates operator interactions to the interaction handler',
        inputs: {
          params: {
            id: 'interaction-1',
            token: 'interaction-token-1',
            actorId: 'operator-1',
            channelId: 'channel-1',
            boundThreadId: 'thread-1',
            commandName: 'retry-gates',
            summary: 'Retry gates from slash command',
            privileged: false,
            updatedAt: '2026-04-04T00:00:00.000Z',
            boundSession: {
              id: 'session-1',
              summary: 'Implementation thread',
              status: 'running',
              trace: [],
              updatedAt: '2026-04-04T00:00:00.000Z',
              guildId: 'guild-1',
              channelId: 'channel-1',
              parentChannelId: 'implementation-parent-1',
              threadId: 'thread-1',
              kind: 'implementation',
              specId: 'spec-1',
              sliceId: 'slice-1',
              pullRequestNumber: null,
              artifactId: 'session-artifact-1',
            },
          },
        },
        mock: () => ({
          tool: createHandleDiscordControlTool({
            discordControlPlaneService: {
              async handleAction() {
                throw new Error('Unexpected action handler call.');
              },
              async handleInteraction(input) {
                const workItem = {
                  threadKind: 'implementation',
                  threadId: input.boundThreadId,
                  artifactId: 'session-artifact-1',
                  specId: 'spec-1',
                  sliceId: 'slice-1',
                };

                return {
                  request: {
                    id: input.id,
                    summary: input.summary ?? 'retry-gates',
                    status: 'running',
                    trace: [],
                    updatedAt: input.updatedAt,
                    actorId: input.actorId,
                    threadId: input.boundThreadId,
                    channelId: input.channelId,
                    action: 'retry-gates',
                    privileged: input.privileged ?? false,
                    workItem,
                  },
                  policyDecisionId: 'policy-retry-gates',
                  allowed: true,
                  persistedKey: input.id,
                  failedClosed: false,
                  workItem,
                  responseReceipt: {
                    endpoint:
                      '/interactions/interaction-1/interaction-token-1/callback',
                    statusCode: 200,
                    responseBody: { ok: true },
                  },
                  threadReceipt: {
                    endpoint: '/channels/thread-1/messages',
                    statusCode: 200,
                    responseBody: { ok: true },
                  },
                };
              },
            },
          }),
        }),
        assert: async (context, inputs) => {
          const result = await context.tool.execute(
            'tool-call-dc2',
            inputs.params,
          );

          expect(result.details).toMatchObject({
            allowed: true,
            failedClosed: false,
            policyDecisionId: 'policy-retry-gates',
            responseReceipt: {
              endpoint:
                '/interactions/interaction-1/interaction-token-1/callback',
            },
            threadReceipt: {
              endpoint: '/channels/thread-1/messages',
            },
            workItem: {
              sliceId: 'slice-1',
              specId: 'spec-1',
              threadId: 'thread-1',
              threadKind: 'implementation',
            },
          });
        },
      },
    ];

    for (const testCase of cases) {
      const context = testCase.mock();
      await testCase.assert(context, testCase.inputs);
    }
  });

  describe('test-mode callback response transport', () => {
    /**
     * Builds the callback-shaped Discord control input shared by transport cases.
     */
    function createTestModeDiscordInteractionParams(): Record<string, unknown> {
      return {
        id: 'interaction-test-mode-1',
        token: 'token-test-mode-1',
        actorId: 'operator-1',
        channelId: 'channel-1',
        boundThreadId: 'thread-1',
        commandName: 'retry-gates',
        summary: 'Retry gates from slash command',
        privileged: false,
        updatedAt: '2026-04-04T00:00:00.000Z',
        boundSession: {
          id: 'session-test-mode-1',
          summary: 'Implementation thread',
          status: 'running',
          trace: [],
          updatedAt: '2026-04-04T00:00:00.000Z',
          guildId: 'guild-1',
          channelId: 'channel-1',
          parentChannelId: 'implementation-parent-1',
          threadId: 'thread-1',
          kind: 'implementation',
          specId: 'spec-1',
          sliceId: 'slice-1',
          pullRequestNumber: null,
          artifactId: 'session-artifact-1',
        },
      };
    }

    const cases = [
      {
        name: 'hermetic test mode',
        inputs: {
          testMode: 'hermetic',
        },
        mock: async (inputs: { testMode: string }) => {
          const storageRoot = await mkdtemp(
            join(tmpdir(), `devplat-openclaw-${inputs.testMode}-`),
          );
          const previousTestMode = process.env['DEVPLAT_TEST_MODE'];
          const previousStorageRoot = process.env['DEVPLAT_STORAGE_ROOT'];

          return {
            previousStorageRoot,
            previousTestMode,
            storageRoot,
          };
        },
        assert: async (
          context: {
            previousStorageRoot: string | undefined;
            previousTestMode: string | undefined;
            storageRoot: string;
          },
          inputs: {
            testMode: string;
          },
        ) => {
          try {
            process.env['DEVPLAT_TEST_MODE'] = inputs.testMode;
            process.env['DEVPLAT_STORAGE_ROOT'] = `  ${context.storageRoot}  `;

            const tool = createHandleDiscordControlTool();
            const result = await tool.execute('tool-call-dc-test-mode', {
              ...createTestModeDiscordInteractionParams(),
            });
            const envStore = new FileStoreService(context.storageRoot);

            expect(result.details).toMatchObject({
              allowed: true,
              failedClosed: false,
              policyDecisionId: 'policy-retry-gates',
              responseReceipt: {
                endpoint:
                  '/interactions/interaction-test-mode-1/token-test-mode-1/callback',
                responseBody: {
                  mode: 'loopback',
                },
              },
              threadReceipt: {
                endpoint: '/channels/thread-1/messages',
                responseBody: {
                  mode: 'loopback',
                },
              },
            });
            expect(await envStore.list('state')).toContain(
              'interaction-test-mode-1',
            );
          } finally {
            if (context.previousTestMode === undefined) {
              delete process.env['DEVPLAT_TEST_MODE'];
            } else {
              process.env['DEVPLAT_TEST_MODE'] = context.previousTestMode;
            }
            if (context.previousStorageRoot === undefined) {
              delete process.env['DEVPLAT_STORAGE_ROOT'];
            } else {
              process.env['DEVPLAT_STORAGE_ROOT'] = context.previousStorageRoot;
            }
            await rm(context.storageRoot, { force: true, recursive: true });
          }
        },
      },
      {
        name: 'live test mode',
        inputs: {
          testMode: 'live',
        },
        mock: async (inputs: { testMode: string }) => {
          const storageRoot = await mkdtemp(
            join(tmpdir(), `devplat-openclaw-${inputs.testMode}-`),
          );
          const previousTestMode = process.env['DEVPLAT_TEST_MODE'];
          const previousStorageRoot = process.env['DEVPLAT_STORAGE_ROOT'];

          return {
            previousStorageRoot,
            previousTestMode,
            storageRoot,
          };
        },
        assert: async (
          context: {
            previousStorageRoot: string | undefined;
            previousTestMode: string | undefined;
            storageRoot: string;
          },
          inputs: {
            testMode: string;
          },
        ) => {
          try {
            process.env['DEVPLAT_TEST_MODE'] = inputs.testMode;
            process.env['DEVPLAT_STORAGE_ROOT'] = `  ${context.storageRoot}  `;

            const tool = createHandleDiscordControlTool();
            const result = await tool.execute('tool-call-dc-test-mode', {
              ...createTestModeDiscordInteractionParams(),
            });
            const envStore = new FileStoreService(context.storageRoot);

            expect(result.details).toMatchObject({
              allowed: true,
              failedClosed: false,
              policyDecisionId: 'policy-retry-gates',
              responseReceipt: {
                endpoint:
                  '/interactions/interaction-test-mode-1/token-test-mode-1/callback',
                responseBody: {
                  mode: 'loopback',
                },
              },
              threadReceipt: {
                endpoint: '/channels/thread-1/messages',
                responseBody: {
                  mode: 'loopback',
                },
              },
            });
            expect(await envStore.list('state')).toContain(
              'interaction-test-mode-1',
            );
          } finally {
            if (context.previousTestMode === undefined) {
              delete process.env['DEVPLAT_TEST_MODE'];
            } else {
              process.env['DEVPLAT_TEST_MODE'] = context.previousTestMode;
            }
            if (context.previousStorageRoot === undefined) {
              delete process.env['DEVPLAT_STORAGE_ROOT'];
            } else {
              process.env['DEVPLAT_STORAGE_ROOT'] = context.previousStorageRoot;
            }
            await rm(context.storageRoot, { force: true, recursive: true });
          }
        },
      },
    ];

    it.each(cases)('$name', async (testCase) => {
      const context = await testCase.mock(testCase.inputs);
      await testCase.assert(context, testCase.inputs);
    });
  });

  it('returns decode failures for invalid Discord control input', async () => {
    const result = await createHandleDiscordControlTool().execute(
      'tool-call-dc2',
      {
        id: 'control-1',
      },
    );

    expect(result.details).toMatchObject({ status: 'failed' });
  });

  it('verifies Sonar bootstrap state from valid tool input', async () => {
    const result = await createVerifySonarBootstrapTool().execute(
      'tool-call-sb1',
      {
        projectKey: 'vannadii_devplat',
        qualityGateStatus: 'OK',
        conditions: [
          {
            metricKey: 'coverage',
            comparator: 'LT',
            errorThreshold: '90',
            actualValue: '99.69',
          },
          {
            metricKey: 'new_coverage',
            comparator: 'LT',
            errorThreshold: '90',
            actualValue: '100',
          },
        ],
        evaluatedAt: '2026-04-04T00:00:00.000Z',
      },
    );

    expect(result.details).toMatchObject({
      projectKey: 'vannadii_devplat',
      status: 'passed',
      checks: {
        qualityGateComputed: true,
        qualityGatePassing: true,
        overallCoverageCondition: true,
        newCodeCoverageCondition: true,
      },
    });
  });

  it('returns decode failures for invalid Sonar bootstrap input', async () => {
    const result = await createVerifySonarBootstrapTool().execute(
      'tool-call-sb2',
      {
        projectKey: 'vannadii_devplat',
      },
    );

    expect(result.details).toMatchObject({ status: 'failed' });
  });

  it('evaluates Sonar quality gates from valid tool input', async () => {
    const result = await createEvaluateSonarQualityGateTool().execute(
      'tool-call-sq1',
      {
        projectKey: 'vannadii_devplat',
        overallCoverage: 91,
        newCodeCoverage: 92,
        blockingIssues: 0,
      },
    );

    expect(result.details).toMatchObject({
      projectKey: 'vannadii_devplat',
      status: 'passed',
    });
  });

  it('returns decode failures for invalid Sonar quality gate input', async () => {
    const result = await createEvaluateSonarQualityGateTool().execute(
      'tool-call-sq2',
      {
        projectKey: 'vannadii_devplat',
      },
    );

    expect(result.details).toMatchObject({ status: 'failed' });
  });

  it('creates review finding artifacts from valid tool input', async () => {
    const result = await createReviewFindingTool().execute('tool-call-rf1', {
      findingId: 'finding-1',
      severity: 'high',
      path: 'packages/openclaw/src/tool-surfaces/service.ts',
      message: 'Missing policy mediation.',
      rationale: 'Privileged actions must stay policy-aware.',
      fixRecommendation: 'Delegate through the policy service.',
      blocking: true,
      updatedAt: '2026-04-04T00:00:00.000Z',
    });

    expect(result.details).toMatchObject({
      artifactType: 'review-finding',
      payload: { findingId: 'finding-1' },
    });
  });

  it('returns decode failures for invalid review finding input', async () => {
    const result = await createReviewFindingTool().execute('tool-call-rf2', {
      findingId: 'finding-1',
    });

    expect(result.details).toMatchObject({ status: 'failed' });
  });

  it('creates remediation plans from valid tool input', async () => {
    const result = await createRemediationPlanTool().execute('tool-call-rp1', {
      findings: [
        {
          findingId: 'finding-1',
          severity: 'medium',
          path: 'packages/openclaw/src/tool-surfaces/service.ts',
          message: 'Add test coverage.',
          rationale: 'The adapter needs direct surface tests.',
          fixRecommendation: 'Add a focused service test.',
          blocking: false,
          updatedAt: '2026-04-04T00:00:00.000Z',
        },
      ],
      autofix: true,
    });

    expect(result.details).toMatchObject({
      findingIds: ['finding-1'],
      autofix: true,
    });
  });

  it('returns decode failures for invalid remediation input', async () => {
    const result = await createRemediationPlanTool().execute('tool-call-rp2', {
      findings: {},
      autofix: true,
    });

    expect(result.details).toMatchObject({ status: 'failed' });
  });

  it('persists memory entries from valid tool input', async () => {
    const result = await createRememberMemoryEntryTool().execute(
      'tool-call-me1',
      {
        memoryId: 'memory-openclaw-1',
        kind: 'decision',
        subject: ' Use Discord as the primary control plane ',
        detail: ' Keep the operator flow auditable and thread-scoped. ',
        tags: ['discord', 'discord', ' audit '],
        status: 'active',
        sourceArtifactId: 'artifact-1',
        updatedAt: '2026-04-04T00:00:00.000Z',
      },
    );

    expect(result.details).toMatchObject({
      memoryId: 'memory-openclaw-1',
      subject: 'Use Discord as the primary control plane',
      tags: ['discord', 'audit'],
    });
  });

  it('returns decode failures for invalid memory entry input', async () => {
    const result = await createRememberMemoryEntryTool().execute(
      'tool-call-me2',
      {
        memoryId: 'memory-openclaw-1',
      },
    );

    expect(result.details).toMatchObject({ status: 'failed' });
  });

  it('evaluates policy actions from valid tool input', async () => {
    const cases = [
      {
        name: 'returns lifecycle policy metadata for merge requests',
        inputs: {
          params: {
            action: 'merge-now',
            privileged: false,
          },
        },
        mock: () => undefined,
        assert: async (
          _context: undefined,
          inputs: {
            params: {
              action: string;
              privileged: boolean;
            };
          },
        ) => {
          const result = await createEvaluatePolicyActionTool().execute(
            'tool-call-pa1',
            inputs.params,
          );

          expect(result.details).toMatchObject({
            action: 'merge-now',
            actionCategory: 'merge',
            allowed: false,
            auditRequired: true,
            escalationRequired: true,
            escalationTarget: 'operator',
            nextAction: 'request-merge-approval',
            privileged: false,
            requiresApproval: true,
            riskLevel: 'high',
          });
          expect(result.details).toHaveProperty('auditReason');
        },
      },
    ];

    for (const testCase of cases) {
      const context = testCase.mock();
      await testCase.assert(context, testCase.inputs);
    }
  });

  it('returns decode failures for invalid policy action input', async () => {
    const result = await createEvaluatePolicyActionTool().execute(
      'tool-call-pa2',
      {
        action: 'merge-now',
      },
    );

    expect(result.details).toMatchObject({ status: 'failed' });
  });

  it('records telemetry events from valid tool input', async () => {
    const result = await createRecordTelemetryEventTool().execute(
      'tool-call-te1',
      {
        id: 'telemetry-openclaw-1',
        summary: ' Sync branch telemetry ',
        status: 'approved',
        trace: [],
        updatedAt: '2026-04-04T00:00:00.000Z',
        actorId: 'operator-1',
        action: 'sync-branch',
        scope: 'github',
        details: {
          prNumber: 42,
        },
      },
    );

    expect(result.details).toMatchObject({
      id: 'telemetry-openclaw-1',
      summary: 'Sync branch telemetry',
      trace: ['telemetry:github:sync-branch'],
    });
  });

  it('returns decode failures for invalid telemetry input', async () => {
    const result = await createRecordTelemetryEventTool().execute(
      'tool-call-te2',
      {
        id: 'telemetry-openclaw-1',
      },
    );

    expect(result.details).toMatchObject({ status: 'failed' });
  });

  it('updates task lifecycle state from valid tool input', async () => {
    const result = await createUpdateTaskTool().execute('tool-call-7', {
      taskId: 'task-1',
      sliceId: 'slice-1',
      threadId: 'thread-1',
      status: 'merged',
    });

    expect(result.details).toMatchObject({ status: 'merged' });
  });

  it('returns decode failures for invalid update input', async () => {
    const result = await createUpdateTaskTool().execute('tool-call-8', {
      taskId: 'task-1',
      sliceId: 'slice-1',
      threadId: 'thread-1',
      status: 'queued',
    });

    expect(result.details).toMatchObject({ status: 'failed' });
  });

  describe('durable task lifecycle tools', () => {
    const cases = [
      {
        name: 'claim preserves the current queue record transition history',
        inputs: {
          toolCallId: 'tool-call-task-lifecycle-1',
          execute: createClaimTaskTool,
          params: {
            taskId: 'task-1',
            sliceId: 'slice-1',
            threadId: 'thread-1',
            assigneeId: 'worker-1',
            record: {
              id: 'queue-task-1',
              summary: 'Current queue task',
              status: 'review',
              trace: ['queue:task-1:review'],
              updatedAt: '2026-04-04T00:00:00.000Z',
              taskId: 'task-1',
              sliceId: 'slice-1',
              threadId: 'thread-1',
              transitions: [
                {
                  toStatus: 'review',
                  action: 'create',
                  reason: 'Created task task-1',
                  occurredAt: '2026-04-04T00:00:00.000Z',
                },
              ],
            },
          },
        },
        mock: async () => undefined,
        assert: (result) => {
          expect(result.details).toMatchObject({
            id: 'queue-task-1',
            status: 'claimed',
            assigneeId: 'worker-1',
            transitions: expect.arrayContaining([
              expect.objectContaining({
                fromStatus: 'review',
                toStatus: 'claimed',
                action: 'claim',
              }),
            ]),
          });
        },
      },
      {
        name: 'update preserves the current queue record transition history',
        inputs: {
          toolCallId: 'tool-call-task-lifecycle-2',
          execute: createUpdateTaskTool,
          params: {
            taskId: 'task-2',
            sliceId: 'slice-2',
            threadId: 'thread-2',
            status: 'complete',
            record: {
              id: 'queue-task-2',
              summary: 'Current claimed task',
              status: 'claimed',
              trace: ['queue:task-2:claimed'],
              updatedAt: '2026-04-04T00:00:00.000Z',
              taskId: 'task-2',
              sliceId: 'slice-2',
              threadId: 'thread-2',
              assigneeId: 'worker-2',
              transitions: [
                {
                  toStatus: 'claimed',
                  action: 'claim',
                  reason: 'Claimed task task-2',
                  occurredAt: '2026-04-04T00:00:00.000Z',
                  actorId: 'worker-2',
                },
              ],
            },
          },
        },
        mock: async () => undefined,
        assert: (result) => {
          expect(result.details).toMatchObject({
            id: 'queue-task-2',
            status: 'complete',
            assigneeId: 'worker-2',
            transitions: expect.arrayContaining([
              expect.objectContaining({
                fromStatus: 'claimed',
                toStatus: 'complete',
                action: 'complete',
              }),
            ]),
          });
        },
      },
    ];

    it.each(cases)('$name', async (testCase) => {
      await testCase.mock(testCase.inputs);
      const tool = testCase.inputs.execute();
      const result = await tool.execute(
        testCase.inputs.toolCallId,
        testCase.inputs.params,
      );
      testCase.assert(result);
    });
  });

  it('reads stored records from valid tool input', async () => {
    await createRememberMemoryEntryTool().execute('tool-call-sr0', {
      memoryId: 'memory-openclaw-read-1',
      kind: 'constraint',
      subject: ' Preserve audit history ',
      detail: 'Stored reads should expose persisted records.',
      tags: ['audit'],
      status: 'active',
      updatedAt: '2026-04-04T00:00:00.000Z',
    });

    const result = await createReadStoredRecordTool().execute('tool-call-sr1', {
      scope: 'memory',
      key: 'memory-openclaw-read-1',
    });

    expect(result.details).toMatchObject({
      status: 'ok',
      scope: 'memory',
      key: 'memory-openclaw-read-1',
      record: {
        id: 'memory-openclaw-read-1',
        scope: 'memory',
      },
    });
  });

  it('returns decode failures for invalid stored record reads', async () => {
    const result = await createReadStoredRecordTool().execute('tool-call-sr2', {
      scope: 'memory',
    });

    expect(result.details).toMatchObject({ status: 'failed' });
  });

  it('returns structured failures for missing stored record reads', async () => {
    const result = await createReadStoredRecordTool().execute('tool-call-sr3', {
      scope: 'memory',
      key: 'missing-memory-key',
    });

    expect(result.details).toMatchObject({
      status: 'failed',
      scope: 'memory',
      key: 'missing-memory-key',
    });
  });

  it('lists stored records from valid tool input', async () => {
    await createRememberMemoryEntryTool().execute('tool-call-ls0', {
      memoryId: 'memory-openclaw-list-1',
      kind: 'preference',
      subject: ' Prefer auditable controls ',
      detail: 'List calls should expose known persisted keys.',
      tags: ['controls'],
      status: 'active',
      updatedAt: '2026-04-04T00:00:00.000Z',
    });

    const result = await createListStoredRecordsTool().execute(
      'tool-call-ls1',
      {
        scope: 'memory',
      },
    );

    expect(result.details).toEqual(
      expect.objectContaining({
        status: 'ok',
        scope: 'memory',
        keys: expect.arrayContaining(['memory-openclaw-list-1']),
      }),
    );
  });

  it('returns decode failures for invalid stored record listing', async () => {
    const result = await createListStoredRecordsTool().execute(
      'tool-call-ls2',
      {},
    );

    expect(result.details).toMatchObject({ status: 'failed' });
  });

  it('creates task records from valid tool input', async () => {
    const result = await createTaskRecordTool().execute('tool-call-tq1', {
      id: 'queue-openclaw-1',
      summary: ' Queue a Discord implementation slice ',
      status: 'queued',
      trace: [],
      updatedAt: '2026-04-04T00:00:00.000Z',
      taskId: 'task-queue-1',
      sliceId: 'slice-queue-1',
      threadId: 'thread-queue-1',
    });

    expect(result.details).toMatchObject({
      id: 'queue-openclaw-1',
      taskId: 'task-queue-1',
      status: 'queued',
      summary: 'Queue a Discord implementation slice',
      trace: expect.arrayContaining(['queue:task-queue-1:queued']),
    });
  });

  it('returns decode failures for invalid task record input', async () => {
    const result = await createTaskRecordTool().execute('tool-call-tq2', {
      id: 'queue-openclaw-2',
    });

    expect(result.details).toMatchObject({ status: 'failed' });
  });

  const environmentStorageToolCases = [
    {
      name: 'stores reads and lists records under the configured storage root',
      inputs: {
        recordKey: 'storage-openclaw-env-1',
      },
      mock: async () => {
        const storageRoot = await mkdtemp(
          join(tmpdir(), 'devplat-openclaw-storage-env-'),
        );
        const previousStorageRoot = process.env['DEVPLAT_STORAGE_ROOT'];

        return {
          previousStorageRoot,
          storageRoot,
        };
      },
      assert: async (
        context: {
          previousStorageRoot: string | undefined;
          storageRoot: string;
        },
        inputs: {
          recordKey: string;
        },
      ) => {
        try {
          process.env['DEVPLAT_STORAGE_ROOT'] = `  ${context.storageRoot}  `;

          await createStoreRecordTool().execute('tool-call-storage-env-1', {
            record: {
              id: inputs.recordKey,
              key: inputs.recordKey,
              scope: 'state',
              summary: 'Environment-root state snapshot',
              status: 'complete',
              trace: [],
              updatedAt: '2026-04-04T00:00:00.000Z',
              payload: {
                state: 'complete',
              },
            },
            actorId: 'operator-env-1',
            privileged: false,
          });
          const listResult = await createListStoredRecordsTool().execute(
            'tool-call-storage-env-2',
            {
              scope: 'state',
            },
          );
          const readResult = await createReadStoredRecordTool().execute(
            'tool-call-storage-env-3',
            {
              scope: 'state',
              key: inputs.recordKey,
            },
          );
          const envStore = new FileStoreService(context.storageRoot);
          const envRecord = await envStore.read('state', inputs.recordKey);

          expect(listResult.details).toMatchObject({
            status: 'ok',
            keys: [inputs.recordKey],
          });
          expect(readResult.details).toMatchObject({
            status: 'ok',
            record: {
              key: inputs.recordKey,
            },
          });
          expect(envRecord.ok).toBe(true);
        } finally {
          if (context.previousStorageRoot === undefined) {
            delete process.env['DEVPLAT_STORAGE_ROOT'];
          } else {
            process.env['DEVPLAT_STORAGE_ROOT'] = context.previousStorageRoot;
          }
          await rm(context.storageRoot, { force: true, recursive: true });
        }
      },
    },
    {
      name: 'records telemetry under the configured storage root',
      inputs: {
        eventId: 'telemetry-openclaw-env-1',
      },
      mock: async () => {
        const storageRoot = await mkdtemp(
          join(tmpdir(), 'devplat-openclaw-telemetry-env-'),
        );
        const previousStorageRoot = process.env['DEVPLAT_STORAGE_ROOT'];

        return {
          previousStorageRoot,
          storageRoot,
        };
      },
      assert: async (
        context: {
          previousStorageRoot: string | undefined;
          storageRoot: string;
        },
        inputs: {
          eventId: string;
        },
      ) => {
        try {
          process.env['DEVPLAT_STORAGE_ROOT'] = `  ${context.storageRoot}  `;

          await createRecordTelemetryEventTool().execute(
            'tool-call-telemetry-env-1',
            {
              id: inputs.eventId,
              summary: 'OpenClaw telemetry uses env storage',
              status: 'complete',
              trace: [],
              updatedAt: '2026-04-04T00:00:00.000Z',
              actorId: 'operator-env-2',
              action: 'show-status',
              scope: 'discord',
              details: {
                threadId: 'thread-env-2',
              },
            },
          );
          const envStore = new FileStoreService(context.storageRoot);

          expect(await envStore.list('telemetry')).toEqual([inputs.eventId]);
        } finally {
          if (context.previousStorageRoot === undefined) {
            delete process.env['DEVPLAT_STORAGE_ROOT'];
          } else {
            process.env['DEVPLAT_STORAGE_ROOT'] = context.previousStorageRoot;
          }
          await rm(context.storageRoot, { force: true, recursive: true });
        }
      },
    },
    {
      name: 'remembers memory entries under the configured storage root',
      inputs: {
        memoryId: 'memory-openclaw-env-1',
      },
      mock: async () => {
        const storageRoot = await mkdtemp(
          join(tmpdir(), 'devplat-openclaw-memory-env-'),
        );
        const previousStorageRoot = process.env['DEVPLAT_STORAGE_ROOT'];

        return {
          previousStorageRoot,
          storageRoot,
        };
      },
      assert: async (
        context: {
          previousStorageRoot: string | undefined;
          storageRoot: string;
        },
        inputs: {
          memoryId: string;
        },
      ) => {
        try {
          process.env['DEVPLAT_STORAGE_ROOT'] = `  ${context.storageRoot}  `;

          await createRememberMemoryEntryTool().execute(
            'tool-call-memory-env-1',
            {
              memoryId: inputs.memoryId,
              subject: 'OpenClaw storage-root memory',
              kind: 'decision',
              detail: 'Use the configured storage root.',
              tags: ['DEVPLAT_STORAGE_ROOT'],
              status: 'active',
              updatedAt: '2026-04-04T00:00:00.000Z',
            },
          );
          const envStore = new FileStoreService(context.storageRoot);

          expect(await envStore.list('memory')).toEqual([inputs.memoryId]);
        } finally {
          if (context.previousStorageRoot === undefined) {
            delete process.env['DEVPLAT_STORAGE_ROOT'];
          } else {
            process.env['DEVPLAT_STORAGE_ROOT'] = context.previousStorageRoot;
          }
          await rm(context.storageRoot, { force: true, recursive: true });
        }
      },
    },
    {
      name: 'binds Discord threads under the configured storage root',
      inputs: {
        bindingKey: 'binding-openclaw-env-1:thread-openclaw-env-1',
      },
      mock: async () => {
        const storageRoot = await mkdtemp(
          join(tmpdir(), 'devplat-openclaw-binding-env-'),
        );
        const previousStorageRoot = process.env['DEVPLAT_STORAGE_ROOT'];

        return {
          previousStorageRoot,
          storageRoot,
        };
      },
      assert: async (
        context: {
          previousStorageRoot: string | undefined;
          storageRoot: string;
        },
        inputs: {
          bindingKey: string;
        },
      ) => {
        try {
          process.env['DEVPLAT_STORAGE_ROOT'] = `  ${context.storageRoot}  `;

          await createBindDiscordThreadTool().execute(
            'tool-call-binding-env-1',
            {
              id: 'binding-openclaw-env-1',
              summary: 'Bind env-root spec thread',
              status: 'approved',
              trace: [],
              updatedAt: '2026-04-04T00:00:00.000Z',
              guildId: 'guild-env-1',
              channelId: 'channel-env-1',
              kind: 'spec',
              threadBindingMode: 'inherit-parent',
              threadId: 'thread-openclaw-env-1',
              parentChannelId: 'channel-env-1',
              actorId: 'operator-env-3',
            },
          );
          const envStore = new FileStoreService(context.storageRoot);

          expect(await envStore.list('state')).toContain(inputs.bindingKey);
          expect(await envStore.list('telemetry')).toContain(
            `telemetry-${inputs.bindingKey}`,
          );
        } finally {
          if (context.previousStorageRoot === undefined) {
            delete process.env['DEVPLAT_STORAGE_ROOT'];
          } else {
            process.env['DEVPLAT_STORAGE_ROOT'] = context.previousStorageRoot;
          }
          await rm(context.storageRoot, { force: true, recursive: true });
        }
      },
    },
    {
      name: 'opens Discord thread sessions under the configured storage root',
      inputs: {
        artifactId: 'artifact-openclaw-env-1',
        sessionId: 'session-openclaw-env-1',
      },
      mock: async () => {
        const storageRoot = await mkdtemp(
          join(tmpdir(), 'devplat-openclaw-session-env-'),
        );
        const previousStorageRoot = process.env['DEVPLAT_STORAGE_ROOT'];

        return {
          previousStorageRoot,
          storageRoot,
        };
      },
      assert: async (
        context: {
          previousStorageRoot: string | undefined;
          storageRoot: string;
        },
        inputs: {
          artifactId: string;
          sessionId: string;
        },
      ) => {
        try {
          process.env['DEVPLAT_STORAGE_ROOT'] = `  ${context.storageRoot}  `;

          await createOpenDiscordThreadTool().execute(
            'tool-call-session-env-1',
            {
              id: inputs.sessionId,
              summary: 'Spec thread under configured root',
              status: 'approved',
              trace: [],
              updatedAt: '2026-04-04T00:00:00.000Z',
              guildId: 'guild-env-2',
              channelId: 'channel-env-2',
              parentChannelId: 'parent-env-2',
              threadId: 'thread-openclaw-env-2',
              kind: 'spec',
              specId: 'spec-env-2',
              sliceId: null,
              pullRequestNumber: null,
              artifactId: inputs.artifactId,
              actorId: 'operator-env-4',
            },
          );
          const envStore = new FileStoreService(context.storageRoot);

          expect(await envStore.list('state')).toContain(inputs.sessionId);
          expect(await envStore.list('artifacts')).toContain(inputs.artifactId);
          expect(await envStore.list('telemetry')).toContain(
            `telemetry-${inputs.sessionId}`,
          );
        } finally {
          if (context.previousStorageRoot === undefined) {
            delete process.env['DEVPLAT_STORAGE_ROOT'];
          } else {
            process.env['DEVPLAT_STORAGE_ROOT'] = context.previousStorageRoot;
          }
          await rm(context.storageRoot, { force: true, recursive: true });
        }
      },
    },
    {
      name: 'handles Discord approvals under the configured storage root',
      inputs: {
        approvalId: 'approval-openclaw-env-1',
        artifactId: 'approval-openclaw-env-1:artifact',
      },
      mock: async () => {
        const storageRoot = await mkdtemp(
          join(tmpdir(), 'devplat-openclaw-approval-env-'),
        );
        const previousStorageRoot = process.env['DEVPLAT_STORAGE_ROOT'];

        return {
          previousStorageRoot,
          storageRoot,
        };
      },
      assert: async (
        context: {
          previousStorageRoot: string | undefined;
          storageRoot: string;
        },
        inputs: {
          approvalId: string;
          artifactId: string;
        },
      ) => {
        try {
          process.env['DEVPLAT_STORAGE_ROOT'] = `  ${context.storageRoot}  `;

          await createHandleDiscordApprovalTool().execute(
            'tool-call-approval-env-1',
            {
              id: inputs.approvalId,
              summary: 'Approve from configured root',
              status: 'review',
              trace: [],
              updatedAt: '2026-04-04T00:00:00.000Z',
              actorId: 'operator-env-5',
              channelId: 'channel-env-3',
              threadId: 'thread-openclaw-env-3',
              action: 'approve',
              artifactId: 'requested-artifact-env-3',
              privileged: false,
            },
          );
          const envStore = new FileStoreService(context.storageRoot);

          expect(await envStore.list('state')).toContain(inputs.approvalId);
          expect(await envStore.list('artifacts')).toContain(inputs.artifactId);
          expect(await envStore.list('telemetry')).toContain(
            `telemetry-${inputs.approvalId}`,
          );
        } finally {
          if (context.previousStorageRoot === undefined) {
            delete process.env['DEVPLAT_STORAGE_ROOT'];
          } else {
            process.env['DEVPLAT_STORAGE_ROOT'] = context.previousStorageRoot;
          }
          await rm(context.storageRoot, { force: true, recursive: true });
        }
      },
    },
    {
      name: 'records GitHub action telemetry under the configured storage root',
      inputs: {
        action: 'sync-branch',
      },
      mock: async () => {
        const storageRoot = await mkdtemp(
          join(tmpdir(), 'devplat-openclaw-github-env-'),
        );
        const previousStorageRoot = process.env['DEVPLAT_STORAGE_ROOT'];

        return {
          previousStorageRoot,
          storageRoot,
        };
      },
      assert: async (
        context: {
          previousStorageRoot: string | undefined;
          storageRoot: string;
        },
        inputs: {
          action: string;
        },
      ) => {
        try {
          process.env['DEVPLAT_STORAGE_ROOT'] = `  ${context.storageRoot}  `;

          await createSubmitGitHubActionTool().execute(
            'tool-call-github-env-1',
            {
              request: {
                repoFullName: 'VannaDii/devplat',
                action: inputs.action,
                summary: 'Sync downstream branch under configured root',
                privileged: false,
                targetNumber: 42,
                branchName: 'feature/downstream',
                updatedAt: '2026-04-04T00:00:00.000Z',
              },
              actorId: 'operator-env-6',
            },
          );
          const envStore = new FileStoreService(context.storageRoot);

          expect(await envStore.list('telemetry')).toHaveLength(1);
        } finally {
          if (context.previousStorageRoot === undefined) {
            delete process.env['DEVPLAT_STORAGE_ROOT'];
          } else {
            process.env['DEVPLAT_STORAGE_ROOT'] = context.previousStorageRoot;
          }
          await rm(context.storageRoot, { force: true, recursive: true });
        }
      },
    },
    {
      name: 'records supervisor telemetry under the configured storage root',
      inputs: {
        action: 'retry-gates',
      },
      mock: async () => {
        const storageRoot = await mkdtemp(
          join(tmpdir(), 'devplat-openclaw-supervisor-env-'),
        );
        const previousStorageRoot = process.env['DEVPLAT_STORAGE_ROOT'];

        return {
          previousStorageRoot,
          storageRoot,
        };
      },
      assert: async (
        context: {
          previousStorageRoot: string | undefined;
          storageRoot: string;
        },
        inputs: {
          action: string;
        },
      ) => {
        try {
          process.env['DEVPLAT_STORAGE_ROOT'] = `  ${context.storageRoot}  `;

          const result = await createRunSupervisorStepTool().execute(
            'tool-call-supervisor-env-1',
            {
              action: inputs.action,
              actorId: 'operator-env-7',
              privileged: false,
            },
          );
          const envStore = new FileStoreService(context.storageRoot);

          expect(await envStore.list('telemetry')).toContain(result.details.id);
        } finally {
          if (context.previousStorageRoot === undefined) {
            delete process.env['DEVPLAT_STORAGE_ROOT'];
          } else {
            process.env['DEVPLAT_STORAGE_ROOT'] = context.previousStorageRoot;
          }
          await rm(context.storageRoot, { force: true, recursive: true });
        }
      },
    },
    {
      name: 'submits pull request updates with configured repository identity',
      inputs: {
        repoFullName: 'VannaDii/devplat-ops',
      },
      mock: async () => {
        const storageRoot = await mkdtemp(
          join(tmpdir(), 'devplat-openclaw-pr-env-'),
        );
        const previousGitHubOwner = process.env['GITHUB_OWNER'];
        const previousGitHubRepo = process.env['GITHUB_REPO'];
        const previousStorageRoot = process.env['DEVPLAT_STORAGE_ROOT'];

        return {
          previousGitHubOwner,
          previousGitHubRepo,
          previousStorageRoot,
          storageRoot,
        };
      },
      assert: async (
        context: {
          previousGitHubOwner: string | undefined;
          previousGitHubRepo: string | undefined;
          previousStorageRoot: string | undefined;
          storageRoot: string;
        },
        inputs: {
          repoFullName: string;
        },
      ) => {
        try {
          process.env['DEVPLAT_STORAGE_ROOT'] = `  ${context.storageRoot}  `;
          process.env['GITHUB_OWNER'] = '  VannaDii  ';
          process.env['GITHUB_REPO'] = '  devplat-ops  ';

          const result = await createSubmitPullRequestUpdateTool().execute(
            'tool-call-pr-env-1',
            {
              record: {
                prNumber: 77,
                branchName: 'feature/pr-env',
                baseBranch: 'main',
                title: 'Configured repo submission',
                labels: ['automation'],
                reviewState: 'review',
                mergeReady: false,
                updatedAt: '2026-04-04T00:00:00.000Z',
              },
              actorId: 'operator-env-8',
            },
          );
          const envStore = new FileStoreService(context.storageRoot);

          expect(result.details).toMatchObject({
            request: {
              repoFullName: inputs.repoFullName,
            },
          });
          expect(await envStore.list('telemetry')).toHaveLength(1);
        } finally {
          if (context.previousGitHubOwner === undefined) {
            delete process.env['GITHUB_OWNER'];
          } else {
            process.env['GITHUB_OWNER'] = context.previousGitHubOwner;
          }
          if (context.previousGitHubRepo === undefined) {
            delete process.env['GITHUB_REPO'];
          } else {
            process.env['GITHUB_REPO'] = context.previousGitHubRepo;
          }
          if (context.previousStorageRoot === undefined) {
            delete process.env['DEVPLAT_STORAGE_ROOT'];
          } else {
            process.env['DEVPLAT_STORAGE_ROOT'] = context.previousStorageRoot;
          }
          await rm(context.storageRoot, { force: true, recursive: true });
        }
      },
    },
    {
      name: 'allocates worktrees under the configured worktree root',
      inputs: {
        branchName: 'feature/worktree-env',
        worktreePath: '.devplat-worktrees/feature/worktree-env',
      },
      mock: async () => {
        const previousWorktreeRoot = process.env['DEVPLAT_WORKTREE_ROOT'];

        return {
          previousWorktreeRoot,
        };
      },
      assert: async (
        context: {
          previousWorktreeRoot: string | undefined;
        },
        inputs: {
          branchName: string;
          worktreePath: string;
        },
      ) => {
        try {
          process.env['DEVPLAT_WORKTREE_ROOT'] = '  .devplat-worktrees  ';

          const result = await createAllocateWorktreeTool().execute(
            'tool-call-worktree-env-1',
            {
              taskId: 'task-worktree-env-1',
              branchName: inputs.branchName,
            },
          );

          expect(result.details).toMatchObject({
            branchName: inputs.branchName,
            worktreePath: inputs.worktreePath,
          });
        } finally {
          if (context.previousWorktreeRoot === undefined) {
            delete process.env['DEVPLAT_WORKTREE_ROOT'];
          } else {
            process.env['DEVPLAT_WORKTREE_ROOT'] = context.previousWorktreeRoot;
          }
        }
      },
    },
    {
      name: 'rebases dependents with the configured worktree root',
      inputs: {
        branchName: 'feature/rebase-env',
        worktreePath: '.devplat-worktrees/feature/rebase-env',
      },
      mock: async () => {
        const previousWorktreeRoot = process.env['DEVPLAT_WORKTREE_ROOT'];

        return {
          previousWorktreeRoot,
        };
      },
      assert: async (
        context: {
          previousWorktreeRoot: string | undefined;
        },
        inputs: {
          branchName: string;
          worktreePath: string;
        },
      ) => {
        try {
          process.env['DEVPLAT_WORKTREE_ROOT'] = '  .devplat-worktrees  ';

          const result = await createExecuteRebaseDependentsTool().execute(
            'tool-call-rebase-env-1',
            {
              record: {
                prNumber: 78,
                branchName: 'feature/pr-env',
                baseBranch: 'main',
                title: 'Configured worktree rebase',
                labels: ['automation'],
                reviewState: 'approved',
                mergeReady: true,
                updatedAt: '2026-04-04T00:00:00.000Z',
              },
              dependentBranches: [inputs.branchName],
              syncMode: 'rebase',
            },
          );

          expect(result.details).toMatchObject({
            syncResults: [
              {
                branchName: inputs.branchName,
                worktreePath: inputs.worktreePath,
              },
            ],
          });
        } finally {
          if (context.previousWorktreeRoot === undefined) {
            delete process.env['DEVPLAT_WORKTREE_ROOT'];
          } else {
            process.env['DEVPLAT_WORKTREE_ROOT'] = context.previousWorktreeRoot;
          }
        }
      },
    },
  ];

  it.each(environmentStorageToolCases)(
    '$name',
    async ({ inputs, mock, assert }) => {
      const context = await mock();
      await assert(context, inputs);
    },
  );

  it('stores records from valid tool input when policy allows it', async () => {
    const result = await createStoreRecordTool().execute('tool-call-ss1', {
      record: {
        id: 'storage-openclaw-write-1',
        key: 'storage-openclaw-write-1',
        scope: 'state',
        summary: ' Persisted state snapshot ',
        status: 'complete',
        trace: [],
        updatedAt: '2026-04-04T00:00:00.000Z',
        payload: {
          state: 'review',
        },
      },
      actorId: 'operator-1',
      privileged: false,
    });

    expect(result.details).toMatchObject({
      allowed: true,
      policyDecisionId: 'policy-store-record',
      record: {
        id: 'storage-openclaw-write-1',
        key: 'storage-openclaw-write-1',
        scope: 'state',
        trace: expect.arrayContaining(['storage:state']),
      },
    });
  });

  it('blocks privileged record storage requests', async () => {
    const result = await createStoreRecordTool().execute('tool-call-ss2', {
      record: {
        id: 'storage-openclaw-write-2',
        key: 'storage-openclaw-write-2',
        scope: 'telemetry',
        summary: 'Blocked telemetry record',
        status: 'review',
        trace: [],
        updatedAt: '2026-04-04T00:00:00.000Z',
        payload: {
          outcome: 'blocked',
        },
      },
      actorId: 'operator-1',
      privileged: true,
    });

    expect(result.details).toMatchObject({
      allowed: false,
      policyDecisionId: 'policy-store-record',
      scope: 'telemetry',
      key: 'storage-openclaw-write-2',
    });
  });

  it('returns decode failures for invalid record storage input', async () => {
    const result = await createStoreRecordTool().execute('tool-call-ss3', {
      record: {
        id: 'storage-openclaw-write-3',
      },
    });

    expect(result.details).toMatchObject({ status: 'failed' });
  });

  it('creates pull request records from valid tool input', async () => {
    const result = await createPullRequestRecordTool().execute(
      'tool-call-pr0',
      {
        prNumber: 42,
        branchName: ' feature/discord-tools ',
        baseBranch: ' main ',
        title: ' Expand OpenClaw pull request wiring ',
        labels: ['automation', 'automation', ' review '],
        reviewState: 'review',
        mergeReady: false,
        updatedAt: '2026-04-04T00:00:00.000Z',
      },
    );

    expect(result.details).toMatchObject({
      prNumber: 42,
      branchName: 'feature/discord-tools',
      baseBranch: 'main',
      title: 'Expand OpenClaw pull request wiring',
      labels: ['automation', 'review'],
      reviewState: 'review',
      mergeReady: false,
    });
  });

  it('returns decode failures for invalid pull request record input', async () => {
    const result = await createPullRequestRecordTool().execute(
      'tool-call-prx',
      {
        prNumber: 42,
      },
    );

    expect(result.details).toMatchObject({ status: 'failed' });
  });

  it('submits pull request updates from valid tool input', async () => {
    const result = await createSubmitPullRequestUpdateTool().execute(
      'tool-call-pr1',
      {
        record: {
          prNumber: 42,
          branchName: 'feature/discord-tools',
          baseBranch: 'main',
          title: 'Expand OpenClaw tools',
          labels: ['automation'],
          reviewState: 'approved',
          mergeReady: true,
          updatedAt: '2026-04-04T00:00:00.000Z',
        },
        actorId: 'operator-1',
      },
    );

    expect(result.details).toMatchObject({
      allowed: false,
      request: { action: 'update-pr' },
    });
  });

  it('submits pull request merges from valid tool input', async () => {
    const result = await createSubmitPullRequestMergeTool().execute(
      'tool-call-pr1a',
      {
        record: {
          prNumber: 42,
          branchName: 'feature/discord-tools',
          baseBranch: 'main',
          title: 'Expand OpenClaw tools',
          labels: ['automation'],
          reviewState: 'approved',
          mergeReady: true,
          updatedAt: '2026-04-04T00:00:00.000Z',
        },
        actorId: 'operator-1',
      },
    );

    expect(result.details).toMatchObject({
      allowed: false,
      request: { action: 'merge-pr' },
    });
  });

  it('returns decode failures for invalid pull request merge input', async () => {
    const result = await createSubmitPullRequestMergeTool().execute(
      'tool-call-pr1b',
      {
        record: {
          prNumber: 42,
        },
      },
    );

    expect(result.details).toMatchObject({ status: 'failed' });
  });

  it('returns decode failures for invalid pull request update input', async () => {
    const result = await createSubmitPullRequestUpdateTool().execute(
      'tool-call-pr2',
      {
        record: {
          prNumber: 42,
        },
      },
    );

    expect(result.details).toMatchObject({ status: 'failed' });
  });

  it('plans dependent rebases from valid tool input', async () => {
    const result = await createPlanRebaseDependentsTool().execute(
      'tool-call-rb1',
      {
        record: {
          prNumber: 42,
          branchName: 'feature/discord-tools',
          baseBranch: 'main',
          title: 'Expand OpenClaw tools',
          labels: ['automation'],
          reviewState: 'approved',
          mergeReady: true,
          updatedAt: '2026-04-04T00:00:00.000Z',
        },
        dependentBranches: ['feature/downstream'],
      },
    );

    expect(result.details).toMatchObject({
      mergedPrNumber: 42,
      rebaseRequired: true,
    });
  });

  it('executes dependent rebases through worktree sync results', async () => {
    const result = await createExecuteRebaseDependentsTool().execute(
      'tool-call-rb1a',
      {
        record: {
          prNumber: 42,
          branchName: 'feature/discord-tools',
          baseBranch: 'main',
          title: 'Expand OpenClaw tools',
          labels: ['automation'],
          reviewState: 'approved',
          mergeReady: true,
          updatedAt: '2026-04-04T00:00:00.000Z',
        },
        dependentBranches: ['feature/downstream'],
        syncMode: 'rebase',
      },
    );

    expect(result.details).toMatchObject({
      plan: {
        mergedPrNumber: 42,
      },
      syncMode: 'rebase',
      executed: true,
      syncResults: [
        {
          baseBranch: 'main',
          branchName: 'feature/downstream',
        },
      ],
    });
  });

  it('defaults dependent rebase execution to rebase sync mode', async () => {
    const result = await createExecuteRebaseDependentsTool().execute(
      'tool-call-rb1b',
      {
        record: {
          prNumber: 42,
          branchName: 'feature/discord-tools',
          baseBranch: 'main',
          title: 'Expand OpenClaw tools',
          labels: ['automation'],
          reviewState: 'approved',
          mergeReady: true,
          updatedAt: '2026-04-04T00:00:00.000Z',
        },
        dependentBranches: ['feature/downstream'],
      },
    );

    expect(result.details).toMatchObject({
      syncMode: 'rebase',
      executed: true,
    });
  });

  it('returns decode failures for invalid dependent rebase execution input', async () => {
    const result = await createExecuteRebaseDependentsTool().execute(
      'tool-call-rb1c',
      {
        record: {
          prNumber: 42,
        },
      },
    );

    expect(result.details).toMatchObject({ status: 'failed' });
  });

  it('returns decode failures for invalid rebase plan input', async () => {
    const result = await createPlanRebaseDependentsTool().execute(
      'tool-call-rb2',
      {
        record: {
          prNumber: 42,
        },
      },
    );

    expect(result.details).toMatchObject({ status: 'failed' });
  });

  it('creates GitHub action requests from valid tool input', async () => {
    const result = await createGitHubActionRequestTool().execute(
      'tool-call-gh0',
      {
        repoFullName: ' VannaDii/devplat ',
        action: 'sync-branch',
        summary: ' Sync downstream branch ',
        privileged: false,
        branchName: ' feature/downstream ',
        updatedAt: '2026-04-04T00:00:00.000Z',
      },
    );

    expect(result.details).toMatchObject({
      repoFullName: 'VannaDii/devplat',
      action: 'sync-branch',
      summary: 'Sync downstream branch',
      branchName: 'feature/downstream',
    });
  });

  it('returns decode failures for invalid GitHub action request input', async () => {
    const result = await createGitHubActionRequestTool().execute(
      'tool-call-gh0b',
      {
        repoFullName: 'VannaDii/devplat',
      },
    );

    expect(result.details).toMatchObject({ status: 'failed' });
  });

  it('submits GitHub actions from valid tool input', async () => {
    const cases = [
      {
        inputs: {
          params: {
            request: {
              repoFullName: 'VannaDii/devplat',
              action: 'sync-branch',
              summary: 'Sync downstream branch',
              privileged: false,
              branchName: 'feature/downstream',
              updatedAt: '2026-04-04T00:00:00.000Z',
            },
            actorId: 'operator-1',
          },
        },
        mock: () =>
          createSubmitGitHubActionTool({
            async submit(request) {
              return {
                request,
                allowed: true,
                policyDecisionId: 'policy-sync-branch',
                submitted: true,
                receipt: {
                  method: 'PUT',
                  endpoint: '/repos/VannaDii/devplat/pulls/42/update-branch',
                  statusCode: 202,
                  responseBody: { ok: true },
                },
              };
            },
          }),
        assert: (
          result: Awaited<
            ReturnType<
              ReturnType<typeof createSubmitGitHubActionTool>['execute']
            >
          >,
        ) => {
          expect(result.details).toMatchObject({
            allowed: true,
            submitted: true,
            request: { action: 'sync-branch' },
          });
        },
      },
    ];

    for (const testCase of cases) {
      const tool = testCase.mock();
      const result = await tool.execute(
        'tool-call-gh1',
        testCase.inputs.params,
      );
      testCase.assert(result);
    }
  });

  it('returns decode failures for invalid GitHub action input', async () => {
    const result = await createSubmitGitHubActionTool().execute(
      'tool-call-gh2',
      {
        request: {
          repoFullName: 'VannaDii/devplat',
        },
      },
    );

    expect(result.details).toMatchObject({ status: 'failed' });
  });

  it('rejects missing artifact payloads', async () => {
    const result = await createValidateArtifactTool().execute(
      'tool-call-9',
      {},
    );

    expect(result.details).toMatchObject({ status: 'failed' });
  });

  it('rejects invalid artifact envelopes', async () => {
    const result = await createValidateArtifactTool().execute('tool-call-10', {
      artifact: {},
    });

    expect(result.details).toMatchObject({ status: 'failed' });
  });

  it('validates well-formed artifact envelopes', async () => {
    const result = await createValidateArtifactTool().execute('tool-call-11', {
      artifact: {
        id: 'artifact-1',
        artifactType: 'review-finding',
        version: 1,
        summary: 'artifact',
        status: 'approved',
        trace: [],
        updatedAt: '2026-04-04T00:00:00.000Z',
        payload: {
          findingId: 'finding-1',
        },
      },
    });

    expect(result.details).toMatchObject({ artifactType: 'review-finding' });
  });

  it('validates and normalizes known artifact contracts', async () => {
    const result = await createValidateArtifactTool().execute('tool-call-11b', {
      artifact: {
        id: 'artifact-approval-1',
        artifactType: 'approval-record',
        version: 1,
        summary: ' Approve slice ',
        status: 'approved',
        trace: [],
        updatedAt: '2026-04-04T00:00:00.000Z',
        payload: {
          approvalId: ' approval-1 ',
          subjectType: 'slice',
          subjectId: ' slice-1 ',
          actorId: ' operator-1 ',
          decision: 'approved',
          rationale: ' Ready to proceed ',
        },
      },
    });

    expect(result.details).toMatchObject({
      artifactType: 'approval-record',
      summary: 'Approve slice',
      payload: {
        approvalId: 'approval-1',
        subjectId: 'slice-1',
        actorId: 'operator-1',
        rationale: 'Ready to proceed',
      },
    });
  });

  it('rejects malformed known artifact contracts', async () => {
    const result = await createValidateArtifactTool().execute('tool-call-11c', {
      artifact: {
        id: 'artifact-approval-2',
        artifactType: 'approval-record',
        version: 1,
        summary: 'Approve slice',
        status: 'approved',
        trace: [],
        updatedAt: '2026-04-04T00:00:00.000Z',
        payload: {
          approvalId: 'approval-2',
        },
      },
    });

    expect(result.details).toMatchObject({ status: 'failed' });
  });

  it('runs supervisor steps from valid tool input', async () => {
    const result = await createRunSupervisorStepTool().execute('tool-call-12', {
      action: 'retry-gates',
      actorId: 'operator-1',
      privileged: false,
      lifecycleSignals: [
        {
          phase: 'gates',
          ready: true,
          artifactIds: ['gate-run-1'],
          blockers: [],
          nextAction: 'review-findings',
        },
      ],
    });

    expect(result.details).toMatchObject({
      approved: true,
      nextState: 'approved',
      routePlan: {
        nextPhase: 'review',
        routedTo: 'review-findings-service',
      },
    });
  });

  it('returns decode failures for invalid supervisor input', async () => {
    const result = await createRunSupervisorStepTool().execute('tool-call-13', {
      action: 'retry-gates',
      actorId: 'operator-1',
    });

    expect(result.details).toMatchObject({ status: 'failed' });
  });
});
