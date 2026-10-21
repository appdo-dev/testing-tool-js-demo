#!/usr/bin/env node
import { readFileSync } from 'fs';
import { resolve } from 'path';

import {
  IngestClient,
  buildIngestPayload,
  detectCiEnvironment,
  envToConfig,
  loadConfig,
  composeOptions,
  type IngestFormat,
  type IngestPayload,
  type IngestUploadProgress,
  type JestVitestJsonReport,
} from '@ai-testing-tool/forge-commons';

type CliArgs = {
  project?: string;
  report?: string;
  url?: string;
  token?: string;
  launch?: string;
  plan?: string;
  planId?: string;
  planKey?: string;
  fixVersion?: string;
  sprint?: string;
  format?: IngestFormat;
  help?: boolean;
};

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === '--help' || arg === '-h') args.help = true;
    if ((arg === '--project' || arg === '-p') && next) {
      args.project = next;
      i += 1;
    }
    if ((arg === '--report' || arg === '-r') && next) {
      args.report = next;
      i += 1;
    }
    if (arg === '--url' && next) {
      args.url = next;
      i += 1;
    }
    if (arg === '--token' && next) {
      args.token = next;
      i += 1;
    }
    if ((arg === '--launch' || arg === '-l') && next) {
      args.launch = next;
      i += 1;
    }
    if (arg === '--plan' && next) {
      args.plan = next;
      i += 1;
    }
    if (arg === '--plan-id' && next) {
      args.planId = next;
      i += 1;
    }
    if (arg === '--plan-key' && next) {
      args.planKey = next;
      i += 1;
    }
    if (arg === '--fix-version' && next) {
      args.fixVersion = next;
      i += 1;
    }
    if (arg === '--sprint' && next) {
      args.sprint = next;
      i += 1;
    }
    if (arg === '--format' && next) {
      args.format = next as IngestFormat;
      i += 1;
    }
  }
  return args;
}

function printHelp(): void {
  console.log(`@ai-testing-tool/forge-api-client

Usage:
  @ai-testing-tool/forge-api-client --project <KEY> --report <path>

Options:
  --project, -p   Jira project key
  --report, -r    Path to Jest/Vitest JSON report (default ./ai-testing-tool-results.json)
  --format        jest-json (default) | vitest-json | normalized
  --url           Ingest URL (or AI_TESTING_TOOL_INGEST_URL)
  --token         Bearer token (or AI_TESTING_TOOL_INGEST_TOKEN)
  --launch, -l    Launch display name
  --plan          Test Plan name (or AI_TESTING_TOOL_PLAN_NAME)
  --plan-id       Test Plan UUID (or AI_TESTING_TOOL_PLAN_ID)
  --plan-key      Test Plan slug (or AI_TESTING_TOOL_PLAN_KEY)
  --fix-version  Fix version tag (or AI_TESTING_TOOL_FIX_VERSION)
  --sprint        Sprint name tag (or AI_TESTING_TOOL_SPRINT)
  --help          Show this help

Upload progress (percent) is written to stderr while uploading.
`);
}

function readText(path: string): string {
  const absolute = resolve(process.cwd(), path);
  return readFileSync(absolute, 'utf8');
}

function readJsonReport(path: string): JestVitestJsonReport {
  const parsed = JSON.parse(readText(path)) as unknown;
  if (
    parsed &&
    typeof parsed === 'object' &&
    'report' in parsed &&
    'projectKey' in parsed
  ) {
    return (parsed as IngestPayload).report as JestVitestJsonReport;
  }
  return parsed as JestVitestJsonReport;
}

function remapReportIssueKeyPrefix<T extends JestVitestJsonReport>(
  report: T,
  fromProjectKey: string | undefined,
  toProjectKey: string,
): T {
  if (!fromProjectKey || fromProjectKey === toProjectKey) {
    return report;
  }
  const prefixPattern = new RegExp(`^${fromProjectKey}-(\\d+)$`);
  return {
    ...report,
    testResults: report.testResults?.map((suite) => ({
      ...suite,
      assertionResults: suite.assertionResults?.map((assertion) => {
        const qa =
          assertion.meta?.qa && typeof assertion.meta.qa === 'object'
            ? (assertion.meta.qa as Record<string, unknown>)
            : undefined;
        const issueKeys = qa?.issueKeys;
        if (!qa || !Array.isArray(issueKeys) || issueKeys.length === 0) {
          return assertion;
        }
        return {
          ...assertion,
          meta: {
            ...assertion.meta,
            qa: {
              ...qa,
              issueKeys: issueKeys.map((key) =>
                typeof key === 'string'
                  ? key.replace(prefixPattern, `${toProjectKey}-$1`)
                  : key,
              ),
            },
          },
        };
      }),
    })),
  };
}

/** Progress on stderr so stdout stays machine-readable JSON. */
function reportUploadProgress(progress: IngestUploadProgress): void {
  const line = `Ingest upload: ${progress.percent}% — ${progress.message}`;
  if (process.stderr.isTTY) {
    process.stderr.write(`\r${line.padEnd(100)}`);
    if (progress.phase === 'done' || progress.percent >= 100) {
      process.stderr.write('\n');
    }
    return;
  }
  console.error(line);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || process.argv.length <= 2) {
    printHelp();
    process.exit(args.help ? 0 : 1);
  }

  const fileConfig = loadConfig() ?? {};
  const envConfig = envToConfig();
  const merged = composeOptions(fileConfig, envConfig);
  const reportPath = args.report ?? './ai-testing-tool-results.json';
  const format: IngestFormat = args.format ?? 'jest-json';
  const raw = readText(reportPath);
  const parsed = JSON.parse(raw) as unknown;
  const existingPayload =
    parsed &&
    typeof parsed === 'object' &&
    parsed !== null &&
    'report' in parsed &&
    'projectKey' in parsed
      ? (parsed as IngestPayload)
      : undefined;

  const resolvedProjectKey = args.project ?? merged.projectKey ?? existingPayload?.projectKey;
  if (!resolvedProjectKey) {
    console.error('Missing --project (or projectKey in ai-testing-tool.config.json / AI_TESTING_TOOL_PROJECT_KEY)');
    process.exit(1);
  }

  const ci = detectCiEnvironment();
  const payload = existingPayload
    ? {
        ...existingPayload,
        projectKey: resolvedProjectKey,
        report: remapReportIssueKeyPrefix(
          existingPayload.report,
          existingPayload.projectKey,
          resolvedProjectKey,
        ),
        launchName: args.launch ?? merged.launchName ?? existingPayload.launchName,
        planId: args.planId ?? merged.planId ?? existingPayload.planId,
        planKey: args.planKey ?? merged.planKey ?? existingPayload.planKey,
        planName: args.plan ?? merged.planName ?? existingPayload.planName,
        fixVersion: args.fixVersion ?? merged.fixVersion ?? existingPayload.fixVersion,
        sprintName: args.sprint ?? merged.sprintName ?? existingPayload.sprintName,
        ciPlatform: ci.ciPlatform ?? existingPayload.ciPlatform,
        ciBuildUrl: ci.ciBuildUrl ?? existingPayload.ciBuildUrl,
        gitCommitSha: ci.gitCommitSha ?? existingPayload.gitCommitSha,
        gitBranch: ci.gitBranch ?? existingPayload.gitBranch,
        gitAuthorName: ci.gitAuthorName ?? existingPayload.gitAuthorName,
        gitHashCommitUrl: ci.gitHashCommitUrl ?? existingPayload.gitHashCommitUrl,
      }
    : buildIngestPayload({
        projectKey: resolvedProjectKey,
        report: readJsonReport(reportPath),
        format,
        launchName: args.launch ?? merged.launchName,
        planId: args.planId ?? merged.planId,
        planKey: args.planKey ?? merged.planKey,
        planName: args.plan ?? merged.planName,
        fixVersion: args.fixVersion ?? merged.fixVersion,
        sprintName: args.sprint ?? merged.sprintName,
        ci,
      });

  const client = new IngestClient({
    url: args.url ?? merged.ingest?.url,
    token: args.token ?? merged.ingest?.token,
    timeoutMs: merged.ingest?.timeoutMs,
    completeTimeoutMs: merged.ingest?.completeTimeoutMs,
    maxPayloadBytes: merged.ingest?.maxPayloadBytes,
    chunkThresholdBytes: merged.ingest?.chunkThresholdBytes,
    chunkMaxBytes: merged.ingest?.chunkMaxBytes,
    maxRetries: merged.ingest?.maxRetries,
    retryBaseDelayMs: merged.ingest?.retryBaseDelayMs,
    onProgress: reportUploadProgress,
  });

  const response = await client.send(payload);
  console.log(JSON.stringify({ ok: true, status: response.status, body: response.body }));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
