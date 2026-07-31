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

describe('email visual system', () => {
  it('uses the compact responsive wrapper across every notification type', async () => {
    await email.sendLoginCode('user@example.com', '123456');
    await email.sendWelcome('user@example.com', true);
    await email.sendWelcome('user@example.com', false);
    await email.sendTrialExpired('user@example.com');
    await email.sendSubscriptionExpired('user@example.com');
    await email.sendSubscriptionExtended('user@example.com', 30, '2026-07-04T00:00:00.000Z');
    await email.sendPaymentConfirmed('user@example.com', 30, '2026-07-04T00:00:00.000Z', 'Спасибо');
    await email.sendPaymentRejected('user@example.com', 'Нужен более чёткий скриншот');
    await email.sendPaymentNotification('user@example.com', '990', '28.06.2026', true);
    await email.sendFeedback('user@example.com', 'wish', 'Добавьте новый рецепт');
    await email.sendNewUserNotification(
      { id: 'user-1', email: 'user@example.com' },
      { method: 'email', ip: '127.0.0.1', userAgent: 'Vitest', trialGranted: true }
    );
    await email.sendReviewNotification('Анна', 'Омлет', 5, 'Очень вкусно', 'omelet');
    await email.sendVideoRequestThresholdNotification('Омлет', 'omelet', 100, 100);
    await email.sendNewsletter(
      'user@example.com',
      { type: 'recipe', recipeId: 'omelet', recipeName: 'Омлет', text: 'Новый рецепт уже на платформе' },
      'unsubscribe-token',
      'Анна'
    );
    await email.sendTestingInvitation('user@example.com', 'testing-token', 'Анна');
    await email.sendPersonalMessage('user@example.com', {
      sender: 'hello', subject: 'Личное сообщение', text: 'Здравствуйте!', displayName: 'Анна'
    });
    await email.sendFeedbackReply('user@example.com', 'wish', 'Моё обращение', 'Спасибо за идею', 'Анна');

    expect(sendMail).toHaveBeenCalledTimes(17);
    for (const [message] of sendMail.mock.calls) {
      expect(message.html).toContain('width="560"');
      expect(message.html).toContain('class="em-content"');
      expect(message.html).toContain('-webkit-text-size-adjust:100%');
      expect(message.html).toContain('font-size:25px');
      expect(message.html).not.toContain('padding:17px 38px');
      expect(message.html).not.toContain('font-size:22px;color:#111');
    }
  });

  it('keeps CTA buttons compact and preserves support and unsubscribe links', async () => {
    await email.sendSubscriptionExtended('user@example.com', 30, '2026-07-04T00:00:00.000Z');
    const serviceMessage = sendMail.mock.calls[0][0];
    expect(serviceMessage.html).toContain('padding:13px 21px');
    expect(serviceMessage.html).toContain('background-color:#e8400a');
    expect(serviceMessage.html).toContain('/cabinet.html?tab=feedback');

    await email.sendNewsletter('user@example.com', 'Новости платформы', 'token with spaces');
    const newsletterMessage = sendMail.mock.calls[1][0];
    expect(newsletterMessage.html).toContain('/api/unsubscribe?token=token%20with%20spaces');
  });

  it('personalizes newsletter greeting and uses the mailing-only footer', async () => {
    await email.sendNewsletter('user@example.com', 'Тестовая новость', 'unsubscribe-token', 'Анна <Иванова>');
    const personalized = sendMail.mock.calls[0][0].html;
    expect(personalized).toContain('Привет, Анна &lt;Иванова&gt;!');
    expect(personalized).not.toContain('>Новости</p>');
    expect(personalized.indexOf('Ваша Юля')).toBeLessThan(personalized.indexOf('Открыть Умную тарелку'));
    expect(personalized).toContain('Вы получили это письмо, потому что подписались на новости проекта.');
    expect(personalized).toContain('Отписаться от рассылки');
    expect(personalized).toContain('© 2026 Юлия Воронова');
    expect(personalized).not.toContain('Открыть платформу');

    await email.sendNewsletter('user@example.com', 'Ещё одна новость', 'unsubscribe-token');
    const generic = sendMail.mock.calls[1][0].html;
    expect(generic).toContain('Привет!');
    expect(generic).not.toContain('Привет, !');
  });

  it('renders the testing invitation in the branded email system', async () => {
    await email.sendTestingInvitation('user@example.com', 'testing token', 'Анна <Иванова>');
    const message = sendMail.mock.calls[0][0];

    expect(message.subject).toBe('Приглашение на тестирование «Умной тарелки»');
    expect(message.html).toContain('Привет, Анна &lt;Иванова&gt;!');
    expect(message.html).toContain('Уже 88 рецептов.');
    expect(message.html).toContain('Соберите минимум 3 разные тарелки');
    expect(message.html).toContain('padding:13px 21px');
    expect(message.html).toContain('/api/unsubscribe?token=testing%20token');
    expect(message.html).toContain('согласились помочь с тестированием проекта');
    expect(message.html).toContain('/cabinet.html?tab=feedback');
  });

  it('sends a branded personal message from the selected mailbox and escapes free text', async () => {
    await email.sendPersonalMessage('user@example.com', {
      sender: 'yulia',
      subject: 'Важная <тема>',
      text: 'Текст <script>bad()</script>\nВторая строка',
      displayName: 'Анна <Иванова>'
    });
    const message = sendMail.mock.calls[0][0];

    expect(message.from).toBe('"Юлия Воронова" <yulia@voronova.online>');
    expect(message.replyTo).toBe('yulia@voronova.online');
    expect(message.subject).toBe('Важная <тема>');
    expect(message.html).toContain('Здравствуйте, Анна &lt;Иванова&gt;!');
    expect(message.html).toContain('Важная &lt;тема&gt;');
    expect(message.html).toContain('Текст &lt;script&gt;bad()&lt;/script&gt;');
    expect(message.html).toContain('white-space:pre-wrap');

    const preview = email.previewPersonalMessage({
      sender: 'hello', subject: 'Проверка', text: 'Текст', displayName: ''
    });
    expect(preview).toContain('Отдел заботы');
    expect(preview).toContain('Здравствуйте!');

    await email.sendPersonalMessage('user@example.com', {
      sender: 'hello', subject: 'Проверка', text: 'Текст', displayName: ''
    });
    const helloMessage = sendMail.mock.calls[1][0];
    expect(helloMessage.from).toBe('"Умная тарелка" <hello@voronova.online>');
    expect(helloMessage.replyTo).toBe('hello@voronova.online');
  });
});
