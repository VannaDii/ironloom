import { describe, expect, it } from 'vitest';

import {
  DISCORD_BASE64URL_MARKER_PATTERN,
  DISCORD_COMPONENT_CUSTOM_ID_PREFIX,
  DISCORD_CUSTOM_ID_MAX_LENGTH,
  DISCORD_EPHEMERAL_MESSAGE_FLAG,
  DISCORD_MILLISECONDS_PER_SECOND,
  DISCORD_MESSAGE_CONTENT_MAX_LENGTH,
  DISCORD_MESSAGE_CONTENT_TRUNCATED_MARKER,
  DISCORD_PROJECT_CONFIG_VERSION_PATTERN,
  DISCORD_SUMMARY_MARKER_TOKEN_PATTERN,
  DISCORD_REST_SUCCESS_MAX_EXCLUSIVE_STATUS,
  DISCORD_REST_SUCCESS_MIN_STATUS,
} from './constants.js';

type DiscordControlPlaneConstantsCase = {
  name: string;
  inputs: {
    prefix: string;
    ephemeralFlag: number;
    maxMessageLength: number;
    truncatedMarker: string;
    maxCustomIdLength: number;
    millisecondsPerSecond: number;
    successMin: number;
    successMaxExclusive: number;
    projectConfigVersionPattern: RegExp;
    base64urlMarkerPattern: RegExp;
    summaryMarkerTokenPattern: RegExp;
  };
  mock: () => Record<string, never>;
  assert: (
    context: Record<string, never>,
    inputs: DiscordControlPlaneConstantsCase['inputs'],
  ) => void;
};

describe('discord control-plane constants', () => {
  const cases = [
    {
      name: 'exports stable protocol bounds and wire defaults',
      inputs: {
        prefix: DISCORD_COMPONENT_CUSTOM_ID_PREFIX,
        ephemeralFlag: DISCORD_EPHEMERAL_MESSAGE_FLAG,
        maxMessageLength: DISCORD_MESSAGE_CONTENT_MAX_LENGTH,
        truncatedMarker: DISCORD_MESSAGE_CONTENT_TRUNCATED_MARKER,
        maxCustomIdLength: DISCORD_CUSTOM_ID_MAX_LENGTH,
        millisecondsPerSecond: DISCORD_MILLISECONDS_PER_SECOND,
        successMin: DISCORD_REST_SUCCESS_MIN_STATUS,
        successMaxExclusive: DISCORD_REST_SUCCESS_MAX_EXCLUSIVE_STATUS,
        projectConfigVersionPattern: DISCORD_PROJECT_CONFIG_VERSION_PATTERN,
        base64urlMarkerPattern: DISCORD_BASE64URL_MARKER_PATTERN,
        summaryMarkerTokenPattern: DISCORD_SUMMARY_MARKER_TOKEN_PATTERN,
      },
      mock: () => ({}),
      assert: (context, inputs) => {
        expect(inputs.prefix).toBe('devplat:v1');
        expect(inputs.ephemeralFlag).toBe(64);
        expect(inputs.maxMessageLength).toBe(2000);
        expect(inputs.truncatedMarker).toBe('(content truncated)');
        expect(inputs.maxCustomIdLength).toBe(100);
        expect(inputs.millisecondsPerSecond).toBe(1000);
        expect(inputs.successMin).toBe(200);
        expect(inputs.successMaxExclusive).toBe(300);
        expect(inputs.projectConfigVersionPattern.test('v9')).toBe(true);
        expect(inputs.projectConfigVersionPattern.test('v1junk')).toBe(false);
        expect(inputs.base64urlMarkerPattern.test('aHR0cHM6Ly8')).toBe(true);
        expect(inputs.base64urlMarkerPattern.test('invalid+/token')).toBe(
          false,
        );
        expect(
          '(repo:devplat) (project:alpha)'.match(
            inputs.summaryMarkerTokenPattern,
          ),
        ).toEqual(['(repo:devplat)', '(project:alpha)']);
      },
    },
  ] satisfies DiscordControlPlaneConstantsCase[];

  it.each(cases)('$name', (testCase) => {
    expect.hasAssertions();
    const context = testCase.mock();

    testCase.assert(context, testCase.inputs);
  });
});
