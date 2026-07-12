const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 465,
  secure: true,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
});

const FROM = '"Умная тарелка" <' + (process.env.SMTP_FROM || 'noreply@voronova.online') + '>';
const PLATFORM_URL = process.env.PLATFORM_URL || 'https://app.voronova.online';

function wrap(body, unsubscribeToken, showSupportFooter = false, newsletterFooter = false) {
  const unsubLink = unsubscribeToken
    ? '<a href="' + PLATFORM_URL + '/api/unsubscribe?token=' + encodeURIComponent(unsubscribeToken) + '" style="color:#77716a; text-decoration:underline;">Отписаться от рассылки</a>'
    : '';
  const supportBlock = showSupportFooter
    ? `<tr>
	<td class="em-help" bgcolor="#faf8f5" style="background-color:#faf8f5; border-top:1px solid #e5e1db; padding:18px 36px; font-family:'Montserrat',Arial,Helvetica,sans-serif; font-size:12px; line-height:1.65; font-weight:400; color:#625d57;">Нужна помощь? Напишите на <a href="mailto:hello@voronova.online" style="color:#c73208; text-decoration:underline; font-weight:600;">hello@voronova.online</a> или в разделе <a href="${PLATFORM_URL}/cabinet.html?tab=feedback" target="_blank" style="color:#c73208; text-decoration:underline; font-weight:600;">«Связь»</a>.</td>
</tr>`
    : '';
  const standardFooter = `<tr>
	<td class="em-footer" align="center" style="border-top:1px solid #e5e1db; padding:19px 28px 21px;">
		<div style="font-family:'Playfair Display',Georgia,'Times New Roman',serif; font-size:14px; line-height:1.3; font-weight:700; color:#171717;">Умная&nbsp;<span style="color:#e8400a;">тарелка</span></div>
		<div style="margin-top:7px; font-family:'Montserrat',Arial,Helvetica,sans-serif; font-size:11px; line-height:1.55; color:#8a847d;"><a href="${PLATFORM_URL}/" target="_blank" style="color:#77716a; text-decoration:underline;">Открыть платформу</a>{{UNSUBSCRIBE_LINK}}&nbsp;&nbsp;·&nbsp;&nbsp;© 2026 Юлия Воронова</div>
	</td>
</tr>`.replace('{{UNSUBSCRIBE_LINK}}', () => unsubLink ? '&nbsp;&nbsp;·&nbsp;&nbsp;' + unsubLink : '');
  const mailingFooter = `<tr>
	<td class="em-footer" align="center" style="border-top:1px solid #e5e1db; padding:19px 28px 21px;">
		<div style="font-family:'Playfair Display',Georgia,'Times New Roman',serif; font-size:14px; line-height:1.3; font-weight:700; color:#171717;">Умная&nbsp;<span style="color:#e8400a;">тарелка</span></div>
		<div style="margin-top:7px; font-family:'Montserrat',Arial,Helvetica,sans-serif; font-size:11px; line-height:1.55; color:#8a847d;">Вы получили это письмо, потому что подписались на новости проекта.</div>
		<div style="margin-top:3px; font-family:'Montserrat',Arial,Helvetica,sans-serif; font-size:11px; line-height:1.55; color:#8a847d;">{{UNSUBSCRIBE_LINK}}{{COPYRIGHT_SEPARATOR}}© 2026 Юлия Воронова</div>
	</td>
</tr>`
    .replace('{{UNSUBSCRIBE_LINK}}', () => unsubLink)
    .replace('{{COPYRIGHT_SEPARATOR}}', () => unsubLink ? '&nbsp;&nbsp;·&nbsp;&nbsp;' : '');
  const footer = newsletterFooter ? mailingFooter : standardFooter;
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
		body { margin:0; padding:0; width:100% !important; -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
		table { border-collapse:collapse; }
		a { color:#c73208; }
		@media only screen and (max-width:600px){
			.em-outer{ padding:14px 10px !important; }
			.em-author{ padding:10px 16px !important; font-size:9px !important; letter-spacing:1.5px !important; }
			.em-mast{ padding:22px 20px 20px !important; }
			.em-brand{ font-size:26px !important; }
			.em-content{ padding:28px 22px 30px !important; }
			.em-h1{ font-size:23px !important; }
			.em-help{ padding:18px 22px !important; }
			.em-footer{ padding:18px 22px 20px !important; }
		}
	</style>
</head>
<body style="margin:0; padding:0; background-color:#f0ede7; -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%;">
	<div style="display:none; max-height:0; overflow:hidden; opacity:0; font-size:1px; line-height:1px; color:#f0ede7;">Персональный помощник в питании — Умная тарелка.</div>
	<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f0ede7; -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%;">
		<tr>
			<td class="em-outer" align="center" style="padding:24px 16px;">
				<table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:560px; max-width:100%; background-color:#ffffff; border:1px solid #dedad3;">
					<!-- чёрная авторская полоса -->
					<tr>
						<td class="em-author" align="center" bgcolor="#171717" style="background-color:#171717; padding:11px 20px; font-family:'Montserrat',Arial,Helvetica,sans-serif; font-size:9px; line-height:1.4; font-weight:700; letter-spacing:1.9px; color:#ffffff; text-transform:uppercase;">Юлия Воронова&nbsp;&nbsp;<span style="color:#e8400a;">●</span>&nbsp;&nbsp;Нутрициолог</td>
					</tr>
					<!-- шапка бренда -->
					<tr>
						<td class="em-mast" align="center" style="padding:25px 28px 23px; border-bottom:1px solid #e5e1db;">
							<div style="font-family:'Montserrat',Arial,Helvetica,sans-serif; font-size:9px; line-height:1.4; font-weight:700; letter-spacing:2.2px; color:#77716a; text-transform:uppercase;">Персональный помощник в питании</div>
							<div class="em-brand" style="margin-top:8px; font-family:'Playfair Display',Georgia,'Times New Roman',serif; font-size:29px; font-weight:700; line-height:1.05; color:#171717; letter-spacing:-0.4px;">Умная&nbsp;<span style="color:#e8400a;">тарелка</span></div>
						</td>
					</tr>
					<!-- основной контент -->
					<tr>
						<td class="em-content" style="padding:32px 36px 34px; font-family:'Montserrat',Arial,Helvetica,sans-serif; color:#33302d;">{{BODY}}</td>
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
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate; margin:4px 0 22px;">
	<tr>
		<td align="center" bgcolor="#e8400a" style="background-color:#e8400a; border-radius:3px;">
			<a href="{{URL}}" target="_blank" style="display:inline-block; padding:13px 21px; font-family:'Montserrat',Arial,Helvetica,sans-serif; font-size:14px; font-weight:700; line-height:1.2; color:#ffffff; text-decoration:none; white-space:nowrap;">{{TEXT}}&nbsp;&nbsp;&rarr;</a>
		</td>
	</tr>
</table>`
    .replace('{{URL}}', () => url)
    .replace('{{TEXT}}', () => text);
}

async function send(to, subject, html) {
  await transporter.sendMail({ from: FROM, to, subject, html });
}

function escHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function heading(text, eyebrow) {
  const eyebrowHtml = eyebrow
    ? '<div style="margin:0 0 8px;font-family:\'Montserrat\',Arial,Helvetica,sans-serif;font-size:10px;line-height:1.4;font-weight:700;letter-spacing:1.7px;color:#c73208;text-transform:uppercase">' + eyebrow + '</div>'
    : '';
  return eyebrowHtml
    + '<h2 class="em-h1" style="margin:0 0 14px;font-family:\'Playfair Display\',Georgia,\'Times New Roman\',serif;font-size:25px;line-height:1.22;font-weight:700;letter-spacing:-0.25px;color:#171717">'
    + text + '</h2>';
}

function paragraph(html, margin = '0 0 16px', color = '#4a4642', extraStyle = '') {
  return '<p style="margin:' + margin + ';font-family:\'Montserrat\',Arial,Helvetica,sans-serif;font-size:15px;line-height:1.65;font-weight:400;color:' + color + ';' + extraStyle + '">' + html + '</p>';
}

function smallText(html, margin = '0', color = '#625d57') {
  return '<p style="margin:' + margin + ';font-family:\'Montserrat\',Arial,Helvetica,sans-serif;font-size:12px;line-height:1.65;font-weight:400;color:' + color + '">' + html + '</p>';
}

function signature(text = 'Ваша Юля') {
  return paragraph(text, '0', '#171717', 'font-weight:600;');
}

function callout(html, accent = false) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin:4px 0 20px;border-collapse:collapse;background-color:#faf7f2;${accent ? 'border-left:3px solid #e8400a;' : 'border:1px solid #ebe6df;'}">
	<tr>
		<td style="padding:15px 17px;font-family:'Montserrat',Arial,Helvetica,sans-serif;font-size:14px;line-height:1.65;font-weight:400;color:#4a4642;">${html}</td>
	</tr>
</table>`;
}

function statusBlock(label, value) {
  if (!value) return '';
  return callout(
    '<div style="font-size:10px;line-height:1.4;font-weight:700;letter-spacing:1.4px;color:#7c756d;text-transform:uppercase">' + label + '</div>'
    + '<div style="margin-top:4px;font-size:16px;line-height:1.45;font-weight:600;color:#171717">' + value + '</div>',
    true
  );
}

function detailTable(rows) {
  const body = rows.map(([label, value, valueStyle = '']) =>
    '<tr>'
    + '<td style="padding:5px 12px 5px 0;vertical-align:top;font-family:\'Montserrat\',Arial,Helvetica,sans-serif;font-size:12px;line-height:1.55;color:#7c756d;white-space:nowrap">' + label + '</td>'
    + '<td style="padding:5px 0;vertical-align:top;font-family:\'Montserrat\',Arial,Helvetica,sans-serif;font-size:13px;line-height:1.55;color:#33302d;' + valueStyle + '">' + value + '</td>'
    + '</tr>'
  ).join('');
  return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin:2px 0 20px;border-collapse:collapse">' + body + '</table>';
}

// ── 1. Код для входа ──
async function sendLoginCode(to, code) {
  const body =
    heading('Ваш код для входа', 'Безопасный вход')
    + callout('<div style="font-size:30px;line-height:1.3;font-weight:700;letter-spacing:8px;text-align:center;color:#171717">' + escHtml(code) + '</div>', true)
    + smallText('Код действует 5 минут. Никому не сообщайте его.<br>Если вы не запрашивали вход в «Умную тарелку», просто проигнорируйте это письмо.');
  await send(to, 'Код для входа в Умную тарелку', wrapService(body));
}

// ── 2. Welcome (первая регистрация) ──
async function sendWelcome(to, trialGranted = true) {
  const features =
    paragraph('Здесь вы найдёте:', '0 0 5px')
    + '<ul style="font-family:\'Montserrat\',Arial,Helvetica,sans-serif;font-size:15px;line-height:1.7;font-weight:400;color:#4a4642;padding-left:20px;margin:0 0 18px">'
    + '<li>Мои проверенные рецепты для всей семьи</li>'
    + '<li>Подробные пошаговые видеорецепты</li>'
    + '<li>Конструктор сбалансированной тарелки</li>'
    + '<li>Расчёт КБЖУ</li>'
    + '<li>Новый вкусный и полезный рецепт каждую неделю</li>'
    + '</ul>';

  if (!trialGranted) {
    const body =
      heading('Добро пожаловать!', 'Аккаунт создан')
      + paragraph('Ваш аккаунт в <strong>«Умной тарелке»</strong> создан.')
      + callout('Бесплатный пробный период не был активирован, так как ранее он уже использовался на этом устройстве или в вашей сети. Один пробный период предоставляется только один раз.')
      + paragraph('Чтобы получить полный доступ к платформе, оформите подписку в личном кабинете.')
      + btn('Оформить подписку', PLATFORM_URL + '/cabinet.html?tab=subscription')
      + signature();
    await send(to, 'Аккаунт создан — Умная тарелка', wrapService(body));
    return;
  }

  const body =
    heading('Добро пожаловать!', '7 дней бесплатно')
    + paragraph('Вы зарегистрировались на платформе <strong>«Умная тарелка»</strong>, и у вас активирован <strong>бесплатный пробный период на 7 дней</strong>. Статус доступа и срок пробного периода можно посмотреть в личном кабинете.')
    + features
    + btn('Открыть Умную тарелку', '' + PLATFORM_URL + '/')
    + paragraph('Желаю приятного использования!', '0 0 5px')
    + signature();
  await send(to, 'Добро пожаловать в Умную тарелку!', wrapService(body));
}

// ── 3. Триал истёк ──
async function sendTrialExpired(to) {
  const body =
    heading('Спасибо, что попробовали «Умную тарелку»!', 'Пробный период завершён')
    + paragraph('Ваш бесплатный пробный период завершился.')
    + paragraph('Надеюсь, моя онлайн-платформа помогла вам найти новые идеи для вкусного и сбалансированного питания для вас и вашей семьи.')
    + paragraph('Если вам понравилась «Умная тарелка», оформите подписку в личном кабинете, чтобы продолжить пользоваться платформой.')
    + btn('Оформить подписку', '' + PLATFORM_URL + '/cabinet.html')
    + signature();
  await send(to, 'Пробный период завершён', wrapService(body));
}

// ── 4. Подписка истекла ──
async function sendSubscriptionExpired(to) {
  const body =
    heading('Подписка завершилась', 'Статус подписки')
    + paragraph('К сожалению, ваша подписка на платформу <strong>«Умная тарелка»</strong> завершилась.')
    + paragraph('Продлите её, чтобы снова получить доступ ко всем рецептам и конструктору тарелки.')
    + btn('Продлить подписку', '' + PLATFORM_URL + '/cabinet.html')
    + smallText('Если вы уже оплатили, пожалуйста, дождитесь подтверждения администратором.', '0 0 7px')
    + signature();
  await send(to, 'Подписка завершилась', wrapService(body));
}

// ── 5b. Подписка продлена админом вручную ──
async function sendSubscriptionExtended(to, days, activeUntil) {
  const untilStr = activeUntil
    ? new Date(activeUntil).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : '';
  const body =
    heading('Подписка продлена', 'Статус подписки')
    + paragraph('Готово — доступ ко всем рецептам и конструктору тарелки активен.')
    + statusBlock('Доступ активен до', untilStr)
    + btn('Открыть Умную тарелку', '' + PLATFORM_URL + '/')
    + paragraph('Спасибо, что вы со мной!', '0 0 5px')
    + signature();
  await send(to, 'Подписка продлена', wrapService(body));
}

async function sendPaymentConfirmed(to, days, activeUntil, comment) {
  const untilStr = activeUntil
    ? new Date(activeUntil).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : '';
  const commentHtml = comment && String(comment).trim()
    ? smallText('Комментарий отдела заботы:', '0 0 6px', '#7c756d')
      + callout('<div style="white-space:pre-wrap">' + escHtml(comment) + '</div>')
    : '';
  const body =
    heading('Оплата подтверждена', 'Статус оплаты')
    + paragraph('Подписка на платформу <strong>«Умная тарелка»</strong> активирована.')
    + statusBlock('Доступ активен до', untilStr)
    + commentHtml
    + btn('Открыть Умную тарелку', '' + PLATFORM_URL + '/')
    + paragraph('Спасибо за доверие!', '0 0 5px')
    + signature();
  await send(to, 'Оплата подтверждена', wrapService(body));
}

// ── 5c. Платёж отклонён ──
async function sendPaymentRejected(to, reason) {
  const reasonHtml = reason && String(reason).trim()
    ? callout('<div style="white-space:pre-wrap">' + escHtml(reason) + '</div>')
    : '';
  const body =
    heading('Не удалось подтвердить платёж', 'Статус оплаты')
    + paragraph('К сожалению, нам пока не удалось подтвердить ваш платёж за подписку на платформу <strong>«Умная тарелка»</strong>.')
    + (reasonHtml ? smallText('Комментарий отдела заботы:', '0 0 6px', '#7c756d') + reasonHtml : '')
    + paragraph('Если оплата была совершена, отправьте на '
    + '<a href="mailto:hello@voronova.online" style="color:#e8400a;text-decoration:none;font-weight:600">hello@voronova.online</a> '
    + 'скриншот, на котором видны сумма, дата и получатель перевода. Мы проверим платёж ещё раз.')
    + btn('Открыть личный кабинет', PLATFORM_URL + '/cabinet.html?tab=subscription')
    + signature('Отдел заботы · Умная тарелка');
  await send(to, 'Не удалось подтвердить платёж', wrapService(body));
}

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'hello@voronova.online';

async function sendPaymentNotification(userEmail, amount, paymentDate, hasScreenshot) {
  const body =
    heading('Новая оплата на проверку', 'Внутреннее уведомление')
    + paragraph('Пользователь <strong>' + escHtml(userEmail) + '</strong> сообщил об оплате подписки:')
    + detailTable([
      ['Сумма', escHtml(amount) + ' ₽', 'font-weight:700;color:#171717;'],
      ['Дата перевода', escHtml(paymentDate)],
      ['Скриншот', hasScreenshot ? '📎 Приложен (смотрите в админке)' : 'Не приложен']
    ])
    + btn('Проверить оплату в админке', '' + PLATFORM_URL + '/admin.html')
    + smallText('Проверьте поступление и подтвердите или отклоните платёж.');
  await send(ADMIN_EMAIL, 'Новая оплата на проверку: ' + userEmail, wrap(body));
}

async function sendFeedback(userEmail, category, text, opts) {
  const labels = { wish: 'Пожелание', recipe: 'Идея рецепта', problem: 'Проблема' };
  const label = labels[category] || category;
  const isFollowUp = !!(opts && opts.followUp);
  const feedbackId = opts && opts.feedbackId ? opts.feedbackId : '';
  const feedbackIdHtml = escHtml(feedbackId);
  const labelHtml = escHtml(label);
  const subject = isFollowUp
    ? 'Уточнение к обращению #' + feedbackId
    : 'Новое обращение: ' + label;
  const intro = isFollowUp
    ? paragraph('<strong>Пользователь добавил уточнение в обращение #' + feedbackIdHtml + '</strong>')
    : '';
  const body = heading(isFollowUp ? 'Уточнение к обращению' : 'Новое обращение', 'Обратная связь')
    + intro
    + detailTable([
      ['Категория', labelHtml, 'font-weight:600;color:#171717;'],
      ['От', escHtml(userEmail)]
    ])
    + callout('<div style="white-space:pre-wrap">' + escHtml(text) + '</div>')
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
  const body =
    heading('Новый пользователь', 'Внутреннее уведомление')
    + paragraph('На платформе <strong>Умная тарелка</strong> зарегистрирован новый пользователь:')
    + detailTable([
      ['Email', escHtml(user.email || '—'), 'font-weight:700;color:#171717;'],
      ['User ID', escHtml(user.id)],
      ['Способ', escHtml(method)],
      ['Триал', trialGranted ? 'Выдан' : 'Не выдан', 'font-weight:700;color:' + (trialGranted ? '#2d7a2d' : '#8a1a1a') + ';'],
      ['Дата (МСК)', escHtml(mskStr)],
      ['Дата (UTC)', escHtml(utcStr)],
      ['IP', escHtml(ip)],
      ['User-agent', escHtml(String(ua).slice(0, 300)), 'font-size:11px;color:#77716a;word-break:break-word;']
    ])
    + btn('Открыть админку', PLATFORM_URL + '/admin.html');
  await send(NEW_USER_NOTIFY_TO, 'Новый пользователь зарегистрирован', wrap(body));
}

// ── 7. Уведомление об отзыве ──
async function sendReviewNotification(author, recipeName, stars, text, recipeId) {
  const starsStr = '★'.repeat(stars) + '☆'.repeat(5 - stars);
  const reviewUrl = PLATFORM_URL + '/recipe.html?id=' + encodeURIComponent(recipeId || '') + '#reviews-section';
  const body =
    heading('Новый отзыв', 'Внутреннее уведомление')
    + paragraph('Новый отзыв от <strong>' + escHtml(author) + '</strong> на рецепт <strong>' + escHtml(recipeName) + '</strong>:')
    + callout('<div style="font-size:18px;line-height:1.3;margin-bottom:8px;color:#e59a18">' + starsStr + '</div>'
      + '<div style="white-space:pre-wrap">' + escHtml(text) + '</div>')
    + btn('Посмотреть отзыв', reviewUrl);
  await send('hello@voronova.online', 'Новый отзыв: ' + recipeName, wrap(body));
}

// ── 8. Видеорецепт набрал нужное число голосов ──
async function sendVideoRequestThresholdNotification(recipeName, recipeId, votes, goal) {
  const adminUrl = PLATFORM_URL + '/admin.html?tab=video-requests';
  const recipeUrl = PLATFORM_URL + '/recipe.html?id=' + encodeURIComponent(recipeId || '');
  const body =
    heading('Пора снимать видеорецепт', 'Достигнут порог голосов')
    + paragraph('Рецепт <strong>' + escHtml(recipeName) + '</strong> набрал <strong>' + Number(votes) + ' из ' + Number(goal) + '</strong> голосов.')
    + callout('Запрос автоматически добавлен в очередь видеорецептов.', true)
    + btn('Открыть очередь', adminUrl)
    + smallText('<a href="' + recipeUrl + '" style="color:#c73208;font-weight:600;text-decoration:underline">Открыть рецепт</a>');
  await send('hello@voronova.online', 'Нужно снять видео: ' + recipeName, wrap(body));
}

// ── 9. Рассылка новости ──
async function sendNewsletter(to, news, unsubscribeToken, displayName) {
  const item = typeof news === 'string' ? { text: news } : (news || {});
  const isRecipe = item.type === 'recipe' && item.recipeId && item.recipeName;
  const newsText = escHtml(item.text);
  const recipeName = escHtml(item.recipeName);
  const safeName = escHtml(String(displayName || '').trim());
  const greeting = safeName ? 'Привет, ' + safeName + '!' : 'Привет!';
  const subject = isRecipe ? 'Новый рецепт: ' + item.recipeName : 'Новости';
  const title = isRecipe
    ? 'Я добавила новый рецепт: <strong>' + recipeName + '</strong>.'
    : '';
  const buttonText = isRecipe ? 'Посмотреть рецепт' : 'Открыть Умную тарелку';
  const buttonUrl = isRecipe
    ? PLATFORM_URL + '/recipe.html?id=' + encodeURIComponent(item.recipeId)
    : PLATFORM_URL + '/';
  const body =
    heading(greeting, isRecipe ? 'Новый рецепт' : 'Новости Умной тарелки')
    + (title ? paragraph(title) : '')
    + (newsText
      ? paragraph(newsText, '0 0 16px', '#4a4642', 'white-space:pre-wrap;')
      : '')
    + signature()
    + btn(buttonText, buttonUrl);
  await send(to, subject, wrap(body, unsubscribeToken, false, true));
}

// ── 10. Уведомление пользователю об ответе на обращение ──
async function sendFeedbackReply(to, category, originalText, replyText, displayName) {
  const labels = { wish: 'Пожелание', recipe: 'Идея рецепта', problem: 'Проблема' };
  const label = labels[category] || category;
  const safeName = escHtml(String(displayName || '').trim());
  const greeting = safeName ? 'Здравствуйте, ' + safeName + '!' : 'Здравствуйте!';
  const body =
    heading(greeting, 'Ответ на ваше обращение')
    + smallText('Категория: <strong style="color:#33302d">' + escHtml(label) + '</strong>', '0 0 7px', '#7c756d')
    + callout('<div style="white-space:pre-wrap">' + escHtml(originalText) + '</div>')
    + paragraph('<strong style="color:#171717">Юлия:</strong>', '0 0 6px')
    + paragraph(escHtml(replyText), '0 0 16px', '#4a4642', 'white-space:pre-wrap;')
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
  sendVideoRequestThresholdNotification,
  sendNewsletter
};
