import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createDependenciesCollector,
  createRuntimesCollector,
  createSystemCollector,
} from '../src/collectors/index.js';
import { CONFIG_FILENAME } from '../src/config/index.js';
import { runCli } from '../src/index.js';
import {
  PrivacyValidator,
  RedactionEngine,
  SecretScanner,
  SecurityPipeline,
} from '../src/security/index.js';
import type { SecretRule } from '../src/security/patterns.js';
import type { Collector } from '../src/types/index.js';

function createCapturedIo() {
  let stdout = '';
  let stderr = '';

  return {
    io: {
      stdout: (text: string) => {
        stdout += text;
      },
      stderr: (text: string) => {
        stderr += text;
      },
    },
    getStdout: () => stdout,
    getStderr: () => stderr,
  };
}

function createMockCollectors(): readonly Collector[] {
  const system = createSystemCollector({
    platform: () => 'linux',
    release: () => '6.8.0-generic',
    arch: () => 'x64',
    nodeVersion: () => 'v22.17.1',
    cpus: () => [{ model: 'AMD Ryzen 7' }, { model: 'AMD Ryzen 7' }],
  });

  const runtimes = createRuntimesCollector({
    runner: {
      async run(exe) {
        if (exe === 'node') {
          return { ok: true, stdout: 'v22.17.1', stderr: '', timedOut: false, notFound: false };
        }
        if (exe === 'npm') {
          return { ok: true, stdout: '11.5.2', stderr: '', timedOut: false, notFound: false };
        }
        return { ok: false, stdout: '', stderr: '', timedOut: false, notFound: true };
      },
    },
  });

  const dependencies = createDependenciesCollector();

  return [system, runtimes, dependencies];
}

describe('bugbundle inspect', () => {
  const tempDirs: string[] = [];

  function makeWorkspace(): string {
    const dir = mkdtempSync(join(tmpdir(), 'bugbundle-inspect-test-'));
    tempDirs.push(dir);
    return dir;
  }

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('displays help for bugbundle inspect --help', async () => {
    const capture = createCapturedIo();
    const exitCode = await runCli(['node', 'bugbundle', 'inspect', '--help'], { io: capture.io });

    expect(exitCode).toBe(0);
    expect(capture.getStdout()).toContain('Usage: bugbundle inspect');
    expect(capture.getStdout()).toContain('without writing a report file');
    expect(capture.getStderr()).toBe('');
  });

  it('runs successfully with missing configuration using safe defaults and writes zero files', async () => {
    const dir = makeWorkspace();
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({ name: 'inspect-app', version: '1.0.0', dependencies: { zod: '^3.24.2' } }),
    );
    writeFileSync(join(dir, 'package-lock.json'), JSON.stringify({ lockfileVersion: 3 }));
    const beforeFiles = readdirSync(dir).sort();

    const capture = createCapturedIo();
    const exitCode = await runCli(['node', 'bugbundle', 'inspect'], {
      io: capture.io,
      cwd: dir,
      collectors: createMockCollectors(),
    });

    expect(exitCode).toBe(0);
    const out = capture.getStdout();
    expect(out).toContain('bugbundle inspect');
    expect(out).toContain('Running local diagnostic collection and security checks...');
    expect(out).toContain('# bugbundle Diagnostic Report');
    expect(out).toContain('## System Information');
    expect(out).toContain('## Runtime Information');
    expect(out).toContain('## Dependency Information');
    expect(out).toContain('## Collection Warnings');
    expect(out).toContain('## Privacy and Security Summary');
    expect(out).toContain('Preview only — no files were created or modified.');
    expect(capture.getStderr()).toBe('');

    const afterFiles = readdirSync(dir).sort();
    expect(afterFiles).toEqual(beforeFiles);
    expect(existsSync(join(dir, 'bugbundle-report.md'))).toBe(false);
    expect(existsSync(join(dir, CONFIG_FILENAME))).toBe(false);
  });

  it('respects valid bugbundle.config.json including projectName and excluded collectors', async () => {
    const dir = makeWorkspace();
    writeFileSync(
      join(dir, CONFIG_FILENAME),
      JSON.stringify({
        projectName: 'custom-inspect-project',
        collectors: {
          excluded: ['runtimes'],
        },
        report: {
          includeWarnings: false,
        },
      }),
    );
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({ name: 'pkg-name', version: '0.1.0' }),
    );

    const capture = createCapturedIo();
    const exitCode = await runCli(['node', 'bugbundle', 'inspect'], {
      io: capture.io,
      cwd: dir,
      collectors: createMockCollectors(),
    });

    expect(exitCode).toBe(0);
    const out = capture.getStdout();
    expect(out).toContain('| Project | custom-inspect-project |');
    expect(out).toContain('Runtime information was not collected.');
    expect(out).toContain('Collection warnings omitted by configuration');
  });

  it('rejects invalid configuration with CONFIG_VALIDATION_ERROR and displays no report', async () => {
    const dir = makeWorkspace();
    writeFileSync(join(dir, CONFIG_FILENAME), '{ invalid json');

    const capture = createCapturedIo();
    const exitCode = await runCli(['node', 'bugbundle', 'inspect'], {
      io: capture.io,
      cwd: dir,
      collectors: createMockCollectors(),
    });

    expect(exitCode).toBe(2);
    expect(capture.getStderr()).toContain('CONFIG_VALIDATION_ERROR');
    expect(capture.getStdout()).not.toContain('# bugbundle Diagnostic Report');
  });

  it('sanitizes secrets and home paths and never displays raw collector secrets', async () => {
    const dir = makeWorkspace();
    const syntheticToken = 'ghp_syntheticInspectSecretToken1234567';
    const fakeCollector: Collector = {
      meta: {
        id: 'system',
        name: 'System information',
        description: 'Synthetic test collector',
        sensitivity: 'low',
      },
      async collect() {
        return {
          id: 'system',
          status: 'partial',
          warnings: [`Token leak ${syntheticToken} at /Users/alice/secret-workspace`],
          data: {
            platform: 'linux',
            release: '6.8.0',
            arch: 'x64',
            nodeVersion: 'v22.17.1',
            cpu: { model: 'Synthetic CPU', cores: 4 },
          },
          durationMs: 1,
        };
      },
    };

    const capture = createCapturedIo();
    const exitCode = await runCli(['node', 'bugbundle', 'inspect'], {
      io: capture.io,
      cwd: dir,
      collectors: [fakeCollector],
      securityPipeline: new SecurityPipeline({
        pathSanitizerOptions: { homeDir: '/Users/alice', username: 'alice' },
      }),
    });

    expect(exitCode).toBe(0);
    const out = capture.getStdout();
    expect(out).toContain('# bugbundle Diagnostic Report');
    expect(out).toContain('\\[REDACTED\\]');
    expect(out).toContain('&lt;HOME&gt;/secret-workspace');
    expect(out).not.toContain(syntheticToken);
    expect(out).not.toContain('/Users/alice');
  });

  it('fails closed and prevents report display when SecurityPipeline validation fails', async () => {
    const dir = makeWorkspace();
    const customRule: SecretRule = {
      id: 'unredacted-leak',
      name: 'Unredacted Leak',
      category: 'api_key',
      severity: 'critical',
      description: 'Simulates residual secret failing PrivacyValidator',
      pattern: /\b(RESIDUAL_SECRET_[A-Z0-9]{6,})\b/g,
      secretGroup: 1,
    };

    const leakingCollector: Collector = {
      meta: {
        id: 'system',
        name: 'System information',
        description: 'Synthetic collector with residual secret',
        sensitivity: 'low',
      },
      async collect() {
        return {
          id: 'system',
          status: 'partial',
          warnings: ['Leaked RESIDUAL_SECRET_ABCDEF'],
          durationMs: 1,
        };
      },
    };

    const strictPipeline = new SecurityPipeline({
      scanner: new SecretScanner(),
      redactor: new RedactionEngine(new SecretScanner()),
      privacyValidator: new PrivacyValidator({
        scanner: new SecretScanner([customRule]),
      }),
    });

    const capture = createCapturedIo();
    const exitCode = await runCli(['node', 'bugbundle', 'inspect'], {
      io: capture.io,
      cwd: dir,
      collectors: [leakingCollector],
      securityPipeline: strictPipeline,
    });

    expect(exitCode).toBe(4);
    expect(capture.getStderr()).toContain('SECURITY_BOUNDARY_ERROR');
    expect(capture.getStdout()).not.toContain('# bugbundle Diagnostic Report');
    expect(capture.getStdout()).not.toContain('RESIDUAL_SECRET_ABCDEF');
    expect(capture.getStderr()).not.toContain('RESIDUAL_SECRET_ABCDEF');
  });

  it('handles report generation errors safely without leaking stack traces', async () => {
    const dir = makeWorkspace();
    const capture = createCapturedIo();
    const exitCode = await runCli(['node', 'bugbundle', 'inspect'], {
      io: capture.io,
      cwd: dir,
      collectors: createMockCollectors(),
      reportBuilder: () => {
        throw new Error('Markdown rendering failed');
      },
    });

    expect(exitCode).toBe(1);
    expect(capture.getStderr()).toContain('[INTERNAL_ERROR] Markdown rendering failed');
    expect(capture.getStderr()).not.toContain('at reportBuilder');
    expect(capture.getStdout()).not.toContain('# bugbundle Diagnostic Report');
  });

  it('handles unresolvable target project directory cleanly', async () => {
    const capture = createCapturedIo();
    const exitCode = await runCli(['node', 'bugbundle', 'inspect'], {
      io: capture.io,
      cwd: join(tmpdir(), 'non-existent-bugbundle-dir-123456'),
      collectors: createMockCollectors(),
    });

    expect(exitCode).toBe(2);
    expect(capture.getStderr()).toContain('CONFIG_VALIDATION_ERROR');
  });
});
