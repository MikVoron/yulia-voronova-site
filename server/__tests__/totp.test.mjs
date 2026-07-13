import { describe, expect, it } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { verifyTotp } = require('../src/totp');

describe('admin TOTP verification', () => {
  // RFC 6238 SHA-1 test secret, Base32 encoded. The implementation truncates
  // the RFC's 8-digit output to the six digits used by authenticator apps.
  const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

  it('accepts the current 30-second window and a one-window clock drift', () => {
    expect(verifyTotp('287082', secret, 59_000)).toBe(true);
    expect(verifyTotp('287082', secret, 89_000)).toBe(true);
  });

  it('rejects malformed and incorrect codes', () => {
    expect(verifyTotp('12345', secret, 59_000)).toBe(false);
    expect(verifyTotp('000000', secret, 59_000)).toBe(false);
    expect(verifyTotp('287082', 'short', 59_000)).toBe(false);
  });
});
