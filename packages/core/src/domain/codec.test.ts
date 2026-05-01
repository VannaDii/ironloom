import { describe, expect, it } from 'vitest';

import {
  DevplatErrorCodec,
  DevplatIdCodec,
  GitBranchNameCodec,
  IsoTimestampCodec,
  RepositoryKeyCodec,
} from './codec.js';
import { decodeWithCodec } from './service.js';

describe('domain codecs', () => {
  const cases = [
    {
      name: 'accepts normalized value objects',
      inputs: {
        id: 'devplat-1',
        repositoryKey: 'VannaDii/devplat',
        timestamp: '2026-04-04T00:00:00.000Z',
      },
      mock: () => undefined,
      assert: (inputs: {
        id: string;
        repositoryKey: string;
        timestamp: string;
      }) => {
        expect(decodeWithCodec(DevplatIdCodec, inputs.id).ok).toBe(true);
        expect(
          decodeWithCodec(RepositoryKeyCodec, inputs.repositoryKey).ok,
        ).toBe(true);
        expect(decodeWithCodec(IsoTimestampCodec, inputs.timestamp).ok).toBe(
          true,
        );
      },
    },
    {
      name: 'rejects unnormalized or invalid value objects',
      inputs: {
        id: ' devplat-1 ',
        repositoryKey: 'VannaDii/devplat/extra',
        timestamp: 'not-a-date',
      },
      mock: () => undefined,
      assert: (inputs: {
        id: string;
        repositoryKey: string;
        timestamp: string;
      }) => {
        expect(decodeWithCodec(DevplatIdCodec, inputs.id).ok).toBe(false);
        expect(
          decodeWithCodec(RepositoryKeyCodec, inputs.repositoryKey).ok,
        ).toBe(false);
        expect(decodeWithCodec(IsoTimestampCodec, inputs.timestamp).ok).toBe(
          false,
        );
      },
    },
    {
      name: 'accepts and normalizes Git branch names at decode boundaries',
      inputs: {
        branchName: ' feature/full-autonomy-runtime ',
      },
      mock: () => undefined,
      assert: (inputs: { branchName: string }) => {
        const decoded = decodeWithCodec(GitBranchNameCodec, inputs.branchName);

        expect(decoded).toMatchObject({
          ok: true,
          value: 'feature/full-autonomy-runtime',
        });
        expect(GitBranchNameCodec.is('feature/full-autonomy-runtime')).toBe(
          true,
        );
        expect(IsoTimestampCodec.is('2026-04-04T00:00:00.000Z')).toBe(true);
      },
    },
    {
      name: 'rejects non-string branch and timestamp values',
      inputs: {
        branchName: 42,
        timestamp: 42,
      },
      mock: () => undefined,
      assert: (inputs: { branchName: number; timestamp: number }) => {
        expect(decodeWithCodec(GitBranchNameCodec, inputs.branchName).ok).toBe(
          false,
        );
        expect(decodeWithCodec(IsoTimestampCodec, inputs.timestamp).ok).toBe(
          false,
        );
      },
    },
    {
      name: 'accepts structured platform error classification metadata',
      inputs: {
        error: {
          kind: 'execution',
          message: 'gate failed',
          retryable: true,
          details: {},
          code: 'gate.command_failed',
          severity: 'warning',
          source: 'gates',
        },
      },
      mock: () => undefined,
      assert: (inputs: {
        error: Parameters<typeof DevplatErrorCodec.decode>[0];
      }) => {
        expect(decodeWithCodec(DevplatErrorCodec, inputs.error).ok).toBe(true);
      },
    },
  ];

  it.each(cases)('$name', (testCase) => {
    expect.hasAssertions();
    testCase.mock();
    testCase.assert(testCase.inputs);
  });
});
