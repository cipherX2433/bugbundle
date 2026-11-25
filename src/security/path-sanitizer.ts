import { homedir } from 'node:os';
import { basename } from 'node:path';
import { SecurityBoundaryError } from '../errors/index.js';

export interface PathSanitizerOptions {
  readonly homeDir?: string | undefined;
  readonly username?: string | undefined;
  readonly projectRoot?: string | undefined;
}

export interface PathSanitizationStats {
  readonly replacements: number;
  readonly homePathsRedacted: number;
  readonly projectPathsSanitized: number;
  readonly absolutePathsRedacted: number;
}

export interface PathSanitizeTextResult {
  readonly text: string;
  readonly stats: PathSanitizationStats;
}

export interface PathSanitizeValueResult<T> {
  readonly data: T;
  readonly stats: PathSanitizationStats;
}

const HOME_PLACEHOLDER = '<HOME>';
const PROJECT_PLACEHOLDER = '<PROJECT>';
const PATH_PLACEHOLDER = '<PATH>';

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeSlashes(value: string): string {
  return value.replace(/\\/g, '/');
}

function inferUsername(homeDirPath: string): string | undefined {
  const normalized = normalizeSlashes(homeDirPath).replace(/\/+$/, '');
  const base = basename(normalized);
  if (!base || base === '/' || base === '.' || base === 'Users' || base === 'home') {
    return undefined;
  }
  return base;
}

export class PathSanitizer {
  private readonly homeDir: string;
  private readonly username: string | undefined;
  private readonly projectRoot: string | undefined;

  public constructor(options: PathSanitizerOptions = {}) {
    this.homeDir = options.homeDir ?? homedir();
    this.username = options.username ?? inferUsername(this.homeDir);
    this.projectRoot = options.projectRoot;
  }

  public sanitizeText(input: string): PathSanitizeTextResult {
    if (typeof input !== 'string' || input.length === 0) {
      return {
        text: typeof input === 'string' ? input : '',
        stats: {
          replacements: 0,
          homePathsRedacted: 0,
          projectPathsSanitized: 0,
          absolutePathsRedacted: 0,
        },
      };
    }

    let text = input;
    let homePathsRedacted = 0;
    let projectPathsSanitized = 0;
    let absolutePathsRedacted = 0;

    // 1. Replace configured projectRoot paths first so safe relative project paths are preserved.
    if (this.projectRoot && this.projectRoot.length > 0) {
      const normalizedProject = normalizeSlashes(this.projectRoot).replace(/\/+$/, '');
      const windowsProject = normalizedProject.replace(/\//g, '\\');
      const variants = [...new Set([normalizedProject, windowsProject])].filter(
        (v) => v.length > 0,
      );

      for (const variant of variants) {
        const pattern = new RegExp(`${escapeRegex(variant)}([\\\\/][^\\s'"\`,;)]*)?`, 'g');
        text = text.replace(pattern, (_full, rest: string | undefined) => {
          projectPathsSanitized += 1;
          if (!rest) {
            return PROJECT_PLACEHOLDER;
          }
          return `${PROJECT_PLACEHOLDER}${normalizeSlashes(rest)}`;
        });
      }
    }

    // 2. Replace configured homeDir (Unix and Windows representations).
    if (this.homeDir && this.homeDir.length > 0) {
      const normalizedHome = normalizeSlashes(this.homeDir).replace(/\/+$/, '');
      const windowsHome = normalizedHome.replace(/\//g, '\\');
      const variants = [...new Set([normalizedHome, windowsHome])].filter((v) => v.length > 0);

      for (const variant of variants) {
        const pattern = new RegExp(`${escapeRegex(variant)}([\\\\/][^\\s'"\`,;)]*)?`, 'gi');
        text = text.replace(pattern, (_full, rest: string | undefined) => {
          homePathsRedacted += 1;
          return `${HOME_PLACEHOLDER}${rest ?? ''}`;
        });
      }
    }

    // 3. Replace generic Windows home directory patterns (C:\Users\<user>\... or C:/Users/<user>/...) before Unix /Users/ match.
    text = text.replace(
      /(^|[\s"'(=:,[])[A-Za-z]:[\\/]Users[\\/][^\\/\s'"`,;)]+([\\/][^\s'"`,;)]*)?/gi,
      (_full, prefix: string, rest: string | undefined) => {
        homePathsRedacted += 1;
        return `${prefix}${HOME_PLACEHOLDER}${rest ?? ''}`;
      },
    );

    // 4. Replace generic Unix home directory patterns (/Users/<user>/..., /home/<user>/..., /root/...).
    text = text.replace(
      /(^|[\s"'(=,[])(?:\/Users\/[^/\s'"`,;)]+|\/home\/[^/\s'"`,;)]+|\/root(?=\/|[\s"'`,;)]|$))(\/[^\s'"`,;)]*)?/g,
      (_full, prefix: string, rest: string | undefined) => {
        homePathsRedacted += 1;
        return `${prefix}${HOME_PLACEHOLDER}${rest ?? ''}`;
      },
    );

    // 5. Replace other sensitive absolute system/drive/UNC paths while leaving URLs and relative paths intact.
    text = text.replace(
      /(^|[\s"'(=:,[])((?:\/(?:etc|var|tmp|private|opt|srv|usr\/local)\/[^\s'"`,;)]+)|(?:[A-Za-z]:\\(?:Windows|ProgramData|Program Files(?:\s\(x86\))?|temp)\\[^\s'"`,;)]+)|(?:\\\\[^\s\\/\s'"`,;)]+\\[^\s'"`,;)]+))/gi,
      (_full, prefix: string) => {
        absolutePathsRedacted += 1;
        return `${prefix}${PATH_PLACEHOLDER}`;
      },
    );

    // 6. Sanitize explicit username assignments or path-bound username occurrences if configured.
    if (this.username && this.username.length >= 3) {
      const escapedUser = escapeRegex(this.username);
      const userAssignRegex = new RegExp(
        `(\\b(?:user|username|USER|USERNAME|LOGNAME)\\b\\s*[:=]\\s*['"]?)${escapedUser}(['"]?)`,
        'g',
      );
      text = text.replace(userAssignRegex, (_full, p1: string, p2: string) => {
        homePathsRedacted += 1;
        return `${p1}<USER>${p2}`;
      });
    }

    return {
      text,
      stats: {
        replacements: homePathsRedacted + projectPathsSanitized + absolutePathsRedacted,
        homePathsRedacted,
        projectPathsSanitized,
        absolutePathsRedacted,
      },
    };
  }

  public sanitizeValue<T>(value: T): PathSanitizeValueResult<T> {
    let homePathsRedacted = 0;
    let projectPathsSanitized = 0;
    let absolutePathsRedacted = 0;
    const visited = new WeakSet<object>();

    const walk = (node: unknown): unknown => {
      if (typeof node === 'string') {
        const res = this.sanitizeText(node);
        homePathsRedacted += res.stats.homePathsRedacted;
        projectPathsSanitized += res.stats.projectPathsSanitized;
        absolutePathsRedacted += res.stats.absolutePathsRedacted;
        return res.text;
      }

      if (
        node === null ||
        typeof node === 'number' ||
        typeof node === 'boolean' ||
        typeof node === 'undefined'
      ) {
        return node;
      }

      if (typeof node !== 'object') {
        throw new SecurityBoundaryError(
          `Unsupported value type "${typeof node}" encountered during path sanitization.`,
        );
      }

      if (visited.has(node)) {
        throw new SecurityBoundaryError(
          'Circular object reference detected during path sanitization.',
        );
      }
      visited.add(node);

      if (Array.isArray(node)) {
        return node.map((item) => walk(item));
      }

      const out: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(node)) {
        if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
          continue;
        }
        out[key] = walk(val);
      }
      return out;
    };

    const data = walk(value) as T;
    return {
      data,
      stats: {
        replacements: homePathsRedacted + projectPathsSanitized + absolutePathsRedacted,
        homePathsRedacted,
        projectPathsSanitized,
        absolutePathsRedacted,
      },
    };
  }
}
