import { describe, expect, it } from 'vitest';
import {
  createDefaultConfig,
  parseCollectorList,
  resolveEffectiveCollectors,
  validateConfig,
} from '../../src/config/index.js';
import { ConfigValidationError } from '../../src/errors/index.js';

describe('parseCollectorList', () => {
  it('parses single, multiple, whitespace-padded, and duplicate collector names', () => {
    expect(parseCollectorList('system', 'include')).toEqual(['system']);
    expect(parseCollectorList(' system , runtimes , system ', 'include')).toEqual([
      'system',
      'runtimes',
    ]);
    expect(parseCollectorList('dependencies,runtimes', 'exclude')).toEqual([
      'dependencies',
      'runtimes',
    ]);
  });

  it('rejects empty values and trailing/leading commas', () => {
    expect(() => parseCollectorList('', 'include')).toThrow(ConfigValidationError);
    expect(() => parseCollectorList('   ', 'exclude')).toThrow(ConfigValidationError);
    expect(() => parseCollectorList('system,', 'include')).toThrow(ConfigValidationError);
    expect(() => parseCollectorList(',runtimes', 'exclude')).toThrow(ConfigValidationError);
  });

  it('rejects unknown collector names', () => {
    expect(() => parseCollectorList('docker', 'include')).toThrow(ConfigValidationError);
    expect(() => parseCollectorList('system,unknown', 'exclude')).toThrow(ConfigValidationError);
  });
});

describe('resolveEffectiveCollectors', () => {
  it('uses configured enabled minus configured excluded by default', () => {
    const config = validateConfig({
      collectors: {
        excluded: ['dependencies'],
      },
    });

    expect(resolveEffectiveCollectors({ config })).toEqual(['system', 'runtimes']);
  });

  it('narrows with --include and --exclude without re-enabling config-excluded collectors', () => {
    const config = validateConfig({
      collectors: {
        enabled: ['system', 'runtimes'],
      },
    });

    expect(
      resolveEffectiveCollectors({
        config,
        cliInclude: ['system', 'runtimes'],
        cliExclude: ['runtimes'],
      }),
    ).toEqual(['system']);

    // Config only enabled system & runtimes; CLI --include dependencies leaves nothing enabled
    expect(() =>
      resolveEffectiveCollectors({
        config,
        cliInclude: ['dependencies'],
      }),
    ).toThrow(ConfigValidationError);
  });

  it('rejects when all collectors are excluded', () => {
    const config = createDefaultConfig();

    expect(() =>
      resolveEffectiveCollectors({
        config,
        cliExclude: ['system', 'runtimes', 'dependencies'],
      }),
    ).toThrow(ConfigValidationError);
  });
});
