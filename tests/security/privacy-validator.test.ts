import { describe, expect, it } from 'vitest';
import { SecurityBoundaryError } from '../../src/errors/index.js';
import { PrivacyValidator } from '../../src/security/privacy-validator.js';

describe('PrivacyValidator', () => {
  const validator = new PrivacyValidator({ homeDir: '/Users/alice' });

  it('accepts clean sanitized diagnostic content', () => {
    const clean = {
      system: 'darwin 24.6.0 (arm64)',
      path: '<HOME>/projects/app',
      authHeader: 'Bearer [REDACTED]',
    };

    const result = validator.validateValue(clean);
    expect(result.valid).toBe(true);
    expect(result.violations).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it('rejects private key headers and never prints secret contents in violations or errors', () => {
    const syntheticKey = [
      '-----BEGIN EC PRIVATE KEY-----',
      'MHcCAQEEIFakeSyntheticSecretMaterial1234567890',
      '-----END EC PRIVATE KEY-----',
    ].join('\n');

    const result = validator.validateText(syntheticKey);

    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.code === 'PRIVATE_KEY_DETECTED')).toBe(true);
    expect(JSON.stringify(result)).not.toContain('MHcCAQEEIFakeSyntheticSecretMaterial1234567890');

    try {
      validator.assertValid({ key: syntheticKey });
      expect.unreachable('Expected PrivacyValidator.assertValid to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(SecurityBoundaryError);
      expect((error as Error).message).not.toContain(
        'MHcCAQEEIFakeSyntheticSecretMaterial1234567890',
      );
    }
  });

  it('rejects residual high-confidence secrets that remain after sanitization', () => {
    const text = 'Leftover token: ghp_syntheticResidualTokenValue1234567';
    const result = validator.validateText(text);

    expect(result.valid).toBe(false);
    expect(result.violations[0]?.code).toBe('RESIDUAL_SECRET_DETECTED');
    expect(JSON.stringify(result)).not.toContain('ghp_syntheticResidualTokenValue1234567');
  });

  it('rejects unsanitized home directory paths', () => {
    const result = validator.validateValue({ trace: 'Error at /Users/alice/work/index.ts' });

    expect(result.valid).toBe(false);
    expect(result.violations[0]?.code).toBe('UNSANITIZED_HOME_PATH');
    expect(JSON.stringify(result)).not.toContain('/Users/alice/work/index.ts');
  });

  it('fails closed on malformed or circular structured values', () => {
    const circular: Record<string, unknown> = {};
    circular['self'] = circular;

    const result = validator.validateValue(circular);
    expect(result.valid).toBe(false);
    expect(result.violations[0]?.code).toBe('MALFORMED_INPUT');
  });
});
