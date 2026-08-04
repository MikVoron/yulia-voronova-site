import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { generateLoginCode } = require('../src/auth');

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
