import { SecurityBoundaryError } from '../errors/index.js';
import {
  PathSanitizer,
  type PathSanitizationStats,
  type PathSanitizerOptions,
} from './path-sanitizer.js';
import { PrivacyValidator, type PrivacyValidationResult } from './privacy-validator.js';
import { RedactionEngine, type RedactionEntry } from './redactor.js';
import { SecretScanner, type SecretScanResult } from './scanner.js';

export interface SecurityPipelineOptions {
  readonly scanner?: SecretScanner | undefined;
  readonly redactor?: RedactionEngine | undefined;
  readonly pathSanitizer?: PathSanitizer | undefined;
  readonly privacyValidator?: PrivacyValidator | undefined;
  readonly pathSanitizerOptions?: PathSanitizerOptions | undefined;
}

export interface SecurityPipelineResult<T> {
  readonly data: T;
  readonly scan: SecretScanResult;
  readonly redactionCount: number;
  readonly redactionEntries: readonly RedactionEntry[];
  readonly pathStats: PathSanitizationStats;
  readonly validation: PrivacyValidationResult;
}

/**
 * Security sanitization and fail-closed validation pipeline:
 * Approved Data -> Secret Scanner -> Redaction Engine -> Path Sanitizer -> Privacy Validator -> Sanitized Data
 */
export class SecurityPipeline {
  private readonly scanner: SecretScanner;
  private readonly redactor: RedactionEngine;
  private readonly pathSanitizer: PathSanitizer;
  private readonly privacyValidator: PrivacyValidator;

  public constructor(options: SecurityPipelineOptions = {}) {
    this.scanner = options.scanner ?? new SecretScanner();
    this.redactor = options.redactor ?? new RedactionEngine(this.scanner);
    this.pathSanitizer = options.pathSanitizer ?? new PathSanitizer(options.pathSanitizerOptions);
    this.privacyValidator =
      options.privacyValidator ??
      new PrivacyValidator({
        scanner: this.scanner,
        homeDir: options.pathSanitizerOptions?.homeDir,
      });
  }

  public processText(input: string): SecurityPipelineResult<string> {
    const scan = this.scanner.scan(input);
    const redacted = this.redactor.redactText(input);
    const sanitized = this.pathSanitizer.sanitizeText(redacted.text);
    const validation = this.privacyValidator.validateText(sanitized.text);

    if (!validation.valid) {
      const ruleSummary = [...new Set(validation.violations.map((v) => v.ruleId))].join(', ');
      throw new SecurityBoundaryError(
        `Security pipeline blocked output (${validation.violations.length} violation(s): ${ruleSummary}).`,
      );
    }

    return {
      data: sanitized.text,
      scan,
      redactionCount: redacted.redactedCount,
      redactionEntries: redacted.entries,
      pathStats: sanitized.stats,
      validation,
    };
  }

  public processValue<T>(input: T): SecurityPipelineResult<T> {
    const redacted = this.redactor.redactValue(input);
    const sanitized = this.pathSanitizer.sanitizeValue(redacted.data);
    const validation = this.privacyValidator.validateValue(sanitized.data);

    if (!validation.valid) {
      const ruleSummary = [...new Set(validation.violations.map((v) => v.ruleId))].join(', ');
      throw new SecurityBoundaryError(
        `Security pipeline blocked output (${validation.violations.length} violation(s): ${ruleSummary}).`,
      );
    }

    return {
      data: sanitized.data,
      scan: {
        hasFindings: redacted.redactedCount > 0,
        matches: [],
      },
      redactionCount: redacted.redactedCount,
      redactionEntries: redacted.entries,
      pathStats: sanitized.stats,
      validation,
    };
  }
}
