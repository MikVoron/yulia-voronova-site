import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const path = require('path');
const Module = require('module');

const sendMail = vi.fn().mockResolvedValue(true);
let email;

function registerMock(moduleName, exports) {
  const resolved = require.resolve(moduleName);
  const mod = new Module(resolved);
  mod.exports = exports;
  mod.loaded = true;
  require.cache[resolved] = mod;
}

beforeAll(() => {
  registerMock('nodemailer', {
    createTransport: () => ({ sendMail })
  });
  const emailPath = path.resolve(import.meta.dirname, '..', 'src', 'email.js');
  delete require.cache[require.resolve(emailPath)];
  email = require(emailPath);
});

beforeEach(() => {
  sendMail.mockClear();
});

describe('email template escaping', () => {
  it('escapes user-controlled feedback fields in admin emails', async () => {
    await email.sendFeedback(
      'bad@example.com"><img src=x>',
      '<b>legacy</b>',
      '<img src=x onerror=alert(1)>& " \'',
      { followUp: true, feedbackId: '7"><svg' }
    );

    const message = sendMail.mock.calls[0][0];
    expect(message.to).toBe('hello@voronova.online');
    expect(message.html).not.toContain('<img src=x');
    expect(message.html).not.toContain('<b>legacy</b>');
    expect(message.html).not.toContain('<svg');
    expect(message.html).toContain('bad@example.com&quot;&gt;&lt;img src=x&gt;');
    expect(message.html).toContain('&lt;b&gt;legacy&lt;/b&gt;');
    expect(message.html).toContain('&lt;img src=x onerror=alert(1)&gt;&amp; &quot; &#39;');
    expect(message.html).toContain('#7&quot;&gt;&lt;svg');
  });

  it('escapes user and admin feedback text in reply emails', async () => {
    await email.sendFeedbackReply(
      'user@example.com',
      '<script>legacy</script>',
      '<img src=x onerror=alert(1)>',
      'reply <b>bold</b> & "quote"',
      'Юлия <Admin>'
    );

    const message = sendMail.mock.calls[0][0];
    expect(message.to).toBe('user@example.com');
    expect(message.html).not.toContain('<script>legacy</script>');
    expect(message.html).not.toContain('<img src=x');
    expect(message.html).not.toContain('<b>bold</b>');
    expect(message.html).toContain('Юлия &lt;Admin&gt;');
    expect(message.html).toContain('&lt;script&gt;legacy&lt;/script&gt;');
    expect(message.html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(message.html).toContain('reply &lt;b&gt;bold&lt;/b&gt; &amp; &quot;quote&quot;');
  });
});
