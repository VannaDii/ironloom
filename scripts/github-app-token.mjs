import { createPrivateKey, createSign } from 'node:crypto';

const githubApiVersion = '2026-03-10';

function encodeBase64Url(value) {
  return Buffer.from(value)
    .toString('base64')
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
}

function createRequestError(message, status, responseText) {
  const statusFragment = ` (HTTP ${String(status)})`;
  const responseFragment = responseText.length > 0 ? `: ${responseText}` : '.';
  const error = new Error(`${message}${statusFragment}${responseFragment}`);
  error.status = status;
  error.responseText = responseText;
  return error;
}

async function requestGitHubJson({
  authorization,
  body,
  expectedStatuses = [200],
  fetchImpl = fetch,
  method = 'GET',
  path,
}) {
  const headers = {
    accept: 'application/vnd.github+json',
    authorization,
    'x-github-api-version': githubApiVersion,
  };
  const requestBody =
    body === undefined
      ? undefined
      : (() => {
          headers['content-type'] = 'application/json';
          return JSON.stringify(body);
        })();
  const url = new URL(path, 'https://api.github.com').toString();
  const response = await fetchImpl(url, {
    body: requestBody,
    headers,
    method,
  });
  const responseText = await response.text();

  if (!expectedStatuses.includes(response.status)) {
    throw createRequestError(
      `Request to ${url} failed`,
      response.status,
      responseText,
    );
  }

  if (responseText.length === 0) {
    return null;
  }

  return JSON.parse(responseText);
}

function isNotFoundError(error) {
  return error instanceof Error && error.message.includes('(HTTP 404)');
}

function normalizePrivateKey(privateKey) {
  return privateKey.trim().replaceAll('\r\n', '\n').replaceAll('\\n', '\n');
}

export function createGitHubAppJwt({ clientId, now = Date.now(), privateKey }) {
  const header = {
    alg: 'RS256',
    typ: 'JWT',
  };
  const payload = {
    exp: Math.floor(now / 1_000) + 600,
    iat: Math.floor(now / 1_000) - 60,
    iss: clientId,
  };
  const encodedHeader = encodeBase64Url(JSON.stringify(header));
  const encodedPayload = encodeBase64Url(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = createSign('RSA-SHA256')
    .update(signingInput)
    .end()
    .sign(createPrivateKey(normalizePrivateKey(privateKey)));

  return `${signingInput}.${encodeBase64Url(signature)}`;
}

export async function resolveGitHubAppInstallationId({
  fetchImpl = fetch,
  jwt,
  owner,
}) {
  try {
    const installation = await requestGitHubJson({
      authorization: `Bearer ${jwt}`,
      fetchImpl,
      path: `/orgs/${encodeURIComponent(owner)}/installation`,
    });
    return installation.id;
  } catch (error) {
    if (!isNotFoundError(error)) {
      throw error;
    }
  }

  const installation = await requestGitHubJson({
    authorization: `Bearer ${jwt}`,
    fetchImpl,
    path: `/users/${encodeURIComponent(owner)}/installation`,
  });
  return installation.id;
}

export async function createGitHubAppInstallationToken({
  clientId,
  fetchImpl = fetch,
  owner,
  permissions,
  privateKey,
}) {
  const jwt = createGitHubAppJwt({
    clientId,
    privateKey,
  });
  const installationId = await resolveGitHubAppInstallationId({
    fetchImpl,
    jwt,
    owner,
  });
  const response = await requestGitHubJson({
    authorization: `Bearer ${jwt}`,
    body: permissions === undefined ? undefined : { permissions },
    expectedStatuses: [201],
    fetchImpl,
    method: 'POST',
    path: `/app/installations/${String(installationId)}/access_tokens`,
  });

  if (typeof response?.token !== 'string' || response.token.length === 0) {
    throw new Error(
      'GitHub App installation token response did not include a token.',
    );
  }

  return response.token;
}

export async function ensureLiveTestGitHubToken({
  env = process.env,
  fetchImpl = fetch,
  permissions,
}) {
  const existingToken = env['LIVE_TEST_GITHUB_TOKEN'];
  if (typeof existingToken === 'string' && existingToken.length > 0) {
    return existingToken;
  }

  const clientId = env['LIVE_TEST_GITHUB_APP_CLIENT_ID'];
  if (typeof clientId !== 'string' || clientId.length === 0) {
    throw new Error(
      'LIVE_TEST_GITHUB_TOKEN is not set and LIVE_TEST_GITHUB_APP_CLIENT_ID is missing.',
    );
  }

  const owner = env['LIVE_TEST_GITHUB_ORG'];
  if (typeof owner !== 'string' || owner.length === 0) {
    throw new Error(
      'LIVE_TEST_GITHUB_TOKEN is not set and LIVE_TEST_GITHUB_ORG is missing.',
    );
  }

  const privateKey = env['LIVE_TEST_GITHUB_APP_PRIVATE_KEY'];
  if (typeof privateKey !== 'string' || privateKey.length === 0) {
    throw new Error(
      'LIVE_TEST_GITHUB_TOKEN is not set and LIVE_TEST_GITHUB_APP_PRIVATE_KEY is missing.',
    );
  }

  const token = await createGitHubAppInstallationToken({
    clientId,
    fetchImpl,
    owner,
    permissions,
    privateKey,
  });
  env['LIVE_TEST_GITHUB_TOKEN'] = token;
  return token;
}
