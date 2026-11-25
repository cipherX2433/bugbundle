import { ConfigValidationError } from '../errors/index.js';
import {
  CollectorIdSchema,
  KNOWN_COLLECTOR_IDS,
  type BugbundleConfig,
  type CollectorId,
} from './schema.js';

export function parseCollectorList(raw: string, flagName: string): CollectorId[] {
  if (raw.trim().length === 0) {
    throw new ConfigValidationError(
      `Flag --${flagName} must not be empty. Supported collectors: ${KNOWN_COLLECTOR_IDS.join(', ')}.`,
    );
  }

  const parts = raw.split(',').map((part) => part.trim());
  if (parts.some((part) => part.length === 0)) {
    throw new ConfigValidationError(
      `Flag --${flagName} contains an empty collector name. Supported collectors: ${KNOWN_COLLECTOR_IDS.join(', ')}.`,
    );
  }

  const validated: CollectorId[] = [];
  for (const part of parts) {
    const parsed = CollectorIdSchema.safeParse(part);
    if (!parsed.success) {
      throw new ConfigValidationError(
        `Unknown collector "${part}" in --${flagName}. Supported collectors: ${KNOWN_COLLECTOR_IDS.join(', ')}.`,
      );
    }
    if (!validated.includes(parsed.data)) {
      validated.push(parsed.data);
    }
  }

  return validated;
}

export interface ResolveCollectorSelectionOptions {
  readonly config: BugbundleConfig;
  readonly cliInclude?: readonly CollectorId[] | undefined;
  readonly cliExclude?: readonly CollectorId[] | undefined;
}

/**
 * Resolves effective collectors using strict narrowing precedence:
 * 1. Start with configured enabled collectors (or all known collectors by default).
 * 2. Apply configured exclusions.
 * 3. Apply CLI --include as a further restriction (cannot re-enable config-disabled collectors).
 * 4. Apply CLI --exclude as a further restriction.
 * 5. Reject an empty final selection.
 */
export function resolveEffectiveCollectors(
  options: ResolveCollectorSelectionOptions,
): CollectorId[] {
  const configuredEnabled = options.config.collectors.enabled ?? [...KNOWN_COLLECTOR_IDS];
  const configuredExcluded = new Set(options.config.collectors.excluded ?? []);

  let effective = configuredEnabled.filter((id) => !configuredExcluded.has(id));

  if (options.cliInclude && options.cliInclude.length > 0) {
    const includeSet = new Set(options.cliInclude);
    effective = effective.filter((id) => includeSet.has(id));
  }

  if (options.cliExclude && options.cliExclude.length > 0) {
    const excludeSet = new Set(options.cliExclude);
    effective = effective.filter((id) => !excludeSet.has(id));
  }

  if (effective.length === 0) {
    throw new ConfigValidationError(
      'No collectors remain enabled after applying configuration and CLI collector filters.',
    );
  }

  return effective;
}
