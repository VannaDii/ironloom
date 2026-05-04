import { describe, expect, it } from 'vitest';

import { decodeWithCodec } from '@vannadii/devplat-core';

import { DiscordThreadSessionCodec } from './codec.js';

describe('discord thread session codec', () => {
  const cases = [
    {
      name: 'decode valid thread sessions including pull request sessions',
      inputs: {
        values: [
          {
            id: 'thread-session-1',
            summary: 'Spec thread',
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
          {
            id: 'thread-session-2',
            summary: 'Pull request thread',
            status: 'review',
            trace: [],
            updatedAt: '2026-04-04T00:00:00.000Z',
            guildId: 'guild-1',
            channelId: 'thread-2',
            parentChannelId: 'channel-pr',
            threadId: 'thread-2',
            kind: 'pull-request',
            specId: null,
            sliceId: null,
            pullRequestNumber: 12,
            artifactId: 'artifact-2',
          },
        ],
      },
      mock: async ({ values }) =>
        values.map((value) =>
          decodeWithCodec(DiscordThreadSessionCodec, value),
        ),
      assert: (decodedValues) => {
        expect(decodedValues.every((decoded) => decoded.ok)).toBe(true);
      },
    },
    {
      name: 'reject pull request sessions with invalid pull request numbers',
      inputs: {
        values: [0, -1, 1.5].map((pullRequestNumber, index) => ({
          id: `thread-session-invalid-${index + 1}`,
          summary: 'Pull request thread',
          status: 'review',
          trace: [],
          updatedAt: '2026-04-04T00:00:00.000Z',
          guildId: 'guild-1',
          channelId: 'thread-invalid',
          parentChannelId: 'channel-pr',
          threadId: 'thread-invalid',
          kind: 'pull-request',
          specId: null,
          sliceId: null,
          pullRequestNumber,
          artifactId: `artifact-invalid-${index + 1}`,
        })),
      },
      mock: async ({ values }) =>
        values.map((value) =>
          decodeWithCodec(DiscordThreadSessionCodec, value),
        ),
      assert: (decodedValues) => {
        expect(decodedValues.every((decoded) => !decoded.ok)).toBe(true);
      },
    },
    {
      name: 'reject thread sessions with invalid lifecycle timestamps',
      inputs: {
        values: [
          {
            id: 'thread-session-invalid-timestamp',
            summary: 'Spec thread',
            status: 'approved',
            trace: [],
            updatedAt: '2026-04-04',
            guildId: 'guild-1',
            channelId: 'thread-invalid-timestamp',
            parentChannelId: 'channel-spec',
            threadId: 'thread-invalid-timestamp',
            kind: 'spec',
            specId: 'spec-1',
            sliceId: null,
            pullRequestNumber: null,
            artifactId: 'artifact-invalid-timestamp',
          },
        ],
      },
      mock: async ({ values }) =>
        values.map((value) =>
          decodeWithCodec(DiscordThreadSessionCodec, value),
        ),
      assert: (decodedValues) => {
        expect(decodedValues.every((decoded) => !decoded.ok)).toBe(true);
      },
    },
    {
      name: 'reject thread sessions whose kind-specific fields do not match',
      inputs: {
        values: [
          {
            id: 'thread-session-invalid-combo-1',
            summary: 'Spec thread with pull request number',
            status: 'approved',
            trace: [],
            updatedAt: '2026-04-04T00:00:00.000Z',
            guildId: 'guild-1',
            channelId: 'thread-invalid-combo-1',
            parentChannelId: 'channel-spec',
            threadId: 'thread-invalid-combo-1',
            kind: 'spec',
            specId: 'spec-1',
            sliceId: null,
            pullRequestNumber: 12,
            artifactId: 'artifact-invalid-combo-1',
          },
          {
            id: 'thread-session-invalid-combo-2',
            summary: 'Implementation thread without slice',
            status: 'running',
            trace: [],
            updatedAt: '2026-04-04T00:00:00.000Z',
            guildId: 'guild-1',
            channelId: 'thread-invalid-combo-2',
            parentChannelId: 'channel-impl',
            threadId: 'thread-invalid-combo-2',
            kind: 'implementation',
            specId: 'spec-1',
            sliceId: null,
            pullRequestNumber: null,
            artifactId: 'artifact-invalid-combo-2',
          },
          {
            id: 'thread-session-invalid-combo-3',
            summary: 'Pull request thread without pull request number',
            status: 'review',
            trace: [],
            updatedAt: '2026-04-04T00:00:00.000Z',
            guildId: 'guild-1',
            channelId: 'thread-invalid-combo-3',
            parentChannelId: 'channel-pr',
            threadId: 'thread-invalid-combo-3',
            kind: 'pull-request',
            specId: null,
            sliceId: null,
            pullRequestNumber: null,
            artifactId: 'artifact-invalid-combo-3',
          },
        ],
      },
      mock: async ({ values }) =>
        values.map((value) =>
          decodeWithCodec(DiscordThreadSessionCodec, value),
        ),
      assert: (decodedValues) => {
        expect(decodedValues.every((decoded) => !decoded.ok)).toBe(true);
      },
    },
    {
      name: 'expose consistent is and encode behavior for pull request numbers',
      inputs: {
        validValue: {
          id: 'thread-session-3',
          summary: 'Pull request thread',
          status: 'review',
          trace: [],
          updatedAt: '2026-04-04T00:00:00.000Z',
          guildId: 'guild-1',
          channelId: 'thread-3',
          parentChannelId: 'channel-pr',
          threadId: 'thread-3',
          kind: 'pull-request',
          specId: null,
          sliceId: null,
          pullRequestNumber: 12,
          artifactId: 'artifact-3',
        },
        invalidValue: {
          id: 'thread-session-4',
          summary: 'Pull request thread',
          status: 'review',
          trace: [],
          updatedAt: '2026-04-04T00:00:00.000Z',
          guildId: 'guild-1',
          channelId: 'thread-4',
          parentChannelId: 'channel-pr',
          threadId: 'thread-4',
          kind: 'pull-request',
          specId: null,
          sliceId: null,
          pullRequestNumber: 1.5,
          artifactId: 'artifact-4',
        },
      },
      mock: async ({ validValue, invalidValue }) => ({
        valid: DiscordThreadSessionCodec.is(validValue),
        invalid: DiscordThreadSessionCodec.is(invalidValue),
        encoded: DiscordThreadSessionCodec.encode(validValue),
      }),
      assert: (outcome) => {
        expect(outcome.valid).toBe(true);
        expect(outcome.invalid).toBe(false);
        expect(outcome.encoded.pullRequestNumber).toBe(12);
      },
    },
  ];

  it.each(cases)('$name', async (testCase) => {
    const outcome = await testCase.mock(testCase.inputs);
    testCase.assert(outcome);
  });
});
