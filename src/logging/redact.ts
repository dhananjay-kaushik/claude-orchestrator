export function redactSecrets(text: string): string {
  if (!text) return text;

  // Redact Bearer tokens
  text = text.replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/g, 'Bearer [REDACTED]');

  // Redact AWS Access Keys
  text = text.replace(/(AKIA|A3T|AGPA|AIDA|AROA|AIPA|ANPA|ANVA|ASIA)[A-Z0-9]{16}/g, '[REDACTED_AWS_KEY]');

  // Redact standard API keys in strings (JSON safe)
  text = text.replace(/(["']?(?:api_key|apikey|password|secret|token)["']?\s*[=:]\s*["']?)[A-Za-z0-9\-._~+/]+(["']?)/gi, '$1[REDACTED]$2');

  return text;
}
