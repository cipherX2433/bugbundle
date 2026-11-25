import { homedir } from 'node:os';
import { SecurityBoundaryError } from '../errors/index.js';
import type { SecretCategory } from './patterns.js';
import { SecretScanner } from './scanner.js';

export type PrivacyViolationCode =
  'PRIVATE_KEY_DETECTED' | 'RESIDUAL_SECRET_DETECTED' | 'UNSANITIZED_HOME_PATH' | 'MALFORMED_INPUT';

export interface PrivacyViolation {
  readonly code: PrivacyViolationCode;
  readonly ruleId: string;
  readonly category: SecretCategory | 'path' | 'validation';
  readonly message: string;
  readonly location?: string | undefined;
}

export interface PrivacyValidationResult {
  readonly valid: boolean;
  readonly violations: readonly PrivacyViolation[];
  readonly warnings: readonly string[];
}

export interface PrivacyValidatorOptions {
  readonly scanner?: SecretScanner | undefined;
  readonly homeDir?: string | undefined;
}

const PRIVATE_KEY_HEADER_PATTERN =
  /(?:-----BEGIN (?:[A-Z0-9-]+ )?PRIVATE KEY-----|PuTTY-User-Key-File-)/i;

const UNSANITIZED_HOME_PATTERNS: readonly RegExp[] = [
  /(?:^|[\s"'(=,[])(?:\/Users\/[^/\s'"`,;)]+|\/home\/[^/\s'"`,;)]+)/,
  /(?:^|[\s"'(=:,[])[A-Za-z]:[\\/]Users[\\/][^\\/\s'"`,;)]+/i,
];

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export class PrivacyValidator {
  private readonly scanner: SecretScanner;
  private readonly homeDir: string;

  public constructor(options: PrivacyValidatorOptions = {}) {
    this.scanner = options.scanner ?? new SecretScanner();
    this.homeDir = options.homeDir ?? homedir();
  }

  public validateText(input: string, location = 'text'): PrivacyValidationResult {
    if (typeof input !== 'string') {
      return {
        valid: false,
        violations: [
          {
            code: 'MALFORMED_INPUT',
            ruleId: 'type-check',
            category: 'validation',
            message: 'Expected string input for privacy validation.',
            location,
          },
        ],
        warnings: [`[${location}] Privacy validation failed: malformed non-string input.`],
      };
    }

    const violations: PrivacyViolation[] = [];
    const warnings: string[] = [];

    if (PRIVATE_KEY_HEADER_PATTERN.test(input)) {
      violations.push({
        code: 'PRIVATE_KEY_DETECTED',
        ruleId: 'private-key-header',
        category: 'private_key',
        message: 'Private key material is prohibited in exportable diagnostic reports.',
        location,
      });
      warnings.push(`[${location}] Prohibited private-key material detected and blocked.`);
    }

    const scan = this.scanner.scan(input);
    for (const match of scan.matches) {
      if (match.category === 'private_key') {
        continue;
      }
      violations.push({
        code: 'RESIDUAL_SECRET_DETECTED',
        ruleId: match.ruleId,
        category: match.category,
        message: `Residual ${match.ruleName} detected at line ${match.line}.`,
        location,
      });
      warnings.push(
        `[${location}] Residual sensitive value (${match.ruleId}) detected at line ${match.line}.`,
      );
    }

    let hasHomeLeak = UNSANITIZED_HOME_PATTERNS.some((pattern) => pattern.test(input));
    if (!hasHomeLeak && this.homeDir.length > 0) {
      const normalized = this.homeDir.replace(/\\/g, '/').replace(/\/+$/, '');
      const windowsForm = normalized.replace(/\//g, '\\');
      for (const variant of [normalized, windowsForm]) {
        if (variant.length > 0 && new RegExp(escapeRegex(variant), 'i').test(input)) {
          hasHomeLeak = true;
          break;
        }
      }
    }

    if (hasHomeLeak) {
      violations.push({
        code: 'UNSANITIZED_HOME_PATH',
        ruleId: 'unsanitized-home-path',
        category: 'path',
        message: 'Unsanitized user home directory path detected.',
        location,
      });
      warnings.push(`[${location}] Unsanitized user home directory path detected.`);
    }

    return {
      valid: violations.length === 0,
      violations,
      warnings,
    };
  }

  public validateValue(value: unknown): PrivacyValidationResult {
    const violations: PrivacyViolation[] = [];
    const warnings: string[] = [];
    const visited = new WeakSet<object>();

    const walk = (node: unknown, path: string): void => {
      if (typeof node === 'string') {
        const res = this.validateText(node, path);
        violations.push(...res.violations);
        warnings.push(...res.warnings);
        return;
      }

      if (
        node === null ||
        typeof node === 'number' ||
        typeof node === 'boolean' ||
        typeof node === 'undefined'
      ) {
        return;
      }

      if (typeof node !== 'object') {
        violations.push({
          code: 'MALFORMED_INPUT',
          ruleId: 'unsupported-type',
          category: 'validation',
          message: `Unsupported value type "${typeof node}" encountered during privacy validation.`,
          location: path,
        });
        warnings.push(`[${path}] Unsupported value type encountered during privacy validation.`);
        return;
      }

      if (visited.has(node)) {
        violations.push({
          code: 'MALFORMED_INPUT',
          ruleId: 'circular-reference',
          category: 'validation',
          message: 'Circular object reference encountered during privacy validation.',
          location: path,
        });
        warnings.push(`[${path}] Circular object reference encountered during privacy validation.`);
        return;
      }
      visited.add(node);

      if (Array.isArray(node)) {
        node.forEach((item, index) => walk(item, `${path}[${index}]`));
        return;
      }

      for (const [key, val] of Object.entries(node)) {
        walk(val, path ? `${path}.${key}` : key);
      }
    };

    walk(value, 'root');

    return {
      valid: violations.length === 0,
      violations,
      warnings,
    };
  }

  public assertValid(value: unknown): void {
    const result = this.validateValue(value);
    if (!result.valid) {
      const ruleSummary = [...new Set(result.violations.map((v) => v.ruleId))].join(', ');
      throw new SecurityBoundaryError(
        `Privacy validation failed (${result.violations.length} violation(s): ${ruleSummary}). Export blocked.`,
      );
    }
  }
}
