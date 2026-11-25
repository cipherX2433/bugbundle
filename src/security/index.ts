export { DEFAULT_APPROVED_COLLECTION_FILES, PathSecurityGuard } from './path-guard.js';
export type { PathSecurityGuardOptions } from './path-guard.js';

export { DEFAULT_SECRET_RULES, REDACTED_PLACEHOLDER } from './patterns.js';
export type { SecretCategory, SecretRule, SecretSeverity } from './patterns.js';

export { SecretScanner } from './scanner.js';
export type { SecretMatch, SecretScanResult } from './scanner.js';

export { RedactionEngine } from './redactor.js';
export type { RedactionEntry, RedactionTextResult, RedactionValueResult } from './redactor.js';

export { PathSanitizer } from './path-sanitizer.js';
export type {
  PathSanitizationStats,
  PathSanitizerOptions,
  PathSanitizeTextResult,
  PathSanitizeValueResult,
} from './path-sanitizer.js';

export { PrivacyValidator } from './privacy-validator.js';
export type {
  PrivacyValidationResult,
  PrivacyValidatorOptions,
  PrivacyViolation,
  PrivacyViolationCode,
} from './privacy-validator.js';

export { SecurityPipeline } from './pipeline.js';
export type { SecurityPipelineOptions, SecurityPipelineResult } from './pipeline.js';
