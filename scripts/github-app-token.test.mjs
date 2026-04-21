import { generateKeyPairSync } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  createGitHubAppInstallationToken,
  createGitHubAppJwt,
  ensureLiveTestGitHubToken,
  resolveGitHubAppInstallationId,
} from './github-app-token.mjs';

const { privateKey: githubAppPrivateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: {
    format: 'pem',
    type: 'pkcs8',
  },
  publicKeyEncoding: {
    format: 'pem',
    type: 'spki',
  },
});

function decodeBase64UrlJson(value) {
  const normalizedValue = value
    .replaceAll('-', '+')
    .replaceAll('_', '/')
    .padEnd(Math.ceil(value.length / 4) * 4, '=');

  return JSON.parse(Buffer.from(normalizedValue, 'base64').toString('utf8'));
}

describe('github-app-token helpers', () => {
  const cases = [
    {
      name: 'creates a GitHub App JWT with the expected claims',
      inputs: {},
      mock: async () => undefined,
      assert: async () => {
        const now = Date.parse('2026-04-19T04:15:00.000Z');
        const jwt = createGitHubAppJwt({
          clientId: 'client-id-1',
          now,
          privateKey: githubAppPrivateKey,
        });
        const [headerSegment, payloadSegment, signatureSegment] =
          jwt.split('.');

        expect(decodeBase64UrlJson(headerSegment)).toEqual({
          alg: 'RS256',
          typ: 'JWT',
        });
        expect(decodeBase64UrlJson(payloadSegment)).toEqual({
          exp: Math.floor(now / 1_000) + 600,
          iat: Math.floor(now / 1_000) - 60,
          iss: 'client-id-1',
        });
        expect(signatureSegment.length).toBeGreaterThan(0);
      },
    },
    {
      name: 'normalizes single-line private keys copied from local env files',
      inputs: {},
      mock: async () => undefined,
      assert: async () => {
        const jwt = createGitHubAppJwt({
          clientId: 'client-id-2',
          privateKey: githubAppPrivateKey.replaceAll('\n', '\\n'),
        });

        expect(jwt.split('.')).toHaveLength(3);
      },
    },
    {
      name: 'resolves the organization installation without falling back to the user endpoint',
      inputs: {},
      mock: async () => {
        const calls = [];
        const fetchImpl = async (url, options) => {
          calls.push({
            headers: options.headers,
            method: options.method,
            url: String(url),
          });

          if (String(url).endsWith('/orgs/sandbox-org/installation')) {
            return {
              status: 200,
              text: async () => JSON.stringify({ id: 9001 }),
            };
          }

          throw new Error(`Unexpected fetch: ${String(url)}`);
        };

        return { calls, fetchImpl };
      },
      assert: async (context) => {
        await expect(
          resolveGitHubAppInstallationId({
            fetchImpl: context.fetchImpl,
            jwt: 'jwt-token-1',
            owner: 'sandbox-org',
          }),
        ).resolves.toBe(9001);

        expect(context.calls).toEqual([
          expect.objectContaining({
            method: 'GET',
            url: 'https://api.github.com/orgs/sandbox-org/installation',
          }),
        ]);
      },
    },
    {
      name: 'falls back to the user installation endpoint after an organization 404',
      inputs: {},
      mock: async () => {
        const calls = [];
        const fetchImpl = async (url, options) => {
          calls.push({
            headers: options.headers,
            method: options.method,
            url: String(url),
          });

          if (String(url).endsWith('/orgs/sandbox-user/installation')) {
            return {
              status: 404,
              text: async () => JSON.stringify({ message: 'Not Found' }),
            };
          }

          if (String(url).endsWith('/users/sandbox-user/installation')) {
            return {
              status: 200,
              text: async () => JSON.stringify({ id: 9002 }),
            };
          }

          throw new Error(`Unexpected fetch: ${String(url)}`);
        };

        return { calls, fetchImpl };
      },
      assert: async (context) => {
        await expect(
          resolveGitHubAppInstallationId({
            fetchImpl: context.fetchImpl,
            jwt: 'jwt-token-1',
            owner: 'sandbox-user',
          }),
        ).resolves.toBe(9002);

        expect(context.calls.map((call) => call.url)).toEqual([
          'https://api.github.com/orgs/sandbox-user/installation',
          'https://api.github.com/users/sandbox-user/installation',
        ]);
      },
    },
    {
      name: 'creates an installation token with explicit permissions',
      inputs: {},
      mock: async () => {
        const calls = [];
        const fetchImpl = async (url, options) => {
          calls.push({
            body:
              typeof options.body === 'string'
                ? JSON.parse(options.body)
                : undefined,
            method: options.method,
            url: String(url),
          });

          if (String(url).endsWith('/orgs/sandbox-org/installation')) {
            return {
              status: 200,
              text: async () => JSON.stringify({ id: 314 }),
            };
          }

          if (String(url).endsWith('/app/installations/314/access_tokens')) {
            return {
              status: 201,
              text: async () =>
                JSON.stringify({ token: 'installation-token-1' }),
            };
          }

          throw new Error(`Unexpected fetch: ${String(url)}`);
        };

        return { calls, fetchImpl };
      },
      assert: async (context) => {
        await expect(
          createGitHubAppInstallationToken({
            clientId: 'client-id-1',
            fetchImpl: context.fetchImpl,
            owner: 'sandbox-org',
            permissions: {
              administration: 'write',
              metadata: 'read',
            },
            privateKey: githubAppPrivateKey,
          }),
        ).resolves.toBe('installation-token-1');

        expect(context.calls).toEqual([
          {
            body: undefined,
            method: 'GET',
            url: 'https://api.github.com/orgs/sandbox-org/installation',
          },
          {
            body: {
              permissions: {
                administration: 'write',
                metadata: 'read',
              },
            },
            method: 'POST',
            url: 'https://api.github.com/app/installations/314/access_tokens',
          },
        ]);
      },
    },
    {
      name: 'returns an existing live-test token without making requests',
      inputs: {},
      mock: async () => {
        let fetchCalled = false;
        const fetchImpl = async () => {
          fetchCalled = true;
          throw new Error('fetch should not be called');
        };

        return { fetchCalled: () => fetchCalled, fetchImpl };
      },
      assert: async (context) => {
        const env = {
          LIVE_TEST_GITHUB_TOKEN: 'existing-token-1',
        };

        await expect(
          ensureLiveTestGitHubToken({
            env,
            fetchImpl: context.fetchImpl,
          }),
        ).resolves.toBe('existing-token-1');
        expect(context.fetchCalled()).toBe(false);
      },
    },
    {
      name: 'mints and stores a live-test token from GitHub App credentials',
      inputs: {},
      mock: async () => {
        const calls = [];
        const fetchImpl = async (url, options) => {
          calls.push({
            body:
              typeof options.body === 'string'
                ? JSON.parse(options.body)
                : undefined,
            method: options.method,
            url: String(url),
          });

          if (String(url).endsWith('/orgs/sandbox-org/installation')) {
            return {
              status: 200,
              text: async () => JSON.stringify({ id: 2718 }),
            };
          }

          if (String(url).endsWith('/app/installations/2718/access_tokens')) {
            return {
              status: 201,
              text: async () => JSON.stringify({ token: 'minted-token-1' }),
            };
          }

          throw new Error(`Unexpected fetch: ${String(url)}`);
        };

        return { calls, fetchImpl };
      },
      assert: async (context) => {
        const env = {
          LIVE_TEST_GITHUB_APP_CLIENT_ID: 'client-id-1',
          LIVE_TEST_GITHUB_APP_PRIVATE_KEY: githubAppPrivateKey,
          LIVE_TEST_GITHUB_ORG: 'sandbox-org',
        };

        await expect(
          ensureLiveTestGitHubToken({
            env,
            fetchImpl: context.fetchImpl,
            permissions: {
              contents: 'write',
            },
          }),
        ).resolves.toBe('minted-token-1');

        expect(env['LIVE_TEST_GITHUB_TOKEN']).toBe('minted-token-1');
        expect(context.calls).toEqual([
          {
            body: undefined,
            method: 'GET',
            url: 'https://api.github.com/orgs/sandbox-org/installation',
          },
          {
            body: {
              permissions: {
                contents: 'write',
              },
            },
            method: 'POST',
            url: 'https://api.github.com/app/installations/2718/access_tokens',
          },
        ]);
      },
    },
    {
      name: 'rejects missing bootstrap client identifiers',
      inputs: {},
      mock: async () => undefined,
      assert: async () => {
        await expect(
          ensureLiveTestGitHubToken({
            env: {
              LIVE_TEST_GITHUB_ORG: 'sandbox-org',
              LIVE_TEST_GITHUB_APP_PRIVATE_KEY: githubAppPrivateKey,
            },
          }),
        ).rejects.toThrow(
          'LIVE_TEST_GITHUB_TOKEN is not set and LIVE_TEST_GITHUB_APP_CLIENT_ID is missing.',
        );
      },
    },
    {
      name: 'rejects missing bootstrap owners',
      inputs: {},
      mock: async () => undefined,
      assert: async () => {
        await expect(
          ensureLiveTestGitHubToken({
            env: {
              LIVE_TEST_GITHUB_APP_CLIENT_ID: 'client-id-1',
              LIVE_TEST_GITHUB_APP_PRIVATE_KEY: githubAppPrivateKey,
            },
          }),
        ).rejects.toThrow(
          'LIVE_TEST_GITHUB_TOKEN is not set and LIVE_TEST_GITHUB_ORG is missing.',
        );
      },
    },
    {
      name: 'rejects missing bootstrap private keys',
      inputs: {},
      mock: async () => undefined,
      assert: async () => {
        await expect(
          ensureLiveTestGitHubToken({
            env: {
              LIVE_TEST_GITHUB_APP_CLIENT_ID: 'client-id-1',
              LIVE_TEST_GITHUB_ORG: 'sandbox-org',
            },
          }),
        ).rejects.toThrow(
          'LIVE_TEST_GITHUB_TOKEN is not set and LIVE_TEST_GITHUB_APP_PRIVATE_KEY is missing.',
        );
      },
    },
  ];

  it.each(cases)('$name', async (testCase) => {
    const context = (await testCase.mock()) ?? {};
    await testCase.assert(context, testCase.inputs);
  });
});
