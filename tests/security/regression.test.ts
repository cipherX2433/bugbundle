import { describe, expect, it } from 'vitest';
import { SecurityBoundaryError } from '../../src/errors/index.js';
import {
  PrivacyValidator,
  RedactionEngine,
  SecurityPipeline,
  SecretScanner,
} from '../../src/security/index.js';
import type { SecretRule } from '../../src/security/patterns.js';

describe('Security regression suite (password assignment & pipeline hardening)', () => {
  const pipeline = new SecurityPipeline({
    pathSanitizerOptions: {
      homeDir: '/Users/alice',
      username: 'alice',
      projectRoot: '/Users/alice/dev/bugbundle',
    },
  });

  describe('SecurityPipeline.processText()', () => {
    it('redacts standalone and prefixed password assignments including FAKE_PASSWORD and DB_PASS', () => {
      const secrets = [
        'example_standalone_1',
        'example_passwd_2',
        'example_pwd_3',
        'example_db_pass_4',
        'example_db_password_5',
        'example_app_password_6',
        'example_user_password_7',
        'example_fake_password_8',
        'example_colon_pw_9',
        'example_colon_app_10',
      ];

      const input = [
        `PASSWORD=${secrets[0]}`,
        `PASSWD=${secrets[1]}`,
        `PWD=${secrets[2]}`,
        `DB_PASS=${secrets[3]}`,
        `DB_PASSWORD=${secrets[4]}`,
        `APP_PASSWORD=${secrets[5]}`,
        `USER_PASSWORD=${secrets[6]}`,
        `FAKE_PASSWORD=${secrets[7]}`,
        `PASSWORD: ${secrets[8]}`,
        `APP_PASSWORD: "${secrets[9]}"`,
      ].join('\n');

      const result = pipeline.processText(input);

      expect(result.validation.valid).toBe(true);
      expect(result.redactionCount).toBe(10);
      expect(result.redactionEntries).toEqual([
        expect.objectContaining({
          ruleId: 'password-assignment',
          category: 'password',
          count: 10,
        }),
      ]);

      for (const secret of secrets) {
        expect(result.data).not.toContain(secret);
      }
      expect(result.data).toContain('FAKE_PASSWORD=[REDACTED]');
      expect(result.data).toContain('APP_PASSWORD=[REDACTED]');
      expect(result.data).toContain('PASSWORD: [REDACTED]');

      // Metadata privacy: no raw secret values anywhere in scan/redaction metadata
      const serializedMeta = JSON.stringify({
        scan: result.scan,
        redactionEntries: result.redactionEntries,
        pathStats: result.pathStats,
        validation: result.validation,
      });
      for (const secret of secrets) {
        expect(serializedMeta).not.toContain(secret);
      }
    });

    it('redacts API_SECRET=example and mixed-case password names across multiline input', () => {
      const input = [
        'API_SECRET=example',
        'App_Password=MixedCaseSecretValue1',
        'fake_password: "QuotedMixedValue2"',
        'Db_Pass=MixedDbPass3',
      ].join('\n');

      const result = pipeline.processText(input);

      expect(result.validation.valid).toBe(true);
      expect(result.redactionCount).toBe(4);
      expect(result.data).toBe(
        [
          'API_SECRET=[REDACTED]',
          'App_Password=[REDACTED]',
          'fake_password: "[REDACTED]"',
          'Db_Pass=[REDACTED]',
        ].join('\n'),
      );

      const serialized = JSON.stringify(result);
      for (const raw of ['example', 'MixedCaseSecretValue1', 'QuotedMixedValue2', 'MixedDbPass3']) {
        expect(serialized).not.toContain(raw);
      }
    });

    it('redacts database credentials, GitHub tokens, Bearer tokens, JWTs, and multiple secrets in one string', () => {
      const dbPass = 'syntheticDbPass987';
      const ghToken = 'ghp_syntheticRegressToken1234567890';
      const bearer = 'syntheticBearerToken123456';
      const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJyZWdyZXNzIn0.syntheticJwtSig123456';
      const appPass = 'syntheticAppPw999';

      const input = `postgres://admin:${dbPass}@db.example.com:5432/app | Authorization: Bearer ${bearer} | GH=${ghToken} | JWT=${jwt} | APP_PASSWORD=${appPass}`;

      const result = pipeline.processText(input);

      expect(result.validation.valid).toBe(true);
      expect(result.redactionCount).toBe(5);
      expect(result.data).toBe(
        'postgres://admin:[REDACTED]@db.example.com:5432/app | Authorization: Bearer [REDACTED] | GH=[REDACTED] | JWT=[REDACTED] | APP_PASSWORD=[REDACTED]',
      );

      const serialized = JSON.stringify(result);
      for (const secret of [dbPass, ghToken, bearer, jwt, appPass]) {
        expect(serialized).not.toContain(secret);
      }
    });

    it('does not trigger false positives on PASSWORD_POLICY or normal diagnostic output', () => {
      const safeInput = [
        'PASSWORD_POLICY=strict',
        'APP_PASSWORD_POLICY: enforced',
        'password policy documented in SECURITY.md',
        'my_password_hint=none',
        'crossword=example',
        'System: darwin 24.6.0 (arm64)',
        'Node.js v22.17.1',
        'dependencies: chalk@^5.6.2, commander@^13.1.0, zod@^4.6.7',
        'Bearer of good diagnostic news',
      ].join('\n');

      const result = pipeline.processText(safeInput);

      expect(result.validation.valid).toBe(true);
      expect(result.redactionCount).toBe(0);
      expect(result.redactionEntries).toEqual([]);
      expect(result.data).toBe(safeInput);
    });
  });

  describe('SecurityPipeline.processValue()', () => {
    it('redacts secrets across strings, nested objects, arrays, and multiple secret fields without leaking metadata', () => {
      const s1 = 'nestedFakePass123';
      const s2 = 'nestedDbSecret456';
      const s3 = 'ghp_nestedArrayGitHubToken12345678';
      const s4 = 'nestedBearer7890';

      const payload = {
        line: `FAKE_PASSWORD=${s1}`,
        nested: {
          envText: `DB_PASSWORD=${s2}\nAPI_SECRET=example`,
          tokens: [`Authorization: Bearer ${s4}`, ghSecret(s3)],
        },
      };

      const result = pipeline.processValue(payload);

      expect(result.validation.valid).toBe(true);
      expect(result.redactionCount).toBe(5);
      expect(result.data).toEqual({
        line: 'FAKE_PASSWORD=[REDACTED]',
        nested: {
          envText: 'DB_PASSWORD=[REDACTED]\nAPI_SECRET=[REDACTED]',
          tokens: ['Authorization: Bearer [REDACTED]', '[REDACTED]'],
        },
      });

      const serialized = JSON.stringify(result);
      for (const secret of [s1, s2, s3, s4, 'example']) {
        expect(serialized).not.toContain(secret);
      }
    });

    it('rejects circular references fail-closed with SecurityBoundaryError', () => {
      const circular: Record<string, unknown> = { ok: 'value' };
      circular.self = circular;

      expect(() => pipeline.processValue(circular)).toThrow(SecurityBoundaryError);
    });

    it('strips prototype-pollution keys safely without mutating Object.prototype', () => {
      const polluted = JSON.parse(
        '{"__proto__":{"polluted":"yes"},"constructor":{"bad":"val"},"prototype":{"x":"y"},"safe":"FAKE_PASSWORD=secretProto123"}',
      ) as Record<string, unknown>;

      const result = pipeline.processValue(polluted);

      expect(result.validation.valid).toBe(true);
      expect(result.data).toEqual({
        safe: 'FAKE_PASSWORD=[REDACTED]',
      });
      expect(({} as Record<string, unknown>).polluted).toBeUndefined();
      expect(JSON.stringify(result)).not.toContain('secretProto123');
    });
  });

  describe('fail-closed PrivacyValidator behavior', () => {
    it('blocks output if PrivacyValidator detects an unredacted residual secret', () => {
      const residualRule: SecretRule = {
        id: 'residual-regress-rule',
        name: 'Residual Regression Rule',
        category: 'password',
        severity: 'critical',
        description: 'Simulates a residual secret missed by redaction',
        pattern: /\b(RESIDUAL_SECRET_[A-Z0-9]{6,})\b/g,
        secretGroup: 1,
      };

      const failingPipeline = new SecurityPipeline({
        scanner: new SecretScanner(),
        redactor: new RedactionEngine(new SecretScanner([])),
        privacyValidator: new PrivacyValidator({
          scanner: new SecretScanner([residualRule]),
        }),
      });

      expect(() => failingPipeline.processText('RESIDUAL_SECRET_ABC123')).toThrow(
        SecurityBoundaryError,
      );
    });
  });
});

function ghSecret(token: string): string {
  return token;
}
