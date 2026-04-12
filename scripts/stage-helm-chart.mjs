import { access, cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const rootDirectory = resolve(import.meta.dirname, '..');
const chartSourceDirectory = resolve(rootDirectory, 'deploy/helm/devplat');

function parseArgs(argv) {
  const args = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    args.set(argv[index], argv[index + 1]);
  }

  return {
    appVersion: args.get('--app-version'),
    artifacthubChangeDescription: args.get('--artifacthub-change-description'),
    artifacthubChangeKind: args.get('--artifacthub-change-kind'),
    artifacthubContainsSecurityUpdates: args.get(
      '--artifacthub-contains-security-updates',
    ),
    artifacthubImage: args.get('--artifacthub-image'),
    artifacthubPrerelease: args.get('--artifacthub-prerelease'),
    chartVersion: args.get('--chart-version'),
    imageTag: args.get('--image-tag'),
    outDir: args.get('--out-dir'),
  };
}

function replaceOne(sourceText, pattern, replacement, label) {
  if (!pattern.test(sourceText)) {
    throw new Error(`Unable to update ${label}.`);
  }

  return sourceText.replace(pattern, () => replacement);
}

const {
  appVersion,
  artifacthubChangeDescription,
  artifacthubChangeKind,
  artifacthubContainsSecurityUpdates,
  artifacthubImage,
  artifacthubPrerelease,
  chartVersion,
  imageTag,
  outDir,
} = parseArgs(process.argv.slice(2));
if (
  !appVersion ||
  !artifacthubChangeDescription ||
  !artifacthubChangeKind ||
  !artifacthubContainsSecurityUpdates ||
  !artifacthubImage ||
  !artifacthubPrerelease ||
  !chartVersion ||
  !imageTag ||
  !outDir
) {
  throw new Error(
    'Usage: node scripts/stage-helm-chart.mjs --out-dir <dir> --chart-version <version> --app-version <version> --image-tag <tag> --artifacthub-image <image> --artifacthub-prerelease <true|false> --artifacthub-contains-security-updates <true|false> --artifacthub-change-kind <kind> --artifacthub-change-description <description>',
  );
}

const outputDirectory = resolve(rootDirectory, outDir);
await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });
await cp(chartSourceDirectory, outputDirectory, { recursive: true });
await cp(
  resolve(rootDirectory, 'LICENSE'),
  resolve(outputDirectory, 'LICENSE'),
);

const chartYamlPath = resolve(outputDirectory, 'Chart.yaml');
const readmePath = resolve(outputDirectory, 'README.md');
const valuesYamlPath = resolve(outputDirectory, 'values.yaml');

const chartYaml = await readFile(chartYamlPath, 'utf8');
const valuesYaml = await readFile(valuesYamlPath, 'utf8');

let updatedChartYaml = chartYaml;
for (const [pattern, replacement, label] of [
  [
    /^version:\s.*$/mu,
    `version: ${JSON.stringify(chartVersion)}`,
    'chart version',
  ],
  [
    /^appVersion:\s.*$/mu,
    `appVersion: ${JSON.stringify(appVersion)}`,
    'chart appVersion',
  ],
  [
    /^ {2}artifacthub\.io\/prerelease:\s.*$/mu,
    `  artifacthub.io/prerelease: ${JSON.stringify(artifacthubPrerelease)}`,
    'Artifact Hub prerelease flag',
  ],
  [
    /^ {2}artifacthub\.io\/containsSecurityUpdates:\s.*$/mu,
    `  artifacthub.io/containsSecurityUpdates: ${JSON.stringify(artifacthubContainsSecurityUpdates)}`,
    'Artifact Hub security update flag',
  ],
  [
    /^ {4}- kind:\s.*$/mu,
    `    - kind: ${artifacthubChangeKind}`,
    'Artifact Hub change kind',
  ],
  [
    /^ {6}description:\s.*$/mu,
    `      description: ${JSON.stringify(artifacthubChangeDescription)}`,
    'Artifact Hub change description',
  ],
  [
    /^ {6}image:\s.*$/mu,
    `      image: ${JSON.stringify(artifacthubImage)}`,
    'Artifact Hub image reference',
  ],
]) {
  updatedChartYaml = replaceOne(updatedChartYaml, pattern, replacement, label);
}
const updatedValuesYaml = replaceOne(
  valuesYaml,
  /^ {2}tag:\s.*$/mu,
  `  tag: ${JSON.stringify(imageTag)}`,
  'chart image tag',
);

await writeFile(chartYamlPath, updatedChartYaml, 'utf8');
await writeFile(valuesYamlPath, updatedValuesYaml, 'utf8');
await access(readmePath);

process.stdout.write(
  `${JSON.stringify(
    {
      appVersion,
      artifacthubChangeDescription,
      artifacthubChangeKind,
      artifacthubContainsSecurityUpdates,
      artifacthubImage,
      artifacthubPrerelease,
      chartDirectory: outputDirectory,
      chartVersion,
      imageTag,
    },
    null,
    2,
  )}\n`,
);
