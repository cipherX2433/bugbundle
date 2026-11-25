import { z } from 'zod';
import type {
  Collector,
  CollectorMetadata,
  CollectorResult,
  DependenciesData,
  DiagnosticContext,
  LockfileFilename,
  LockfileInfo,
  LockfileType,
} from '../types/index.js';

const PackageJsonSchema = z
  .object({
    name: z.unknown().optional(),
    version: z.unknown().optional(),
    packageManager: z.unknown().optional(),
    dependencies: z.unknown().optional(),
    devDependencies: z.unknown().optional(),
  })
  .passthrough();

const LOCKFILE_SPECS: readonly {
  readonly filename: LockfileFilename;
  readonly type: LockfileType;
}[] = [
  { filename: 'package-lock.json', type: 'npm' },
  { filename: 'pnpm-lock.yaml', type: 'pnpm' },
  { filename: 'yarn.lock', type: 'yarn' },
  { filename: 'bun.lock', type: 'bun' },
  { filename: 'bun.lockb', type: 'bun-binary' },
];

const UNSAFE_OBJECT_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function extractDependencyMap(
  raw: unknown,
  sectionName: string,
  warnings: string[],
): Record<string, string> {
  if (raw === undefined) {
    return {};
  }

  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    warnings.push(`Ignoring malformed "${sectionName}" section in package.json (expected object).`);
    return {};
  }

  const result: Record<string, string> = {};
  let invalidCount = 0;

  for (const [key, value] of Object.entries(raw)) {
    if (UNSAFE_OBJECT_KEYS.has(key)) {
      continue;
    }
    if (typeof value === 'string') {
      result[key] = value;
    } else {
      invalidCount += 1;
    }
  }

  if (invalidCount > 0) {
    warnings.push(
      `Ignored ${invalidCount} non-string entry(s) in "${sectionName}" of package.json.`,
    );
  }

  return result;
}

function parseNpmLockfile(content: string, warnings: string[]): LockfileInfo {
  try {
    const parsed: unknown = JSON.parse(content);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      warnings.push('package-lock.json is malformed (expected JSON object).');
      return {
        filename: 'package-lock.json',
        type: 'npm',
        present: true,
        supported: false,
        formatNote: 'Malformed JSON object in package-lock.json.',
      };
    }

    const version = (parsed as { lockfileVersion?: unknown }).lockfileVersion;
    if (typeof version === 'number' && (version === 1 || version === 2 || version === 3)) {
      return {
        filename: 'package-lock.json',
        type: 'npm',
        present: true,
        supported: true,
        lockfileVersion: version,
      };
    }

    warnings.push(
      `Unsupported package-lock.json lockfileVersion (${String(version ?? 'missing')}).`,
    );
    return {
      filename: 'package-lock.json',
      type: 'npm',
      present: true,
      supported: false,
      formatNote: `Unsupported or missing lockfileVersion (${String(version ?? 'missing')}).`,
    };
  } catch {
    warnings.push('Malformed JSON in package-lock.json.');
    return {
      filename: 'package-lock.json',
      type: 'npm',
      present: true,
      supported: false,
      formatNote: 'Malformed JSON in package-lock.json.',
    };
  }
}

function parsePnpmLockfile(content: string, warnings: string[]): LockfileInfo {
  const match = /^lockfileVersion:\s*['"]?([0-9]+(?:\.[0-9]+)?)['"]?\s*$/m.exec(content);
  if (match?.[1]) {
    return {
      filename: 'pnpm-lock.yaml',
      type: 'pnpm',
      present: true,
      supported: true,
      lockfileVersion: match[1],
    };
  }

  warnings.push('Unsupported or unrecognized pnpm-lock.yaml format (missing lockfileVersion).');
  return {
    filename: 'pnpm-lock.yaml',
    type: 'pnpm',
    present: true,
    supported: false,
    formatNote: 'Missing or unrecognized lockfileVersion in pnpm-lock.yaml.',
  };
}

function parseYarnLockfile(content: string, warnings: string[]): LockfileInfo {
  if (/^#\s*yarn lockfile v1\b/m.test(content)) {
    return {
      filename: 'yarn.lock',
      type: 'yarn',
      present: true,
      supported: true,
      lockfileVersion: '1',
    };
  }

  const berryMatch = /^__metadata:\s*[\r\n]+(?:\s+.*\r?\n)*?\s+version:\s*([0-9]+)\b/m.exec(
    content,
  );
  if (berryMatch?.[1]) {
    return {
      filename: 'yarn.lock',
      type: 'yarn',
      present: true,
      supported: true,
      lockfileVersion: berryMatch[1],
    };
  }

  warnings.push('Unsupported or unrecognized yarn.lock format.');
  return {
    filename: 'yarn.lock',
    type: 'yarn',
    present: true,
    supported: false,
    formatNote: 'Unrecognized yarn.lock header/metadata.',
  };
}

function stripJsoncTrailingCommas(input: string): string {
  return input.replace(/,\s*([}\]])/g, '$1');
}

function parseBunLockfile(content: string, warnings: string[]): LockfileInfo {
  try {
    const parsed: unknown = JSON.parse(stripJsoncTrailingCommas(content));
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      warnings.push('bun.lock is malformed (expected JSON/JSONC object).');
      return {
        filename: 'bun.lock',
        type: 'bun',
        present: true,
        supported: false,
        formatNote: 'Malformed object in bun.lock.',
      };
    }

    const version = (parsed as { lockfileVersion?: unknown }).lockfileVersion;
    if (typeof version === 'number' && (version === 0 || version === 1)) {
      return {
        filename: 'bun.lock',
        type: 'bun',
        present: true,
        supported: true,
        lockfileVersion: version,
      };
    }

    warnings.push(`Unsupported bun.lock lockfileVersion (${String(version ?? 'missing')}).`);
    return {
      filename: 'bun.lock',
      type: 'bun',
      present: true,
      supported: false,
      formatNote: `Unsupported or missing lockfileVersion (${String(version ?? 'missing')}).`,
    };
  } catch {
    warnings.push('Malformed JSON/JSONC in bun.lock.');
    return {
      filename: 'bun.lock',
      type: 'bun',
      present: true,
      supported: false,
      formatNote: 'Malformed JSON/JSONC in bun.lock.',
    };
  }
}

async function inspectLockfiles(
  ctx: DiagnosticContext,
  warnings: string[],
): Promise<LockfileInfo[]> {
  const detected: LockfileInfo[] = [];

  for (const spec of LOCKFILE_SPECS) {
    const exists = await ctx.securityGuard.fileExists(spec.filename);
    if (!exists) {
      continue;
    }

    if (spec.filename === 'bun.lockb') {
      warnings.push(
        'Binary bun.lockb detected; metadata parsing is unsupported without executing bun.',
      );
      detected.push({
        filename: 'bun.lockb',
        type: 'bun-binary',
        present: true,
        supported: false,
        formatNote: 'Binary bun.lockb detected; not text-parsed or executed.',
      });
      continue;
    }

    const content = await ctx.securityGuard.readSafeTextFile(spec.filename);
    switch (spec.filename) {
      case 'package-lock.json':
        detected.push(parseNpmLockfile(content, warnings));
        break;
      case 'pnpm-lock.yaml':
        detected.push(parsePnpmLockfile(content, warnings));
        break;
      case 'yarn.lock':
        detected.push(parseYarnLockfile(content, warnings));
        break;
      case 'bun.lock':
        detected.push(parseBunLockfile(content, warnings));
        break;
    }
  }

  return detected;
}

function inferPackageManager(
  manifestPackageManager: string | undefined,
  lockfiles: readonly LockfileInfo[],
): string | undefined {
  if (manifestPackageManager) {
    return manifestPackageManager;
  }

  const firstLockfile = lockfiles[0];
  if (!firstLockfile) {
    return undefined;
  }

  return firstLockfile.type === 'bun-binary' ? 'bun' : firstLockfile.type;
}

export const DEPENDENCIES_COLLECTOR_META: CollectorMetadata = {
  id: 'dependencies',
  name: 'Dependency information',
  description:
    'Inspects package.json and supported lockfile metadata without scanning node_modules',
  sensitivity: 'moderate',
};

export function createDependenciesCollector(): Collector<DependenciesData> {
  return {
    meta: DEPENDENCIES_COLLECTOR_META,
    async collect(ctx: DiagnosticContext): Promise<CollectorResult<DependenciesData>> {
      const start = Date.now();
      const warnings: string[] = [];

      try {
        const hasManifest = await ctx.securityGuard.fileExists('package.json');
        let manifestPresent = false;
        let manifestMalformed = false;
        let projectName: string | undefined;
        let projectVersion: string | undefined;
        let manifestPackageManager: string | undefined;
        let dependencies: Record<string, string> = {};
        let devDependencies: Record<string, string> = {};

        if (!hasManifest) {
          warnings.push('No package.json found in target directory.');
        } else {
          const rawManifest = await ctx.securityGuard.readSafeTextFile('package.json');
          try {
            const parsedJson: unknown = JSON.parse(rawManifest);
            if (
              typeof parsedJson !== 'object' ||
              parsedJson === null ||
              Array.isArray(parsedJson)
            ) {
              manifestMalformed = true;
              warnings.push('Malformed package.json: root value must be a JSON object.');
            } else {
              const parsed = PackageJsonSchema.parse(parsedJson);
              manifestPresent = true;

              if (typeof parsed.name === 'string' && parsed.name.trim()) {
                projectName = parsed.name.trim();
              }
              if (typeof parsed.version === 'string' && parsed.version.trim()) {
                projectVersion = parsed.version.trim();
              }
              if (typeof parsed.packageManager === 'string' && parsed.packageManager.trim()) {
                manifestPackageManager = parsed.packageManager.trim();
              }

              dependencies = extractDependencyMap(parsed.dependencies, 'dependencies', warnings);
              devDependencies = extractDependencyMap(
                parsed.devDependencies,
                'devDependencies',
                warnings,
              );
            }
          } catch {
            manifestMalformed = true;
            warnings.push('Malformed package.json: invalid JSON syntax.');
          }
        }

        const lockfiles = await inspectLockfiles(ctx, warnings);
        if (lockfiles.length === 0) {
          warnings.push('No supported lockfile found in target directory.');
        }

        const depCount = Object.keys(dependencies).length;
        const devDepCount = Object.keys(devDependencies).length;

        const data: DependenciesData = {
          manifestPresent,
          projectName,
          projectVersion,
          packageManager: inferPackageManager(manifestPackageManager, lockfiles),
          dependencies,
          devDependencies,
          counts: {
            dependencies: depCount,
            devDependencies: devDepCount,
            total: depCount + devDepCount,
          },
          lockfiles,
        };

        let status: CollectorResult<DependenciesData>['status'] = 'ok';
        if (!hasManifest && lockfiles.length === 0) {
          status = 'skipped';
        } else if (manifestMalformed || warnings.length > 0) {
          status = 'partial';
        }

        return {
          id: DEPENDENCIES_COLLECTOR_META.id,
          status,
          data,
          warnings,
          durationMs: Math.max(0, Date.now() - start),
        };
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : 'Failed to inspect project dependencies.';
        return {
          id: DEPENDENCIES_COLLECTOR_META.id,
          status: 'error',
          warnings,
          error: {
            code: 'COLLECTOR_EXECUTION_ERROR',
            message,
          },
          durationMs: Math.max(0, Date.now() - start),
        };
      }
    },
  };
}

export const dependenciesCollector: Collector<DependenciesData> = createDependenciesCollector();
