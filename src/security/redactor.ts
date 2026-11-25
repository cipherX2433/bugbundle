import { SecurityBoundaryError } from '../errors/index.js';
import { REDACTED_PLACEHOLDER, type SecretCategory, type SecretSeverity } from './patterns.js';
import { SecretScanner, type SecretMatch } from './scanner.js';

export interface RedactionEntry {
  readonly ruleId: string;
  readonly category: SecretCategory;
  readonly severity: SecretSeverity;
  readonly count: number;
  readonly lines: readonly number[];
}

export interface RedactionTextResult {
  readonly text: string;
  readonly redactedCount: number;
  readonly entries: readonly RedactionEntry[];
}

export interface RedactionValueResult<T> {
  readonly data: T;
  readonly redactedCount: number;
  readonly entries: readonly RedactionEntry[];
}

function mergeEntries(
  target: Map<
    string,
    { category: SecretCategory; severity: SecretSeverity; count: number; lines: Set<number> }
  >,
  matches: readonly SecretMatch[],
): void {
  for (const match of matches) {
    const existing = target.get(match.ruleId);
    if (existing) {
      existing.count += 1;
      existing.lines.add(match.line);
    } else {
      target.set(match.ruleId, {
        category: match.category,
        severity: match.severity,
        count: 1,
        lines: new Set([match.line]),
      });
    }
  }
}

function finalizeEntries(
  map: Map<
    string,
    { category: SecretCategory; severity: SecretSeverity; count: number; lines: Set<number> }
  >,
): RedactionEntry[] {
  return [...map.entries()].map(([ruleId, entry]) => ({
    ruleId,
    category: entry.category,
    severity: entry.severity,
    count: entry.count,
    lines: [...entry.lines].sort((a, b) => a - b),
  }));
}

export class RedactionEngine {
  private readonly scanner: SecretScanner;

  public constructor(scanner: SecretScanner = new SecretScanner()) {
    this.scanner = scanner;
  }

  public redactText(input: string): RedactionTextResult {
    if (typeof input !== 'string' || input.length === 0) {
      return {
        text: typeof input === 'string' ? input : '',
        redactedCount: 0,
        entries: [],
      };
    }

    const scan = this.scanner.scan(input);
    if (!scan.hasFindings) {
      return {
        text: input,
        redactedCount: 0,
        entries: [],
      };
    }

    let cursor = 0;
    const chunks: string[] = [];
    for (const match of scan.matches) {
      chunks.push(input.slice(cursor, match.start));
      chunks.push(REDACTED_PLACEHOLDER);
      cursor = match.end;
    }
    chunks.push(input.slice(cursor));

    const entryMap = new Map<
      string,
      { category: SecretCategory; severity: SecretSeverity; count: number; lines: Set<number> }
    >();
    mergeEntries(entryMap, scan.matches);

    return {
      text: chunks.join(''),
      redactedCount: scan.matches.length,
      entries: finalizeEntries(entryMap),
    };
  }

  public redactValue<T>(value: T): RedactionValueResult<T> {
    const entryMap = new Map<
      string,
      { category: SecretCategory; severity: SecretSeverity; count: number; lines: Set<number> }
    >();
    let totalRedacted = 0;
    const visited = new WeakSet<object>();

    const walk = (node: unknown): unknown => {
      if (typeof node === 'string') {
        const scan = this.scanner.scan(node);
        if (!scan.hasFindings) {
          return node;
        }
        mergeEntries(entryMap, scan.matches);
        totalRedacted += scan.matches.length;

        let cursor = 0;
        const chunks: string[] = [];
        for (const match of scan.matches) {
          chunks.push(node.slice(cursor, match.start));
          chunks.push(REDACTED_PLACEHOLDER);
          cursor = match.end;
        }
        chunks.push(node.slice(cursor));
        return chunks.join('');
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
          `Unsupported value type "${typeof node}" encountered during redaction.`,
        );
      }

      if (visited.has(node)) {
        throw new SecurityBoundaryError('Circular object reference detected during redaction.');
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

    const redactedData = walk(value) as T;
    return {
      data: redactedData,
      redactedCount: totalRedacted,
      entries: finalizeEntries(entryMap),
    };
  }
}
