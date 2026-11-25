import { arch, cpus, platform, release } from 'node:os';
import type {
  Collector,
  CollectorMetadata,
  CollectorResult,
  DiagnosticContext,
  SystemInfoData,
} from '../types/index.js';

export interface SystemCpuEntry {
  readonly model: string;
}

export interface SystemAdapter {
  platform(): string;
  release(): string;
  arch(): string;
  nodeVersion(): string;
  cpus(): readonly SystemCpuEntry[];
}

const defaultSystemAdapter: SystemAdapter = {
  platform: () => platform(),
  release: () => release(),
  arch: () => arch(),
  nodeVersion: () => process.version,
  cpus: () => cpus(),
};

export const SYSTEM_COLLECTOR_META: CollectorMetadata = {
  id: 'system',
  name: 'System information',
  description:
    'Collects OS platform, release, CPU architecture, Node.js version, and safe CPU metadata',
  sensitivity: 'low',
};

export function createSystemCollector(
  adapter: SystemAdapter = defaultSystemAdapter,
): Collector<SystemInfoData> {
  return {
    meta: SYSTEM_COLLECTOR_META,
    async collect(_ctx: DiagnosticContext): Promise<CollectorResult<SystemInfoData>> {
      const start = Date.now();
      const warnings: string[] = [];

      try {
        const cpuEntries = adapter.cpus();
        const firstCpu = cpuEntries[0];
        const model = firstCpu?.model.trim() || 'unknown';
        const cores = cpuEntries.length;

        if (cores === 0) {
          warnings.push('CPU metadata unavailable from host OS.');
        }

        const data: SystemInfoData = {
          platform: adapter.platform(),
          release: adapter.release(),
          arch: adapter.arch(),
          nodeVersion: adapter.nodeVersion(),
          cpu: {
            model,
            cores,
          },
        };

        return {
          id: SYSTEM_COLLECTOR_META.id,
          status: warnings.length > 0 ? 'partial' : 'ok',
          data,
          warnings,
          durationMs: Math.max(0, Date.now() - start),
        };
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : 'Failed to collect system information.';
        return {
          id: SYSTEM_COLLECTOR_META.id,
          status: 'error',
          warnings,
          error: {
            code: 'COLLECTOR_EXECUTION_ERROR',
            message,
          },
          durationMs: Math.max(0, Date.now() - start),
        };
      }
    },
  };
}

export const systemCollector: Collector<SystemInfoData> = createSystemCollector();
