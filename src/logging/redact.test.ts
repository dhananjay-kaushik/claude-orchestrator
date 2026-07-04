import { describe, it, expect } from 'vitest';
import { redactSecrets } from './redact.js';

describe('redactSecrets', () => {
  it('redacts Bearer tokens', () => {
    const text = 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
    expect(redactSecrets(text)).toBe('Authorization: Bearer [REDACTED]');
  });

  it('redacts AWS keys', () => {
    const text = 'AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE';
    expect(redactSecrets(text)).toBe('AWS_ACCESS_KEY_ID=[REDACTED_AWS_KEY]');
  });

  it('redacts simple password patterns', () => {
    const text = 'password=supersecret';
    expect(redactSecrets(text)).toBe('password=[REDACTED]');
  });
});
