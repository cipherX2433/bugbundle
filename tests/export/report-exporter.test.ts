import { existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  ExportError,
  FileExistsError,
  ReviewAbortedError,
  SecurityBoundaryError,
} from '../../src/errors/index.js';
import { exportReport } from '../../src/export/index.js';
import type { ReviewApproval } from '../../src/review/index.js';

const VALID_APPROVAL: ReviewApproval = {
  approved: true,
  mode: 'interactive',
  reviewedAt: '2026-11-25T15:00:00.000Z',
};

describe('exportReport', () => {
  const tempDirs: string[] = [];

  function makeWorkspace(): string {
    const dir = mkdtempSync(join(tmpdir(), 'bugbundle-export-test-'));
    tempDirs.push(dir);
    return dir;
  }

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('writes sanitized Markdown report to default bugbundle-report.md', async () => {
    const dir = makeWorkspace();
    const content = '# bugbundle Diagnostic Report\n\nSafe output.\n';

    const result = await exportReport({
      cwd: dir,
      markdownContent: content,
      approval: VALID_APPROVAL,
      securityValidated: true,
    });

    expect(result).toEqual({
      ok: true,
      filePath: 'bugbundle-report.md',
      bytesWritten: Buffer.byteLength(content, 'utf8'),
    });
    expect(readFileSync(join(dir, 'bugbundle-report.md'), 'utf8')).toBe(content);
  });

  it('refuses to overwrite an existing report and preserves its contents', async () => {
    const dir = makeWorkspace();
    const original = 'Existing user report contents\n';
    writeFileSync(join(dir, 'bugbundle-report.md'), original);

    await expect(
      exportReport({
        cwd: dir,
        markdownContent: '# New report\n',
        approval: VALID_APPROVAL,
        securityValidated: true,
      }),
    ).rejects.toThrow(FileExistsError);

    expect(readFileSync(join(dir, 'bugbundle-report.md'), 'utf8')).toBe(original);
  });

  it('uses exclusive file creation and maps EEXIST race to FileExistsError', async () => {
    const dir = makeWorkspace();

    await expect(
      exportReport({
        cwd: dir,
        markdownContent: '# Report\n',
        approval: VALID_APPROVAL,
        securityValidated: true,
        writer: {
          async writeExclusive() {
            const err = new Error('EEXIST') as Error & { code: string };
            err.code = 'EEXIST';
            throw err;
          },
        },
      }),
    ).rejects.toThrow(FileExistsError);
  });

  it('rejects path traversal, absolute paths, and restricted filenames', async () => {
    const dir = makeWorkspace();

    for (const badDest of [
      '../escape.md',
      '/tmp/report.md',
      'C:\\report.md',
      '.',
      './',
      '.env',
      '.npmrc',
      '.ssh/id_rsa',
      'node_modules/report.md',
      '.git/report.md',
    ]) {
      await expect(
        exportReport({
          cwd: dir,
          destinationPath: badDest,
          markdownContent: '# Report\n',
          approval: VALID_APPROVAL,
          securityValidated: true,
        }),
      ).rejects.toThrow(badDest === '.' || badDest === './' ? ExportError : SecurityBoundaryError);
    }
  });

  it('rejects symlink destinations escaping the project directory', async () => {
    const root = makeWorkspace();
    const outside = makeWorkspace();
    const outsideTarget = join(outside, 'outside-report.md');
    writeFileSync(outsideTarget, 'outside');
    symlinkSync(outsideTarget, join(root, 'bugbundle-report.md'));

    await expect(
      exportReport({
        cwd: root,
        markdownContent: '# Report\n',
        approval: VALID_APPROVAL,
        securityValidated: true,
      }),
    ).rejects.toThrow(SecurityBoundaryError);
    expect(readFileSync(outsideTarget, 'utf8')).toBe('outside');
  });

  it('does not create unexpected directories and rejects missing parent paths', async () => {
    const dir = makeWorkspace();

    await expect(
      exportReport({
        cwd: dir,
        destinationPath: 'nonexistent-subdir/bugbundle-report.md',
        markdownContent: '# Report\n',
        approval: VALID_APPROVAL,
        securityValidated: true,
      }),
    ).rejects.toThrow(ExportError);
    expect(existsSync(join(dir, 'nonexistent-subdir'))).toBe(false);
  });

  it('rejects empty destinations and maps permission errors to ExportError', async () => {
    const dir = makeWorkspace();

    await expect(
      exportReport({
        cwd: dir,
        destinationPath: '   ',
        markdownContent: '# Report\n',
        approval: VALID_APPROVAL,
        securityValidated: true,
      }),
    ).rejects.toThrow(ExportError);

    await expect(
      exportReport({
        cwd: dir,
        markdownContent: '# Report\n',
        approval: VALID_APPROVAL,
        securityValidated: true,
        writer: {
          async writeExclusive() {
            const err = new Error('EACCES: permission denied') as Error & { code: string };
            err.code = 'EACCES';
            throw err;
          },
        },
      }),
    ).rejects.toThrow(ExportError);
  });

  it('refuses export when approval is missing or security validation failed', async () => {
    const dir = makeWorkspace();

    await expect(
      exportReport({
        cwd: dir,
        markdownContent: '# Report\n',
        approval: { approved: false } as unknown as ReviewApproval,
        securityValidated: true,
      }),
    ).rejects.toThrow(ReviewAbortedError);

    await expect(
      exportReport({
        cwd: dir,
        markdownContent: '# Report\n',
        approval: VALID_APPROVAL,
        securityValidated: false,
      }),
    ).rejects.toThrow(SecurityBoundaryError);

    expect(existsSync(join(dir, 'bugbundle-report.md'))).toBe(false);
  });
});
