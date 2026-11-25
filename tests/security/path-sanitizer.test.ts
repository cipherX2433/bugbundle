import { describe, expect, it } from 'vitest';
import { PathSanitizer } from '../../src/security/path-sanitizer.js';

describe('PathSanitizer', () => {
  it('sanitizes Unix home directory paths and usernames', () => {
    const sanitizer = new PathSanitizer({
      homeDir: '/Users/alice',
      username: 'alice',
    });

    const input = [
      'Config loaded from /Users/alice/.config/tool.json',
      'Cache path: /home/bob/.cache/pnpm',
      'USER=alice',
    ].join('\n');

    const result = sanitizer.sanitizeText(input);

    expect(result.text).toBe(
      [
        'Config loaded from <HOME>/.config/tool.json',
        'Cache path: <HOME>/.cache/pnpm',
        'USER=<USER>',
      ].join('\n'),
    );
    expect(result.stats.homePathsRedacted).toBe(3);
    expect(result.text).not.toContain('alice');
    expect(result.text).not.toContain('bob');
  });

  it('sanitizes Windows home directory and system paths', () => {
    const sanitizer = new PathSanitizer({
      homeDir: 'C:\\Users\\AliceDev',
      username: 'AliceDev',
    });

    const input = [
      'Error in C:\\Users\\AliceDev\\AppData\\Local\\Temp\\log.txt',
      'Other path C:/Users/Bob/project/index.ts',
      'System file: C:\\Windows\\System32\\drivers\\etc\\hosts',
    ].join('\n');

    const result = sanitizer.sanitizeText(input);

    expect(result.text).toBe(
      [
        'Error in <HOME>\\AppData\\Local\\Temp\\log.txt',
        'Other path <HOME>/project/index.ts',
        'System file: <PATH>',
      ].join('\n'),
    );
    expect(result.text).not.toContain('AliceDev');
    expect(result.text).not.toContain('Bob');
  });

  it('preserves safe relative project paths and normalizes project root paths', () => {
    const sanitizer = new PathSanitizer({
      homeDir: '/Users/alice',
      projectRoot: '/Users/alice/projects/bugbundle',
    });

    const input = [
      'Entry: /Users/alice/projects/bugbundle/src/cli/program.ts',
      'Relative: src/collectors/system.ts and ./package.json',
      'Docs: https://example.com/docs/getting-started and @types/node',
    ].join('\n');

    const result = sanitizer.sanitizeText(input);

    expect(result.text).toBe(
      [
        'Entry: <PROJECT>/src/cli/program.ts',
        'Relative: src/collectors/system.ts and ./package.json',
        'Docs: https://example.com/docs/getting-started and @types/node',
      ].join('\n'),
    );
    expect(result.text).not.toContain('alice');
  });

  it('handles empty input and unrelated diagnostic text without corruption', () => {
    const sanitizer = new PathSanitizer({ homeDir: '/Users/alice', username: 'alice' });

    expect(sanitizer.sanitizeText('').text).toBe('');
    const safe = 'System: darwin 24.6.0 (arm64), Node v22.17.1, deps: chalk@^5.4.1';
    expect(sanitizer.sanitizeText(safe).text).toBe(safe);
  });
});
