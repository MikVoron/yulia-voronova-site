const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 465,
  secure: true,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
});

const FROM = '"Умная тарелка" <' + (process.env.SMTP_FROM || 'noreply@voronova.online') + '>';

function wrap(body) {
  return '<div style="font-family:\'Montserrat\',system-ui,sans-serif;max-width:480px;margin:0 auto;padding:0">'
    + '<div style="background:#e8400a;padding:20px 24px;border-radius:12px 12px 0 0">'
    + '<h1 style="margin:0;font-size:20px;color:#fff;font-weight:700">Умная тарелка</h1>'
    + '<p style="margin:4px 0 0;font-size:12px;color:rgba(255,255,255,.7)">Юлия Воронова · Нутрициолог</p>'
    + '</div>'
    + '<div style="background:#fff;padding:28px 24px;border:1px solid #eee;border-top:none">'
    + body
    + '</div>'
    + '<div style="padding:16px 24px;text-align:center;font-size:11px;color:#999">'
    + '<a href="https://voronova.online/platform/" style="color:#e8400a;text-decoration:none;font-weight:600">voronova.online</a>'
    + ' · Платформа сбалансированного питания'
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
    + '<p style="color:#777;font-size:13px;margin:16px 0 0;line-height:1.5">Код действует 5 минут. Если вы не запрашивали вход — просто проигнорируйте.</p>';
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
    + btn('Открыть платформу', 'https://voronova.online/platform/')
    + '<p style="font-size:13px;color:#777;margin:0;line-height:1.5">'
    + 'Если у вас есть вопросы — просто ответьте на это письмо.</p>';
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
    + btn('Оформить подписку', 'https://voronova.online/platform/cabinet.html')
    + '<p style="font-size:13px;color:#777;margin:0;line-height:1.5">'
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
    + btn('Продлить подписку', 'https://voronova.online/platform/cabinet.html')
    + '<p style="font-size:13px;color:#777;margin:0;line-height:1.5">'
    + 'Если вы уже оплатили — подождите подтверждения администратором.</p>';
  await send(to, 'Подписка истекла — Умная тарелка', wrap(body));
}

// ── 5. Оплата подтверждена ──
async function sendPaymentConfirmed(to, days) {
  const body =
    '<h2 style="font-size:22px;color:#111;margin:0 0 12px;font-weight:700">Оплата подтверждена!</h2>'
    + '<p style="font-size:15px;color:#444;line-height:1.6;margin:0 0 16px">'
    + 'Ваша оплата подтверждена. Подписка на платформу <strong>Умная тарелка</strong> активирована на <strong>'
    + days + ' дней</strong>.</p>'
    + '<p style="font-size:15px;color:#444;line-height:1.6;margin:0 0 16px">'
    + 'Все рецепты, конструктор тарелки и другие возможности теперь полностью доступны.</p>'
    + btn('Перейти на платформу', 'https://voronova.online/platform/')
    + '<p style="font-size:13px;color:#777;margin:0;line-height:1.5">'
    + 'Спасибо за доверие!</p>';
  await send(to, 'Оплата подтверждена — Умная тарелка', wrap(body));
}

module.exports = {
  sendLoginCode,
  sendWelcome,
  sendTrialExpired,
  sendSubscriptionExpired,
  sendPaymentConfirmed
};
