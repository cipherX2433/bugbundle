import { SecurityBoundaryError } from '../errors/index.js';
import { REDACTED_PLACEHOLDER, type SecurityPipelineResult } from '../security/index.js';
import type {
  CollectorResult,
  DependenciesData,
  DiagnosticBundle,
  RuntimesData,
  SystemInfoData,
} from '../types/index.js';
import type { MarkdownReportInput } from './types.js';

function normalizeSingleLine(value: string): string {
  return value.replace(/[\r\n\t]+/g, ' ').trim();
}

/**
 * Escapes Markdown-significant characters in plain text or table cells so
 * collected values cannot inject headings, links, HTML, or table columns.
 */
export function escapeMarkdownText(value: string): string {
  const singleLine = normalizeSingleLine(value);
  return singleLine
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\|/g, '\\|')
    .replace(/\*/g, '\\*')
    .replace(/_/g, '\\_')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/^#/g, '\\#');
}

/**
 * Formats an identifier or version string inside a safe inline Markdown code span.
 */
export function formatCodeSpan(value: string): string {
  const safe = normalizeSingleLine(value).replace(/\|/g, '\\|');
  if (!safe.includes('`')) {
    return `\`${safe}\``;
  }
  return `\`\` ${safe} \`\``;
}

function findCollectorResult(bundle: DiagnosticBundle, id: string): CollectorResult | undefined {
  return bundle.results.find((result) => result.id === id);
}

function isSystemData(data: unknown): data is SystemInfoData {
  return (
    typeof data === 'object' &&
    data !== null &&
    'platform' in data &&
    'release' in data &&
    'arch' in data
  );
}

function isRuntimesData(data: unknown): data is RuntimesData {
  return (
    typeof data === 'object' &&
    data !== null &&
    'tools' in data &&
    Array.isArray((data as { tools?: unknown }).tools)
  );
}

function isDependenciesData(data: unknown): data is DependenciesData {
  return (
    typeof data === 'object' &&
    data !== null &&
    'manifestPresent' in data &&
    'counts' in data &&
    'lockfiles' in data
  );
}

function resolveProjectName(
  input: MarkdownReportInput,
  depsResult: CollectorResult | undefined,
): string | undefined {
  if (input.projectName && input.projectName.trim().length > 0) {
    return input.projectName.trim();
  }
  if (depsResult?.data && isDependenciesData(depsResult.data) && depsResult.data.projectName) {
    return depsResult.data.projectName;
  }
  return undefined;
}

function renderHeaderSection(
  input: MarkdownReportInput,
  depsResult: CollectorResult | undefined,
): string[] {
  const lines: string[] = [
    '# bugbundle Diagnostic Report',
    '',
    'Automatically generated local-first diagnostic report for issue triage.',
    '',
    '| Field | Value |',
    '| :--- | :--- |',
    `| Tool | ${formatCodeSpan(`bugbundle v${input.bundle.cliVersion || 'unknown'}`)} |`,
  ];

  const projectName = resolveProjectName(input, depsResult);
  if (projectName) {
    lines.push(`| Project | ${escapeMarkdownText(projectName)} |`);
  }

  lines.push(`| Generated At | ${formatCodeSpan(input.bundle.generatedAt || 'unknown')} |`);
  return lines;
}

function renderSystemSection(result: CollectorResult | undefined): string[] {
  const lines: string[] = ['## System Information', ''];

  if (!result) {
    lines.push('System information was not collected.');
    return lines;
  }

  if (!result.data || !isSystemData(result.data)) {
    lines.push(`System information unavailable (status: ${escapeMarkdownText(result.status)}).`);
    return lines;
  }

  const { platform, release, arch, nodeVersion, cpu } = result.data;
  lines.push(
    '| Property | Value |',
    '| :--- | :--- |',
    `| Platform | ${formatCodeSpan(platform || 'unknown')} |`,
    `| OS Release | ${formatCodeSpan(release || 'unknown')} |`,
    `| Architecture | ${formatCodeSpan(arch || 'unknown')} |`,
    `| Node.js Version | ${formatCodeSpan(nodeVersion || 'unknown')} |`,
    `| CPU Model | ${escapeMarkdownText(cpu?.model || 'unknown')} |`,
    `| CPU Cores | ${String(cpu?.cores ?? 0)} |`,
  );

  return lines;
}

function renderRuntimesSection(result: CollectorResult | undefined): string[] {
  const lines: string[] = ['## Runtime Information', ''];

  if (!result) {
    lines.push('Runtime information was not collected.');
    return lines;
  }

  if (!result.data || !isRuntimesData(result.data)) {
    lines.push(`Runtime information unavailable (status: ${escapeMarkdownText(result.status)}).`);
    return lines;
  }

  if (result.data.tools.length === 0) {
    lines.push('No runtime checks were recorded.');
    return lines;
  }

  lines.push('| Runtime | Role | Status | Version |', '| :--- | :--- | :--- | :--- |');
  for (const tool of result.data.tools) {
    const role = tool.required ? 'Primary' : 'Optional';
    const versionDisplay = tool.version
      ? formatCodeSpan(tool.version)
      : escapeMarkdownText(tool.status === 'missing' ? 'not installed' : 'unavailable');
    lines.push(
      `| ${escapeMarkdownText(tool.name)} | ${role} | ${escapeMarkdownText(tool.status)} | ${versionDisplay} |`,
    );
  }

  return lines;
}

function renderDependencyMap(title: string, entries: Readonly<Record<string, string>>): string[] {
  const pairs = Object.entries(entries);
  if (pairs.length === 0) {
    return [];
  }

  const lines: string[] = [`### ${title}`, '', '| Package | Version Range |', '| :--- | :--- |'];
  for (const [name, versionRange] of pairs) {
    lines.push(`| ${formatCodeSpan(name)} | ${formatCodeSpan(versionRange)} |`);
  }
  return lines;
}

function renderDependenciesSection(result: CollectorResult | undefined): string[] {
  const lines: string[] = ['## Dependency Information', ''];

  if (!result) {
    lines.push('Dependency information was not collected.');
    return lines;
  }

  if (!result.data || !isDependenciesData(result.data)) {
    lines.push(
      `Dependency information unavailable (status: ${escapeMarkdownText(result.status)}).`,
    );
    return lines;
  }

  const data = result.data;
  const manifestLabel = data.manifestPresent ? 'package.json found' : 'package.json not found';
  const projectLabel = data.projectName
    ? `${data.projectName}${data.projectVersion ? `@${data.projectVersion}` : ''}`
    : 'not specified';

  lines.push(
    '| Property | Value |',
    '| :--- | :--- |',
    `| Manifest | ${escapeMarkdownText(manifestLabel)} |`,
    `| Project Manifest Name | ${escapeMarkdownText(projectLabel)} |`,
    `| Package Manager | ${data.packageManager ? formatCodeSpan(data.packageManager) : 'not detected'} |`,
    `| Dependencies Count | ${String(data.counts.dependencies)} |`,
    `| DevDependencies Count | ${String(data.counts.devDependencies)} |`,
    `| Total Declared Dependencies | ${String(data.counts.total)} |`,
  );

  lines.push('', '### Lockfiles', '');
  if (data.lockfiles.length === 0) {
    lines.push('No supported lockfiles detected.');
  } else {
    lines.push(
      '| Filename | Type | Supported | Version | Notes |',
      '| :--- | :--- | :--- | :--- | :--- |',
    );
    for (const lock of data.lockfiles) {
      const versionCell =
        lock.lockfileVersion !== undefined ? formatCodeSpan(String(lock.lockfileVersion)) : 'n/a';
      const noteCell = lock.formatNote ? escapeMarkdownText(lock.formatNote) : '-';
      lines.push(
        `| ${formatCodeSpan(lock.filename)} | ${escapeMarkdownText(lock.type)} | ${lock.supported ? 'Yes' : 'No'} | ${versionCell} | ${noteCell} |`,
      );
    }
  }

  const depLines = renderDependencyMap('Declared Dependencies', data.dependencies);
  if (depLines.length > 0) {
    lines.push('', ...depLines);
  }

  const devDepLines = renderDependencyMap('Development Dependencies', data.devDependencies);
  if (devDepLines.length > 0) {
    lines.push('', ...devDepLines);
  }

  return lines;
}

function collectSafeWarnings(bundle: DiagnosticBundle): string[] {
  const seen = new Set<string>();
  const collected: string[] = [];

  for (const warning of bundle.warnings) {
    const normalized = normalizeSingleLine(warning);
    if (normalized.length > 0 && !seen.has(normalized)) {
      seen.add(normalized);
      collected.push(normalized);
    }
  }

  for (const result of bundle.results) {
    if (result.error) {
      const errorLine = `[${result.id}] ${result.error.code}: ${result.error.message}`;
      const normalized = normalizeSingleLine(errorLine);
      if (!seen.has(normalized)) {
        seen.add(normalized);
        collected.push(normalized);
      }
    }
  }

  return collected;
}

function renderWarningsSection(
  bundle: DiagnosticBundle,
  includeWarnings: boolean,
  warnings: readonly string[],
): string[] {
  const lines: string[] = ['## Collection Warnings', ''];

  if (!includeWarnings) {
    lines.push('Collection warnings omitted by configuration (`report.includeWarnings: false`).');
    return lines;
  }

  if (warnings.length === 0) {
    lines.push('No collection warnings or errors.');
    return lines;
  }

  for (const warning of warnings) {
    lines.push(`- ${escapeMarkdownText(warning)}`);
  }

  // Note if bundle had no collector results at all
  if (bundle.results.length === 0) {
    lines.push('', '_No collectors were executed in this diagnostic bundle._');
  }

  return lines;
}

function renderPrivacySection(input: MarkdownReportInput, warningCount: number): string[] {
  const lines: string[] = [
    '## Privacy and Security Summary',
    '',
    'This report was generated locally after processing through the `bugbundle` security pipeline (no telemetry, no automatic uploads, `.env` and credential files excluded).',
    '',
    '| Check | Value |',
    '| :--- | :--- |',
  ];

  if (input.security) {
    lines.push(
      `| Security Validation | ${input.security.validated ? 'Passed' : 'Failed'} |`,
      `| Redactions Applied | ${String(input.security.redactionCount)} |`,
    );
    if (input.security.pathReplacements !== undefined) {
      lines.push(`| Path Sanitizations | ${String(input.security.pathReplacements)} |`);
    }
  } else {
    lines.push('| Security Validation | Not attached |');
  }

  lines.push(`| Collection Warnings | ${String(warningCount)} |`);
  return lines;
}

/**
 * Returns a shallow copy of `bundle` with top-level `warnings` entries that are
 * exact `[collectorId] warning` copies of `results[].warnings` removed, so
 * security redaction counting does not double-count derived orchestrator warnings.
 */
export function stripDerivedBundleWarnings(bundle: DiagnosticBundle): DiagnosticBundle {
  const derivedCounts = new Map<string, number>();
  for (const result of bundle.results) {
    for (const warning of result.warnings) {
      const derived = `[${result.id}] ${warning}`;
      derivedCounts.set(derived, (derivedCounts.get(derived) ?? 0) + 1);
    }
  }

  const remainingWarnings: string[] = [];
  for (const warning of bundle.warnings) {
    const count = derivedCounts.get(warning) ?? 0;
    if (count > 0) {
      derivedCounts.set(warning, count - 1);
    } else {
      remainingWarnings.push(warning);
    }
  }

  return {
    ...bundle,
    warnings: remainingWarnings,
  };
}

function countDuplicateDerivedWarningRedactions(bundle: DiagnosticBundle): number {
  const derivedCounts = new Map<string, number>();
  for (const result of bundle.results) {
    for (const warning of result.warnings) {
      const derived = `[${result.id}] ${warning}`;
      derivedCounts.set(derived, (derivedCounts.get(derived) ?? 0) + 1);
    }
  }

  let duplicateRedactions = 0;
  for (const warning of bundle.warnings) {
    const count = derivedCounts.get(warning) ?? 0;
    if (count > 0) {
      derivedCounts.set(warning, count - 1);
      let index = warning.indexOf(REDACTED_PLACEHOLDER);
      while (index !== -1) {
        duplicateRedactions += 1;
        index = warning.indexOf(REDACTED_PLACEHOLDER, index + REDACTED_PLACEHOLDER.length);
      }
    }
  }

  return duplicateRedactions;
}

export function createReportInputFromPipeline(
  secured: SecurityPipelineResult<DiagnosticBundle>,
  options: {
    readonly projectName?: string | undefined;
    readonly includeWarnings?: boolean | undefined;
    readonly redactionCount?: number | undefined;
  } = {},
): MarkdownReportInput {
  const redactionCount =
    options.redactionCount !== undefined
      ? options.redactionCount
      : secured.redactionCount > 0 &&
          secured.data.warnings.length > 0 &&
          secured.data.results.length > 0
        ? Math.max(0, secured.redactionCount - countDuplicateDerivedWarningRedactions(secured.data))
        : secured.redactionCount;

  return {
    bundle: secured.data,
    projectName: options.projectName,
    includeWarnings: options.includeWarnings,
    security: {
      validated: secured.validation.valid,
      redactionCount,
      pathReplacements: secured.pathStats.replacements,
    },
  };
}

/**
 * Pure transformation converting sanitized diagnostic output into a structured
 * GitHub-Flavored Markdown report.
 */
export function buildMarkdownReport(input: MarkdownReportInput): string {
  if (input.security && !input.security.validated) {
    throw new SecurityBoundaryError(
      'Cannot build Markdown report: security validation did not pass.',
    );
  }

  const bundle = input.bundle;
  const includeWarnings = input.includeWarnings ?? true;
  const systemResult = findCollectorResult(bundle, 'system');
  const runtimesResult = findCollectorResult(bundle, 'runtimes');
  const depsResult = findCollectorResult(bundle, 'dependencies');
  const warnings = collectSafeWarnings(bundle);

  const sections: string[][] = [
    renderHeaderSection(input, depsResult),
    renderSystemSection(systemResult),
    renderRuntimesSection(runtimesResult),
    renderDependenciesSection(depsResult),
    renderWarningsSection(bundle, includeWarnings, warnings),
    renderPrivacySection(input, warnings.length),
  ];

  return `${sections.map((section) => section.join('\n')).join('\n\n')}\n`;
}
