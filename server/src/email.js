const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 465,
  secure: true,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
});

const FROM = '"Умная тарелка" <' + (process.env.SMTP_FROM || 'noreply@voronova.online') + '>';
const PLATFORM_URL = process.env.PLATFORM_URL || 'https://app.voronova.online';

function wrap(body, unsubscribeToken, showSupportFooter = false) {
  const unsubLink = unsubscribeToken
    ? '&nbsp;&nbsp;·&nbsp;&nbsp;<a href="' + PLATFORM_URL + '/api/unsubscribe?token=' + encodeURIComponent(unsubscribeToken) + '" style="color:#777777; text-decoration:underline;">Отписаться от рассылки</a>'
    : '';
  const supportBlock = showSupportFooter
    ? `<tr>
	<td class="em-pad" bgcolor="#faf8f5" style="background-color:#faf8f5; border-top:1px solid #e5e5e5; padding:22px 32px; font-family:'Montserrat',Arial,Helvetica,sans-serif; font-size:13px; line-height:1.6; color:#444444;">Нужна помощь? Напишите на <a href="mailto:hello@voronova.online" style="color:#c73208; text-decoration:underline; font-weight:600;">hello@voronova.online</a> или воспользуйтесь формой в разделе <a href="${PLATFORM_URL}/cabinet.html?tab=feedback" target="_blank" style="color:#c73208; text-decoration:underline; font-weight:600;">«Связь»</a> личного кабинета.</td>
</tr>`
    : '';
  const footer = `<tr>
	<td class="em-pad" align="center" style="border-top:1px solid #e5e5e5; padding:24px 32px;">
		<div style="font-family:'Playfair Display',Georgia,serif; font-size:15px; font-weight:700; color:#111111;">Умная&nbsp;<span style="color:#e8400a;">тарелка</span></div>
		<div style="margin-top:10px; font-family:'Montserrat',Arial,Helvetica,sans-serif; font-size:12px; line-height:1.7; color:#777777;"><a href="${PLATFORM_URL}/" target="_blank" style="color:#777777; text-decoration:underline;">Открыть платформу</a>{{UNSUBSCRIBE_LINK}}</div>
		<div style="margin-top:10px; font-family:'Montserrat',Arial,Helvetica,sans-serif; font-size:11px; color:#aaaaaa;">© 2026 Умная тарелка · Юлия Воронова</div>
	</td>
</tr>`.replace('{{UNSUBSCRIBE_LINK}}', () => unsubLink);
  return `<!DOCTYPE html>
<html lang="ru" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<meta http-equiv="X-UA-Compatible" content="IE=edge">
	<meta name="x-apple-disable-message-reformatting">
	<title>Умная тарелка</title>
	<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
	<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800&family=Playfair+Display:wght@600;700;800&display=swap" rel="stylesheet">
	<style>
		body { margin:0; padding:0; width:100% !important; }
		table { border-collapse:collapse; }
		a { color:#c73208; }
		@media only screen and (max-width:600px){
			.em-pad{ padding-left:22px !important; padding-right:22px !important; }
			.em-mast{ padding-top:26px !important; padding-bottom:22px !important; }
			.em-brand{ font-size:28px !important; }
			.em-h1{ font-size:23px !important; }
		}
	</style>
</head>
<body style="margin:0; padding:0; background-color:#efece6;">
	<div style="display:none; max-height:0; overflow:hidden; opacity:0; font-size:1px; line-height:1px; color:#efece6;">Персональный помощник в питании — Умная тарелка.</div>
	<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#efece6;">
		<tr>
			<td align="center" style="padding:28px 16px;">
				<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px; max-width:600px; background-color:#ffffff; border:1px solid #e5e5e5;">
					<!-- чёрная авторская полоса -->
					<tr>
						<td align="center" bgcolor="#161616" style="background-color:#161616; padding:13px 24px; font-family:'Montserrat',Arial,Helvetica,sans-serif; font-size:11px; font-weight:700; letter-spacing:2px; color:#ffffff; text-transform:uppercase;">Юлия Воронова&nbsp;&nbsp;·&nbsp;&nbsp;Нутрициолог</td>
					</tr>
					<!-- шапка бренда -->
					<tr>
						<td class="em-mast" align="center" style="padding:32px 32px 28px;">
							<div style="font-family:'Montserrat',Arial,Helvetica,sans-serif; font-size:10px; font-weight:700; letter-spacing:3px; color:#777777; text-transform:uppercase;">— &nbsp;Персональный помощник в питании&nbsp; —</div>
							<div class="em-brand" style="margin-top:12px; font-family:'Playfair Display',Georgia,'Times New Roman',serif; font-size:34px; font-weight:700; line-height:1.05; color:#111111; letter-spacing:-0.5px;">Умная&nbsp;<span style="color:#e8400a;">тарелка</span></div>
						</td>
					</tr>
					<tr><td style="font-size:0; line-height:0; height:1px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td height="1" style="height:1px; background-color:#e5e5e5; font-size:0; line-height:0;">&nbsp;</td></tr></table></td></tr>
					<!-- основной контент -->
					<tr>
						<td class="em-pad" style="padding:34px 32px 36px;">{{BODY}}</td>
					</tr>
					{{SUPPORT_BLOCK}}
					{{FOOTER}}
				</table>
			</td>
		</tr>
	</table>
</body>
</html>`
    .replace('{{BODY}}', () => body)
    .replace('{{SUPPORT_BLOCK}}', () => supportBlock)
    .replace('{{FOOTER}}', () => footer);
}

function wrapService(body) {
  return wrap(body, null, true);
}

function btn(text, url) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 4px;">
	<tr>
		<td align="center" bgcolor="#161616" style="background-color:#161616; border-radius:4px;">
			<a href="{{URL}}" target="_blank" style="display:inline-block; padding:17px 38px; font-family:'Montserrat',Arial,Helvetica,sans-serif; font-size:16px; font-weight:700; line-height:1; color:#ffffff; text-decoration:none; letter-spacing:0.3px;">{{TEXT}}</a>
		</td>
	</tr>
</table>`
    .replace('{{URL}}', () => url)
    .replace('{{TEXT}}', () => text);
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
    + '<p style="color:#111;font-size:14px;margin:16px 0 0;line-height:1.5">Код действует 5 минут. Никому не сообщайте его.<br>'
    + 'Если вы не запрашивали вход в «Умную тарелку», просто проигнорируйте это письмо.</p>';
  await send(to, 'Код для входа в Умную тарелку', wrapService(body));
}

// ── 2. Welcome (первая регистрация) ──
async function sendWelcome(to, trialGranted = true) {
  const features =
    '<p style="font-size:15px;color:#444;line-height:1.6;margin:0 0 4px">Здесь вы найдёте:</p>'
    + '<ul style="font-size:14px;color:#444;line-height:1.8;padding-left:20px;margin:0 0 8px">'
    + '<li>Мои проверенные рецепты для всей семьи</li>'
    + '<li>Подробные пошаговые видеорецепты</li>'
    + '<li>Конструктор сбалансированной тарелки</li>'
    + '<li>Расчёт КБЖУ</li>'
    + '<li>Новый вкусный и полезный рецепт каждую неделю</li>'
    + '</ul>';

  if (!trialGranted) {
    const body =
      '<h2 style="font-size:22px;color:#111;margin:0 0 12px;font-weight:700">Добро пожаловать!</h2>'
      + '<p style="font-size:15px;color:#444;line-height:1.6;margin:0 0 16px">'
      + 'Ваш аккаунт в <strong>«Умной тарелке»</strong> создан.</p>'
      + '<p style="font-size:15px;color:#444;line-height:1.6;margin:0 0 16px">'
      + 'Бесплатный пробный период не был активирован, так как ранее он уже использовался на этом устройстве или в вашей сети. '
      + 'Один пробный период предоставляется только один раз.</p>'
      + '<p style="font-size:15px;color:#444;line-height:1.6;margin:0 0 16px">'
      + 'Чтобы получить полный доступ к платформе, оформите подписку в личном кабинете.</p>'
      + btn('Оформить подписку', PLATFORM_URL + '/cabinet.html?tab=subscription')
      + '<p style="font-size:14px;color:#111;margin:0;line-height:1.5">Ваша Юля</p>';
    await send(to, 'Аккаунт создан — Умная тарелка', wrapService(body));
    return;
  }

  const body =
    '<h2 style="font-size:22px;color:#111;margin:0 0 12px;font-weight:700">Добро пожаловать!</h2>'
    + '<p style="font-size:15px;color:#444;line-height:1.6;margin:0 0 16px">'
    + 'Вы зарегистрировались на платформе <strong>«Умная тарелка»</strong>, и у вас активирован '
    + '<strong>бесплатный пробный период на 7 дней</strong>. '
    + 'Статус доступа и срок пробного периода можно посмотреть в личном кабинете.</p>'
    + features
    + btn('Открыть Умную тарелку', '' + PLATFORM_URL + '/')
    + '<p style="font-size:14px;color:#111;margin:0 0 12px;line-height:1.6">Желаю приятного использования!</p>'
    + '<p style="font-size:14px;color:#111;margin:0;line-height:1.5">Ваша Юля</p>';
  await send(to, 'Добро пожаловать в Умную тарелку!', wrapService(body));
}

// ── 3. Триал истёк ──
async function sendTrialExpired(to) {
  const body =
    '<h2 style="font-size:22px;color:#111;margin:0 0 12px;font-weight:700">Привет! Спасибо, что попробовали «Умную тарелку»!</h2>'
    + '<p style="font-size:15px;color:#444;line-height:1.6;margin:0 0 16px">'
    + 'Ваш бесплатный пробный период завершился.</p>'
    + '<p style="font-size:15px;color:#444;line-height:1.6;margin:0 0 16px">'
    + 'Надеюсь, моя онлайн-платформа помогла вам найти новые идеи для вкусного и сбалансированного питания для вас и вашей семьи.</p>'
    + '<p style="font-size:15px;color:#444;line-height:1.6;margin:0 0 16px">'
    + 'Если вам понравилась «Умная тарелка», оформите подписку в личном кабинете, чтобы продолжить пользоваться платформой.</p>'
    + btn('Оформить подписку', '' + PLATFORM_URL + '/cabinet.html')
    + '<p style="font-size:14px;color:#111;margin:0;line-height:1.5">Ваша Юля</p>';
  await send(to, 'Пробный период завершён', wrapService(body));
}

// ── 4. Подписка истекла ──
async function sendSubscriptionExpired(to) {
  const body =
    '<h2 style="font-size:22px;color:#111;margin:0 0 12px;font-weight:700">Привет!</h2>'
    + '<p style="font-size:15px;color:#444;line-height:1.6;margin:0 0 16px">'
    + 'К сожалению, ваша подписка на платформу <strong>«Умная тарелка»</strong> завершилась.</p>'
    + '<p style="font-size:15px;color:#444;line-height:1.6;margin:0 0 16px">'
    + 'Продлите её, чтобы снова получить доступ ко всем рецептам и конструктору тарелки.</p>'
    + btn('Продлить подписку', '' + PLATFORM_URL + '/cabinet.html')
    + '<p style="font-size:14px;color:#111;margin:0 0 12px;line-height:1.6">'
    + 'Если вы уже оплатили, пожалуйста, дождитесь подтверждения администратором.</p>'
    + '<p style="font-size:14px;color:#111;margin:0;line-height:1.5">Ваша Юля</p>';
  await send(to, 'Подписка завершилась', wrapService(body));
}

// ── 5b. Подписка продлена админом вручную ──
async function sendSubscriptionExtended(to, days, activeUntil) {
  const untilStr = activeUntil
    ? new Date(activeUntil).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : '';
  const body =
    '<h2 style="font-size:22px;color:#111;margin:0 0 12px;font-weight:700">Привет!</h2>'
    + '<p style="font-size:15px;color:#444;line-height:1.6;margin:0 0 16px">'
    + 'Ваша подписка на платформу <strong>«Умная тарелка»</strong> продлена'
    + (untilStr ? ' до <strong>' + untilStr + '</strong>' : '') + '.</p>'
    + btn('Открыть Умную тарелку', '' + PLATFORM_URL + '/')
    + '<p style="font-size:14px;color:#111;margin:0 0 12px;line-height:1.6">Спасибо, что вы со мной!</p>'
    + '<p style="font-size:14px;color:#111;margin:0;line-height:1.5">Ваша Юля</p>';
  await send(to, 'Подписка продлена', wrapService(body));
}

// ── 5. Оплата подтверждена ──
function escHtml(s) {
  return String(s || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function sendPaymentConfirmed(to, days, activeUntil, comment) {
  const untilStr = activeUntil
    ? new Date(activeUntil).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : '';
  const commentHtml = comment && String(comment).trim()
    ? '<p style="font-size:14px;color:#777;margin:0 0 6px">Комментарий отдела заботы:</p>'
      + '<div style="padding:14px;background:#faf8f5;border-radius:10px;border:1px solid #eee;margin:0 0 16px;font-size:14px;color:#444;line-height:1.6;white-space:pre-wrap">'
      + escHtml(comment) + '</div>'
    : '';
  const body =
    '<h2 style="font-size:22px;color:#111;margin:0 0 12px;font-weight:700">Привет!</h2>'
    + '<p style="font-size:15px;color:#444;line-height:1.6;margin:0 0 16px">'
    + 'Ваша оплата подтверждена. Подписка на платформу <strong>«Умная тарелка»</strong>'
    + (untilStr ? ' действует до <strong>' + untilStr + '</strong>' : ' активирована') + '.</p>'
    + commentHtml
    + btn('Открыть Умную тарелку', '' + PLATFORM_URL + '/')
    + '<p style="font-size:14px;color:#111;margin:0 0 12px;line-height:1.6">Спасибо за доверие!</p>'
    + '<p style="font-size:14px;color:#111;margin:0;line-height:1.5">Ваша Юля</p>';
  await send(to, 'Оплата подтверждена', wrapService(body));
}

// ── 5c. Платёж отклонён ──
async function sendPaymentRejected(to, reason) {
  const reasonHtml = reason && String(reason).trim()
    ? '<div style="padding:14px;background:#faf8f5;border-radius:10px;border:1px solid #eee;margin:0 0 16px;font-size:14px;color:#444;line-height:1.6;white-space:pre-wrap">'
      + escHtml(reason) + '</div>'
    : '';
  const body =
    '<h2 style="font-size:22px;color:#111;margin:0 0 12px;font-weight:700">Привет!</h2>'
    + '<p style="font-size:15px;color:#444;line-height:1.6;margin:0 0 16px">'
    + 'К сожалению, нам пока не удалось подтвердить ваш платёж за подписку на платформу <strong>«Умная тарелка»</strong>.</p>'
    + (reasonHtml ? '<p style="font-size:14px;color:#777;margin:0 0 6px">Комментарий отдела заботы:</p>' + reasonHtml : '')
    + '<p style="font-size:15px;color:#444;line-height:1.6;margin:0 0 16px">'
    + 'Если оплата была совершена, отправьте на '
    + '<a href="mailto:hello@voronova.online" style="color:#e8400a;text-decoration:none;font-weight:600">hello@voronova.online</a> '
    + 'скриншот, на котором видны сумма, дата и получатель перевода. Мы проверим платёж ещё раз.</p>'
    + btn('Открыть личный кабинет', PLATFORM_URL + '/cabinet.html?tab=subscription')
    + '<p style="font-size:14px;color:#111;margin:0;line-height:1.5">Отдел заботы | Умная тарелка</p>';
  await send(to, 'Не удалось подтвердить платёж', wrapService(body));
}

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'hello@voronova.online';

async function sendPaymentNotification(userEmail, amount, paymentDate, hasScreenshot) {
  const body =
    '<h2 style="font-size:22px;color:#111;margin:0 0 12px;font-weight:700">Новая оплата на проверку</h2>'
    + '<p style="font-size:15px;color:#444;line-height:1.6;margin:0 0 16px">'
    + 'Пользователь <strong>' + userEmail + '</strong> сообщил об оплате подписки:</p>'
    + '<table cellpadding="6" cellspacing="0" border="0" style="font-size:14px;color:#444;margin-bottom:16px">'
    + '<tr><td style="color:#777">Сумма:</td><td style="font-weight:700;color:#111">' + amount + ' ₽</td></tr>'
    + '<tr><td style="color:#777">Дата перевода:</td><td>' + paymentDate + '</td></tr>'
    + '<tr><td style="color:#777">Скриншот:</td><td>' + (hasScreenshot ? '📎 Приложен (смотрите в админке)' : 'Не приложен') + '</td></tr>'
    + '</table>'
    + btn('Проверить оплату в админке', '' + PLATFORM_URL + '/admin.html')
    + '<p style="font-size:14px;color:#111;margin:0;line-height:1.5">'
    + 'Проверьте поступление и подтвердите или отклоните платёж.</p>';
  await send(ADMIN_EMAIL, 'Новая оплата на проверку: ' + userEmail, wrap(body));
}

async function sendFeedback(userEmail, category, text, opts) {
  const labels = { wish: 'Пожелание', recipe: 'Идея рецепта', problem: 'Проблема' };
  const label = labels[category] || category;
  const isFollowUp = !!(opts && opts.followUp);
  const feedbackId = opts && opts.feedbackId ? opts.feedbackId : '';
  const subject = isFollowUp
    ? 'Уточнение к обращению #' + feedbackId
    : 'Новое обращение: ' + label;
  const intro = isFollowUp
    ? '<p style="font-size:14px;color:#111;margin:0 0 8px"><strong>Пользователь добавил уточнение в обращение #' + feedbackId + '</strong></p>'
    : '';
  const body = intro
    + '<p style="font-size:14px;color:#111;margin:0 0 8px"><strong>Категория:</strong> ' + label + '</p>'
    + '<p style="font-size:14px;color:#111;margin:0 0 8px"><strong>От:</strong> ' + userEmail + '</p>'
    + '<p style="font-size:14px;color:#111;margin:0 0 16px;white-space:pre-wrap">' + text.replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</p>'
    + btn('Открыть обращения в админке', PLATFORM_URL + '/admin.html?tab=feedback');
  await send('hello@voronova.online', subject, wrap(body));
}

// ── 6b. Новый пользователь зарегистрирован (уведомление админу) ──
const NEW_USER_NOTIFY_ENABLED = process.env.NEW_USER_NOTIFY_ENABLED !== 'false';
const NEW_USER_NOTIFY_TO = process.env.NEW_USER_NOTIFY_TO || 'hello@voronova.online';

async function sendNewUserNotification(user, meta) {
  if (!NEW_USER_NOTIFY_ENABLED) return;
  const method = (meta && meta.method) || 'email';
  const ip = (meta && meta.ip) || '—';
  const ua = (meta && meta.userAgent) || '—';
  const trialGranted = !!(meta && meta.trialGranted);
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
    + '<tr><td style="color:#777">Триал:</td><td style="font-weight:700;color:' + (trialGranted ? '#2d7a2d' : '#8a1a1a') + '">' + (trialGranted ? 'Выдан' : 'Не выдан') + '</td></tr>'
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
    + 'Новый отзыв от <strong>' + author.replace(/</g, '&lt;') + '</strong> на рецепт <strong>' + recipeName.replace(/</g, '&lt;') + '</strong>:</p>'
    + '<div style="padding:16px;background:#faf8f5;border-radius:10px;border:1px solid #eee;margin-bottom:16px">'
    + '<div style="font-size:20px;margin-bottom:8px;color:#f5a623">' + starsStr + '</div>'
    + '<p style="font-size:14px;color:#333;margin:0;white-space:pre-wrap">' + text.replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</p>'
    + '</div>'
    + btn('Посмотреть отзыв', reviewUrl);
  await send('hello@voronova.online', 'Новый отзыв: ' + recipeName.replace(/</g, '&lt;'), wrap(body));
}

// ── 8. Рассылка новости ──
async function sendNewsletter(to, news, unsubscribeToken) {
  const item = typeof news === 'string' ? { text: news } : (news || {});
  const esc = (s) => String(s || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const isRecipe = item.type === 'recipe' && item.recipeId && item.recipeName;
  const newsText = esc(item.text);
  const recipeName = esc(item.recipeName);
  const subject = isRecipe ? 'Новый рецепт: ' + item.recipeName : 'Новости';
  const title = isRecipe
    ? 'Я добавила новый рецепт: <strong>' + recipeName + '</strong>.'
    : 'Новости';
  const buttonText = isRecipe ? 'Посмотреть рецепт' : 'Открыть Умную тарелку';
  const buttonUrl = isRecipe
    ? PLATFORM_URL + '/recipe.html?id=' + encodeURIComponent(item.recipeId)
    : PLATFORM_URL + '/';
  const body =
    '<h2 style="font-size:22px;color:#111;margin:0 0 12px;font-weight:700">Привет!</h2>'
    + '<p style="font-size:15px;color:#444;line-height:1.6;margin:0 0 16px">' + title + '</p>'
    + (newsText
      ? '<p style="font-size:15px;color:#444;line-height:1.6;margin:0 0 16px;white-space:pre-wrap">' + newsText + '</p>'
      : '')
    + btn(buttonText, buttonUrl)
    + '<p style="font-size:14px;color:#111;margin:0;line-height:1.5">Ваша Юля</p>';
  await send(to, subject, wrap(body, unsubscribeToken));
}

// ── 9. Уведомление пользователю об ответе на обращение ──
async function sendFeedbackReply(to, category, originalText, replyText, displayName) {
  const labels = { wish: 'Пожелание', recipe: 'Идея рецепта', problem: 'Проблема' };
  const label = labels[category] || category;
  const safeName = String(displayName || '').trim().replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const greeting = safeName ? 'Здравствуйте, ' + safeName + '!' : 'Здравствуйте!';
  const body =
    '<h2 style="font-size:22px;color:#111;margin:0 0 12px;font-weight:700">' + greeting + '</h2>'
    + '<p style="font-size:15px;color:#444;line-height:1.6;margin:0 0 16px">Ответ на ваше обращение</p>'
    + '<p style="font-size:14px;color:#777;margin:0 0 4px">Категория: <strong>' + label + '</strong></p>'
    + '<div style="padding:14px;background:#faf8f5;border-radius:10px;border:1px solid #eee;margin:12px 0;font-size:14px;color:#444;line-height:1.6;white-space:pre-wrap">'
    + originalText.replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</div>'
    + '<p style="font-size:15px;color:#111;font-weight:700;margin:16px 0 8px">Юлия:</p>'
    + '<p style="font-size:15px;color:#444;line-height:1.6;margin:0 0 16px;white-space:pre-wrap">'
    + replyText.replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</p>'
    + btn('Открыть личный кабинет', '' + PLATFORM_URL + '/cabinet.html');
  await send(to, 'Ответ на ваше обращение', wrapService(body));
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
