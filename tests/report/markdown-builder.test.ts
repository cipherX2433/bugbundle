import { describe, expect, it } from 'vitest';
import { SecurityBoundaryError } from '../../src/errors/index.js';
import { buildMarkdownReport, createReportInputFromPipeline } from '../../src/report/index.js';
import { SecurityPipeline } from '../../src/security/index.js';
import type { DiagnosticBundle } from '../../src/types/index.js';

function createCompleteBundle(): DiagnosticBundle {
  return {
    generatedAt: '2026-11-25T14:00:00.000Z',
    cliVersion: '0.1.0',
    warnings: ['[runtimes] Optional runtime "Bun" is not installed or not on PATH.'],
    results: [
      {
        id: 'system',
        status: 'ok',
        warnings: [],
        durationMs: 2,
        data: {
          platform: 'darwin',
          release: '24.6.0',
          arch: 'arm64',
          nodeVersion: 'v22.17.1',
          cpu: {
            model: 'Apple M4',
            cores: 10,
          },
        },
      },
      {
        id: 'runtimes',
        status: 'ok',
        warnings: ['Optional runtime "Bun" is not installed or not on PATH.'],
        durationMs: 12,
        data: {
          detectedCount: 2,
          missingOptionalCount: 1,
          tools: [
            { id: 'node', name: 'Node.js', required: true, status: 'detected', version: '22.17.1' },
            { id: 'npm', name: 'npm', required: true, status: 'detected', version: '11.5.2' },
            { id: 'bun', name: 'Bun', required: false, status: 'missing' },
          ],
        },
      },
      {
        id: 'dependencies',
        status: 'ok',
        warnings: [],
        durationMs: 5,
        data: {
          manifestPresent: true,
          projectName: 'sample-lib',
          projectVersion: '1.2.3',
          packageManager: 'npm@11.5.2',
          dependencies: {
            commander: '^13.1.0',
            zod: '^3.24.2',
          },
          devDependencies: {
            vitest: '^3.0.8',
          },
          counts: {
            dependencies: 2,
            devDependencies: 1,
            total: 3,
          },
          lockfiles: [
            {
              filename: 'package-lock.json',
              type: 'npm',
              present: true,
              supported: true,
              lockfileVersion: 3,
            },
          ],
        },
      },
    ],
  };
}

describe('buildMarkdownReport', () => {
  it('generates all expected sections for a complete diagnostic bundle', () => {
    const markdown = buildMarkdownReport({
      bundle: createCompleteBundle(),
      projectName: 'sample-lib',
      security: {
        validated: true,
        redactionCount: 0,
        pathReplacements: 0,
      },
    });

    expect(markdown).toContain('# bugbundle Diagnostic Report');
    expect(markdown).toContain('## System Information');
    expect(markdown).toContain('## Runtime Information');
    expect(markdown).toContain('## Dependency Information');
    expect(markdown).toContain('## Collection Warnings');
    expect(markdown).toContain('## Privacy and Security Summary');

    expect(markdown).toContain('`bugbundle v0.1.0`');
    expect(markdown).toContain('| Project | sample-lib |');
    expect(markdown).toContain('`darwin`');
    expect(markdown).toContain('`arm64`');
    expect(markdown).toContain('Apple M4');
    expect(markdown).toContain('| Bun | Optional | missing | not installed |');
    expect(markdown).toContain('| `package-lock.json` | npm | Yes | `3` | - |');
    expect(markdown).toContain('| `commander` | `^13.1.0` |');
    expect(markdown).toContain('| Security Validation | Passed |');
  });

  it('handles missing optional system information cleanly', () => {
    const bundle = createCompleteBundle();
    const withoutSystem: DiagnosticBundle = {
      ...bundle,
      results: bundle.results.filter((r) => r.id !== 'system'),
    };

    const markdown = buildMarkdownReport({ bundle: withoutSystem });
    expect(markdown).toContain('## System Information\n\nSystem information was not collected.');
  });

  it('handles missing runtime information cleanly', () => {
    const bundle = createCompleteBundle();
    const withoutRuntimes: DiagnosticBundle = {
      ...bundle,
      results: bundle.results.filter((r) => r.id !== 'runtimes'),
    };

    const markdown = buildMarkdownReport({ bundle: withoutRuntimes });
    expect(markdown).toContain('## Runtime Information\n\nRuntime information was not collected.');
  });

  it('handles missing dependency information cleanly', () => {
    const bundle = createCompleteBundle();
    const withoutDeps: DiagnosticBundle = {
      ...bundle,
      results: bundle.results.filter((r) => r.id !== 'dependencies'),
    };

    const markdown = buildMarkdownReport({ bundle: withoutDeps });
    expect(markdown).toContain(
      '## Dependency Information\n\nDependency information was not collected.',
    );
  });

  it('renders clean message when warning lists are empty', () => {
    const bundle: DiagnosticBundle = {
      ...createCompleteBundle(),
      warnings: [],
    };

    const markdown = buildMarkdownReport({ bundle });
    expect(markdown).toContain('## Collection Warnings\n\nNo collection warnings or errors.');
  });

  it('renders multiple collection warnings and safe error summaries without raw stack traces', () => {
    const bundle: DiagnosticBundle = {
      generatedAt: '2026-11-25T14:00:00.000Z',
      cliVersion: '0.1.0',
      warnings: [
        '[runtimes] Optional runtime "Bun" is not installed.',
        '[dependencies] No supported lockfile found in target directory.',
      ],
      results: [
        {
          id: 'system',
          status: 'error',
          warnings: [],
          error: {
            code: 'COLLECTOR_EXECUTION_ERROR',
            message: 'Host CPU API unavailable',
          },
          durationMs: 1,
        },
      ],
    };

    const markdown = buildMarkdownReport({ bundle });

    expect(markdown).toContain('- \\[runtimes\\] Optional runtime "Bun" is not installed.');
    expect(markdown).toContain(
      '- \\[dependencies\\] No supported lockfile found in target directory.',
    );
    expect(markdown).toContain(
      '- \\[system\\] COLLECTOR\\_EXECUTION\\_ERROR: Host CPU API unavailable',
    );
    expect(markdown).toContain('| Collection Warnings | 3 |');
  });

  it('includes accurate redaction and path sanitization summary from SecurityPipeline', () => {
    const pipeline = new SecurityPipeline({
      pathSanitizerOptions: {
        homeDir: '/Users/alice',
        username: 'alice',
      },
    });

    const rawBundle: DiagnosticBundle = {
      generatedAt: '2026-11-25T14:00:00.000Z',
      cliVersion: '0.1.0',
      warnings: ['Auth header Authorization: Bearer syntheticSecretToken12345 at /Users/alice/app'],
      results: [],
    };

    const secured = pipeline.processValue(rawBundle);
    const input = createReportInputFromPipeline(secured, { projectName: 'my-app' });
    const markdown = buildMarkdownReport(input);

    expect(markdown).toContain('| Security Validation | Passed |');
    expect(markdown).toContain('| Redactions Applied | 1 |');
    expect(markdown).toContain('| Path Sanitizations | 1 |');
    expect(markdown).toContain('\\[REDACTED\\]');
    expect(markdown).toContain('&lt;HOME&gt;/app');
    expect(markdown).not.toContain('syntheticSecretToken12345');
    expect(markdown).not.toContain('alice');
  });

  it('escapes Markdown-special characters in project names and collected values to prevent injection', () => {
    const bundle: DiagnosticBundle = {
      generatedAt: '2026-11-25T14:00:00.000Z',
      cliVersion: '0.1.0',
      warnings: ['Bad warning\n# Injected Heading\n<script>alert(1)</script> | col2'],
      results: [
        {
          id: 'system',
          status: 'ok',
          warnings: [],
          durationMs: 1,
          data: {
            platform: 'linux',
            release: '6.8.0',
            arch: 'x64',
            nodeVersion: 'v22.17.1',
            cpu: {
              model: 'Intel *Core* [Fake](https://evil.test) | #1',
              cores: 4,
            },
          },
        },
      ],
    };

    const markdown = buildMarkdownReport({
      bundle,
      projectName: 'evil | `code` # Heading <img src=x>',
    });

    expect(markdown).not.toContain('\n# Injected Heading');
    expect(markdown).not.toContain('<script>');
    expect(markdown).not.toContain('<img src=x>');
    expect(markdown).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(markdown).toContain('evil \\| \\`code\\` # Heading &lt;img src=x&gt;');
    expect(markdown).toContain('Intel \\*Core\\* \\[Fake\\](https://evil.test) \\| #1');
  });

  it('escapes pipe characters inside inline code spans in table cells', () => {
    const bundle = createCompleteBundle();
    const withPipe: DiagnosticBundle = {
      ...bundle,
      results: bundle.results.map((r) =>
        r.id === 'system'
          ? {
              ...r,
              data: {
                ...(r.data as Record<string, unknown>),
                platform: 'linux|custom',
              },
            }
          : r,
      ),
    };

    const markdown = buildMarkdownReport({ bundle: withPipe });
    expect(markdown).toContain('| Platform | `linux\\|custom` |');
  });

  it('refuses to build a report when security validation failed', () => {
    expect(() =>
      buildMarkdownReport({
        bundle: createCompleteBundle(),
        security: {
          validated: false,
          redactionCount: 0,
        },
      }),
    ).toThrow(SecurityBoundaryError);
  });

  it('handles empty or minimal diagnostic input safely', () => {
    const emptyBundle: DiagnosticBundle = {
      generatedAt: '',
      cliVersion: '',
      warnings: [],
      results: [],
    };

    const markdown = buildMarkdownReport({ bundle: emptyBundle });

    expect(markdown).toContain('# bugbundle Diagnostic Report');
    expect(markdown).toContain('`bugbundle vunknown`');
    expect(markdown).toContain('System information was not collected.');
    expect(markdown).toContain('Runtime information was not collected.');
    expect(markdown).toContain('Dependency information was not collected.');
    expect(markdown).toContain('No collection warnings or errors.');
    expect(markdown).toContain('| Security Validation | Not attached |');
  });

  it('produces deterministic output for identical inputs', () => {
    const input = {
      bundle: createCompleteBundle(),
      projectName: 'sample-lib',
      security: {
        validated: true,
        redactionCount: 0,
        pathReplacements: 0,
      },
    };

    const first = buildMarkdownReport(input);
    const second = buildMarkdownReport(input);
    expect(first).toBe(second);
  });
});
