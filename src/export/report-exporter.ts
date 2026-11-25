import { lstat, realpath, writeFile } from 'node:fs/promises';
import { basename, isAbsolute, relative, resolve } from 'node:path';
import {
  ExportError,
  FileExistsError,
  ReviewAbortedError,
  SecurityBoundaryError,
} from '../errors/index.js';
import type { ExportFileWriter, ExportReportOptions, ExportReportResult } from './types.js';

const DEFAULT_REPORT_DESTINATION = 'bugbundle-report.md';

const DENIED_EXPORT_BASENAMES: readonly RegExp[] = [
  /^\.env$/i,
  /^\.env\..+/i,
  /\.env$/i,
  /^\.envrc$/i,
  /^\.npmrc$/i,
  /^\.yarnrc(\.yml)?$/i,
  /^\.netrc$/i,
  /^\.pypirc$/i,
  /^id_rsa/i,
  /^id_ed25519/i,
  /\.(pem|key|p12|pfx|jks|kdbx)$/i,
];

const DENIED_EXPORT_SEGMENTS = new Set(['.ssh', '.aws', '.gnupg', '.git', 'node_modules']);

const defaultWriter: ExportFileWriter = {
  async writeExclusive(filePath: string, content: string): Promise<void> {
    await writeFile(filePath, content, { encoding: 'utf8', flag: 'wx' });
  },
};

function isErrnoCode(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === code
  );
}

function isPathInsideRoot(rootPath: string, candidatePath: string): boolean {
  const rel = relative(rootPath, candidatePath);
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel);
}

export function validateExportDestination(destinationPath: string): string {
  const trimmed = destinationPath.trim();
  if (trimmed.length === 0) {
    throw new ExportError('Export destination path must not be empty.');
  }
  if (isAbsolute(trimmed) || /^[A-Za-z]:/.test(trimmed)) {
    throw new SecurityBoundaryError('Absolute export destination paths are not allowed.');
  }
  if (trimmed.includes('\0')) {
    throw new SecurityBoundaryError('Invalid null byte in export destination path.');
  }

  const segments = trimmed.split(/[\\/]+/).filter(Boolean);
  if (segments.length === 0 || segments.every((segment) => segment === '.')) {
    throw new ExportError('Export destination must include a valid filename.');
  }
  for (const segment of segments) {
    if (segment === '..') {
      throw new SecurityBoundaryError('Path traversal outside project directory is not allowed.');
    }
    if (DENIED_EXPORT_SEGMENTS.has(segment)) {
      throw new SecurityBoundaryError(
        `Exporting into restricted directory "${segment}" is denied.`,
      );
    }
  }

  const fileName = basename(trimmed);
  for (const pattern of DENIED_EXPORT_BASENAMES) {
    if (pattern.test(fileName)) {
      throw new SecurityBoundaryError(`Exporting to restricted filename "${fileName}" is denied.`);
    }
  }

  return trimmed;
}

export async function exportReport(options: ExportReportOptions): Promise<ExportReportResult> {
  if (!options.securityValidated) {
    throw new SecurityBoundaryError(
      'Cannot export diagnostic report: security validation did not pass.',
    );
  }

  if (!options.approval || options.approval.approved !== true) {
    throw new ReviewAbortedError('Export requires explicit user review approval.');
  }

  const safeDestination = validateExportDestination(
    options.destinationPath ?? DEFAULT_REPORT_DESTINATION,
  );

  let resolvedRoot: string;
  try {
    resolvedRoot = await realpath(resolve(options.cwd));
  } catch {
    throw new ExportError('Target export directory could not be resolved.');
  }

  const candidatePath = resolve(resolvedRoot, safeDestination);
  if (!isPathInsideRoot(resolvedRoot, candidatePath)) {
    throw new SecurityBoundaryError('Export path escapes target project directory.');
  }

  const relDisplay = relative(resolvedRoot, candidatePath).replace(/\\/g, '/');

  // Pre-check existing file or symlink escape before attempting exclusive creation
  try {
    const existing = await lstat(candidatePath);
    if (existing.isSymbolicLink()) {
      let realTarget: string | undefined;
      try {
        realTarget = await realpath(candidatePath);
      } catch {
        // Broken symlink still exists at candidatePath — never overwrite
        throw new FileExistsError(
          `Report destination "${relDisplay}" already exists (symlink). Refusing to overwrite.`,
        );
      }
      if (!isPathInsideRoot(resolvedRoot, realTarget)) {
        throw new SecurityBoundaryError('Symlink destination escapes target project directory.');
      }
    }
    throw new FileExistsError(
      `Report file "${relDisplay}" already exists. Refusing to overwrite existing file.`,
    );
  } catch (error: unknown) {
    if (error instanceof FileExistsError || error instanceof SecurityBoundaryError) {
      throw error;
    }
    if (!isErrnoCode(error, 'ENOENT')) {
      throw new ExportError(`Failed to inspect export destination "${relDisplay}".`, error);
    }
  }

  const writer = options.writer ?? defaultWriter;
  try {
    await writer.writeExclusive(candidatePath, options.markdownContent);
  } catch (error: unknown) {
    if (isErrnoCode(error, 'EEXIST')) {
      throw new FileExistsError(
        `Report file "${relDisplay}" already exists. Refusing to overwrite existing file.`,
      );
    }
    if (
      isErrnoCode(error, 'EACCES') ||
      isErrnoCode(error, 'EPERM') ||
      isErrnoCode(error, 'EROFS')
    ) {
      throw new ExportError(
        `Permission denied while writing "${relDisplay}". Check directory write permissions.`,
        error,
      );
    }
    if (
      isErrnoCode(error, 'ENOENT') ||
      isErrnoCode(error, 'ENOTDIR') ||
      isErrnoCode(error, 'EISDIR')
    ) {
      throw new ExportError(
        `Invalid export destination "${relDisplay}": parent directory does not exist or target is not a file.`,
        error,
      );
    }
    throw new ExportError(`Failed to write diagnostic report "${relDisplay}".`, error);
  }

  return {
    ok: true,
    filePath: relDisplay,
    bytesWritten: Buffer.byteLength(options.markdownContent, 'utf8'),
  };
}
