const secretPatterns: readonly RegExp[] = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/u,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{12,}/iu,
  /\bAKIA[0-9A-Z]{16}\b/u,
  /\b(?:ASIA|A3T[A-Z0-9])[A-Z0-9]{16}\b/u,
  /\b(?:sk|pk)_(?:live|test)_[A-Za-z0-9]{12,}\b/u,
  /\b(?:ghp|github_pat)_[A-Za-z0-9_]{12,}\b/u,
  /\b(?:api[_-]?key|secret|token|password|credential)\s*[=:]\s*[^\s,;]{8,}/iu,
];

export function containsLikelySecret(value: string): boolean {
  return secretPatterns.some((pattern) => pattern.test(value));
}

export function redactLikelySecrets(value: string): string {
  return value
    .replace(
      /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/gu,
      "[REDACTED PRIVATE KEY]",
    )
    .replace(/\b(Bearer)\s+[A-Za-z0-9._~+/=-]+/giu, "$1 [REDACTED]")
    .replace(
      /\b(?:AKIA[0-9A-Z]{16}|(?:ASIA|A3T[A-Z0-9])[A-Z0-9]{16})\b/gu,
      "[REDACTED]",
    )
    .replace(
      /\b(?:(?:sk|pk)_(?:live|test)|ghp|github_pat)_[A-Za-z0-9_]+\b/gu,
      "[REDACTED]",
    )
    .replace(
      /\b([A-Z][A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD|KEY|CREDENTIAL)[A-Z0-9_]*)\s*([=:])\s*([^\s,;]+)/gu,
      "$1$2[REDACTED]",
    )
    .replace(
      /\b(api[_-]?key|secret|token|password|credential)\s*([=:])\s*([^\s,;]+)/giu,
      "$1$2[REDACTED]",
    )
    .replace(
      /([?&](?:token|secret|password|key|credential)=)[^&#\s]+/giu,
      "$1[REDACTED]",
    );
}
