export type SecretCategory =
  | 'api_key'
  | 'bearer_token'
  | 'password'
  | 'database_credential'
  | 'aws_key'
  | 'private_key'
  | 'auth_token';

export type SecretSeverity = 'high' | 'critical';

export interface SecretRule {
  readonly id: string;
  readonly name: string;
  readonly category: SecretCategory;
  readonly severity: SecretSeverity;
  readonly description: string;
  /**
   * Pattern matching the surrounding context plus secret payload.
   * Capture group `secretGroup` isolates ONLY the secret segment to redact.
   */
  readonly pattern: RegExp;
  readonly secretGroup: number;
}

export const REDACTED_PLACEHOLDER = '[REDACTED]';

/**
 * Pattern-based secret detection rules.
 *
 * Limitations: Pattern-based detection cannot guarantee catching every possible
 * secret (e.g., novel custom token formats, encoded/obfuscated blobs, or
 * arbitrary passwords without context). It serves as a defense-in-depth layer
 * behind collection-boundary exclusions and mandatory user review.
 */
export const DEFAULT_SECRET_RULES: readonly SecretRule[] = [
  {
    id: 'private-key-block',
    name: 'Private Key Block',
    category: 'private_key',
    severity: 'critical',
    description: 'Detects PEM/OpenSSH/PGP private key blocks across single or multiple lines.',
    pattern:
      /-----BEGIN (?:[A-Z0-9-]+ )?PRIVATE KEY-----[\s\S]*?(?:-----END (?:[A-Z0-9-]+ )?PRIVATE KEY-----|$)/g,
    secretGroup: 0,
  },
  {
    id: 'aws-access-key-id',
    name: 'AWS Access Key ID',
    category: 'aws_key',
    severity: 'high',
    description: 'Detects AWS IAM/STS access key IDs (AKIA/ASIA prefixes).',
    pattern: /(?:^|[^A-Za-z0-9])((?:AKIA|ASIA)[0-9A-Z]{16})(?![A-Za-z0-9])/g,
    secretGroup: 1,
  },
  {
    id: 'aws-secret-access-key',
    name: 'AWS Secret Access Key Assignment',
    category: 'aws_key',
    severity: 'critical',
    description: 'Detects explicit AWS secret access key assignments.',
    pattern:
      /\b(?:aws_secret_access_key|awsSecretAccessKey)\b\s*[:=]\s*['"]?([A-Za-z0-9/+=]{40})['"]?/gi,
    secretGroup: 1,
  },
  {
    id: 'database-connection-credentials',
    name: 'Database Connection String Credentials',
    category: 'database_credential',
    severity: 'critical',
    description: 'Detects embedded passwords in database or service connection URIs.',
    pattern:
      /\b(?:postgres|postgresql|mysql|mariadb|mongodb(?:\+srv)?|redis|rediss|amqp|amqps|mssql|sqlserver):\/\/[^:\s/@]+:([^@\s'"`]+)@[^\s'"`]+/gi,
    secretGroup: 1,
  },
  {
    id: 'bearer-token',
    name: 'Bearer Authorization Token',
    category: 'bearer_token',
    severity: 'high',
    description: 'Detects HTTP Bearer authorization tokens while preserving the Bearer prefix.',
    pattern: /\bBearer\s+([A-Za-z0-9\-._~+/]{8,}=*)/gi,
    secretGroup: 1,
  },
  {
    id: 'github-token',
    name: 'GitHub Token',
    category: 'auth_token',
    severity: 'critical',
    description: 'Detects GitHub personal/OAuth/fine-grained access tokens.',
    pattern: /\b((?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g,
    secretGroup: 1,
  },
  {
    id: 'npm-token',
    name: 'npm Access Token',
    category: 'auth_token',
    severity: 'critical',
    description: 'Detects npm registry automation/access tokens.',
    pattern: /\b(npm_[A-Za-z0-9]{20,})\b/g,
    secretGroup: 1,
  },
  {
    id: 'provider-api-key',
    name: 'Provider API Key',
    category: 'api_key',
    severity: 'critical',
    description:
      'Detects common prefixed provider API keys (sk-..., pk_live_..., xox..., AIza...).',
    pattern:
      /\b((?:sk|pk)_(?:live|test)_[A-Za-z0-9]{16,}|sk-(?:proj-|ant-)?[A-Za-z0-9\-_]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|AIza[0-9A-Za-z\-_]{30,})\b/g,
    secretGroup: 1,
  },
  {
    id: 'jwt-token',
    name: 'JSON Web Token',
    category: 'auth_token',
    severity: 'high',
    description: 'Detects compact three-segment JWT strings.',
    pattern: /\b(eyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,})\b/g,
    secretGroup: 1,
  },
  {
    id: 'generic-api-key-assignment',
    name: 'API Key or Auth Token Assignment',
    category: 'api_key',
    severity: 'high',
    description: 'Detects explicit api_key, client_secret, and access/auth token assignments.',
    pattern:
      /(?:\b(?:api[_-]?key|apikey|x-api-key|client[_-]?secret|secret[_-]?key|access[_-]?token|auth[_-]?token|refresh[_-]?token)\b['"]?\s*[:=]\s*['"]?)([^\s'"`,;}{[\]\r\n]{8,})/gi,
    secretGroup: 1,
  },
  {
    id: 'password-assignment',
    name: 'Password Assignment',
    category: 'password',
    severity: 'high',
    description: 'Detects explicit password/passwd/pwd configuration or connection assignments.',
    pattern:
      /(?:\b(?:password|passwd|pwd|db_pass|db_password)\b['"]?\s*[:=]\s*)(?:"([^"\r\n]{4,})"|'([^'\r\n]{4,})'|([^\s'"`,;}{[\]\r\n]{4,}))/gi,
    secretGroup: 1,
  },
];
