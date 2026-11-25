import { describe, expect, it } from 'vitest';
import { DiagnosticOrchestrator } from '../../src/core/index.js';
import { PathSecurityGuard } from '../../src/security/index.js';
import type { Collector, DiagnosticContext } from '../../src/types/index.js';

function createContext(cwd = process.cwd()): DiagnosticContext {
  return {
    cwd,
    config: {
      cwd,
      outputPath: 'bugbundle-report.md',
    },
    securityGuard: new PathSecurityGuard(cwd),
  };
}

describe('DiagnosticOrchestrator', () => {
  it('isolates failing collectors without crashing healthy collectors', async () => {
    const healthyCollector: Collector<{ value: string }> = {
      meta: {
        id: 'healthy',
        name: 'Healthy',
        description: 'Works',
        sensitivity: 'low',
      },
      async collect() {
        return {
          id: 'healthy',
          status: 'ok',
          data: { value: 'ok' },
          warnings: ['minor warning'],
          durationMs: 1,
        };
      },
    };

    const throwingCollector: Collector = {
      meta: {
        id: 'broken',
        name: 'Broken',
        description: 'Throws unexpectedly',
        sensitivity: 'low',
      },
      async collect() {
        throw new Error('boom');
      },
    };

    const orchestrator = new DiagnosticOrchestrator({
      collectors: [healthyCollector, throwingCollector],
      cliVersion: '0.1.0',
      now: () => new Date('2026-11-25T00:00:00.000Z'),
    });

    const bundle = await orchestrator.collect(createContext());

    expect(bundle.generatedAt).toBe('2026-11-25T00:00:00.000Z');
    expect(bundle.results).toHaveLength(2);
    expect(bundle.results[0]?.status).toBe('ok');
    expect(bundle.results[1]?.status).toBe('error');
    expect(bundle.results[1]?.error).toEqual({
      code: 'COLLECTOR_EXECUTION_ERROR',
      message: 'boom',
    });
    expect(bundle.warnings).toEqual(['[healthy] minor warning']);
  });
});
