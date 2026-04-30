import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { SonarBootstrapVerificationService } from '../packages/sonarcloud/src/index.ts';

function parsePropertiesFile(content: string): Map<string, string> {
  const entries = content
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'))
    .map((line) => {
      const separatorIndex = line.indexOf('=');
      if (separatorIndex === -1) {
        throw new Error(`Invalid sonar-project.properties line: ${line}`);
      }

      const entry: readonly [string, string] = [
        line.slice(0, separatorIndex).trim(),
        line.slice(separatorIndex + 1).trim(),
      ];

      return entry;
    });

  return new Map(entries);
}

function readRequiredProperty(
  properties: Map<string, string>,
  key: string,
): string {
  const value = properties.get(key);
  if (value === undefined || value.length === 0) {
    throw new Error(`Missing required Sonar property: ${key}`);
  }

  return value;
}

function resolveSonarBaseUrl(region: string | undefined): string {
  if (region === 'us') {
    return 'https://sonarqube.us';
  }

  return 'https://sonarcloud.io';
}

function readObject(value: unknown): object {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Expected a JSON object from the Sonar API.');
  }

  return value;
}

function readObjectProperty(value: object, key: string): unknown {
  if (!Object.prototype.hasOwnProperty.call(value, key)) {
    return undefined;
  }

  return Reflect.get(value, key);
}

function readConditions(value: unknown): Array<{
  metricKey: string;
  comparator: string;
  errorThreshold: string;
  actualValue: string | null;
}> {
  if (!Array.isArray(value)) {
    throw new Error('Sonar project status response is missing conditions.');
  }

  return value.map((entry) => {
    const condition = readObject(entry);
    const metricKey = readObjectProperty(condition, 'metricKey');
    const comparator = readObjectProperty(condition, 'comparator');
    const errorThreshold = readObjectProperty(condition, 'errorThreshold');
    const actualValue = readObjectProperty(condition, 'actualValue');

    if (
      typeof metricKey !== 'string' ||
      typeof comparator !== 'string' ||
      typeof errorThreshold !== 'string'
    ) {
      throw new Error('Sonar project status condition is malformed.');
    }

    if (actualValue !== null && typeof actualValue !== 'string') {
      throw new Error(
        'Sonar project status condition actualValue must be a string or null.',
      );
    }

    return {
      metricKey,
      comparator,
      errorThreshold,
      actualValue,
    };
  });
}

const rootDirectory = resolve(import.meta.dirname, '..');
const properties = parsePropertiesFile(
  await readFile(resolve(rootDirectory, 'sonar-project.properties'), 'utf8'),
);
const projectKey = readRequiredProperty(properties, 'sonar.projectKey');
const organization = readRequiredProperty(properties, 'sonar.organization');
const sonarToken = process.env['SONAR_TOKEN'];

if (sonarToken === undefined || sonarToken.length === 0) {
  throw new Error('SONAR_TOKEN is required for Sonar bootstrap verification.');
}

const baseUrl =
  process.env['SONAR_BASE_URL'] ??
  resolveSonarBaseUrl(process.env['SONAR_REGION']);
const projectStatusUrl = new URL('/api/qualitygates/project_status', baseUrl);
projectStatusUrl.searchParams.set('projectKey', projectKey);
const basicAuthToken = Buffer.from(`${sonarToken}:`).toString('base64');

const response = await fetch(projectStatusUrl, {
  headers: {
    Authorization: `Basic ${basicAuthToken}`,
  },
});

if (!response.ok) {
  throw new Error(
    `Sonar project status request failed with ${String(response.status)} ${response.statusText}.`,
  );
}

const body = readObject(await response.json());
const projectStatus = readObject(readObjectProperty(body, 'projectStatus'));
const qualityGateStatus = readObjectProperty(projectStatus, 'status');
if (
  qualityGateStatus !== 'ERROR' &&
  qualityGateStatus !== 'NONE' &&
  qualityGateStatus !== 'OK'
) {
  throw new Error('Sonar project status response contained an unknown status.');
}

const result = new SonarBootstrapVerificationService().execute({
  projectKey,
  qualityGateStatus,
  conditions: readConditions(readObjectProperty(projectStatus, 'conditions')),
  evaluatedAt: new Date().toISOString(),
});

if (organization !== 'vannadii') {
  throw new Error(
    `Sonar organization is ${organization}, expected vannadii for this repository.`,
  );
}

if (!result.issues.every((issue) => issue.length > 0)) {
  throw new Error('Sonar bootstrap verification produced an empty issue.');
}

if (!new SonarBootstrapVerificationService().passes(result)) {
  throw new Error(
    `Sonar bootstrap verification failed:\n${result.issues.join('\n')}`,
  );
}

process.stdout.write(
  `Verified Sonar bootstrap for ${projectKey}: quality gate is OK and coverage thresholds are >= 90.\n`,
);
