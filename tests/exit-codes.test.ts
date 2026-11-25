import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { CommanderError } from 'commander';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BugbundleError,
  CollectorExecutionError,
  ConfigValidationError,
  EXIT_CODES,
  ExportError,
  FileExistsError,
  NonInteractiveApprovalError,
  ReviewAbortedError,
  SecurityBoundaryError,
  UserInterruptedError,
  formatCliError,
  resolveExitCode,
  runCli,
} from '../src/index.js';
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

describe('EXIT_CODES and resolveExitCode', () => {
  it('defines all standardized exit code constants', () => {
    expect(EXIT_CODES).toEqual({
      SUCCESS: 0,
      INTERNAL_ERROR: 1,
      INVALID_INPUT: 2,
      COLLECTION_FAILURE: 3,
      SECURITY_FAILURE: 4,
      REVIEW_REQUIRED: 5,
      EXPORT_FAILURE: 6,
      USER_INTERRUPTED: 130,
    });
  });

  it('maps every error class and unknown errors to the expected exit code', () => {
    expect(resolveExitCode(new CommanderError(0, 'commander.helpDisplayed', ''))).toBe(0);
    expect(resolveExitCode(new CommanderError(1, 'commander.unknownOption', 'bad flag'))).toBe(2);
    expect(resolveExitCode(new ConfigValidationError('invalid config'))).toBe(2);
    expect(resolveExitCode(new CollectorExecutionError('collector failed'))).toBe(3);
    expect(resolveExitCode(new SecurityBoundaryError('security blocked'))).toBe(4);
    expect(resolveExitCode(new ReviewAbortedError())).toBe(5);
    expect(resolveExitCode(new NonInteractiveApprovalError())).toBe(5);
    expect(resolveExitCode(new FileExistsError('exists'))).toBe(6);
    expect(resolveExitCode(new ExportError('EACCES'))).toBe(6);
    expect(resolveExitCode(new UserInterruptedError())).toBe(130);

    const abortErr = new Error('aborted');
    abortErr.name = 'AbortError';
    expect(resolveExitCode(abortErr)).toBe(130);

    expect(resolveExitCode(new BugbundleError({ code: 'INTERNAL_ERROR', message: 'boom' }))).toBe(
      1,
    );
    expect(resolveExitCode(new Error('unexpected'))).toBe(1);
    expect(resolveExitCode('non-error string')).toBe(1);

    expect(formatCliError(new SecurityBoundaryError('blocked')).exitCode).toBe(4);
  });

  it('maps collection failure (all collectors error) to exit code 3', async () => {
    const failingCollector: Collector = {
      meta: { id: 'system', name: 'System', description: 'Fails', sensitivity: 'low' },
      async collect() {
        throw new Error('Fatal collector failure');
      },
    };

    const capture = createCapturedIo();
    const exitCode = await runCli(['node', 'bugbundle', 'inspect'], {
      io: capture.io,
      collectors: [failingCollector],
    });

    expect(exitCode).toBe(3);
    expect(capture.getStderr()).toContain('COLLECTOR_EXECUTION_ERROR');
  });

  it('maps Ctrl+C / prompt AbortError during collect review to exit code 130', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'bugbundle-sigint-test-'));
    try {
      const okCollector: Collector = {
        meta: { id: 'system', name: 'System', description: 'OK', sensitivity: 'low' },
        async collect() {
          return {
            id: 'system',
            status: 'ok',
            data: {
              platform: 'linux',
              release: '6.8.0',
              arch: 'x64',
              nodeVersion: 'v22.17.1',
              cpu: { model: 'CPU', cores: 2 },
            },
            warnings: [],
            durationMs: 1,
          };
        },
      };

      const prompt: PromptAdapter = {
        isInteractive: () => true,
        ask: vi.fn(async () => {
          const err = new Error('aborted');
          err.name = 'AbortError';
          throw err;
        }),
      };

      const capture = createCapturedIo();
      const exitCode = await runCli(['node', 'bugbundle', 'collect'], {
        io: capture.io,
        cwd: dir,
        collectors: [okCollector],
        prompt,
      });

      expect(exitCode).toBe(130);
      expect(capture.getStderr()).toContain('USER_INTERRUPTED_ERROR');
      expect(existsSync(join(dir, 'bugbundle-report.md'))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('spawned CLI process exit codes', () => {
  const tempDirs: string[] = [];
  const cliPath = resolve('dist/cli/index.js');

  function makeWorkspace(): string {
    const dir = mkdtempSync(join(tmpdir(), 'bugbundle-spawn-test-'));
    tempDirs.push(dir);
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({ name: 'spawn-app', version: '1.0.0' }),
    );
    return dir;
  }

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('returns exact OS exit codes for real spawned CLI commands', () => {
    if (!existsSync(cliPath)) {
      throw new Error(`Compiled CLI not found at ${cliPath}; run npm run build before tests.`);
    }

    const dir = makeWorkspace();

    const helpRes = spawnSync(process.execPath, [cliPath, '--help'], {
      cwd: dir,
      encoding: 'utf8',
    });
    expect(helpRes.status).toBe(0);

    const badFlagRes = spawnSync(process.execPath, [cliPath, 'collect', '--unknown-flag'], {
      cwd: dir,
      encoding: 'utf8',
    });
    expect(badFlagRes.status).toBe(2);

    const badIncludeRes = spawnSync(
      process.execPath,
      [cliPath, 'collect', '--include', 'invalid', '--yes'],
      { cwd: dir, encoding: 'utf8' },
    );
    expect(badIncludeRes.status).toBe(2);

    const inspectRes = spawnSync(process.execPath, [cliPath, 'inspect'], {
      cwd: dir,
      encoding: 'utf8',
    });
    expect(inspectRes.status).toBe(0);

    const initRes1 = spawnSync(process.execPath, [cliPath, 'init'], {
      cwd: dir,
      encoding: 'utf8',
    });
    expect(initRes1.status).toBe(0);

    const initRes2 = spawnSync(process.execPath, [cliPath, 'init'], {
      cwd: dir,
      encoding: 'utf8',
    });
    expect(initRes2.status).toBe(6);

    const collectNoYesRes = spawnSync(process.execPath, [cliPath, 'collect'], {
      cwd: dir,
      input: '',
      encoding: 'utf8',
    });
    expect(collectNoYesRes.status).toBe(5);

    const collectYesRes1 = spawnSync(process.execPath, [cliPath, 'collect', '--yes'], {
      cwd: dir,
      encoding: 'utf8',
    });
    expect(collectYesRes1.status).toBe(0);

    const collectYesRes2 = spawnSync(process.execPath, [cliPath, 'collect', '--yes'], {
      cwd: dir,
      encoding: 'utf8',
    });
    expect(collectYesRes2.status).toBe(6);
  });
});
