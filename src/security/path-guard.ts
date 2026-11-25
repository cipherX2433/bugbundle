import { lstat, readFile, realpath, stat } from 'node:fs/promises';
import { basename, isAbsolute, relative, resolve } from 'node:path';
import { SecurityBoundaryError } from '../errors/index.js';
import type { SecurityGuard } from '../types/index.js';

const DEFAULT_MAX_FILE_BYTES = 5 * 1024 * 1024;

export const DEFAULT_APPROVED_COLLECTION_FILES: readonly string[] = [
  'package.json',
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'bun.lock',
  'bun.lockb',
  'bugbundle.config.json',
];

const DENIED_BASENAME_PATTERNS: readonly RegExp[] = [
  /^\.env$/i,
  /^\.env\..+/i,
  /\.env$/i,
  /^\.envrc$/i,
  /^\.npmrc$/i,
  /^\.yarnrc(\.yml)?$/i,
  /^\.netrc$/i,
  /^\.pypirc$/i,
  /^\.git-credentials$/i,
  /^id_rsa/i,
  /^id_ed25519/i,
  /^id_ecdsa/i,
  /^id_dsa/i,
  /^authorized_keys$/i,
  /^known_hosts$/i,
  /^\.?(?:bash|zsh|sh|ash|ksh|node_repl|python)_history$/i,
  /^(?:\.history|fish_history)$/i,
  /_history$/i,
  /^(?:Cookies|Login Data|Web Data|Local State)$/i,
  /\.(pem|key|p12|pfx|jks|kdbx|ppk)$/i,
  /secret/i,
  /credentials/i,
];

const DENIED_SEGMENTS = new Set([
  '.ssh',
  '.aws',
  '.gnupg',
  '.kube',
  '.docker',
  '.mozilla',
  'node_modules',
  'User Data',
  'Local Storage',
  'Session Storage',
  'Chrome',
  'Chromium',
  'Firefox',
  'BraveSoftware',
  'Microsoft Edge',
]);

export interface PathSecurityGuardOptions {
  readonly allowedFiles?: readonly string[] | undefined;
}

function isPathInsideRoot(rootPath: string, candidatePath: string): boolean {
  const rel = relative(rootPath, candidatePath);
  if (rel === '') {
    return true;
  }
  return !rel.startsWith('..') && !isAbsolute(rel);
}

function normalizeRelative(relPath: string): string {
  return relPath.replace(/\\/g, '/');
}

function assertNotDeniedPath(relPath: string): void {
  const segments = relPath.split(/[\\/]+/).filter(Boolean);
  for (const segment of segments) {
    if (DENIED_SEGMENTS.has(segment)) {
      throw new SecurityBoundaryError(
        `Access denied for restricted directory segment "${segment}".`,
      );
    }
  }

  const fileName = basename(relPath);
  for (const pattern of DENIED_BASENAME_PATTERNS) {
    if (pattern.test(fileName)) {
      throw new SecurityBoundaryError(`Access denied for restricted file "${fileName}".`);
    }
  }
}

export class PathSecurityGuard implements SecurityGuard {
  private readonly rootDir: string;
  private readonly allowedFiles: ReadonlySet<string>;

  public constructor(rootDir: string, options: PathSecurityGuardOptions = {}) {
    this.rootDir = resolve(rootDir);
    this.allowedFiles = new Set(
      (options.allowedFiles ?? DEFAULT_APPROVED_COLLECTION_FILES).map((p) => normalizeRelative(p)),
    );
  }

  public async assertSafePath(targetPath: string): Promise<string> {
    if (isAbsolute(targetPath)) {
      throw new SecurityBoundaryError('Absolute target paths are not allowed.');
    }

    const resolvedRoot = await realpath(this.rootDir);
    const candidate = resolve(resolvedRoot, targetPath);

    if (!isPathInsideRoot(resolvedRoot, candidate)) {
      throw new SecurityBoundaryError('Path traversal outside target workspace is not allowed.');
    }

    const rel = normalizeRelative(relative(resolvedRoot, candidate));
    assertNotDeniedPath(rel);

    if (!this.allowedFiles.has(rel)) {
      throw new SecurityBoundaryError(
        `Access denied for "${rel}": path is outside explicitly approved collection scope.`,
      );
    }

    try {
      const linkInfo = await lstat(candidate);
      if (linkInfo.isSymbolicLink()) {
        const realCandidate = await realpath(candidate);
        if (!isPathInsideRoot(resolvedRoot, realCandidate)) {
          throw new SecurityBoundaryError('Symlink target escapes target workspace.');
        }
        const realRel = normalizeRelative(relative(resolvedRoot, realCandidate));
        assertNotDeniedPath(realRel);
        return realCandidate;
      }
    } catch (error: unknown) {
      if (error instanceof SecurityBoundaryError) {
        throw error;
      }
      // Missing files are handled cleanly by fileExists / readSafeTextFile callers.
    }

    return candidate;
  }

  public async fileExists(targetPath: string): Promise<boolean> {
    const safePath = await this.assertSafePath(targetPath);
    try {
      const info = await stat(safePath);
      return info.isFile();
    } catch {
      return false;
    }
  }

  public async readSafeTextFile(
    targetPath: string,
    maxBytes: number = DEFAULT_MAX_FILE_BYTES,
  ): Promise<string> {
    const safePath = await this.assertSafePath(targetPath);
    const info = await stat(safePath);
    if (!info.isFile()) {
      throw new SecurityBoundaryError('Target path is not a regular file.');
    }
    if (info.size > maxBytes) {
      throw new SecurityBoundaryError(`File exceeds maximum safe read size (${maxBytes} bytes).`);
    }
    return readFile(safePath, 'utf8');
  }
}
