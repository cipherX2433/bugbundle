import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  CONFIG_FILENAME,
  DEFAULT_REPORT_FILENAME,
  loadConfig,
  toValidatedRuntimeConfig,
} from '../../src/config/index.js';
import { ConfigValidationError, SecurityBoundaryError } from '../../src/errors/index.js';
import type { SecurityGuard } from '../../src/types/index.js';

describe('loadConfig', () => {
  const tempDirs: string[] = [];

  function makeWorkspace(): string {
    const dir = mkdtempSync(join(tmpdir(), 'bugbundle-config-loader-'));
    tempDirs.push(dir);
    return dir;
  }

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('loads and validates a valid bugbundle.config.json', async () => {
    const dir = makeWorkspace();
    writeFileSync(
      join(dir, CONFIG_FILENAME),
      JSON.stringify({
        projectName: 'sample-cli',
        collectors: {
          excluded: ['runtimes'],
        },
        report: {
          filename: 'diag.md',
        },
      }),
    );

    const loaded = await loadConfig({ cwd: dir });

    expect(loaded.found).toBe(true);
    expect(loaded.source).toBe('file');
    expect(loaded.config.projectName).toBe('sample-cli');
    expect(loaded.config.collectors.excluded).toEqual(['runtimes']);
    expect(loaded.config.report.filename).toBe('diag.md');

    const runtimeConfig = toValidatedRuntimeConfig(dir, loaded);
    expect(runtimeConfig.outputPath).toBe('diag.md');
    expect(runtimeConfig.excludeCollectors).toEqual(['runtimes']);
    expect(runtimeConfig.configPath).toBe(CONFIG_FILENAME);
  });

  it('handles missing configuration gracefully with defaults', async () => {
    const dir = makeWorkspace();
    const loaded = await loadConfig({ cwd: dir });

    expect(loaded.found).toBe(false);
    expect(loaded.source).toBe('defaults');
    expect(loaded.config.report.filename).toBe(DEFAULT_REPORT_FILENAME);

    const runtimeConfig = toValidatedRuntimeConfig(dir, loaded);
    expect(runtimeConfig.configPath).toBeUndefined();
  });

  it('throws ConfigValidationError on invalid JSON', async () => {
    const dir = makeWorkspace();
    writeFileSync(join(dir, CONFIG_FILENAME), '{ malformed json');

    await expect(loadConfig({ cwd: dir })).rejects.toThrow(ConfigValidationError);
  });

  it('throws ConfigValidationError on invalid schema or unknown fields', async () => {
    const dir = makeWorkspace();
    writeFileSync(
      join(dir, CONFIG_FILENAME),
      JSON.stringify({
        collectors: { enabled: ['invalid'] },
      }),
    );

    await expect(loadConfig({ cwd: dir })).rejects.toThrow(ConfigValidationError);
  });

  it('blocks reading .env files, traversal paths, and credential paths as config', async () => {
    const dir = makeWorkspace();
    writeFileSync(join(dir, '.env'), 'SECRET=should_not_read');

    await expect(loadConfig({ cwd: dir, configPath: '.env' })).rejects.toThrow(
      SecurityBoundaryError,
    );
    await expect(loadConfig({ cwd: dir, configPath: '../outside.json' })).rejects.toThrow(
      SecurityBoundaryError,
    );
    await expect(loadConfig({ cwd: dir, configPath: '/etc/passwd' })).rejects.toThrow(
      SecurityBoundaryError,
    );
    await expect(loadConfig({ cwd: dir, configPath: '.npmrc' })).rejects.toThrow(
      SecurityBoundaryError,
    );
  });

  it('wraps filesystem permission errors in ConfigValidationError', async () => {
    const dir = makeWorkspace();
    const failingGuard: SecurityGuard = {
      async assertSafePath(targetPath: string) {
        return targetPath;
      },
      async fileExists() {
        return true;
      },
      async readSafeTextFile() {
        const err = new Error('EACCES: permission denied');
        throw err;
      },
    };

    await expect(loadConfig({ cwd: dir, securityGuard: failingGuard })).rejects.toThrow(
      ConfigValidationError,
    );
  });
});
