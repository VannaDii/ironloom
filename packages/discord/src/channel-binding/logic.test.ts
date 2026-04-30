import { describe, expect, it } from 'vitest';

import {
  createDiscordChannelBinding,
  createDiscordThreadBindingResult,
  describeDiscordChannelBinding,
} from './logic.js';
import type { DiscordChannelBinding } from './types.js';

type DiscordChannelBindingLogicInputs =
  | {
      mode: 'bind';
      binding: DiscordChannelBinding;
      threadId: string;
      parentChannelId: string;
    }
  | {
      mode: 'create-fails';
      binding: DiscordChannelBinding;
      message: string;
    };

type DiscordChannelBindingLogicCase = {
  name: string;
  inputs: DiscordChannelBindingLogicInputs;
  mock: () => Record<string, never>;
  assert: (
    context: Record<string, never>,
    inputs: DiscordChannelBindingLogicInputs,
  ) => void;
};

describe('Discord channel binding logic', () => {
  const cases = [
    {
      name: 'normalizes channel bindings and derives deterministic routing keys',
      inputs: {
        mode: 'bind',
        binding: {
          id: 'binding-001',
          summary: '  Spec channel binding  ',
          status: 'approved',
          trace: [],
          updatedAt: '2026-04-04T00:00:00.000Z',
          guildId: 'guild-1',
          channelId: 'channel-spec',
          kind: 'spec',
          threadBindingMode: 'inherit-parent',
        },
        threadId: 'thread-1',
        parentChannelId: 'channel-spec',
      },
      mock: () => ({}),
      assert: (context, inputs) => {
        if (inputs.mode !== 'bind') {
          throw new Error('expected bind inputs');
        }

        const binding = createDiscordChannelBinding(inputs.binding);
        const result = createDiscordThreadBindingResult(
          binding,
          inputs.threadId,
          inputs.parentChannelId,
        );

        expect(binding.trace).toContain('discord:binding:spec:channel-spec');
        expect(result.routingKey).toBe('guild-1:spec:thread-1');
        expect(describeDiscordChannelBinding(binding)).toBe(
          'spec:guild-1:channel-spec',
        );
      },
    },
    {
      name: 'rejects thread bindings that do not inherit from the configured channel',
      inputs: {
        mode: 'bind',
        binding: {
          id: 'binding-002',
          summary: 'Implementation channel binding',
          status: 'approved',
          trace: [],
          updatedAt: '2026-04-04T00:00:00.000Z',
          guildId: 'guild-1',
          channelId: 'channel-impl',
          kind: 'implementation',
          threadBindingMode: 'inherit-parent',
        },
        threadId: 'thread-2',
        parentChannelId: 'channel-other',
      },
      mock: () => ({}),
      assert: (context, inputs) => {
        if (inputs.mode !== 'bind') {
          throw new Error('expected bind inputs');
        }

        const binding = createDiscordChannelBinding(inputs.binding);

        expect(() =>
          createDiscordThreadBindingResult(
            binding,
            inputs.threadId,
            inputs.parentChannelId,
          ),
        ).toThrow('inherit');
      },
    },
    {
      name: 'rejects bindings with empty identifiers',
      inputs: {
        mode: 'create-fails',
        binding: {
          id: 'binding-003',
          summary: 'Broken binding',
          status: 'approved',
          trace: [],
          updatedAt: '2026-04-04T00:00:00.000Z',
          guildId: ' ',
          channelId: 'channel-audit',
          kind: 'audit',
          threadBindingMode: 'inherit-parent',
        },
        message: 'guildId',
      },
      mock: () => ({}),
      assert: (context, inputs) => {
        if (inputs.mode !== 'create-fails') {
          throw new Error('expected create-fails inputs');
        }

        expect(() => createDiscordChannelBinding(inputs.binding)).toThrow(
          inputs.message,
        );
      },
    },
    {
      name: 'supports pull request channel bindings for review-thread routing',
      inputs: {
        mode: 'bind',
        binding: {
          id: 'binding-004',
          summary: 'Pull request binding',
          status: 'approved',
          trace: [],
          updatedAt: '2026-04-04T00:00:00.000Z',
          guildId: 'guild-1',
          channelId: 'channel-pr',
          kind: 'pull-request',
          threadBindingMode: 'inherit-parent',
        },
        threadId: 'thread-pr-1',
        parentChannelId: 'channel-pr',
      },
      mock: () => ({}),
      assert: (context, inputs) => {
        if (inputs.mode !== 'bind') {
          throw new Error('expected bind inputs');
        }

        const binding = createDiscordChannelBinding(inputs.binding);
        const result = createDiscordThreadBindingResult(
          binding,
          inputs.threadId,
          inputs.parentChannelId,
        );

        expect(result.routingKey).toBe('guild-1:pull-request:thread-pr-1');
      },
    },
  ] satisfies DiscordChannelBindingLogicCase[];

  for (const testCase of cases) {
    it(testCase.name, () => {
      expect.hasAssertions();
      const context = testCase.mock();

      testCase.assert(context, testCase.inputs);
    });
  }
});
