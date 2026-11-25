import {
  DEFAULT_SECRET_RULES,
  REDACTED_PLACEHOLDER,
  type SecretCategory,
  type SecretRule,
  type SecretSeverity,
} from './patterns.js';

export interface SecretMatch {
  readonly ruleId: string;
  readonly ruleName: string;
  readonly category: SecretCategory;
  readonly severity: SecretSeverity;
  readonly start: number;
  readonly end: number;
  readonly line: number;
}

export interface SecretScanResult {
  readonly hasFindings: boolean;
  readonly matches: readonly SecretMatch[];
}

function buildLineStarts(text: string): number[] {
  const starts = [0];
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === '\n') {
      starts.push(i + 1);
    }
  }
  return starts;
}

function getLineNumber(lineStarts: readonly number[], offset: number): number {
  let low = 0;
  let high = lineStarts.length - 1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    const start = lineStarts[mid] ?? 0;
    if (start <= offset) {
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return high + 1;
}

function extractSecretSpan(
  input: string,
  match: RegExpExecArray,
  rule: SecretRule,
): { readonly start: number; readonly end: number; readonly value: string } | undefined {
  const indices = match.indices;
  if (!indices) {
    return undefined;
  }

  if (rule.secretGroup === 0) {
    const span = indices[0];
    if (!span) {
      return undefined;
    }
    const [start, end] = span;
    if (start >= end) {
      return undefined;
    }
    return { start, end, value: input.slice(start, end) };
  }

  for (let idx = rule.secretGroup; idx < match.length; idx += 1) {
    const candidate = match[idx];
    const span = indices[idx];
    if (candidate !== undefined && candidate.length > 0 && span) {
      const [start, end] = span;
      if (start < end) {
        return { start, end, value: candidate };
      }
    }
  }

  return undefined;
}

function deduplicateMatches(matches: readonly SecretMatch[]): SecretMatch[] {
  const sorted = [...matches].sort((a, b) => {
    if (a.start !== b.start) {
      return a.start - b.start;
    }
    const severityRank = (s: SecretSeverity): number => (s === 'critical' ? 2 : 1);
    const rankDiff = severityRank(b.severity) - severityRank(a.severity);
    if (rankDiff !== 0) {
      return rankDiff;
    }
    return b.end - b.start - (a.end - a.start);
  });

  const accepted: SecretMatch[] = [];
  for (const candidate of sorted) {
    const last = accepted[accepted.length - 1];
    if (last && candidate.start < last.end) {
      continue;
    }
    accepted.push(candidate);
  }
  return accepted;
}

export class SecretScanner {
  private readonly rules: readonly SecretRule[];

  public constructor(rules: readonly SecretRule[] = DEFAULT_SECRET_RULES) {
    this.rules = rules;
  }

  public scan(input: string): SecretScanResult {
    if (typeof input !== 'string' || input.length === 0) {
      return { hasFindings: false, matches: [] };
    }

    const lineStarts = buildLineStarts(input);
    const rawMatches: SecretMatch[] = [];

    for (const rule of this.rules) {
      let flags = rule.pattern.flags;
      if (!flags.includes('g')) {
        flags += 'g';
      }
      if (!flags.includes('d')) {
        flags += 'd';
      }
      const regex = new RegExp(rule.pattern.source, flags);

      let execResult: RegExpExecArray | null;
      while ((execResult = regex.exec(input)) !== null) {
        if (execResult[0].length === 0) {
          regex.lastIndex += 1;
          continue;
        }

        const span = extractSecretSpan(input, execResult, rule);
        if (!span || span.value === REDACTED_PLACEHOLDER) {
          continue;
        }

        rawMatches.push({
          ruleId: rule.id,
          ruleName: rule.name,
          category: rule.category,
          severity: rule.severity,
          start: span.start,
          end: span.end,
          line: getLineNumber(lineStarts, span.start),
        });
      }
    }

    const matches = deduplicateMatches(rawMatches);
    return {
      hasFindings: matches.length > 0,
      matches,
    };
  }
}
