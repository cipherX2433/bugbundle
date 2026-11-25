import { describe, expect, it } from 'vitest';
import { SecurityBoundaryError } from '../../src/errors/index.js';
import { RedactionEngine } from '../../src/security/redactor.js';

describe('RedactionEngine', () => {
  const redactor = new RedactionEngine();

  it('replaces database connection string passwords while preserving host and database context', () => {
    const input =
      'DATABASE_URL=postgres://appuser:syntheticDbPass99@db.example.internal:5432/appdb';
    const result = redactor.redactText(input);

    expect(result.text).toBe(
      'DATABASE_URL=postgres://appuser:[REDACTED]@db.example.internal:5432/appdb',
    );
    expect(result.redactedCount).toBe(1);
    expect(result.entries).toEqual([
      {
        ruleId: 'database-connection-credentials',
        category: 'database_credential',
        severity: 'critical',
        count: 1,
        lines: [1],
      },
    ]);
    expect(JSON.stringify(result)).not.toContain('syntheticDbPass99');
  });

  it('redacts multiple secrets across multiple lines without exposing partial secret characters', () => {
    const secretA = 'ghp_syntheticGitHubTokenValue1234567890';
    const secretB = 'syntheticBearerToken987654';
    const secretC = 'superSecretPass123';
    const input = [
      `token_line: ${secretA}`,
      `Authorization: Bearer ${secretB}`,
      `password="${secretC}"`,
    ].join('\n');

    const result = redactor.redactText(input);

    expect(result.redactedCount).toBe(3);
    expect(result.text).toBe(
      ['token_line: [REDACTED]', 'Authorization: Bearer [REDACTED]', 'password="[REDACTED]"'].join(
        '\n',
      ),
    );
    expect(result.text).not.toContain('ghp_');
    expect(result.text).not.toContain('synthetic');
    expect(result.text).not.toContain('superSecret');
  });

  it('redacts multiline private key blocks completely', () => {
    const input = [
      'before key',
      '-----BEGIN OPENSSH PRIVATE KEY-----',
      'b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAAB',
      'syntheticPrivateKeyBodyLineTwo1234567890',
      '-----END OPENSSH PRIVATE KEY-----',
      'after key',
    ].join('\n');

    const result = redactor.redactText(input);

    expect(result.text).toBe(['before key', '[REDACTED]', 'after key'].join('\n'));
    expect(result.redactedCount).toBe(1);
    expect(result.text).not.toContain('BEGIN OPENSSH');
    expect(result.text).not.toContain('syntheticPrivateKey');
  });

  it('redacts nested object structures and rejects circular references', () => {
    const payload = {
      name: 'demo-app',
      nested: {
        auth: 'Bearer syntheticNestedToken12345',
        safe: 'v1.0.0',
      },
    };

    const result = redactor.redactValue(payload);
    expect(result.data).toEqual({
      name: 'demo-app',
      nested: {
        auth: 'Bearer [REDACTED]',
        safe: 'v1.0.0',
      },
    });
    expect(result.redactedCount).toBe(1);

    const circular: Record<string, unknown> = {};
    circular['self'] = circular;
    expect(() => redactor.redactValue(circular)).toThrow(SecurityBoundaryError);
  });
});
