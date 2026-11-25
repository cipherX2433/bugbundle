import { z } from 'zod';
import { ConfigValidationError } from '../errors/index.js';

export const CONFIG_FILENAME = 'bugbundle.config.json';
export const DEFAULT_REPORT_FILENAME = 'bugbundle-report.md';

export const KNOWN_COLLECTOR_IDS = ['system', 'runtimes', 'dependencies'] as const;
export type CollectorId = (typeof KNOWN_COLLECTOR_IDS)[number];

export const CollectorIdSchema = z.enum(KNOWN_COLLECTOR_IDS);

const SafeRelativeFilenameSchema = z
  .string()
  .trim()
  .min(1, 'Report filename must not be empty.')
  .max(128, 'Report filename is too long.')
  .refine(
    (value) => !value.startsWith('/') && !value.startsWith('\\') && !/^[A-Za-z]:/.test(value),
    'Report filename must be a relative filename, not an absolute path.',
  )
  .refine(
    (value) => !value.includes('..') && !value.includes('/') && !value.includes('\\'),
    'Report filename must not contain path separators or traversal segments.',
  )
  .refine(
    (value) => !/^\.env/i.test(value) && !/\.env$/i.test(value),
    'Report filename must not target .env files.',
  );

export const ReportPreferencesSchema = z
  .object({
    filename: SafeRelativeFilenameSchema.default(DEFAULT_REPORT_FILENAME),
    includeWarnings: z.boolean().default(true),
  })
  .strict();

export const SafeCollectionOptionsSchema = z
  .object({
    includeDevDependencies: z.boolean().default(true),
    processTimeoutMs: z.number().int().min(500).max(30_000).default(3000),
  })
  .strict();

export const CollectorsConfigSchema = z
  .object({
    enabled: z.array(CollectorIdSchema).optional(),
    excluded: z.array(CollectorIdSchema).optional(),
  })
  .strict()
  .refine(
    (value) => {
      if (!value.enabled || !value.excluded) {
        return true;
      }
      const excludedSet = new Set(value.excluded);
      return !value.enabled.some((id) => excludedSet.has(id));
    },
    {
      message: 'A collector cannot appear in both "enabled" and "excluded".',
    },
  );

export const BugbundleConfigSchema = z
  .object({
    projectName: z.string().trim().min(1).max(128).optional(),
    collectors: CollectorsConfigSchema.optional(),
    report: ReportPreferencesSchema.optional(),
    options: SafeCollectionOptionsSchema.optional(),
  })
  .strict();

export type RawBugbundleConfig = z.input<typeof BugbundleConfigSchema>;

export interface BugbundleConfig {
  readonly projectName?: string | undefined;
  readonly collectors: {
    readonly enabled?: readonly CollectorId[] | undefined;
    readonly excluded?: readonly CollectorId[] | undefined;
  };
  readonly report: {
    readonly filename: string;
    readonly includeWarnings: boolean;
  };
  readonly options: {
    readonly includeDevDependencies: boolean;
    readonly processTimeoutMs: number;
  };
}

export function normalizeConfig(parsed: z.infer<typeof BugbundleConfigSchema>): BugbundleConfig {
  return {
    ...(parsed.projectName !== undefined ? { projectName: parsed.projectName } : {}),
    collectors: {
      ...(parsed.collectors?.enabled !== undefined ? { enabled: parsed.collectors.enabled } : {}),
      ...(parsed.collectors?.excluded !== undefined
        ? { excluded: parsed.collectors.excluded }
        : {}),
    },
    report: {
      filename: parsed.report?.filename ?? DEFAULT_REPORT_FILENAME,
      includeWarnings: parsed.report?.includeWarnings ?? true,
    },
    options: {
      includeDevDependencies: parsed.options?.includeDevDependencies ?? true,
      processTimeoutMs: parsed.options?.processTimeoutMs ?? 3000,
    },
  };
}

export function createDefaultConfig(projectName?: string): BugbundleConfig {
  const candidate: RawBugbundleConfig = {
    ...(projectName !== undefined && projectName.trim().length > 0
      ? { projectName: projectName.trim() }
      : {}),
    collectors: {
      enabled: [...KNOWN_COLLECTOR_IDS],
      excluded: [],
    },
    report: {
      filename: DEFAULT_REPORT_FILENAME,
      includeWarnings: true,
    },
    options: {
      includeDevDependencies: true,
      processTimeoutMs: 3000,
    },
  };

  return validateConfig(candidate);
}

export function validateConfig(raw: unknown): BugbundleConfig {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new ConfigValidationError('Configuration must be a JSON object.');
  }

  const parsed = BugbundleConfigSchema.safeParse(raw);
  if (!parsed.success) {
    const issueSummary = parsed.error.issues
      .map((issue) => {
        const path = issue.path.length > 0 ? issue.path.join('.') : 'root';
        return `${path}: ${issue.message}`;
      })
      .join('; ');
    throw new ConfigValidationError(`Invalid configuration: ${issueSummary}`);
  }

  return normalizeConfig(parsed.data);
}
