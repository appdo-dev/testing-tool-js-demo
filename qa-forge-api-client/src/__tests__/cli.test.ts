import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { qaDescribe, qaItAuto, expect } from '@qa/test';

const pkgRoot = join(fileURLToPath(import.meta.url), '..', '..', '..');
const cliPath = join(pkgRoot, 'dist', 'cli.js');

function runCli(args: string[], cwd?: string) {
  return spawnSync(process.execPath, [cliPath, ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, AI_TESTING_TOOL_MODE: 'off' },
  });
}

qaDescribe('@ai-testing-tool/forge-api-client CLI', () => {
  qaItAuto('prints help and exits 0', () => {
    const result = runCli(['--help']);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('@ai-testing-tool/forge-api-client');
    expect(result.stdout).toContain('--project');
  });

  qaItAuto('requires --project when uploading a report', () => {
    const dir = mkdtempSync(join(tmpdir(), 'qa-cli-'));
    const reportPath = join(dir, 'ai-testing-tool-results.json');
    writeFileSync(
      reportPath,
      JSON.stringify({
        numTotalTests: 1,
        numPassedTests: 1,
        numFailedTests: 0,
        success: true,
        testResults: [],
      }),
    );

    try {
      const result = runCli(['--report', reportPath], dir);
      expect(result.status).toBe(1);
      expect(result.stderr).toMatch(/Missing --project/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  qaItAuto('builds payload from jest-json report (dry — no network)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'qa-cli-'));
    const reportPath = join(dir, 'ai-testing-tool-results.json');
    writeFileSync(
      reportPath,
      JSON.stringify({
        numTotalTests: 1,
        numPassedTests: 1,
        numFailedTests: 0,
        success: true,
        testResults: [
          {
            name: 'auth.test.ts',
            assertionResults: [
              {
                ancestorTitles: ['Auth'],
                title: 'AUTH-101 login',
                status: 'passed',
                failureMessages: [],
              },
            ],
          },
        ],
      }),
    );

    try {
      const result = runCli(
        [
          '--project',
          'AUTH',
          '--launch',
          'cli unit',
          '--report',
          reportPath,
          '--url',
          'http://127.0.0.1:9/nope',
          '--token',
          'qa_test_token',
        ],
        dir,
      );
      expect(result.status).not.toBe(0);
      expect(result.stderr + result.stdout).toMatch(/timed out|ECONNREFUSED|fetch failed/i);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  qaItAuto('enriches existing FR41 payload with GitHub Actions CI metadata on upload', async () => {
    const http = await import('node:http');
    const dir = mkdtempSync(join(tmpdir(), 'qa-cli-gh-'));
    const reportPath = join(dir, 'ai-testing-tool-results.json');
    writeFileSync(
      reportPath,
      JSON.stringify({
        projectKey: 'AUTH',
        launchName: 'initial',
        format: 'vitest-json',
        report: {
          numTotalTests: 1,
          numPassedTests: 1,
          numFailedTests: 0,
          success: true,
          testResults: [
            {
              name: 'auth.test.ts',
              assertionResults: [
                {
                  title: 'login',
                  status: 'passed',
                  meta: { qa: { issueKeys: ['AUTH-101'] } },
                },
              ],
            },
          ],
        },
      }),
    );

    let capturedBody: Record<string, unknown> | undefined;
    const server = http.createServer((req, res) => {
      let raw = '';
      req.on('data', (c) => {
        raw += c;
      });
      req.on('end', () => {
        capturedBody = JSON.parse(raw) as Record<string, unknown>;
        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      });
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const addr = server.address() as { port: number };
    try {
      const status = await new Promise<number | null>((resolve) => {
        const child = spawn(
          process.execPath,
          [
            cliPath,
            '--project',
            'ES',
            '--launch',
            'AiTestingTool Vitest #42',
            '--report',
            reportPath,
            '--url',
            `http://127.0.0.1:${addr.port}/ingest`,
            '--token',
            'qa_token_123',
          ],
          {
            cwd: dir,
            stdio: 'ignore',
            env: {
              ...process.env,
              GITHUB_ACTIONS: 'true',
              GITHUB_SERVER_URL: 'https://github.com',
              GITHUB_REPOSITORY: 'ai-testing-tool/testing-tool-js',
              GITHUB_RUN_ID: '123456',
              GITHUB_SHA: 'abcdef1234567890abcdef1234567890abcdef12',
              GITHUB_REF_NAME: 'main',
              GITHUB_ACTOR: 'octocat',
            },
          },
        );
        child.on('close', (code) => resolve(code));
      });
      expect(status).toBe(0);
      expect(capturedBody?.projectKey).toBe('ES');
      expect(capturedBody?.launchName).toBe('AiTestingTool Vitest #42');
      expect(capturedBody?.ciPlatform).toBe('github');
      expect(capturedBody?.ciBuildUrl).toBe(
        'https://github.com/ai-testing-tool/testing-tool-js/actions/runs/123456',
      );
      expect(capturedBody?.gitHashCommitUrl).toBe(
        'https://github.com/ai-testing-tool/testing-tool-js/commit/abcdef1234567890abcdef1234567890abcdef12',
      );
      expect(capturedBody?.gitBranch).toBe('main');
      expect(capturedBody?.gitAuthorName).toBe('octocat');
      const report = capturedBody?.report as {
        testResults?: Array<{ assertionResults?: Array<{ meta?: { qa?: { issueKeys?: string[] } } }> }>;
      };
      expect(report?.testResults?.[0]?.assertionResults?.[0]?.meta?.qa?.issueKeys).toEqual(['ES-101']);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      rmSync(dir, { recursive: true, force: true });
    }
  });

  qaItAuto('converts Playwright native --reporter=json output into FR41 report on upload', async () => {
    const http = await import('node:http');
    const dir = mkdtempSync(join(tmpdir(), 'qa-cli-pw-'));
    const reportPath = join(dir, 'ai-testing-tool-results.json');
    const qaAttachmentBody = Buffer.from(
      JSON.stringify({
        issueKeys: ['AUTH-101'],
        suite: 'E-commerce\tAuthentication\tLogin',
        fields: { severity: 'critical', priority: 'high', layer: 'e2e' },
      }),
      'utf8',
    ).toString('base64');

    writeFileSync(
      reportPath,
      JSON.stringify({
        config: { rootDir: dir },
        suites: [
          {
            title: 'login.spec.js',
            file: 'login.spec.js',
            suites: [
              {
                title: 'Login Functionality',
                file: 'login.spec.js',
                specs: [
                  {
                    title: 'Successful login with valid credentials',
                    file: 'login.spec.js',
                    tests: [
                      {
                        projectName: 'chromium',
                        results: [
                          {
                            status: 'passed',
                            duration: 850,
                            startTime: '2026-10-21T14:00:00.000Z',
                            errors: [],
                            attachments: [
                              {
                                name: 'ai-testing-tool:metadata',
                                contentType: 'application/ai-testing-tool.metadata+json',
                                body: qaAttachmentBody,
                              },
                            ],
                            steps: [
                              {
                                title: 'Navigate to login page',
                                duration: 200,
                              },
                              {
                                title: 'Enter valid credentials',
                                duration: 400,
                              },
                            ],
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
        stats: { startTime: '2026-10-21T14:00:00.000Z' },
      }),
    );

    let capturedBody: Record<string, unknown> | undefined;
    const server = http.createServer((req, res) => {
      let raw = '';
      req.on('data', (c) => {
        raw += c;
      });
      req.on('end', () => {
        capturedBody = JSON.parse(raw) as Record<string, unknown>;
        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      });
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const addr = server.address() as { port: number };
    try {
      const status = await new Promise<number | null>((resolve) => {
        const child = spawn(
          process.execPath,
          [
            cliPath,
            '--project',
            'ES',
            '--launch',
            'AiTestingTool Playwright #1',
            '--report',
            reportPath,
            '--url',
            `http://127.0.0.1:${addr.port}/ingest`,
            '--token',
            'qa_token_123',
          ],
          {
            cwd: dir,
            stdio: 'ignore',
          },
        );
        child.on('close', (code) => resolve(code));
      });
      expect(status).toBe(0);
      expect(capturedBody?.projectKey).toBe('ES');
      expect(capturedBody?.launchName).toBe('AiTestingTool Playwright #1');
      const report = capturedBody?.report as {
        numTotalTests?: number;
        numPassedTests?: number;
        testResults?: Array<{
          name?: string;
          assertionResults?: Array<{
            title?: string;
            fullName?: string;
            status?: string;
            meta?: {
              qa?: {
                issueKeys?: string[];
                suite?: string;
                steps?: Array<{ name?: string; status?: string }>;
              };
            };
          }>;
        }>;
      };
      expect(report?.numTotalTests).toBe(1);
      expect(report?.numPassedTests).toBe(1);
      const assertion = report?.testResults?.[0]?.assertionResults?.[0];
      expect(assertion?.title).toBe('Successful login with valid credentials');
      expect(assertion?.fullName).toBe(
        'Login Functionality Successful login with valid credentials',
      );
      expect(assertion?.meta?.qa?.issueKeys).toEqual(['ES-101']);
      expect(assertion?.meta?.qa?.suite).toEqual([
        { title: 'E-commerce' },
        { title: 'Authentication' },
        { title: 'Login' },
      ]);
      expect(assertion?.meta?.qa?.steps?.map((s) => s.name)).toEqual([
        'Navigate to login page',
        'Enter valid credentials',
      ]);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
