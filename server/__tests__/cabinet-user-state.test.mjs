import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..', '..');
const cabinetJs = readFileSync(resolve(root, 'platform', 'cabinet.js'), 'utf8');
const cabinetHtml = readFileSync(resolve(root, 'platform', 'cabinet.html'), 'utf8');

describe('cabinet account state', () => {
  it('persists weight through the authenticated profile endpoint', () => {
    expect(cabinetJs).toContain("Auth.api('/auth/profile'");
    expect(cabinetJs).toContain('JSON.stringify({ weight: n })');
    expect(cabinetJs).toContain('user.weight = n');
  });

  it('lets a user hide a rejected payment notice without removing history', () => {
    expect(cabinetJs).toContain("payment.status === 'rejected'");
    expect(cabinetJs).toContain('hidden_payment_notice');
    expect(cabinetJs).toContain('Скрыть уведомление');
    expect(cabinetHtml).toContain('.pay-notice-hide');
  });
});
