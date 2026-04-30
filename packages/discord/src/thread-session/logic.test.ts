import { describe, expect, it } from 'vitest';

import {
  createDiscordThreadSession,
  describeDiscordThreadSession,
} from './logic.js';
import type { DiscordThreadSessionInput } from './types.js';

type DiscordThreadSessionLogicInputs =
  | {
      mode: 'create';
      session: DiscordThreadSessionInput;
      traceMarker: string;
      descriptionFragment?: string;
    }
  | {
      mode: 'reject';
      sessions: {
        session: DiscordThreadSessionInput;
        message: string;
      }[];
    };

type DiscordThreadSessionLogicCase = {
  name: string;
  inputs: DiscordThreadSessionLogicInputs;
  mock: () => Record<string, never>;
  assert: (
    context: Record<string, never>,
    inputs: DiscordThreadSessionLogicInputs,
  ) => void;
};

describe('Discord thread session logic', () => {
  const cases = [
    {
      name: 'normalizes spec thread sessions and appends a trace marker',
      inputs: {
        mode: 'create',
        session: {
          id: 'thread-session-001',
          summary: '  Spec thread  ',
          status: 'approved',
          trace: [],
          updatedAt: '2026-04-04T00:00:00.000Z',
          guildId: 'guild-1',
          channelId: 'thread-1',
          parentChannelId: 'channel-spec',
          threadId: 'thread-1',
          kind: 'spec',
          specId: 'spec-1',
          sliceId: null,
          pullRequestNumber: null,
          artifactId: 'artifact-1',
        },
        traceMarker: 'discord:thread:spec:thread-1',
        descriptionFragment: 'spec:thread-1',
      },
      mock: () => ({}),
      assert: (context, inputs) => {
        if (inputs.mode !== 'create') {
          throw new Error('expected create inputs');
        }

        const session = createDiscordThreadSession(inputs.session);

        expect(session.trace).toContain(inputs.traceMarker);
        if (inputs.descriptionFragment !== undefined) {
          expect(describeDiscordThreadSession(session)).toContain(
            inputs.descriptionFragment,
          );
        }
      },
    },
    {
      name: 'rejects invalid implementation thread payloads',
      inputs: {
        mode: 'reject',
        sessions: [
          {
            session: {
              id: 'thread-session-002',
              summary: 'Implementation thread',
              status: 'running',
              trace: [],
              updatedAt: '2026-04-04T00:00:00.000Z',
              guildId: 'guild-1',
              channelId: 'thread-2',
              parentChannelId: 'channel-impl',
              threadId: 'thread-2',
              kind: 'implementation',
              specId: 'spec-1',
              sliceId: null,
              pullRequestNumber: null,
              artifactId: 'artifact-2',
            },
            message: 'sliceId',
          },
          {
            session: {
              id: 'thread-session-002b',
              summary: 'Implementation thread with pull request number',
              status: 'running',
              trace: [],
              updatedAt: '2026-04-04T00:00:00.000Z',
              guildId: 'guild-1',
              channelId: 'thread-2b',
              parentChannelId: 'channel-impl',
              threadId: 'thread-2b',
              kind: 'implementation',
              specId: 'spec-1',
              sliceId: 'slice-1',
              pullRequestNumber: 7,
              artifactId: 'artifact-2b',
            },
            message: 'Only pull request threads',
          },
        ],
      },
      mock: () => ({}),
      assert: (context, inputs) => {
        if (inputs.mode !== 'reject') {
          throw new Error('expected reject inputs');
        }

        for (const rejection of inputs.sessions) {
          expect(() => createDiscordThreadSession(rejection.session)).toThrow(
            rejection.message,
          );
        }
      },
    },
    {
      name: 'rejects spec threads that carry implementation slice identifiers',
      inputs: {
        mode: 'reject',
        sessions: [
          {
            session: {
              id: 'thread-session-003',
              summary: 'Spec thread with slice',
              status: 'approved',
              trace: [],
              updatedAt: '2026-04-04T00:00:00.000Z',
              guildId: 'guild-1',
              channelId: 'thread-3',
              parentChannelId: 'channel-spec',
              threadId: 'thread-3',
              kind: 'spec',
              specId: 'spec-1',
              sliceId: 'slice-1',
              pullRequestNumber: null,
              artifactId: 'artifact-3',
            },
            message: 'implementation slices',
          },
        ],
      },
      mock: () => ({}),
      assert: (context, inputs) => {
        if (inputs.mode !== 'reject') {
          throw new Error('expected reject inputs');
        }

        for (const rejection of inputs.sessions) {
          expect(() => createDiscordThreadSession(rejection.session)).toThrow(
            rejection.message,
          );
        }
      },
    },
    {
      name: 'rejects spec threads that are missing a spec identifier',
      inputs: {
        mode: 'reject',
        sessions: [
          {
            session: {
              id: 'thread-session-003b',
              summary: 'Spec thread without spec id',
              status: 'approved',
              trace: [],
              updatedAt: '2026-04-04T00:00:00.000Z',
              guildId: 'guild-1',
              channelId: 'thread-3b',
              parentChannelId: 'channel-spec',
              threadId: 'thread-3b',
              kind: 'spec',
              specId: null,
              sliceId: null,
              pullRequestNumber: null,
              artifactId: 'artifact-3b',
            },
            message: 'specId',
          },
        ],
      },
      mock: () => ({}),
      assert: (context, inputs) => {
        if (inputs.mode !== 'reject') {
          throw new Error('expected reject inputs');
        }

        for (const rejection of inputs.sessions) {
          expect(() => createDiscordThreadSession(rejection.session)).toThrow(
            rejection.message,
          );
        }
      },
    },
    {
      name: 'accepts implementation threads and rejects empty identifiers',
      inputs: {
        mode: 'reject',
        sessions: [
          {
            session: {
              id: 'thread-session-005',
              summary: 'Implementation thread',
              status: 'running',
              trace: [],
              updatedAt: '2026-04-04T00:00:00.000Z',
              guildId: ' ',
              channelId: 'thread-4',
              parentChannelId: 'channel-impl',
              threadId: 'thread-4',
              kind: 'implementation',
              specId: 'spec-1',
              sliceId: 'slice-1',
              pullRequestNumber: null,
              artifactId: 'artifact-4',
            },
            message: 'guildId',
          },
        ],
      },
      mock: () => ({}),
      assert: (context, inputs) => {
        const session = createDiscordThreadSession({
          id: 'thread-session-004',
          summary: 'Implementation thread',
          status: 'running',
          trace: [],
          updatedAt: '2026-04-04T00:00:00.000Z',
          guildId: 'guild-1',
          channelId: 'thread-4',
          parentChannelId: 'channel-impl',
          threadId: 'thread-4',
          kind: 'implementation',
          specId: 'spec-1',
          sliceId: 'slice-1',
          pullRequestNumber: null,
          artifactId: 'artifact-4',
        });

        expect(session.trace).toContain(
          'discord:thread:implementation:thread-4',
        );

        if (inputs.mode !== 'reject') {
          throw new Error('expected reject inputs');
        }

        for (const rejection of inputs.sessions) {
          expect(() => createDiscordThreadSession(rejection.session)).toThrow(
            rejection.message,
          );
        }
      },
    },
    {
      name: 'accepts pull request threads and requires a pull request number',
      inputs: {
        mode: 'reject',
        sessions: [
          {
            session: {
              id: 'thread-session-007',
              summary: 'Pull request thread',
              status: 'review',
              trace: [],
              updatedAt: '2026-04-04T00:00:00.000Z',
              guildId: 'guild-1',
              channelId: 'thread-6',
              parentChannelId: 'channel-pr',
              threadId: 'thread-6',
              kind: 'pull-request',
              specId: null,
              sliceId: null,
              pullRequestNumber: null,
              artifactId: 'artifact-6',
            },
            message: 'pullRequestNumber',
          },
          {
            session: {
              id: 'thread-session-008',
              summary: 'Pull request thread',
              status: 'review',
              trace: [],
              updatedAt: '2026-04-04T00:00:00.000Z',
              guildId: 'guild-1',
              channelId: 'thread-6',
              parentChannelId: 'channel-pr',
              threadId: 'thread-6',
              kind: 'spec',
              specId: 'spec-6',
              sliceId: null,
              pullRequestNumber: 12,
              artifactId: 'artifact-6',
            },
            message: 'Only pull request threads',
          },
        ],
      },
      mock: () => ({}),
      assert: (context, inputs) => {
        const session = createDiscordThreadSession({
          id: 'thread-session-006',
          summary: 'Pull request thread',
          status: 'review',
          trace: [],
          updatedAt: '2026-04-04T00:00:00.000Z',
          guildId: 'guild-1',
          channelId: 'thread-6',
          parentChannelId: 'channel-pr',
          threadId: 'thread-6',
          kind: 'pull-request',
          specId: null,
          sliceId: null,
          pullRequestNumber: 12,
          artifactId: 'artifact-6',
        });

        expect(session.trace).toContain('discord:thread:pull-request:thread-6');

        if (inputs.mode !== 'reject') {
          throw new Error('expected reject inputs');
        }

        for (const rejection of inputs.sessions) {
          expect(() => createDiscordThreadSession(rejection.session)).toThrow(
            rejection.message,
          );
        }
      },
    },
    {
      name: 'rejects pull request threads with non-positive or non-integer numbers',
      inputs: {
        mode: 'reject',
        sessions: [
          {
            session: {
              id: 'thread-session-invalid-pr-1',
              summary: 'Pull request thread',
              status: 'review',
              trace: [],
              updatedAt: '2026-04-04T00:00:00.000Z',
              guildId: 'guild-1',
              channelId: 'thread-invalid-pr',
              parentChannelId: 'channel-pr',
              threadId: 'thread-invalid-pr',
              kind: 'pull-request',
              specId: null,
              sliceId: null,
              pullRequestNumber: 0,
              artifactId: 'artifact-invalid-pr-1',
            },
            message: 'positive integer',
          },
          {
            session: {
              id: 'thread-session-invalid-pr-2',
              summary: 'Pull request thread',
              status: 'review',
              trace: [],
              updatedAt: '2026-04-04T00:00:00.000Z',
              guildId: 'guild-1',
              channelId: 'thread-invalid-pr',
              parentChannelId: 'channel-pr',
              threadId: 'thread-invalid-pr',
              kind: 'pull-request',
              specId: null,
              sliceId: null,
              pullRequestNumber: -1,
              artifactId: 'artifact-invalid-pr-2',
            },
            message: 'positive integer',
          },
          {
            session: {
              id: 'thread-session-invalid-pr-3',
              summary: 'Pull request thread',
              status: 'review',
              trace: [],
              updatedAt: '2026-04-04T00:00:00.000Z',
              guildId: 'guild-1',
              channelId: 'thread-invalid-pr',
              parentChannelId: 'channel-pr',
              threadId: 'thread-invalid-pr',
              kind: 'pull-request',
              specId: null,
              sliceId: null,
              pullRequestNumber: 1.5,
              artifactId: 'artifact-invalid-pr-3',
            },
            message: 'positive integer',
          },
        ],
      },
      mock: () => ({}),
      assert: (context, inputs) => {
        if (inputs.mode !== 'reject') {
          throw new Error('expected reject inputs');
        }

        for (const rejection of inputs.sessions) {
          expect(() => createDiscordThreadSession(rejection.session)).toThrow(
            rejection.message,
          );
        }
      },
    },
  ] satisfies DiscordThreadSessionLogicCase[];

  for (const testCase of cases) {
    it(testCase.name, () => {
      expect.hasAssertions();
      const context = testCase.mock();

      testCase.assert(context, testCase.inputs);
    });
  }
});
