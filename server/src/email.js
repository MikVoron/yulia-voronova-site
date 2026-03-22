const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 465,
  secure: true,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
});

async function sendLoginCode(to, code) {
  const html = '<div style="font-family:sans-serif;max-width:400px;margin:0 auto;padding:20px"><h2 style="color:#e8734a">Умная тарелка</h2><p>Ваш код для входа:</p><div style="font-size:32px;font-weight:bold;letter-spacing:8px;text-align:center;padding:20px;background:#f5f5f5;border-radius:8px">' + code + '</div><p style="color:#888;font-size:13px;margin-top:16px">Код действует 5 минут. Если вы не запрашивали вход — просто проигнорируйте.</p></div>';
  await transporter.sendMail({
    from: '"Умная тарелка" <' + process.env.SMTP_FROM + '>',
    to,
    subject: 'Код для входа — Умная тарелка',
    html
  });
}

module.exports = { sendLoginCode };
