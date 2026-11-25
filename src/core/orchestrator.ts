import { BugbundleError } from '../errors/index.js';
import type {
  Collector,
  CollectorResult,
  DiagnosticBundle,
  DiagnosticContext,
} from '../types/index.js';

export interface OrchestratorOptions {
  readonly collectors: readonly Collector[];
  readonly cliVersion: string;
  readonly now?: (() => Date) | undefined;
}

async function runSingleCollector(
  collector: Collector,
  ctx: DiagnosticContext,
): Promise<CollectorResult> {
  const start = Date.now();
  try {
    return await collector.collect(ctx);
  } catch (error: unknown) {
    const durationMs = Math.max(0, Date.now() - start);
    if (error instanceof BugbundleError) {
      return {
        id: collector.meta.id,
        status: 'error',
        warnings: [],
        error: error.toSafeSummary(),
        durationMs,
      };
    }

    const message = error instanceof Error ? error.message : 'Unexpected collector failure.';
    return {
      id: collector.meta.id,
      status: 'error',
      warnings: [],
      error: {
        code: 'COLLECTOR_EXECUTION_ERROR',
        message,
      },
      durationMs,
    };
  }
}

export class DiagnosticOrchestrator {
  private readonly collectors: readonly Collector[];
  private readonly cliVersion: string;
  private readonly now: () => Date;

  public constructor(options: OrchestratorOptions) {
    this.collectors = options.collectors;
    this.cliVersion = options.cliVersion;
    this.now = options.now ?? (() => new Date());
  }

  public async collect(ctx: DiagnosticContext): Promise<DiagnosticBundle> {
    const enabled = this.filterCollectors(ctx);
    const results = await Promise.all(
      enabled.map((collector) => runSingleCollector(collector, ctx)),
    );

    const warnings = results.flatMap((result) =>
      result.warnings.map((warning) => `[${result.id}] ${warning}`),
    );

    return {
      generatedAt: this.now().toISOString(),
      cliVersion: this.cliVersion,
      results,
      warnings,
    };
  }

  private filterCollectors(ctx: DiagnosticContext): readonly Collector[] {
    const include = ctx.config.includeCollectors;
    const exclude = new Set(ctx.config.excludeCollectors ?? []);

    return this.collectors.filter((collector) => {
      if (include && include.length > 0 && !include.includes(collector.meta.id)) {
        return false;
      }
      return !exclude.has(collector.meta.id);
    });
  }
}
