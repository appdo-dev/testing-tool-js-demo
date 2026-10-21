#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = require("fs");
const path_1 = require("path");
const forge_commons_1 = require("@ai-testing-tool/forge-commons");
function parseArgs(argv) {
    const args = {};
    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        const next = argv[i + 1];
        if (arg === '--help' || arg === '-h')
            args.help = true;
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
            args.format = next;
            i += 1;
        }
    }
    return args;
}
function printHelp() {
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
function readText(path) {
    const absolute = (0, path_1.resolve)(process.cwd(), path);
    return (0, fs_1.readFileSync)(absolute, 'utf8');
}
const QA_METADATA_CONTENT_TYPE = 'application/ai-testing-tool.metadata+json';
function isPlaywrightNativeJsonReport(parsed) {
    return (Boolean(parsed) &&
        typeof parsed === 'object' &&
        'suites' in parsed &&
        Array.isArray(parsed.suites) &&
        !('testResults' in parsed));
}
function mapPlaywrightNativeStatus(status) {
    if (status === 'passed')
        return 'passed';
    if (status === 'skipped')
        return 'pending';
    if (status === 'failed' || status === 'timedOut' || status === 'interrupted') {
        return 'failed';
    }
    return 'pending';
}
function convertPlaywrightJsonReport(pw) {
    const rootDir = pw.config?.rootDir ?? process.cwd();
    const byFile = new Map();
    const walkSuite = (suite, ancestors) => {
        const isFileSuite = Boolean(suite.file && suite.title === suite.file);
        const nextAncestors = suite.title && !isFileSuite ? [...ancestors, suite.title] : ancestors;
        for (const spec of suite.specs ?? []) {
            const file = spec.file ?? suite.file ?? 'unknown';
            const fullPath = (0, path_1.resolve)(rootDir, file);
            for (const testItem of spec.tests ?? []) {
                const result = testItem.results?.[testItem.results.length - 1] ??
                    testItem.results?.[0];
                if (!result)
                    continue;
                const acc = (0, forge_commons_1.createQaMetaAccumulator)();
                for (const att of result.attachments ?? []) {
                    if (att.contentType !== QA_METADATA_CONTENT_TYPE || !att.body) {
                        continue;
                    }
                    try {
                        const decoded = Buffer.from(att.body, 'base64').toString('utf8');
                        const msg = JSON.parse(decoded);
                        if (typeof msg.title === 'string' && msg.title) {
                            (0, forge_commons_1.applyQaAnnotation)(acc, { type: 'qa-title', body: msg.title });
                        }
                        if (typeof msg.comment === 'string' && msg.comment) {
                            (0, forge_commons_1.applyQaAnnotation)(acc, { type: 'qa-comment', body: msg.comment });
                        }
                        if (typeof msg.suite === 'string' && msg.suite) {
                            (0, forge_commons_1.applyQaAnnotation)(acc, { type: 'qa-suite', body: msg.suite });
                        }
                        if (typeof msg.suiteId === 'string' && msg.suiteId) {
                            (0, forge_commons_1.applyQaAnnotation)(acc, {
                                type: 'qa-suite-id',
                                body: msg.suiteId,
                            });
                        }
                        if (typeof msg.planId === 'string' && msg.planId) {
                            (0, forge_commons_1.applyQaAnnotation)(acc, { type: 'qa-plan-id', body: msg.planId });
                        }
                        if (typeof msg.planName === 'string' && msg.planName) {
                            (0, forge_commons_1.applyQaAnnotation)(acc, { type: 'qa-plan', body: msg.planName });
                        }
                        if (typeof msg.fixVersion === 'string' && msg.fixVersion) {
                            (0, forge_commons_1.applyQaAnnotation)(acc, {
                                type: 'qa-fix-version',
                                body: msg.fixVersion,
                            });
                        }
                        if (typeof msg.sprintName === 'string' && msg.sprintName) {
                            (0, forge_commons_1.applyQaAnnotation)(acc, {
                                type: 'qa-sprint-name',
                                body: msg.sprintName,
                            });
                        }
                        if (msg.labels !== undefined && msg.labels !== null) {
                            (0, forge_commons_1.applyQaAnnotation)(acc, {
                                type: 'qa-labels',
                                body: msg.labels,
                            });
                        }
                        if (msg.fields && typeof msg.fields === 'object') {
                            (0, forge_commons_1.applyQaAnnotation)(acc, {
                                type: 'qa-fields',
                                body: msg.fields,
                            });
                        }
                        if (msg.parameters && typeof msg.parameters === 'object') {
                            (0, forge_commons_1.applyQaAnnotation)(acc, {
                                type: 'qa-parameters',
                                body: msg.parameters,
                            });
                        }
                        if (Array.isArray(msg.issueKeys) && msg.issueKeys.length > 0) {
                            (0, forge_commons_1.applyQaAnnotation)(acc, {
                                type: 'qa-issue-keys',
                                body: msg.issueKeys,
                            });
                        }
                        if (msg.ignore) {
                            (0, forge_commons_1.applyQaAnnotation)(acc, { type: 'qa-ignore', body: true });
                        }
                        if (Array.isArray(msg.attachments)) {
                            for (const item of msg.attachments) {
                                if (item && typeof item === 'object') {
                                    const rec = item;
                                    (0, forge_commons_1.applyQaAnnotation)(acc, {
                                        type: 'qa-attach',
                                        body: { name: rec.name, contentType: rec.contentType },
                                    });
                                }
                            }
                        }
                    }
                    catch {
                        // ignore malformed metadata attachment
                    }
                }
                const walkSteps = (steps) => {
                    for (const step of steps ?? []) {
                        if (step.category && step.category !== 'test.step') {
                            walkSteps(step.steps);
                            continue;
                        }
                        if (step.title) {
                            acc.steps.push({
                                name: step.title,
                                status: step.error ? 'failed' : 'passed',
                            });
                        }
                        walkSteps(step.steps);
                    }
                };
                walkSteps(result.steps);
                const wire = (0, forge_commons_1.toQaMetaWire)(acc, {
                    framework: 'playwright',
                    reporter: '@ai-testing-tool/forge-playwright',
                });
                const title = spec.title ?? 'unknown';
                const fullName = nextAncestors.length > 0
                    ? `${nextAncestors.join(' ')} ${title}`
                    : title;
                const failureMessages = (result.errors ?? [])
                    .map((e) => {
                    if (typeof e === 'string')
                        return e;
                    if (e && typeof e === 'object' && 'message' in e) {
                        return String(e.message ?? '');
                    }
                    return String(e);
                })
                    .filter(Boolean);
                const assertion = {
                    fullName,
                    title,
                    status: mapPlaywrightNativeStatus(result.status),
                    duration: result.duration,
                    failureMessages,
                };
                if (wire) {
                    assertion.meta = { qa: wire };
                }
                const entry = byFile.get(fullPath) ?? { assertions: [] };
                const startMs = result.startTime
                    ? Date.parse(result.startTime)
                    : undefined;
                if (startMs && (!entry.startTime || startMs < entry.startTime)) {
                    entry.startTime = startMs;
                }
                if (startMs && typeof result.duration === 'number') {
                    const endMs = startMs + result.duration;
                    if (!entry.endTime || endMs > entry.endTime) {
                        entry.endTime = endMs;
                    }
                }
                entry.assertions.push(assertion);
                byFile.set(fullPath, entry);
            }
        }
        for (const child of suite.suites ?? []) {
            walkSuite(child, nextAncestors);
        }
    };
    for (const suite of pw.suites ?? []) {
        walkSuite(suite, []);
    }
    const testResults = [];
    let numPassedTests = 0;
    let numFailedTests = 0;
    let numPendingTests = 0;
    let numTodoTests = 0;
    for (const [file, data] of byFile) {
        if (data.assertions.length === 0)
            continue;
        for (const a of data.assertions) {
            if (a.status === 'passed')
                numPassedTests += 1;
            else if (a.status === 'failed')
                numFailedTests += 1;
            else if (a.status === 'todo')
                numTodoTests += 1;
            else
                numPendingTests += 1;
        }
        const status = data.assertions.some((a) => a.status === 'failed')
            ? 'failed'
            : 'passed';
        testResults.push({
            name: (0, forge_commons_1.normalizeReportFilePath)(file),
            status,
            startTime: data.startTime,
            endTime: data.endTime,
            assertionResults: data.assertions,
        });
    }
    const numFailedTestSuites = testResults.filter((t) => t.status === 'failed').length;
    const startTime = pw.stats?.startTime
        ? Date.parse(pw.stats.startTime)
        : Date.now();
    return {
        numTotalTestSuites: testResults.length,
        numPassedTestSuites: testResults.length - numFailedTestSuites,
        numFailedTestSuites,
        numPendingTestSuites: 0,
        numTotalTests: numPassedTests + numFailedTests + numPendingTests + numTodoTests,
        numPassedTests,
        numFailedTests,
        numPendingTests,
        numTodoTests,
        startTime,
        success: numFailedTests === 0,
        testResults,
    };
}
function readJsonReport(path) {
    const parsed = JSON.parse(readText(path));
    if (parsed &&
        typeof parsed === 'object' &&
        'report' in parsed &&
        'projectKey' in parsed) {
        return parsed.report;
    }
    if (isPlaywrightNativeJsonReport(parsed)) {
        return convertPlaywrightJsonReport(parsed);
    }
    return parsed;
}
function remapReportIssueKeyPrefix(report, fromProjectKey, toProjectKey) {
    if (fromProjectKey && fromProjectKey === toProjectKey) {
        return report;
    }
    const prefixPattern = fromProjectKey
        ? new RegExp(`^${fromProjectKey}-(\\d+)$`)
        : /^[A-Z][A-Z0-9_]*-(\d+)$/;
    return {
        ...report,
        testResults: report.testResults?.map((suite) => ({
            ...suite,
            assertionResults: suite.assertionResults?.map((assertion) => {
                const qa = assertion.meta?.qa && typeof assertion.meta.qa === 'object'
                    ? assertion.meta.qa
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
                            issueKeys: issueKeys.map((key) => typeof key === 'string'
                                ? key.replace(prefixPattern, `${toProjectKey}-$1`)
                                : key),
                        },
                    },
                };
            }),
        })),
    };
}
/** Progress on stderr so stdout stays machine-readable JSON. */
function reportUploadProgress(progress) {
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
async function main() {
    const args = parseArgs(process.argv.slice(2));
    if (args.help || process.argv.length <= 2) {
        printHelp();
        process.exit(args.help ? 0 : 1);
    }
    const fileConfig = (0, forge_commons_1.loadConfig)() ?? {};
    const envConfig = (0, forge_commons_1.envToConfig)();
    const merged = (0, forge_commons_1.composeOptions)(fileConfig, envConfig);
    const reportPath = args.report ?? './ai-testing-tool-results.json';
    const format = args.format ?? 'jest-json';
    const raw = readText(reportPath);
    const parsed = JSON.parse(raw);
    const existingPayload = parsed &&
        typeof parsed === 'object' &&
        parsed !== null &&
        'report' in parsed &&
        'projectKey' in parsed
        ? parsed
        : undefined;
    const resolvedProjectKey = args.project ?? merged.projectKey ?? existingPayload?.projectKey;
    if (!resolvedProjectKey) {
        console.error('Missing --project (or projectKey in ai-testing-tool.config.json / AI_TESTING_TOOL_PROJECT_KEY)');
        process.exit(1);
    }
    const ci = (0, forge_commons_1.detectCiEnvironment)();
    const payload = existingPayload
        ? {
            ...existingPayload,
            projectKey: resolvedProjectKey,
            report: remapReportIssueKeyPrefix(existingPayload.report, existingPayload.projectKey, resolvedProjectKey),
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
        : (0, forge_commons_1.buildIngestPayload)({
            projectKey: resolvedProjectKey,
            report: remapReportIssueKeyPrefix(readJsonReport(reportPath), undefined, resolvedProjectKey),
            format,
            launchName: args.launch ?? merged.launchName,
            planId: args.planId ?? merged.planId,
            planKey: args.planKey ?? merged.planKey,
            planName: args.plan ?? merged.planName,
            fixVersion: args.fixVersion ?? merged.fixVersion,
            sprintName: args.sprint ?? merged.sprintName,
            ci,
        });
    const client = new forge_commons_1.IngestClient({
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
main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
});
