import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createDependenciesCollector,
  createRuntimesCollector,
  createSystemCollector,
} from '../src/collectors/index.js';
import { CONFIG_FILENAME } from '../src/config/index.js';
import { getCliVersion, runCli } from '../src/index.js';
import {
  PrivacyValidator,
  RedactionEngine,
  SecretScanner,
  SecurityPipeline,
} from '../src/security/index.js';
import type { SecretRule } from '../src/security/patterns.js';
import type { PromptAdapter } from '../src/review/index.js';
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
    platform: () => 'darwin',
    release: () => '24.0.0',
    arch: () => 'arm64',
    nodeVersion: () => 'v22.17.1',
    cpus: () => [{ model: 'Apple M3' }, { model: 'Apple M3' }],
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

describe('bugbundle CLI', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('displays help with --help and lists collect, inspect, and init commands', async () => {
    const capture = createCapturedIo();
    const exitCode = await runCli(['node', 'bugbundle', '--help'], { io: capture.io });

    expect(exitCode).toBe(0);
    const out = capture.getStdout();
    expect(out).toContain('Usage: bugbundle');
    expect(out).toContain('collect');
    expect(out).toContain('inspect');
    expect(out).toContain('init');
    expect(capture.getStderr()).toBe('');
  });

  it('displays help when invoked with no subcommand', async () => {
    const capture = createCapturedIo();
    const exitCode = await runCli(['node', 'bugbundle'], { io: capture.io });

    expect(exitCode).toBe(0);
    expect(capture.getStdout()).toContain('Usage: bugbundle');
    expect(capture.getStderr()).toBe('');
  });

  it('displays the package version with --version', async () => {
    const capture = createCapturedIo();
    const exitCode = await runCli(['node', 'bugbundle', '--version'], { io: capture.io });

    expect(exitCode).toBe(0);
    expect(capture.getStdout().trim()).toBe(getCliVersion());
    expect(capture.getStderr()).toBe('');
  });

  it('collect displays sanitized report before asking approval and saves when approved', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'bugbundle-collect-approve-'));
    tempDirs.push(tempDir);
    writeFileSync(
      join(tempDir, 'package.json'),
      JSON.stringify({
        name: 'demo-project',
        version: '0.2.0',
        dependencies: { zod: '^3.24.2' },
      }),
    );
    writeFileSync(join(tempDir, 'package-lock.json'), JSON.stringify({ lockfileVersion: 3 }));

    const capture = createCapturedIo();
    const prompt: PromptAdapter = {
      isInteractive: () => true,
      ask: vi.fn(async () => {
        // Preview must already be displayed before prompt is asked
        expect(capture.getStdout()).toContain('DIAGNOSTIC REPORT PREVIEW');
        expect(capture.getStdout()).toContain('# bugbundle Diagnostic Report');
        return 'y';
      }),
    };

    const exitCode = await runCli(['node', 'bugbundle', 'collect'], {
      io: capture.io,
      cwd: tempDir,
      collectors: createMockCollectors(),
      prompt,
    });

    expect(exitCode).toBe(0);
    const out = capture.getStdout();
    expect(out).toContain('System information');
    expect(out).toContain('Runtime information');
    expect(out).toContain('Dependency information');
    expect(out).toContain('Saved diagnostic report to ./bugbundle-report.md');
    expect(capture.getStderr()).toBe('');

    const saved = readFileSync(join(tempDir, 'bugbundle-report.md'), 'utf8');
    expect(saved).toContain('# bugbundle Diagnostic Report');
    expect(saved).toContain('demo-project');
  });

  it('collect writes no file when user declines review', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'bugbundle-collect-decline-'));
    tempDirs.push(tempDir);
    writeFileSync(
      join(tempDir, 'package.json'),
      JSON.stringify({ name: 'decline-app', version: '1.0.0' }),
    );

    const capture = createCapturedIo();
    const prompt: PromptAdapter = {
      isInteractive: () => true,
      ask: vi.fn(async () => 'n'),
    };

    const exitCode = await runCli(['node', 'bugbundle', 'collect'], {
      io: capture.io,
      cwd: tempDir,
      collectors: createMockCollectors(),
      prompt,
    });

    expect(exitCode).toBe(5);
    expect(capture.getStdout()).toContain('Collection cancelled. No report was saved.');
    expect(existsSync(join(tempDir, 'bugbundle-report.md'))).toBe(false);
  });

  it('collect refuses export in non-interactive mode without --yes', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'bugbundle-collect-nonint-'));
    tempDirs.push(tempDir);
    writeFileSync(
      join(tempDir, 'package.json'),
      JSON.stringify({ name: 'ci-app', version: '1.0.0' }),
    );

    const capture = createCapturedIo();
    const prompt: PromptAdapter = {
      isInteractive: () => false,
      ask: vi.fn(async () => 'y'),
    };

    const exitCode = await runCli(['node', 'bugbundle', 'collect'], {
      io: capture.io,
      cwd: tempDir,
      collectors: createMockCollectors(),
      prompt,
    });

    expect(exitCode).toBe(5);
    expect(capture.getStderr()).toContain('NON_INTERACTIVE_APPROVAL_ERROR');
    expect(capture.getStderr()).toContain('--yes');
    expect(existsSync(join(tempDir, 'bugbundle-report.md'))).toBe(false);
  });

  it('collect --yes exports in non-interactive mode and respects config exclusions', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'bugbundle-collect-yes-'));
    tempDirs.push(tempDir);
    writeFileSync(
      join(tempDir, CONFIG_FILENAME),
      JSON.stringify({
        collectors: {
          excluded: ['runtimes'],
        },
      }),
    );
    writeFileSync(
      join(tempDir, 'package.json'),
      JSON.stringify({ name: 'cfg-app', version: '1.0.0' }),
    );

    const capture = createCapturedIo();
    const prompt: PromptAdapter = {
      isInteractive: () => false,
      ask: vi.fn(async () => 'n'),
    };

    const exitCode = await runCli(['node', 'bugbundle', 'collect', '--yes'], {
      io: capture.io,
      cwd: tempDir,
      collectors: createMockCollectors(),
      prompt,
    });

    expect(exitCode).toBe(0);
    const out = capture.getStdout();
    expect(out).toContain('System information');
    expect(out).toContain('Dependency information');
    expect(out).not.toContain('✓ Runtime information');
    expect(out).toContain('Runtime information was not collected.');
    expect(out).toContain('Saved diagnostic report to ./bugbundle-report.md');

    const saved = readFileSync(join(tempDir, 'bugbundle-report.md'), 'utf8');
    expect(saved).toContain('Runtime information was not collected.');
  });

  it('collect --yes never overwrites an existing report file', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'bugbundle-collect-exists-'));
    tempDirs.push(tempDir);
    const existingContent = 'DO NOT OVERWRITE\n';
    writeFileSync(join(tempDir, 'bugbundle-report.md'), existingContent);
    writeFileSync(
      join(tempDir, 'package.json'),
      JSON.stringify({ name: 'exists-app', version: '1.0.0' }),
    );

    const capture = createCapturedIo();
    const exitCode = await runCli(['node', 'bugbundle', 'collect', '--yes'], {
      io: capture.io,
      cwd: tempDir,
      collectors: createMockCollectors(),
    });

    expect(exitCode).toBe(6);
    expect(capture.getStderr()).toContain('FILE_EXISTS_ERROR');
    expect(readFileSync(join(tempDir, 'bugbundle-report.md'), 'utf8')).toBe(existingContent);
  });

  it('collect prevents review and export when security validation fails', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'bugbundle-collect-secfail-'));
    tempDirs.push(tempDir);

    const customRule: SecretRule = {
      id: 'residual-leak',
      name: 'Residual Leak',
      category: 'api_key',
      severity: 'critical',
      description: 'Simulates residual secret',
      pattern: /\b(LEAKED_TOKEN_[0-9]{6})\b/g,
      secretGroup: 1,
    };

    const leakingCollector: Collector = {
      meta: { id: 'system', name: 'System', description: 'Leaks', sensitivity: 'low' },
      async collect() {
        return {
          id: 'system',
          status: 'partial',
          warnings: ['LEAKED_TOKEN_123456'],
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
    const exitCode = await runCli(['node', 'bugbundle', 'collect', '--yes'], {
      io: capture.io,
      cwd: tempDir,
      collectors: [leakingCollector],
      securityPipeline: strictPipeline,
    });

    expect(exitCode).toBe(4);
    expect(capture.getStderr()).toContain('SECURITY_BOUNDARY_ERROR');
    expect(capture.getStdout()).not.toContain('DIAGNOSTIC REPORT PREVIEW');
    expect(existsSync(join(tempDir, 'bugbundle-report.md'))).toBe(false);
  });

  it('creates bugbundle.config.json with init and refuses to overwrite if it exists', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'bugbundle-init-cli-test-'));
    tempDirs.push(tempDir);

    const firstCapture = createCapturedIo();
    const firstExit = await runCli(['node', 'bugbundle', 'init'], {
      io: firstCapture.io,
      cwd: tempDir,
    });

    expect(firstExit).toBe(0);
    expect(firstCapture.getStdout()).toContain('Created bugbundle.config.json');
    expect(firstCapture.getStdout()).toContain('Generated configuration:');
    expect(existsSync(join(tempDir, CONFIG_FILENAME))).toBe(true);

    const createdContent = readFileSync(join(tempDir, CONFIG_FILENAME), 'utf8');

    const secondCapture = createCapturedIo();
    const secondExit = await runCli(['node', 'bugbundle', 'init'], {
      io: secondCapture.io,
      cwd: tempDir,
    });

    expect(secondExit).toBe(6);
    expect(secondCapture.getStderr()).toContain('FILE_EXISTS_ERROR');
    expect(readFileSync(join(tempDir, CONFIG_FILENAME), 'utf8')).toBe(createdContent);
  });

  it('runs inspect and prints sanitized Markdown preview without writing files', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'bugbundle-cli-test-'));
    tempDirs.push(tempDir);

    const capture = createCapturedIo();
    const exitCode = await runCli(['node', 'bugbundle', 'inspect'], {
      io: capture.io,
      cwd: tempDir,
      collectors: createMockCollectors(),
    });

    expect(exitCode).toBe(0);
    expect(capture.getStdout()).toContain('bugbundle inspect');
    expect(capture.getStdout()).toContain('# bugbundle Diagnostic Report');
    expect(capture.getStdout()).toContain('Preview only — no files were created or modified.');
    expect(capture.getStderr()).toBe('');
    expect(existsSync(join(tempDir, 'bugbundle-report.md'))).toBe(false);
    expect(existsSync(join(tempDir, CONFIG_FILENAME))).toBe(false);
  });

  it('returns exit code 2 for unknown commands', async () => {
    const capture = createCapturedIo();
    const exitCode = await runCli(['node', 'bugbundle', 'unknown-cmd'], { io: capture.io });

    expect(exitCode).toBe(2);
    expect(capture.getStderr()).toContain("unknown command 'unknown-cmd'");
  });
});
