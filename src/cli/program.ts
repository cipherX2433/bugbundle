import { readFileSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import chalk from 'chalk';
import { Command } from 'commander';
import { z } from 'zod';
import { dependenciesCollector, runtimesCollector, systemCollector } from '../collectors/index.js';
import {
  initConfig,
  loadConfig,
  parseCollectorList,
  resolveEffectiveCollectors,
  toValidatedRuntimeConfig,
  type CollectorId,
  type LoadedConfigResult,
} from '../config/index.js';
import { DiagnosticOrchestrator } from '../core/index.js';
import {
  CollectorExecutionError,
  ConfigValidationError,
  ReviewAbortedError,
  UserInterruptedError,
} from '../errors/index.js';
import { exportReport, validateExportDestination } from '../export/index.js';
import {
  buildMarkdownReport,
  createReportInputFromPipeline,
  type MarkdownReportInput,
} from '../report/index.js';
import { runReviewGate, type PromptAdapter } from '../review/index.js';
import {
  PathSecurityGuard,
  SecurityPipeline,
  type SecurityPipelineResult,
} from '../security/index.js';
import type {
  Collector,
  CollectorResult,
  CollectorStatus,
  DiagnosticBundle,
} from '../types/index.js';

const PackageManifestSchema = z.object({
  version: z.string().min(1),
});

export interface CliIo {
  readonly stdout: (text: string) => void;
  readonly stderr: (text: string) => void;
}

export interface CreateProgramOptions {
  readonly io?: CliIo | undefined;
  readonly exitOverride?: boolean | undefined;
  readonly collectors?: readonly Collector[] | undefined;
  readonly cwd?: string | undefined;
  readonly securityPipeline?: SecurityPipeline | undefined;
  readonly reportBuilder?: ((input: MarkdownReportInput) => string) | undefined;
  readonly prompt?: PromptAdapter | undefined;
}

const defaultIo: CliIo = {
  stdout: (text) => process.stdout.write(text),
  stderr: (text) => process.stderr.write(text),
};

const COLLECTOR_LABELS: Readonly<Record<string, string>> = {
  system: 'System information',
  runtimes: 'Runtime information',
  dependencies: 'Dependency information',
};

export function getCliVersion(): string {
  const pkgUrl = new URL('../../package.json', import.meta.url);
  const raw = readFileSync(pkgUrl, 'utf8');
  const parsed = PackageManifestSchema.parse(JSON.parse(raw));
  return parsed.version;
}

function writeLine(writer: (text: string) => void, line: string): void {
  writer(`${line}\n`);
}

async function assertValidProjectDirectory(targetCwd: string): Promise<void> {
  try {
    const info = await stat(targetCwd);
    if (!info.isDirectory()) {
      throw new ConfigValidationError('Target project path is not a directory.');
    }
  } catch (error: unknown) {
    if (error instanceof ConfigValidationError) {
      throw error;
    }
    throw new ConfigValidationError('Target project directory could not be resolved.');
  }
}

async function executeDiagnosticPipeline(params: {
  readonly targetCwd: string;
  readonly collectors: readonly Collector[];
  readonly version: string;
  readonly securityPipeline?: SecurityPipeline | undefined;
  readonly cliInclude?: readonly CollectorId[] | undefined;
  readonly cliExclude?: readonly CollectorId[] | undefined;
}): Promise<{
  readonly loadedConfig: LoadedConfigResult;
  readonly secured: SecurityPipelineResult<DiagnosticBundle>;
}> {
  await assertValidProjectDirectory(params.targetCwd);

  const loadedConfig = await loadConfig({ cwd: params.targetCwd });
  const effectiveCollectors = resolveEffectiveCollectors({
    config: loadedConfig.config,
    cliInclude: params.cliInclude,
    cliExclude: params.cliExclude,
  });

  const baseValidatedConfig = toValidatedRuntimeConfig(params.targetCwd, loadedConfig);
  const validatedConfig = {
    ...baseValidatedConfig,
    includeCollectors: effectiveCollectors,
    excludeCollectors: [],
  };

  const orchestrator = new DiagnosticOrchestrator({
    collectors: params.collectors,
    cliVersion: params.version,
  });

  const rawBundle = await orchestrator.collect({
    cwd: params.targetCwd,
    config: validatedConfig,
    securityGuard: new PathSecurityGuard(params.targetCwd),
  });

  if (
    rawBundle.results.length > 0 &&
    rawBundle.results.every((result) => result.status === 'error')
  ) {
    const firstError = rawBundle.results[0]?.error?.message ?? 'All collectors failed.';
    throw new CollectorExecutionError(`Diagnostic collection failed: ${firstError}`);
  }

  const securityPipeline =
    params.securityPipeline ??
    new SecurityPipeline({
      pathSanitizerOptions: {
        projectRoot: params.targetCwd,
      },
    });
  const secured = securityPipeline.processValue(rawBundle);

  return { loadedConfig, secured };
}

function formatStatusIcon(status: CollectorStatus): string {
  switch (status) {
    case 'ok':
      return chalk.green('✓');
    case 'partial':
      return chalk.yellow('!');
    case 'skipped':
      return chalk.yellow('-');
    case 'error':
      return chalk.red('✗');
  }
}

function formatCollectorLine(result: CollectorResult): string {
  const label = COLLECTOR_LABELS[result.id] ?? result.id;
  const suffix = result.status === 'ok' ? '' : chalk.dim(` (${result.status})`);
  return `${formatStatusIcon(result.status)} ${label}${suffix}`;
}

function renderCollectionProgress(bundle: DiagnosticBundle, io: CliIo): void {
  writeLine(io.stdout, chalk.bold('bugbundle — Diagnostic Collection'));
  writeLine(io.stdout, '');

  for (const result of bundle.results) {
    writeLine(io.stdout, formatCollectorLine(result));
  }

  writeLine(io.stdout, '');
  writeLine(io.stdout, chalk.green('Security processing completed.'));
  writeLine(io.stdout, '');
}

export function createProgram(options: CreateProgramOptions = {}): Command {
  const io = options.io ?? defaultIo;
  const version = getCliVersion();
  const collectors = options.collectors ?? [
    systemCollector,
    runtimesCollector,
    dependenciesCollector,
  ];
  const reportBuilder = options.reportBuilder ?? buildMarkdownReport;

  const program = new Command();

  program
    .name('bugbundle')
    .description(
      'Local-first developer diagnostics CLI for Node.js (no telemetry, no uploads, user review required).',
    )
    .version(version, '-V, --version', 'Display the bugbundle CLI version')
    .helpOption('-h, --help', 'Display help for command')
    .showHelpAfterError('(Run with --help for usage information)')
    .configureOutput({
      writeOut: (str) => io.stdout(str),
      writeErr: (str) => io.stderr(str),
    });

  if (options.exitOverride) {
    program.exitOverride();
  }

  program
    .command('collect')
    .description(
      'Collect diagnostics, preview for user review, and export bugbundle-report.md locally',
    )
    .option('--output <path>', 'Relative output path for the Markdown report')
    .option(
      '--include <collectors>',
      'Comma-separated collectors to include (system, runtimes, dependencies)',
    )
    .option(
      '--exclude <collectors>',
      'Comma-separated collectors to exclude (system, runtimes, dependencies)',
    )
    .option('--yes', 'Explicitly approve saving the sanitized report in non-interactive mode')
    .action(
      async (cmdOptions: {
        output?: string;
        include?: string;
        exclude?: string;
        yes?: boolean;
      }) => {
        const targetCwd = options.cwd ?? process.cwd();
        const cliInclude =
          cmdOptions.include !== undefined
            ? parseCollectorList(cmdOptions.include, 'include')
            : undefined;
        const cliExclude =
          cmdOptions.exclude !== undefined
            ? parseCollectorList(cmdOptions.exclude, 'exclude')
            : undefined;

        if (cmdOptions.output !== undefined) {
          validateExportDestination(cmdOptions.output);
        }

        const { loadedConfig, secured } = await executeDiagnosticPipeline({
          targetCwd,
          collectors,
          version,
          securityPipeline: options.securityPipeline,
          cliInclude,
          cliExclude,
        });

        const reportFilename =
          cmdOptions.output !== undefined
            ? validateExportDestination(cmdOptions.output)
            : loadedConfig.config.report.filename;

        const reportInput = createReportInputFromPipeline(secured, {
          projectName: loadedConfig.config.projectName,
          includeWarnings: loadedConfig.config.report.includeWarnings,
        });
        const markdown = reportBuilder(reportInput);

        renderCollectionProgress(secured.data, io);

        const review = await runReviewGate({
          markdownReport: markdown,
          destinationPath: reportFilename,
          securityValidated: secured.validation.valid,
          nonInteractiveApprove: Boolean(cmdOptions.yes),
          io,
          prompt: options.prompt,
        });

        if (!review.approved) {
          if (review.reason === 'interrupted') {
            throw new UserInterruptedError();
          }
          writeLine(io.stdout, chalk.yellow('Collection cancelled. No report was saved.'));
          throw new ReviewAbortedError();
        }

        const exported = await exportReport({
          cwd: targetCwd,
          destinationPath: reportFilename,
          markdownContent: markdown,
          approval: review.approval,
          securityValidated: secured.validation.valid,
        });

        writeLine(
          io.stdout,
          `${chalk.green('✓')} Saved diagnostic report to ./${exported.filePath} (${exported.bytesWritten} bytes)`,
        );
      },
    );

  program
    .command('inspect')
    .description('Collect and preview sanitized diagnostics locally without writing a report file')
    .option(
      '--include <collectors>',
      'Comma-separated collectors to include (system, runtimes, dependencies)',
    )
    .option(
      '--exclude <collectors>',
      'Comma-separated collectors to exclude (system, runtimes, dependencies)',
    )
    .action(async (cmdOptions: { include?: string; exclude?: string }) => {
      const targetCwd = options.cwd ?? process.cwd();
      const cliInclude =
        cmdOptions.include !== undefined
          ? parseCollectorList(cmdOptions.include, 'include')
          : undefined;
      const cliExclude =
        cmdOptions.exclude !== undefined
          ? parseCollectorList(cmdOptions.exclude, 'exclude')
          : undefined;

      writeLine(io.stdout, `${chalk.bold('bugbundle inspect')} ${chalk.dim(`(v${version})`)}`);
      writeLine(io.stdout, chalk.dim('Running local diagnostic collection and security checks...'));

      const { loadedConfig, secured } = await executeDiagnosticPipeline({
        targetCwd,
        collectors,
        version,
        securityPipeline: options.securityPipeline,
        cliInclude,
        cliExclude,
      });

      const reportInput = createReportInputFromPipeline(secured, {
        projectName: loadedConfig.config.projectName,
        includeWarnings: loadedConfig.config.report.includeWarnings,
      });
      const markdown = reportBuilder(reportInput);

      writeLine(io.stdout, '');
      io.stdout(markdown.endsWith('\n') ? markdown : `${markdown}\n`);
      writeLine(io.stdout, chalk.dim('Preview only — no files were created or modified.'));
    });

  program
    .command('init')
    .description('Create a starter bugbundle.config.json configuration file')
    .action(async () => {
      const targetCwd = options.cwd ?? process.cwd();
      const result = await initConfig({ cwd: targetCwd });

      writeLine(io.stdout, `${chalk.green('✓')} Created ${chalk.cyan(result.filePath)}`);
      writeLine(io.stdout, '');
      writeLine(io.stdout, chalk.bold('Generated configuration:'));
      for (const line of result.explanations) {
        writeLine(io.stdout, `  - ${line}`);
      }
    });

  return program;
}
