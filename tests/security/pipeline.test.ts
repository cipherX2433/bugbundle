import { describe, expect, it } from 'vitest';
import { SecurityBoundaryError } from '../../src/errors/index.js';
import {
  PrivacyValidator,
  RedactionEngine,
  SecurityPipeline,
  SecretScanner,
} from '../../src/security/index.js';
import type { SecretRule } from '../../src/security/patterns.js';

describe('SecurityPipeline', () => {
  it('runs SecretScanner -> RedactionEngine -> PathSanitizer -> PrivacyValidator end-to-end', () => {
    const pipeline = new SecurityPipeline({
      pathSanitizerOptions: {
        homeDir: '/Users/alice',
        username: 'alice',
        projectRoot: '/Users/alice/dev/my-app',
      },
    });

    const input = {
      projectFile: '/Users/alice/dev/my-app/src/index.ts',
      cacheDir: '/Users/alice/.npm',
      db: 'postgres://dbuser:syntheticSecretPass@db.internal:5432/prod',
      auth: 'Authorization: Bearer syntheticBearerValue987654',
      key: 'sk_test_syntheticKey1234567890abcdef',
    };

    const result = pipeline.processValue(input);

    expect(result.validation.valid).toBe(true);
    expect(result.redactionCount).toBe(3);
    expect(result.data).toEqual({
      projectFile: '<PROJECT>/src/index.ts',
      cacheDir: '<HOME>/.npm',
      db: 'postgres://dbuser:[REDACTED]@db.internal:5432/prod',
      auth: 'Authorization: Bearer [REDACTED]',
      key: '[REDACTED]',
    });
    expect(JSON.stringify(result)).not.toContain('syntheticSecretPass');
    expect(JSON.stringify(result)).not.toContain('syntheticBearerValue987654');
    expect(JSON.stringify(result)).not.toContain('sk_test_syntheticKey1234567890abcdef');
    expect(JSON.stringify(result)).not.toContain('alice');
  });

  it('blocks export (fails closed) if PrivacyValidator detects residual secrets after sanitization', () => {
    const strictValidatorRule: SecretRule = {
      id: 'residual-custom-secret',
      name: 'Residual Custom Secret',
      category: 'api_key',
      severity: 'critical',
      description: 'Custom validator-only rule simulating a residual secret',
      pattern: /\b(CUSTOM_LEAK_[A-Z0-9]{8,})\b/g,
      secretGroup: 1,
    };

    const pipeline = new SecurityPipeline({
      scanner: new SecretScanner(),
      redactor: new RedactionEngine(new SecretScanner()),
      privacyValidator: new PrivacyValidator({
        scanner: new SecretScanner([strictValidatorRule]),
      }),
    });

    expect(() => pipeline.processText('Header: CUSTOM_LEAK_12345678')).toThrow(
      SecurityBoundaryError,
    );
  });

  it('never allows unredacted private key material to pass validation', () => {
    const pipeline = new SecurityPipeline({
      // Even if a custom redactor fails to strip a private-key header, validator must block export.
      redactor: new RedactionEngine(new SecretScanner([])),
    });

    const rawPrivateKey = '-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEAtest';
    try {
      pipeline.processText(rawPrivateKey);
      expect.unreachable('Expected SecurityPipeline to block private key material');
    } catch (error) {
      expect(error).toBeInstanceOf(SecurityBoundaryError);
      expect((error as Error).message).toContain('private-key-header');
      expect((error as Error).message).not.toContain('MIIEowIBAAKCAQEAtest');
    }
  });
});
