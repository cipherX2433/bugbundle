export {
  BugbundleConfigSchema,
  CONFIG_FILENAME,
  CollectorIdSchema,
  CollectorsConfigSchema,
  DEFAULT_REPORT_FILENAME,
  KNOWN_COLLECTOR_IDS,
  ReportPreferencesSchema,
  SafeCollectionOptionsSchema,
  createDefaultConfig,
  normalizeConfig,
  validateConfig,
} from './schema.js';
export type { BugbundleConfig, CollectorId, RawBugbundleConfig } from './schema.js';

export { loadConfig, toValidatedRuntimeConfig } from './loader.js';
export type { LoadConfigOptions, LoadedConfigResult } from './loader.js';

export { buildConfigExplanations, initConfig } from './init.js';
export type { InitConfigOptions, InitConfigResult, InitFileWriter } from './init.js';

export { parseCollectorList, resolveEffectiveCollectors } from './selection.js';
export type { ResolveCollectorSelectionOptions } from './selection.js';
