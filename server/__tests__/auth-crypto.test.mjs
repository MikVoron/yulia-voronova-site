import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
process.env.JWT_SECRET = 'test-secret-key-for-vitest-at-least-32-bytes';
const { generateLoginCode, validateJwtSecret } = require('../src/auth');

describe('JWT secret validation', () => {
  it('rejects missing, short, placeholder and low-diversity secrets', () => {
    expect(() => validateJwtSecret('')).toThrow(/JWT_SECRET/);
    expect(() => validateJwtSecret('too-short')).toThrow(/JWT_SECRET/);
    expect(() => validateJwtSecret('your-secret-key-here')).toThrow(/JWT_SECRET/);
    expect(() => validateJwtSecret('a'.repeat(64))).toThrow(/JWT_SECRET/);
  });

  it('accepts a sufficiently long and diverse secret', () => {
    expect(validateJwtSecret('valid-jwt-secret-with-32-plus-bytes-123456')).toBe(
      'valid-jwt-secret-with-32-plus-bytes-123456'
    );
  });
});

describe('login code generation', () => {
  it('uses a cryptographic source and always returns a six-digit code', () => {
    const originalRandom = Math.random;
    Math.random = () => { throw new Error('Math.random must not generate login codes'); };

    try {
      const codes = Array.from({ length: 128 }, () => generateLoginCode());
      expect(codes.every(code => /^\d{6}$/.test(code))).toBe(true);
      expect(new Set(codes).size).toBeGreaterThan(120);
    } finally {
      Math.random = originalRandom;
    }
  });
});
