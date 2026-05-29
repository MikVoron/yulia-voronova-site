const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 465,
  secure: true,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
});

const FROM = '"Умная тарелка" <' + (process.env.SMTP_FROM || 'noreply@voronova.online') + '>';
const PLATFORM_URL = process.env.PLATFORM_URL || 'https://app.voronova.online';

function wrap(body, unsubscribeToken) {
  const unsubLink = unsubscribeToken
    ? '<div style="margin-top:8px"><a href="' + PLATFORM_URL + '/api/unsubscribe?token=' + encodeURIComponent(unsubscribeToken) + '" style="color:#bbb;font-size:10px;text-decoration:underline">Отписаться от рассылки</a></div>'
    : '';
  return '<div style="font-family:\'Montserrat\',system-ui,sans-serif;max-width:480px;margin:0 auto;padding:0">'
    + '<div style="background:#fff;padding:20px 24px;border-bottom:2px solid #eee">'
    + '<table cellpadding="0" cellspacing="0" border="0"><tr>'
    + '<td style="vertical-align:middle;padding-right:14px"><img src="https://voronova.online/images/YV-small.webp" width="52" height="52" style="border-radius:50%;border:2px solid #e8400a;display:block" alt="Юлия Воронова"></td>'
    + '<td style="vertical-align:middle"><span style="font-size:13px;color:#111;font-weight:600;display:block">Юлия Воронова</span><span style="font-size:11px;color:#777;display:block;margin-top:1px">нутрициолог</span><span style="font-size:20px;color:#111;font-weight:800;display:block;margin-top:4px;letter-spacing:-.5px">Умная <span style="color:#e8400a">тарелка</span></span></td>'
    + '</tr></table>'
    + '</div>'
    + '<div style="background:#fff;padding:28px 24px;border:1px solid #eee;border-top:none">'
    + body
    + '</div>'
    + '<div style="padding:16px 24px;text-align:center;font-size:11px;color:#999">'
    + '<a href="' + PLATFORM_URL + '/" style="color:#e8400a;text-decoration:none;font-weight:600">voronova.online</a>'
    + ' · Платформа сбалансированного питания'
    + unsubLink
    + '</div>'
    + '</div>';
}

function btn(text, url) {
  return '<div style="text-align:center;margin:24px 0">'
    + '<a href="' + url + '" style="display:inline-block;padding:14px 32px;background:#e8400a;color:#fff;text-decoration:none;border-radius:10px;font-weight:700;font-size:15px">'
    + text + '</a></div>';
}

async function send(to, subject, html) {
  await transporter.sendMail({ from: FROM, to, subject, html });
}

// ── 1. Код для входа ──
async function sendLoginCode(to, code) {
  const body =
    '<p style="font-size:15px;color:#111;margin:0 0 16px">Ваш код для входа:</p>'
    + '<div style="font-size:36px;font-weight:bold;letter-spacing:10px;text-align:center;padding:20px;background:#faf8f5;border-radius:10px;color:#111;border:1px solid #eee">'
    + code + '</div>'
    + '<p style="color:#111;font-size:14px;margin:16px 0 0;line-height:1.5">Код действует 5 минут. Если вы не запрашивали вход — просто проигнорируйте.</p>';
  await send(to, 'Код для входа — Умная тарелка', wrap(body));
}

// ── 2. Welcome (первая регистрация) ──
async function sendWelcome(to) {
  const body =
    '<h2 style="font-size:22px;color:#111;margin:0 0 12px;font-weight:700">Добро пожаловать!</h2>'
    + '<p style="font-size:15px;color:#444;line-height:1.6;margin:0 0 8px">'
    + 'Вы зарегистрировались на платформе <strong>Умная тарелка</strong>. '
    + 'У вас активирован <strong>бесплатный пробный период на 7 дней</strong>.</p>'
    + '<p style="font-size:15px;color:#444;line-height:1.6;margin:0 0 4px">Что вас ждёт:</p>'
    + '<ul style="font-size:14px;color:#444;line-height:1.8;padding-left:20px;margin:0 0 8px">'
    + '<li>Авторские рецепты с расчётом КБЖУ</li>'
    + '<li>Конструктор сбалансированной тарелки</li>'
    + '<li>Списки покупок</li>'
    + '</ul>'
    + btn('Открыть платформу', '' + PLATFORM_URL + '/')
    + '<p style="font-size:14px;color:#111;margin:0;line-height:1.5">'
    + 'Приятного использования!</p>';
  await send(to, 'Добро пожаловать в Умную тарелку!', wrap(body));
}

// ── 3. Триал истёк ──
async function sendTrialExpired(to) {
  const body =
    '<h2 style="font-size:22px;color:#111;margin:0 0 12px;font-weight:700">Пробный период завершён</h2>'
    + '<p style="font-size:15px;color:#444;line-height:1.6;margin:0 0 16px">'
    + 'Ваш 7-дневный пробный период на платформе <strong>Умная тарелка</strong> подошёл к концу.</p>'
    + '<p style="font-size:15px;color:#444;line-height:1.6;margin:0 0 16px">'
    + 'Чтобы продолжить пользоваться всеми рецептами и конструктором тарелки — оформите подписку в личном кабинете.</p>'
    + btn('Оформить подписку', '' + PLATFORM_URL + '/cabinet.html')
    + '<p style="font-size:14px;color:#111;margin:0;line-height:1.5">'
    + 'Спасибо, что попробовали! Мы будем рады видеть вас снова.</p>';
  await send(to, 'Пробный период завершён — Умная тарелка', wrap(body));
}

// ── 4. Подписка истекла ──
async function sendSubscriptionExpired(to) {
  const body =
    '<h2 style="font-size:22px;color:#111;margin:0 0 12px;font-weight:700">Подписка истекла</h2>'
    + '<p style="font-size:15px;color:#444;line-height:1.6;margin:0 0 16px">'
    + 'Ваша подписка на платформу <strong>Умная тарелка</strong> завершилась.</p>'
    + '<p style="font-size:15px;color:#444;line-height:1.6;margin:0 0 16px">'
    + 'Продлите подписку, чтобы снова получить доступ ко всем рецептам, конструктору тарелки и спискам покупок.</p>'
    + btn('Продлить подписку', '' + PLATFORM_URL + '/cabinet.html')
    + '<p style="font-size:14px;color:#111;margin:0;line-height:1.5">'
    + 'Если вы уже оплатили — подождите подтверждения администратором.</p>';
  await send(to, 'Подписка истекла — Умная тарелка', wrap(body));
}

// ── 5b. Подписка продлена админом вручную ──
async function sendSubscriptionExtended(to, days, activeUntil) {
  const untilStr = activeUntil
    ? new Date(activeUntil).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : '';
  const body =
    '<h2 style="font-size:22px;color:#111;margin:0 0 12px;font-weight:700">Подписка продлена</h2>'
    + '<p style="font-size:15px;color:#444;line-height:1.6;margin:0 0 16px">'
    + 'Ваша подписка на платформу <strong>Умная тарелка</strong> продлена на <strong>'
    + days + ' дн.</strong>' + (untilStr ? ' — до <strong>' + untilStr + '</strong>' : '') + '</p>'
    + '<p style="font-size:15px;color:#444;line-height:1.6;margin:0 0 16px">'
    + 'Все рецепты, конструктор тарелки и другие возможности полностью доступны.</p>'
    + btn('Перейти на платформу', '' + PLATFORM_URL + '/')
    + '<p style="font-size:14px;color:#111;margin:0;line-height:1.5">'
    + 'Спасибо, что вы с нами!</p>';
  await send(to, 'Подписка продлена — Умная тарелка', wrap(body));
}

// ── 5. Оплата подтверждена ──
async function sendPaymentConfirmed(to, days, activeUntil) {
  const untilStr = activeUntil
    ? new Date(activeUntil).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : '';
  const body =
    '<h2 style="font-size:22px;color:#111;margin:0 0 12px;font-weight:700">Оплата подтверждена!</h2>'
    + '<p style="font-size:15px;color:#444;line-height:1.6;margin:0 0 16px">'
    + 'Ваша оплата подтверждена. Подписка на платформу <strong>Умная тарелка</strong> активирована/продлена на <strong>'
    + days + ' дн.</strong>' + (untilStr ? ' — до <strong>' + untilStr + '</strong>' : '') + '</p>'
    + '<p style="font-size:15px;color:#444;line-height:1.6;margin:0 0 16px">'
    + 'Все рецепты, конструктор тарелки и другие возможности теперь полностью доступны.</p>'
    + btn('Перейти в личный кабинет', PLATFORM_URL + '/cabinet.html?tab=subscription')
    + '<p style="font-size:14px;color:#111;margin:0;line-height:1.5">'
    + 'Спасибо за доверие!</p>';
  await send(to, 'Оплата подтверждена — Умная тарелка', wrap(body));
}

// ── 5c. Платёж отклонён ──
async function sendPaymentRejected(to, reason) {
  const reasonHtml = reason && String(reason).trim()
    ? '<div style="padding:14px;background:#faf8f5;border-radius:10px;border:1px solid #eee;margin:0 0 16px;font-size:14px;color:#444;line-height:1.6;white-space:pre-wrap">'
      + String(reason).replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</div>'
    : '';
  const body =
    '<h2 style="font-size:22px;color:#111;margin:0 0 12px;font-weight:700">Платёж не подтверждён</h2>'
    + '<p style="font-size:15px;color:#444;line-height:1.6;margin:0 0 16px">'
    + 'К сожалению, мы не смогли подтвердить ваш платёж на платформе <strong>Умная тарелка</strong>.</p>'
    + (reasonHtml ? '<p style="font-size:14px;color:#777;margin:0 0 6px">Комментарий администратора:</p>' + reasonHtml : '')
    + '<p style="font-size:15px;color:#444;line-height:1.6;margin:0 0 16px">'
    + 'Если оплата уже была совершена — пришлите, пожалуйста, корректный скриншот перевода через личный кабинет, и мы перепроверим. '
    + 'Если у вас остались вопросы, напишите нам через раздел «Связь» в кабинете.</p>'
    + btn('Открыть личный кабинет', PLATFORM_URL + '/cabinet.html?tab=subscription')
    + '<p style="font-size:14px;color:#111;margin:0;line-height:1.5">'
    + 'Спасибо за понимание!</p>';
  await send(to, 'Платёж не подтверждён — Умная тарелка', wrap(body));
}

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'hello@voronova.online';

async function sendPaymentNotification(userEmail, amount, paymentDate, hasScreenshot) {
  const body =
    '<h2 style="font-size:22px;color:#111;margin:0 0 12px;font-weight:700">Новый платёж</h2>'
    + '<p style="font-size:15px;color:#444;line-height:1.6;margin:0 0 16px">'
    + 'Пользователь <strong>' + userEmail + '</strong> отправил платёж:</p>'
    + '<table cellpadding="6" cellspacing="0" border="0" style="font-size:14px;color:#444;margin-bottom:16px">'
    + '<tr><td style="color:#777">Сумма:</td><td style="font-weight:700;color:#111">' + amount + ' ₽</td></tr>'
    + '<tr><td style="color:#777">Дата перевода:</td><td>' + paymentDate + '</td></tr>'
    + '<tr><td style="color:#777">Скриншот:</td><td>' + (hasScreenshot ? '📎 Приложен (смотрите в админке)' : 'Не приложен') + '</td></tr>'
    + '</table>'
    + btn('Проверить в админке', '' + PLATFORM_URL + '/admin.html')
    + '<p style="font-size:14px;color:#111;margin:0;line-height:1.5">'
    + 'Проверьте поступление и подтвердите платёж.</p>';
  await send(ADMIN_EMAIL, 'Новый платёж от ' + userEmail, wrap(body));
}

async function sendFeedback(userEmail, category, text, opts) {
  const labels = { wish: 'Пожелание', recipe: 'Идея рецепта', problem: 'Проблема' };
  const label = labels[category] || category;
  const isFollowUp = !!(opts && opts.followUp);
  const subjectPrefix = isFollowUp ? 'Уточнение' : label;
  const intro = isFollowUp
    ? '<p style="font-size:14px;color:#111;margin:0 0 8px"><strong>Пользователь добавил уточнение в обращение #' + (opts.feedbackId || '') + '</strong></p>'
    : '';
  const body = intro
    + '<p style="font-size:14px;color:#111;margin:0 0 8px"><strong>Категория:</strong> ' + label + '</p>'
    + '<p style="font-size:14px;color:#111;margin:0 0 8px"><strong>От:</strong> ' + userEmail + '</p>'
    + '<p style="font-size:14px;color:#111;margin:0;white-space:pre-wrap">' + text.replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</p>';
  await send('hello@voronova.online', '[Умная тарелка] ' + subjectPrefix + ' от ' + userEmail, wrap(body));
}

// ── 6b. Новый пользователь зарегистрирован (уведомление админу) ──
const NEW_USER_NOTIFY_ENABLED = process.env.NEW_USER_NOTIFY_ENABLED !== 'false';
const NEW_USER_NOTIFY_TO = process.env.NEW_USER_NOTIFY_TO || 'hello@voronova.online';

async function sendNewUserNotification(user, meta) {
  if (!NEW_USER_NOTIFY_ENABLED) return;
  const method = (meta && meta.method) || 'email';
  const ip = (meta && meta.ip) || '—';
  const ua = (meta && meta.userAgent) || '—';
  const now = new Date();
  const utcStr = now.toISOString();
  const mskStr = now.toLocaleString('ru-RU', { timeZone: 'Europe/Moscow', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const esc = (s) => String(s).replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const body =
    '<h2 style="font-size:22px;color:#111;margin:0 0 12px;font-weight:700">Новый пользователь</h2>'
    + '<p style="font-size:15px;color:#444;line-height:1.6;margin:0 0 16px">'
    + 'На платформе <strong>Умная тарелка</strong> зарегистрирован новый пользователь:</p>'
    + '<table cellpadding="6" cellspacing="0" border="0" style="font-size:14px;color:#444;margin-bottom:16px">'
    + '<tr><td style="color:#777">Email:</td><td style="font-weight:700;color:#111">' + esc(user.email || '—') + '</td></tr>'
    + '<tr><td style="color:#777">User ID:</td><td>' + esc(user.id) + '</td></tr>'
    + '<tr><td style="color:#777">Способ:</td><td>' + esc(method) + '</td></tr>'
    + '<tr><td style="color:#777">Дата (МСК):</td><td>' + mskStr + '</td></tr>'
    + '<tr><td style="color:#777">Дата (UTC):</td><td>' + utcStr + '</td></tr>'
    + '<tr><td style="color:#777">IP:</td><td>' + esc(ip) + '</td></tr>'
    + '<tr><td style="color:#777;vertical-align:top">User-agent:</td><td style="font-size:12px;color:#777">' + esc(String(ua).slice(0, 300)) + '</td></tr>'
    + '</table>'
    + btn('Открыть админку', PLATFORM_URL + '/admin.html');
  await send(NEW_USER_NOTIFY_TO, 'Новый пользователь зарегистрирован', wrap(body));
}

// ── 7. Уведомление об отзыве ──
async function sendReviewNotification(author, recipeName, stars, text, recipeId) {
  const starsStr = '★'.repeat(stars) + '☆'.repeat(5 - stars);
  const reviewUrl = PLATFORM_URL + '/recipe.html?id=' + encodeURIComponent(recipeId || '') + '#reviews-section';
  const body =
    '<h2 style="font-size:22px;color:#111;margin:0 0 12px;font-weight:700">Новый отзыв</h2>'
    + '<p style="font-size:15px;color:#444;line-height:1.6;margin:0 0 16px">'
    + '<strong>' + author.replace(/</g, '&lt;') + '</strong> оставил(а) отзыв на рецепт <strong>' + recipeName.replace(/</g, '&lt;') + '</strong>:</p>'
    + '<div style="padding:16px;background:#faf8f5;border-radius:10px;border:1px solid #eee;margin-bottom:16px">'
    + '<div style="font-size:20px;margin-bottom:8px;color:#f5a623">' + starsStr + '</div>'
    + '<p style="font-size:14px;color:#333;margin:0;white-space:pre-wrap">' + text.replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</p>'
    + '</div>'
    + btn('Посмотреть отзыв', reviewUrl);
  await send('hello@voronova.online', 'Новый отзыв: ' + recipeName.replace(/</g, '&lt;'), wrap(body));
}

// ── 8. Рассылка новости ──
async function sendNewsletter(to, newsText, unsubscribeToken) {
  const body =
    '<h2 style="font-size:22px;color:#111;margin:0 0 12px;font-weight:700">Новости Умной тарелки</h2>'
    + '<p style="font-size:15px;color:#444;line-height:1.6;margin:0 0 16px;white-space:pre-wrap">'
    + newsText.replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</p>'
    + btn('Открыть платформу', '' + PLATFORM_URL + '/');
  await send(to, 'Новости — Умная тарелка', wrap(body, unsubscribeToken));
}

// ── 9. Уведомление пользователю об ответе на обращение ──
async function sendFeedbackReply(to, category, originalText, replyText) {
  const labels = { wish: 'Пожелание', recipe: 'Идея рецепта', problem: 'Проблема' };
  const label = labels[category] || category;
  const body =
    '<h2 style="font-size:22px;color:#111;margin:0 0 12px;font-weight:700">Ответ на ваше обращение</h2>'
    + '<p style="font-size:14px;color:#777;margin:0 0 4px">Категория: <strong>' + label + '</strong></p>'
    + '<div style="padding:14px;background:#faf8f5;border-radius:10px;border:1px solid #eee;margin:12px 0;font-size:14px;color:#444;line-height:1.6;white-space:pre-wrap">'
    + originalText.replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</div>'
    + '<p style="font-size:15px;color:#111;font-weight:700;margin:16px 0 8px">Ответ Юлии:</p>'
    + '<p style="font-size:15px;color:#444;line-height:1.6;margin:0 0 16px;white-space:pre-wrap">'
    + replyText.replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</p>'
    + '<p style="font-size:14px;color:#777;line-height:1.6;margin:0 0 16px">Если остались вопросы, вы можете продолжить диалог в разделе «Связь» личного кабинета.</p>'
    + btn('Открыть личный кабинет', '' + PLATFORM_URL + '/cabinet.html');
  await send(to, 'Ответ на ваше обращение — Умная тарелка', wrap(body));
}

module.exports = {
  sendLoginCode,
  sendWelcome,
  sendTrialExpired,
  sendSubscriptionExpired,
  sendPaymentConfirmed,
  sendPaymentRejected,
  sendSubscriptionExtended,
  sendPaymentNotification,
  sendNewUserNotification,
  sendFeedback,
  sendFeedbackReply,
  sendReviewNotification,
  sendNewsletter
};
