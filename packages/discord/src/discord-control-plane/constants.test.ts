import { describe, expect, it } from 'vitest';

import {
  DISCORD_SUMMARY_CONFIG_VERSION_PATTERN,
  DISCORD_SUMMARY_INTENT_PATTERN,
} from './constants.js';

type DiscordControlPlaneConstantsCase = {
  name: string;
  inputs: {
    valid: readonly string[];
    invalid: readonly string[];
  };
  mock: () => {
    readonly intentPattern: RegExp;
    readonly configVersionPattern: RegExp;
  };
  assert: (
    context: {
      readonly intentPattern: RegExp;
      readonly configVersionPattern: RegExp;
    },
    inputs: {
      readonly valid: readonly string[];
      readonly invalid: readonly string[];
    },
  ) => void;
};

describe('discord control-plane constants', () => {
  const cases = [
    {
      name: 'matches valid summary metadata markers',
      inputs: {
        valid: [
          '(intent:maintenance)',
          '(intent:bugfix)',
          '(intent:new-feature)',
          '(config-version:v7)',
          '(config-version:2026.05.24)',
        ],
        invalid: ['intent:maintenance', '(intent:)', '(config-version:)'],
      },
      mock: () => ({
        intentPattern: DISCORD_SUMMARY_INTENT_PATTERN,
        configVersionPattern: DISCORD_SUMMARY_CONFIG_VERSION_PATTERN,
      }),
      assert: (context, inputs) => {
        expect(
          context.intentPattern.exec(inputs.valid[0] ?? ''),
        ).not.toBeNull();
        expect(
          context.intentPattern.exec(inputs.valid[1] ?? ''),
        ).not.toBeNull();
        expect(
          context.intentPattern.exec(inputs.valid[2] ?? ''),
        ).not.toBeNull();
        expect(
          context.configVersionPattern.exec(inputs.valid[3] ?? ''),
        ).not.toBeNull();
        expect(
          context.configVersionPattern.exec(inputs.valid[4] ?? ''),
        ).not.toBeNull();

        expect(context.intentPattern.exec(inputs.invalid[0] ?? '')).toBeNull();
        expect(context.intentPattern.exec(inputs.invalid[1] ?? '')).toBeNull();
        expect(
          context.configVersionPattern.exec(inputs.invalid[2] ?? ''),
        ).toBeNull();
      },
    },
  ] satisfies DiscordControlPlaneConstantsCase[];

  it.each(cases)('$name', (testCase) => {
    expect.hasAssertions();
    const context = testCase.mock();

    testCase.assert(context, testCase.inputs);
  });
});
