import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(import.meta.dirname, '../..');
const apiEntry = fs.readFileSync(path.join(repoRoot, 'server/index.js'), 'utf8');
const platformData = fs.readFileSync(path.join(repoRoot, 'platform/data-v2.js'), 'utf8');
const appNginx = fs.readFileSync(path.join(repoRoot, 'server/nginx/app.voronova.online'), 'utf8');
const plateNginx = fs.readFileSync(path.join(repoRoot, 'server/nginx/plate.voronova.online'), 'utf8');

describe('plate domain migration', () => {
  it('allows both frontend origins during the redirect and rollback window', () => {
    expect(apiEntry).toContain("'https://app.voronova.online'");
    expect(apiEntry).toContain("'https://plate.voronova.online'");
  });

  it('uses the same-origin content proxy on both production frontend hosts', () => {
    expect(platformData).toContain("const PLATFORM_HOSTS = ['app.voronova.online', 'plate.voronova.online'];");
    expect(platformData).toContain('PLATFORM_HOSTS.includes(location.hostname)');
  });

  it('limits silent session restoration to the new plate host', () => {
    expect(platformData).toContain("const SESSION_MIGRATION_HOST = 'plate.voronova.online';");
    expect(platformData).toContain("sessionStorage.getItem('hp_plate_domain_session_checked')");
    expect(platformData).toContain('Auth._startDomainSessionMigration();');
  });

  it('serves plate as canonical and redirects every legacy app path', () => {
    expect(plateNginx).toContain('server_name plate.voronova.online;');
    expect(plateNginx).toContain('/etc/letsencrypt/live/plate.voronova.online/fullchain.pem');
    expect(plateNginx).toContain('return 301 https://plate.voronova.online$request_uri;');
    expect(plateNginx).toContain('/etc/nginx/snippets/smartplate-admin-basic-auth.conf');
    expect(plateNginx).not.toContain('server_name app.voronova.online;');
    expect(appNginx).toContain('server_name app.voronova.online;');
    expect(appNginx).toContain('return 301 https://plate.voronova.online$request_uri;');
    expect(appNginx).not.toContain('root /var/www/smartplate-platform;');
  });
});
