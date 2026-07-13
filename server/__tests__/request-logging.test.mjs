import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { safeRequestPath, requestSerializer } = require('../src/request-logging');

describe('request logging', () => {
  it('removes query parameters from error and request logs', () => {
    const request = {
      method: 'GET',
      url: '/health?token=secret&email=user%40example.com',
      host: 'api.example.com',
      ip: '127.0.0.1',
      socket: { remotePort: 12345 }
    };

    expect(safeRequestPath(request)).toBe('/health');
    expect(requestSerializer(request)).toEqual({
      method: 'GET',
      url: '/health',
      host: 'api.example.com',
      remoteAddress: '127.0.0.1',
      remotePort: 12345
    });
  });
});
