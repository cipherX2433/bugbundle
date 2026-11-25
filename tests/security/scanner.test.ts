import { describe, expect, it } from 'vitest';
import { SecretScanner } from '../../src/security/scanner.js';

describe('SecretScanner', () => {
  const scanner = new SecretScanner();

  it('detects provider and assigned API keys without exposing raw secret values in metadata', () => {
    const fakeProviderKey = 'sk-proj-syntheticTestKey1234567890abcd';
    const fakeAssignedKey = 'api_key="test_api_key_value_987654321"';
    const text = `OPENAI=${fakeProviderKey}\n${fakeAssignedKey}`;

    const result = scanner.scan(text);

    expect(result.hasFindings).toBe(true);
    expect(result.matches.map((m) => m.category)).toEqual(['api_key', 'api_key']);
    expect(JSON.stringify(result)).not.toContain('syntheticTestKey1234567890abcd');
    expect(JSON.stringify(result)).not.toContain('test_api_key_value_987654321');
  });

  it('detects Bearer tokens and JWTs', () => {
    const fakeJwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0LXVzZXIifQ.syntheticSignatureValue12345';
    const text = `Authorization: Bearer fakeTokenValue12345\nX-Token: ${fakeJwt}`;

    const result = scanner.scan(text);

    expect(result.hasFindings).toBe(true);
    expect(result.matches.map((m) => m.category)).toEqual(['bearer_token', 'auth_token']);
  });

  it('detects password assignments including quoted values and key-matching values', () => {
    const text =
      'password=syntheticPass123\ndb_password: "my synthetic pass 456"\npassword="password"';

    const result = scanner.scan(text);

    expect(result.hasFindings).toBe(true);
    expect(result.matches).toHaveLength(3);
    expect(result.matches.every((m) => m.category === 'password')).toBe(true);
    expect(text.slice(result.matches[2]!.start, result.matches[2]!.end)).toBe('password');
    expect(result.matches[2]!.start).toBe(text.lastIndexOf('password'));
  });

  it('detects AWS keys and multiline private keys', () => {
    const text = [
      'AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE',
      '-----BEGIN RSA PRIVATE KEY-----',
      'MIIEowIBAAKCAQEAtestSyntheticKeyMaterialLine1',
      'MIIEowIBAAKCAQEAtestSyntheticKeyMaterialLine2',
      '-----END RSA PRIVATE KEY-----',
    ].join('\n');

    const result = scanner.scan(text);

    expect(result.hasFindings).toBe(true);
    expect(result.matches.map((m) => m.category)).toEqual(['aws_key', 'private_key']);
    expect(result.matches[1]?.severity).toBe('critical');
    expect(result.matches[1]?.line).toBe(2);
  });

  it('avoids false positives on normal diagnostic text, package versions, and short words', () => {
    const safeText = [
      'System: darwin 24.6.0 (arm64)',
      'Node.js v22.17.1',
      'dependencies: chalk@^5.4.1, commander@^13.1.0, zod@^3.24.2',
      'Bearer of good diagnostic news',
      'password policy documented in SECURITY.md',
    ].join('\n');

    const result = scanner.scan(safeText);

    expect(result.hasFindings).toBe(false);
    expect(result.matches).toEqual([]);
  });

  it('handles empty input safely', () => {
    expect(scanner.scan('')).toEqual({ hasFindings: false, matches: [] });
  });
});
