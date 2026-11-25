import { describe, expect, it } from 'vitest';
import {
  DEFAULT_REPORT_FILENAME,
  KNOWN_COLLECTOR_IDS,
  createDefaultConfig,
  validateConfig,
} from '../../src/config/index.js';
import { ConfigValidationError } from '../../src/errors/index.js';

describe('BugbundleConfig schema', () => {
  it('validates a complete valid configuration', () => {
    const config = validateConfig({
      projectName: 'my-node-lib',
      collectors: {
        enabled: ['system', 'dependencies'],
        excluded: ['runtimes'],
      },
      report: {
        filename: 'custom-report.md',
        includeWarnings: false,
      },
      options: {
        includeDevDependencies: false,
        processTimeoutMs: 5000,
      },
    });

    expect(config).toEqual({
      projectName: 'my-node-lib',
      collectors: {
        enabled: ['system', 'dependencies'],
        excluded: ['runtimes'],
      },
      report: {
        filename: 'custom-report.md',
        includeWarnings: false,
      },
      options: {
        includeDevDependencies: false,
        processTimeoutMs: 5000,
      },
    });
  });

  it('fills defaults cleanly when optional fields are omitted', () => {
    const config = validateConfig({});

    expect(config).toEqual({
      collectors: {},
      report: {
        filename: DEFAULT_REPORT_FILENAME,
        includeWarnings: true,
      },
      options: {
        includeDevDependencies: true,
        processTimeoutMs: 3000,
      },
    });
  });

  it('creates a valid default configuration', () => {
    const def = createDefaultConfig('bugbundle');
    expect(def.projectName).toBe('bugbundle');
    expect(def.collectors.enabled).toEqual([...KNOWN_COLLECTOR_IDS]);
    expect(def.collectors.excluded).toEqual([]);
    expect(def.report.filename).toBe(DEFAULT_REPORT_FILENAME);
  });

  it('rejects invalid field types and malformed root values', () => {
    expect(() => validateConfig(null)).toThrow(ConfigValidationError);
    expect(() => validateConfig([])).toThrow(ConfigValidationError);
    expect(() => validateConfig('invalid')).toThrow(ConfigValidationError);
    expect(() =>
      validateConfig({
        projectName: 123,
      }),
    ).toThrow(ConfigValidationError);
    expect(() =>
      validateConfig({
        options: {
          processTimeoutMs: 100, // below min 500
        },
      }),
    ).toThrow(ConfigValidationError);
    expect(() =>
      validateConfig({
        collectors: {
          enabled: ['unknown-collector'],
        },
      }),
    ).toThrow(ConfigValidationError);
  });

  it('rejects unknown fields and security bypass attempts', () => {
    expect(() =>
      validateConfig({
        unknownFlag: true,
      }),
    ).toThrow(ConfigValidationError);

    expect(() =>
      validateConfig({
        skipReview: true,
        allowEnv: true,
        scanNodeModules: true,
      }),
    ).toThrow(ConfigValidationError);

    expect(() =>
      validateConfig({
        options: {
          bypassPrivacyValidator: true,
        },
      }),
    ).toThrow(ConfigValidationError);
  });

  it('accepts safe relative subdirectory paths and rejects unsafe targets in report.filename', () => {
    const withSubdir = validateConfig({
      report: { filename: 'reports/custom-report.md' },
    });
    expect(withSubdir.report.filename).toBe('reports/custom-report.md');

    for (const unsafe of [
      '../escape.md',
      '/tmp/report.md',
      'C:\\report.md',
      '.env',
      '.env.local',
      '.npmrc',
      '.ssh/id_rsa',
      'node_modules/report.md',
      '.git/report.md',
    ]) {
      expect(() =>
        validateConfig({
          report: { filename: unsafe },
        }),
      ).toThrow(ConfigValidationError);
    }
  });

  it('rejects overlapping enabled and excluded collectors', () => {
    expect(() =>
      validateConfig({
        collectors: {
          enabled: ['system', 'runtimes'],
          excluded: ['runtimes'],
        },
      }),
    ).toThrow(ConfigValidationError);
  });
});
