import { describe, expect, it, vi } from 'vitest';
import { createRuntimesCollector, type ProcessRunner } from '../../src/collectors/runtimes.js';
import { PathSecurityGuard } from '../../src/security/index.js';
import type { DiagnosticContext } from '../../src/types/index.js';

function createTestContext(cwd = process.cwd()): DiagnosticContext {
  return {
    cwd,
    config: {
      cwd,
      outputPath: 'bugbundle-report.md',
    },
    securityGuard: new PathSecurityGuard(cwd),
  };
}

describe('runtimesCollector', () => {
  it('detects all primary and optional runtimes and normalizes versions', async () => {
    const runner: ProcessRunner = {
      run: vi.fn(async (exe, args) => {
        expect(args.length).toBeGreaterThan(0);
        switch (exe) {
          case 'node':
            return { ok: true, stdout: 'v22.17.1\n', stderr: '', timedOut: false, notFound: false };
          case 'npm':
            return { ok: true, stdout: '11.5.2\n', stderr: '', timedOut: false, notFound: false };
          case 'pnpm':
            return { ok: true, stdout: '9.15.0\n', stderr: '', timedOut: false, notFound: false };
          case 'yarn':
            return { ok: true, stdout: '1.22.22\n', stderr: '', timedOut: false, notFound: false };
          case 'bun':
            return { ok: true, stdout: '1.2.4\n', stderr: '', timedOut: false, notFound: false };
          case 'python3':
            return {
              ok: true,
              stdout: 'Python 3.12.4\n',
              stderr: '',
              timedOut: false,
              notFound: false,
            };
          case 'java':
            return {
              ok: true,
              stdout: '',
              stderr: 'openjdk version "21.0.3" 2024-04-16\n',
              timedOut: false,
              notFound: false,
            };
          default:
            return { ok: false, stdout: '', stderr: '', timedOut: false, notFound: true };
        }
      }),
    };

    const collector = createRuntimesCollector({ runner, timeoutMs: 1000 });
    const result = await collector.collect(createTestContext());

    expect(result.id).toBe('runtimes');
    expect(result.status).toBe('ok');
    expect(result.warnings).toEqual([]);
    expect(result.data?.detectedCount).toBe(7);
    expect(result.data?.missingOptionalCount).toBe(0);
    expect(result.data?.tools.map((t) => [t.id, t.version])).toEqual([
      ['node', '22.17.1'],
      ['npm', '11.5.2'],
      ['pnpm', '9.15.0'],
      ['yarn', '1.22.22'],
      ['bun', '1.2.4'],
      ['python', '3.12.4'],
      ['java', '21.0.3'],
    ]);
  });

  it('handles missing optional runtimes gracefully with warnings and ok status', async () => {
    const runner: ProcessRunner = {
      run: vi.fn(async (exe) => {
        if (exe === 'node') {
          return { ok: true, stdout: 'v22.17.1\n', stderr: '', timedOut: false, notFound: false };
        }
        if (exe === 'npm') {
          return { ok: true, stdout: '11.5.2\n', stderr: '', timedOut: false, notFound: false };
        }
        return { ok: false, stdout: '', stderr: '', timedOut: false, notFound: true };
      }),
    };

    const collector = createRuntimesCollector({ runner });
    const result = await collector.collect(createTestContext());

    expect(result.status).toBe('ok');
    expect(result.data?.detectedCount).toBe(2);
    expect(result.data?.missingOptionalCount).toBe(5);
    expect(result.warnings.length).toBe(5);
    expect(result.warnings.some((w) => w.includes('Optional runtime "Bun"'))).toBe(true);
  });

  it('keeps ok status with warning when an optional runtime shim exits non-zero', async () => {
    const runner: ProcessRunner = {
      run: vi.fn(async (exe) => {
        if (exe === 'node') {
          return { ok: true, stdout: 'v22.17.1\n', stderr: '', timedOut: false, notFound: false };
        }
        if (exe === 'npm') {
          return { ok: true, stdout: '11.5.2\n', stderr: '', timedOut: false, notFound: false };
        }
        if (exe === 'pnpm') {
          return {
            ok: false,
            stdout: '',
            stderr: 'Corepack shim error',
            timedOut: false,
            notFound: false,
          };
        }
        return { ok: false, stdout: '', stderr: '', timedOut: false, notFound: true };
      }),
    };

    const collector = createRuntimesCollector({ runner });
    const result = await collector.collect(createTestContext());

    expect(result.status).toBe('ok');
    expect(result.warnings).toContain(
      'Optional runtime "pnpm" is unavailable (version check failed).',
    );
  });

  it('handles process timeouts and missing primary runtime as partial without crashing', async () => {
    const runner: ProcessRunner = {
      run: vi.fn(async (exe) => {
        if (exe === 'node') {
          return { ok: true, stdout: 'v22.17.1', stderr: '', timedOut: false, notFound: false };
        }
        if (exe === 'npm') {
          return { ok: false, stdout: '', stderr: '', timedOut: false, notFound: true };
        }
        if (exe === 'pnpm') {
          return { ok: false, stdout: '', stderr: '', timedOut: true, notFound: false };
        }
        return { ok: false, stdout: '', stderr: '', timedOut: false, notFound: true };
      }),
    };

    const collector = createRuntimesCollector({ runner, timeoutMs: 250 });
    const result = await collector.collect(createTestContext());

    expect(result.status).toBe('partial');
    expect(result.warnings).toContain('Primary runtime "npm" is not available on PATH.');
    expect(result.warnings).toContain('pnpm version check timed out after 250ms.');

    const pnpmTool = result.data?.tools.find((t) => t.id === 'pnpm');
    expect(pnpmTool?.status).toBe('timeout');
  });

  it('isolates unexpected runner exceptions into CollectorResult error', async () => {
    const runner: ProcessRunner = {
      run: vi.fn(async () => {
        throw new Error('Unexpected spawn failure');
      }),
    };

    const collector = createRuntimesCollector({ runner });
    const result = await collector.collect(createTestContext());

    expect(result.status).toBe('error');
    expect(result.error).toEqual({
      code: 'COLLECTOR_EXECUTION_ERROR',
      message: 'Unexpected spawn failure',
    });
  });
});
