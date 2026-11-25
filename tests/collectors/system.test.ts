import { describe, expect, it } from 'vitest';
import { createSystemCollector } from '../../src/collectors/system.js';
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

describe('systemCollector', () => {
  it('collects OS platform, release, arch, Node version, and safe CPU metadata without PII', async () => {
    const collector = createSystemCollector({
      platform: () => 'linux',
      release: () => '6.8.0-generic',
      arch: () => 'x64',
      nodeVersion: () => 'v22.17.1',
      cpus: () => [{ model: '  AMD Ryzen 7 7840U  ' }, { model: 'AMD Ryzen 7 7840U' }],
    });

    const result = await collector.collect(createTestContext());

    expect(result.id).toBe('system');
    expect(result.status).toBe('ok');
    expect(result.warnings).toEqual([]);
    expect(result.data).toEqual({
      platform: 'linux',
      release: '6.8.0-generic',
      arch: 'x64',
      nodeVersion: 'v22.17.1',
      cpu: {
        model: 'AMD Ryzen 7 7840U',
        cores: 2,
      },
    });

    const serialized = JSON.stringify(result.data);
    expect(serialized).not.toContain('hostname');
    expect(serialized).not.toContain('username');
    expect(serialized).not.toContain('homedir');
  });

  it('returns partial status with warning when CPU list is empty', async () => {
    const collector = createSystemCollector({
      platform: () => 'darwin',
      release: () => '24.0.0',
      arch: () => 'arm64',
      nodeVersion: () => 'v22.17.1',
      cpus: () => [],
    });

    const result = await collector.collect(createTestContext());

    expect(result.status).toBe('partial');
    expect(result.warnings).toContain('CPU metadata unavailable from host OS.');
    expect(result.data?.cpu).toEqual({ model: 'unknown', cores: 0 });
  });

  it('isolates adapter errors without throwing', async () => {
    const collector = createSystemCollector({
      platform: () => {
        throw new Error('OS API unavailable');
      },
      release: () => '1.0.0',
      arch: () => 'x64',
      nodeVersion: () => 'v22.17.1',
      cpus: () => [],
    });

    const result = await collector.collect(createTestContext());

    expect(result.status).toBe('error');
    expect(result.error).toEqual({
      code: 'COLLECTOR_EXECUTION_ERROR',
      message: 'OS API unavailable',
    });
  });
});
