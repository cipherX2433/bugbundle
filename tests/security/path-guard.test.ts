import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { SecurityBoundaryError } from '../../src/errors/index.js';
import { PathSecurityGuard } from '../../src/security/index.js';

describe('PathSecurityGuard', () => {
  const tempDirs: string[] = [];

  function makeWorkspace(): string {
    const dir = mkdtempSync(join(tmpdir(), 'bugbundle-guard-test-'));
    tempDirs.push(dir);
    return dir;
  }

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('allows reading explicitly approved workspace files like package.json', async () => {
    const dir = makeWorkspace();
    writeFileSync(join(dir, 'package.json'), '{"name":"safe"}');

    const guard = new PathSecurityGuard(dir);
    expect(await guard.fileExists('package.json')).toBe(true);
    expect(await guard.readSafeTextFile('package.json')).toBe('{"name":"safe"}');
  });

  it('excludes .env, SSH keys, credentials, shell histories, browser profiles, and node_modules before reading', async () => {
    const dir = makeWorkspace();
    writeFileSync(join(dir, '.env'), 'SECRET=123');
    writeFileSync(join(dir, '.env.local'), 'SECRET=456');
    writeFileSync(join(dir, '.npmrc'), '//registry.npmjs.org/:_authToken=secret');
    writeFileSync(join(dir, '.bash_history'), 'export API_KEY=secret\n');
    writeFileSync(join(dir, '.zsh_history'), 'curl -H "Authorization: Bearer abc"\n');
    mkdirSync(join(dir, '.ssh'), { recursive: true });
    writeFileSync(join(dir, '.ssh', 'id_rsa'), '-----BEGIN RSA PRIVATE KEY-----\n');
    mkdirSync(join(dir, 'Chrome', 'Default'), { recursive: true });
    writeFileSync(join(dir, 'Chrome', 'Default', 'Cookies'), 'cookie-data');
    mkdirSync(join(dir, 'node_modules', 'pkg'), { recursive: true });
    writeFileSync(join(dir, 'node_modules', 'pkg', 'package.json'), '{}');
    writeFileSync(join(dir, 'arbitrary-notes.txt'), 'unapproved file');

    const guard = new PathSecurityGuard(dir);

    for (const prohibited of [
      '.env',
      '.env.local',
      '.npmrc',
      '.bash_history',
      '.zsh_history',
      '.ssh/id_rsa',
      'Chrome/Default/Cookies',
      'node_modules/pkg/package.json',
      'arbitrary-notes.txt',
      '../outside.txt',
      '/etc/passwd',
    ]) {
      await expect(guard.fileExists(prohibited)).rejects.toThrow(SecurityBoundaryError);
      await expect(guard.readSafeTextFile(prohibited)).rejects.toThrow(SecurityBoundaryError);
    }
  });

  it('never lets an allowlist override the denylist for prohibited files', async () => {
    const dir = makeWorkspace();
    writeFileSync(join(dir, '.env'), 'CANARY=never');

    const guard = new PathSecurityGuard(dir, { allowedFiles: ['.env', 'package.json'] });
    await expect(guard.readSafeTextFile('.env')).rejects.toThrow(SecurityBoundaryError);
  });

  it('rejects symlinks escaping the workspace root', async () => {
    const root = makeWorkspace();
    const outside = makeWorkspace();
    const outsideFile = join(outside, 'secret.txt');
    writeFileSync(outsideFile, 'outside secret');
    symlinkSync(outsideFile, join(root, 'package.json'));

    const guard = new PathSecurityGuard(root);
    await expect(guard.readSafeTextFile('package.json')).rejects.toThrow(SecurityBoundaryError);
  });
});
