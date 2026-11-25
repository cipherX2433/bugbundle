import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createDependenciesCollector,
  createRuntimesCollector,
  createSystemCollector,
} from '../src/collectors/index.js';
import { CONFIG_FILENAME } from '../src/config/index.js';
import { runCli } from '../src/index.js';
import type { PromptAdapter } from '../src/review/index.js';
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
    release: () => '6.8.0',
    arch: () => 'x64',
    nodeVersion: () => 'v22.17.1',
    cpus: () => [{ model: 'Synthetic CPU' }, { model: 'Synthetic CPU' }],
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

describe('bugbundle collect CLI flags (--output, --include, --exclude)', () => {
  const tempDirs: string[] = [];

  function makeWorkspace(): string {
    const dir = mkdtempSync(join(tmpdir(), 'bugbundle-flags-test-'));
    tempDirs.push(dir);
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({ name: 'flags-app', version: '1.0.0', dependencies: { zod: '^3.24.2' } }),
    );
    writeFileSync(join(dir, 'package-lock.json'), JSON.stringify({ lockfileVersion: 3 }));
    return dir;
  }

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('documents --output, --include, --exclude, and --yes in collect --help', async () => {
    const capture = createCapturedIo();
    const exitCode = await runCli(['node', 'bugbundle', 'collect', '--help'], { io: capture.io });

    expect(exitCode).toBe(0);
    const out = capture.getStdout();
    expect(out).toContain('--output <path>');
    expect(out).toContain('--include <collectors>');
    expect(out).toContain('--exclude <collectors>');
    expect(out).toContain('--yes');
  });

  it('writes to custom relative --output path in existing directory and displays destination in prompt', async () => {
    const dir = makeWorkspace();
    mkdirSync(join(dir, 'reports'), { recursive: true });

    const capture = createCapturedIo();
    const prompt: PromptAdapter = {
      isInteractive: () => true,
      ask: vi.fn(async (question) => {
        expect(question).toContain('./reports/issue.md');
        return 'y';
      }),
    };

    const exitCode = await runCli(
      ['node', 'bugbundle', 'collect', '--output', './reports/issue.md'],
      {
        io: capture.io,
        cwd: dir,
        collectors: createMockCollectors(),
        prompt,
      },
    );

    expect(exitCode).toBe(0);
    expect(existsSync(join(dir, 'reports', 'issue.md'))).toBe(true);
    expect(existsSync(join(dir, 'bugbundle-report.md'))).toBe(false);
    expect(capture.getStdout()).toContain('Saved diagnostic report to ./reports/issue.md');
  });

  it('supports equivalent relative subdirectory paths in bugbundle.config.json report.filename', async () => {
    const dir = makeWorkspace();
    mkdirSync(join(dir, 'reports'));
    writeFileSync(
      join(dir, CONFIG_FILENAME),
      JSON.stringify({
        report: { filename: './reports/from-config.md' },
      }),
    );

    const capture = createCapturedIo();
    const exitCode = await runCli(['node', 'bugbundle', 'collect', '--yes'], {
      io: capture.io,
      cwd: dir,
      collectors: createMockCollectors(),
    });

    expect(exitCode).toBe(0);
    expect(existsSync(join(dir, 'reports', 'from-config.md'))).toBe(true);
    expect(capture.getStdout()).toContain('Saved diagnostic report to ./reports/from-config.md');
  });

  it('rejects missing parent directory, traversal, symlink escape, restricted output, and existing target', async () => {
    const dir = makeWorkspace();
    const outside = makeWorkspace();
    const outsideFile = join(outside, 'outside.md');
    writeFileSync(outsideFile, 'outside');
    symlinkSync(outsideFile, join(dir, 'link-escape.md'));
    writeFileSync(join(dir, 'existing.md'), 'KEEP_ME');

    const badCases: readonly { readonly args: readonly string[]; readonly expectedExit: number }[] =
      [
        { args: ['--output', './missing-dir/issue.md', '--yes'], expectedExit: 6 },
        { args: ['--output', '../escape.md', '--yes'], expectedExit: 4 },
        { args: ['--output', './link-escape.md', '--yes'], expectedExit: 4 },
        { args: ['--output', '.env', '--yes'], expectedExit: 4 },
        { args: ['--output', './existing.md', '--yes'], expectedExit: 6 },
      ];

    for (const { args, expectedExit } of badCases) {
      const capture = createCapturedIo();
      const exitCode = await runCli(['node', 'bugbundle', 'collect', ...args], {
        io: capture.io,
        cwd: dir,
        collectors: createMockCollectors(),
      });
      expect(exitCode).toBe(expectedExit);
    }

    expect(existsSync(join(dir, 'missing-dir'))).toBe(false);
    expect(readFileSync(join(dir, 'existing.md'), 'utf8')).toBe('KEEP_ME');
    expect(readFileSync(outsideFile, 'utf8')).toBe('outside');
  });

  it('supports --include with single, multiple, duplicate, and whitespace-padded collectors', async () => {
    const dir = makeWorkspace();
    const capture = createCapturedIo();

    const exitCode = await runCli(
      ['node', 'bugbundle', 'collect', '--include', ' system , dependencies , system ', '--yes'],
      {
        io: capture.io,
        cwd: dir,
        collectors: createMockCollectors(),
      },
    );

    expect(exitCode).toBe(0);
    const report = readFileSync(join(dir, 'bugbundle-report.md'), 'utf8');
    expect(report).toContain('| Platform | `linux` |');
    expect(report).toContain('| Manifest | package.json found |');
    expect(report).toContain('Runtime information was not collected.');
  });

  it('rejects empty or unknown --include / --exclude collector names', async () => {
    const dir = makeWorkspace();

    for (const badArgs of [
      ['--include', '', '--yes'],
      ['--include', 'unknown', '--yes'],
      ['--exclude', 'docker', '--yes'],
      ['--exclude', 'system,runtimes,dependencies', '--yes'],
    ]) {
      const capture = createCapturedIo();
      const exitCode = await runCli(['node', 'bugbundle', 'collect', ...badArgs], {
        io: capture.io,
        cwd: dir,
        collectors: createMockCollectors(),
      });
      expect(exitCode).toBe(2);
      expect(capture.getStderr()).toContain('CONFIG_VALIDATION_ERROR');
      expect(existsSync(join(dir, 'bugbundle-report.md'))).toBe(false);
    }
  });

  it('enforces configuration precedence when combining config exclusions, --include, --exclude, --output, and --yes', async () => {
    const dir = makeWorkspace();
    writeFileSync(
      join(dir, CONFIG_FILENAME),
      JSON.stringify({
        collectors: {
          enabled: ['system', 'runtimes'],
        },
      }),
    );

    // Attempting to --include dependencies when config only enabled system & runtimes must fail
    const deniedCapture = createCapturedIo();
    const deniedExit = await runCli(
      ['node', 'bugbundle', 'collect', '--include', 'dependencies', '--yes'],
      {
        io: deniedCapture.io,
        cwd: dir,
        collectors: createMockCollectors(),
      },
    );
    expect(deniedExit).toBe(2);
    expect(deniedCapture.getStderr()).toContain('CONFIG_VALIDATION_ERROR');

    // Valid combined flags: config enables [system, runtimes], --include system,runtimes, --exclude runtimes -> only system runs
    const okCapture = createCapturedIo();
    const okExit = await runCli(
      [
        'node',
        'bugbundle',
        'collect',
        '--include',
        'system,runtimes',
        '--exclude',
        'runtimes',
        '--output',
        './issue.md',
        '--yes',
      ],
      {
        io: okCapture.io,
        cwd: dir,
        collectors: createMockCollectors(),
      },
    );

    expect(okExit).toBe(0);
    const out = okCapture.getStdout();
    expect(out).toContain('✓ System information');
    expect(out).not.toContain('✓ Runtime information');
    expect(out).not.toContain('✓ Dependency information');
    expect(out).toContain('Saved diagnostic report to ./issue.md');

    const saved = readFileSync(join(dir, 'issue.md'), 'utf8');
    expect(saved).toContain('| Platform | `linux` |');
    expect(saved).toContain('Runtime information was not collected.');
    expect(saved).toContain('Dependency information was not collected.');
  });

  it('keeps SecurityPipeline enforced when --include and --yes are used', async () => {
    const dir = makeWorkspace();
    const customRule: SecretRule = {
      id: 'residual-secret',
      name: 'Residual Secret',
      category: 'api_key',
      severity: 'critical',
      description: 'Residual secret check',
      pattern: /\b(RESIDUAL_FLAG_SECRET_[0-9]{4})\b/g,
      secretGroup: 1,
    };

    const leakingSystem: Collector = {
      meta: { id: 'system', name: 'System', description: 'Leaks', sensitivity: 'low' },
      async collect() {
        return {
          id: 'system',
          status: 'partial',
          warnings: ['RESIDUAL_FLAG_SECRET_9999'],
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
    const exitCode = await runCli(
      ['node', 'bugbundle', 'collect', '--include', 'system', '--output', './issue.md', '--yes'],
      {
        io: capture.io,
        cwd: dir,
        collectors: [leakingSystem],
        securityPipeline: strictPipeline,
      },
    );

    expect(exitCode).toBe(4);
    expect(capture.getStderr()).toContain('SECURITY_BOUNDARY_ERROR');
    expect(existsSync(join(dir, 'issue.md'))).toBe(false);
  });
});
