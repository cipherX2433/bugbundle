import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  CONFIG_FILENAME,
  DEFAULT_REPORT_FILENAME,
  initConfig,
  validateConfig,
} from '../../src/config/index.js';
import { ExportError, FileExistsError } from '../../src/errors/index.js';

describe('initConfig', () => {
  const tempDirs: string[] = [];

  function makeWorkspace(): string {
    const dir = mkdtempSync(join(tmpdir(), 'bugbundle-config-init-'));
    tempDirs.push(dir);
    return dir;
  }

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('creates a valid default bugbundle.config.json with explanations', async () => {
    const dir = makeWorkspace();
    const result = await initConfig({ cwd: dir, projectName: 'my-app' });

    expect(result.filePath).toBe(CONFIG_FILENAME);
    expect(result.config.projectName).toBe('my-app');
    expect(result.config.report.filename).toBe(DEFAULT_REPORT_FILENAME);
    expect(result.explanations.length).toBeGreaterThan(0);

    const writtenPath = join(dir, CONFIG_FILENAME);
    expect(existsSync(writtenPath)).toBe(true);

    const parsed = JSON.parse(readFileSync(writtenPath, 'utf8'));
    expect(validateConfig(parsed)).toEqual(result.config);
  });

  it('refuses to overwrite an existing bugbundle.config.json', async () => {
    const dir = makeWorkspace();
    const originalContent = '{"projectName":"existing"}\n';
    writeFileSync(join(dir, CONFIG_FILENAME), originalContent);

    await expect(initConfig({ cwd: dir })).rejects.toThrow(FileExistsError);
    expect(readFileSync(join(dir, CONFIG_FILENAME), 'utf8')).toBe(originalContent);
  });

  it('maps exclusive-create EEXIST race to FileExistsError', async () => {
    const dir = makeWorkspace();
    const racingWriter = {
      async writeExclusive() {
        const err = new Error('EEXIST: file already exists') as Error & { code: string };
        err.code = 'EEXIST';
        throw err;
      },
    };

    await expect(initConfig({ cwd: dir, writer: racingWriter })).rejects.toThrow(FileExistsError);
  });

  it('maps filesystem permission errors to ExportError safely', async () => {
    const dir = makeWorkspace();
    const deniedWriter = {
      async writeExclusive() {
        const err = new Error('EACCES: permission denied') as Error & { code: string };
        err.code = 'EACCES';
        throw err;
      },
    };

    await expect(initConfig({ cwd: dir, writer: deniedWriter })).rejects.toThrow(ExportError);
  });
});
