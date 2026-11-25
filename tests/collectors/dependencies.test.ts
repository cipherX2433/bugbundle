import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDependenciesCollector } from '../../src/collectors/dependencies.js';
import { PathSecurityGuard } from '../../src/security/index.js';
import type { DiagnosticContext } from '../../src/types/index.js';

function createContext(cwd: string, guard = new PathSecurityGuard(cwd)): DiagnosticContext {
  return {
    cwd,
    config: {
      cwd,
      outputPath: 'bugbundle-report.md',
    },
    securityGuard: guard,
  };
}

describe('dependenciesCollector', () => {
  const tempDirs: string[] = [];

  function makeWorkspace(): string {
    const dir = mkdtempSync(join(tmpdir(), 'bugbundle-deps-test-'));
    tempDirs.push(dir);
    return dir;
  }

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('collects manifest dependencies, counts, and supported npm lockfile metadata', async () => {
    const dir = makeWorkspace();
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({
        name: 'sample-app',
        version: '1.2.3',
        packageManager: 'npm@11.5.2',
        dependencies: {
          chalk: '^5.4.1',
          zod: '^3.24.2',
        },
        devDependencies: {
          vitest: '^3.0.8',
        },
      }),
    );
    writeFileSync(join(dir, 'package-lock.json'), JSON.stringify({ lockfileVersion: 3 }));

    const collector = createDependenciesCollector();
    const result = await collector.collect(createContext(dir));

    expect(result.id).toBe('dependencies');
    expect(result.status).toBe('ok');
    expect(result.warnings).toEqual([]);
    expect(result.data).toEqual({
      manifestPresent: true,
      projectName: 'sample-app',
      projectVersion: '1.2.3',
      packageManager: 'npm@11.5.2',
      dependencies: {
        chalk: '^5.4.1',
        zod: '^3.24.2',
      },
      devDependencies: {
        vitest: '^3.0.8',
      },
      counts: {
        dependencies: 2,
        devDependencies: 1,
        total: 3,
      },
      lockfiles: [
        {
          filename: 'package-lock.json',
          type: 'npm',
          present: true,
          supported: true,
          lockfileVersion: 3,
        },
      ],
    });
  });

  it('inspects pnpm, yarn, and bun lockfiles safely and handles bun.lockb without execution', async () => {
    const dir = makeWorkspace();
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({ name: 'multi-lock', version: '0.1.0' }),
    );
    writeFileSync(join(dir, 'pnpm-lock.yaml'), "lockfileVersion: '9.0'\n");
    writeFileSync(join(dir, 'yarn.lock'), '# yarn lockfile v1\n');
    writeFileSync(join(dir, 'bun.lock'), '{\n  "lockfileVersion": 1,\n}\n');
    writeFileSync(join(dir, 'bun.lockb'), Buffer.from([0x00, 0x01, 0x02, 0x03]));

    const collector = createDependenciesCollector();
    const result = await collector.collect(createContext(dir));

    expect(result.status).toBe('partial');
    expect(result.data?.lockfiles).toEqual([
      {
        filename: 'pnpm-lock.yaml',
        type: 'pnpm',
        present: true,
        supported: true,
        lockfileVersion: '9.0',
      },
      {
        filename: 'yarn.lock',
        type: 'yarn',
        present: true,
        supported: true,
        lockfileVersion: '1',
      },
      {
        filename: 'bun.lock',
        type: 'bun',
        present: true,
        supported: true,
        lockfileVersion: 1,
      },
      {
        filename: 'bun.lockb',
        type: 'bun-binary',
        present: true,
        supported: false,
        formatNote: 'Binary bun.lockb detected; not text-parsed or executed.',
      },
    ]);
    expect(result.warnings.some((w) => w.includes('bun.lockb'))).toBe(true);
  });

  it('handles missing project manifest and missing lockfiles gracefully as skipped', async () => {
    const dir = makeWorkspace();
    const collector = createDependenciesCollector();
    const result = await collector.collect(createContext(dir));

    expect(result.status).toBe('skipped');
    expect(result.data?.manifestPresent).toBe(false);
    expect(result.data?.lockfiles).toEqual([]);
    expect(result.warnings).toContain('No package.json found in target directory.');
    expect(result.warnings).toContain('No supported lockfile found in target directory.');
  });

  it('handles missing lockfiles when package.json is present', async () => {
    const dir = makeWorkspace();
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'no-lock', version: '1.0.0' }));

    const collector = createDependenciesCollector();
    const result = await collector.collect(createContext(dir));

    expect(result.status).toBe('partial');
    expect(result.data?.manifestPresent).toBe(true);
    expect(result.data?.counts).toEqual({ dependencies: 0, devDependencies: 0, total: 0 });
    expect(result.warnings).toContain('No supported lockfile found in target directory.');
  });

  it('handles malformed package.json gracefully', async () => {
    const dir = makeWorkspace();
    writeFileSync(join(dir, 'package.json'), '{ invalid json');
    writeFileSync(join(dir, 'package-lock.json'), JSON.stringify({ lockfileVersion: 3 }));

    const collector = createDependenciesCollector();
    const result = await collector.collect(createContext(dir));

    expect(result.status).toBe('partial');
    expect(result.data?.manifestPresent).toBe(false);
    expect(result.data?.lockfiles.length).toBe(1);
    expect(result.warnings).toContain('Malformed package.json: invalid JSON syntax.');
  });

  it('handles unsupported lockfile formats gracefully', async () => {
    const dir = makeWorkspace();
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({ name: 'bad-lock', version: '1.0.0' }),
    );
    writeFileSync(join(dir, 'package-lock.json'), JSON.stringify({ lockfileVersion: 999 }));
    writeFileSync(join(dir, 'yarn.lock'), 'unexpected custom header');

    const collector = createDependenciesCollector();
    const result = await collector.collect(createContext(dir));

    expect(result.status).toBe('partial');
    expect(result.data?.lockfiles).toEqual([
      {
        filename: 'package-lock.json',
        type: 'npm',
        present: true,
        supported: false,
        formatNote: 'Unsupported or missing lockfileVersion (999).',
      },
      {
        filename: 'yarn.lock',
        type: 'yarn',
        present: true,
        supported: false,
        formatNote: 'Unrecognized yarn.lock header/metadata.',
      },
    ]);
  });

  it('handles empty dependency sections cleanly', async () => {
    const dir = makeWorkspace();
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({
        name: 'empty-deps',
        version: '0.0.1',
        dependencies: {},
        devDependencies: {},
      }),
    );
    writeFileSync(join(dir, 'package-lock.json'), JSON.stringify({ lockfileVersion: 3 }));

    const collector = createDependenciesCollector();
    const result = await collector.collect(createContext(dir));

    expect(result.status).toBe('ok');
    expect(result.data?.dependencies).toEqual({});
    expect(result.data?.devDependencies).toEqual({});
    expect(result.data?.counts).toEqual({ dependencies: 0, devDependencies: 0, total: 0 });
  });

  it('never reads .env files or scans node_modules', async () => {
    const dir = makeWorkspace();
    writeFileSync(join(dir, '.env'), 'CANARY_SECRET=should_never_be_read\n');
    mkdirSync(join(dir, 'node_modules', 'evil-pkg'), { recursive: true });
    writeFileSync(
      join(dir, 'node_modules', 'evil-pkg', 'package.json'),
      JSON.stringify({ name: 'evil-pkg', version: '9.9.9' }),
    );
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({ name: 'safe-app', version: '1.0.0' }),
    );

    const guard = new PathSecurityGuard(dir);
    const fileExistsSpy = vi.spyOn(guard, 'fileExists');
    const readFileSpy = vi.spyOn(guard, 'readSafeTextFile');

    const collector = createDependenciesCollector();
    const result = await collector.collect(createContext(dir, guard));

    const checkedPaths = fileExistsSpy.mock.calls.map(([p]) => p);
    const readPaths = readFileSpy.mock.calls.map(([p]) => p);

    expect(checkedPaths.some((p) => p.includes('.env') || p.includes('node_modules'))).toBe(false);
    expect(readPaths.some((p) => p.includes('.env') || p.includes('node_modules'))).toBe(false);
    expect(JSON.stringify(result)).not.toContain('CANARY_SECRET');
    expect(JSON.stringify(result)).not.toContain('evil-pkg');
  });
});
