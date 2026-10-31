'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const markup = `
                    <div class="lp-oauth" id="lp-oauth" hidden>
                        <div class="lp-oauth-divider">или войдите через</div>
                        <div class="lp-oauth-buttons">
                            <div class="lp-vk-one-tap" id="lp-vk-one-tap" hidden></div>
                            <button class="lp-oauth-button" data-oauth-provider="vk" type="button" hidden><span class="lp-oauth-brand lp-oauth-brand-vk" aria-hidden="true">VK</span>Войти через ВК</button>
                            <button class="lp-oauth-button" data-oauth-provider="yandex" type="button" hidden><span class="lp-oauth-brand lp-oauth-brand-yandex" aria-hidden="true">Я</span>Войти через Яндекс</button>
                        </div>
                        <p class="lp-oauth-note">Уже есть аккаунт? Войдите через сервис с той же почтой.</p>
                    </div>
`;

function loginPreview() {
  const html = fs.readFileSync(path.join(root, 'platform/login.html'), 'utf8');
  if (html.includes('id="lp-oauth"') && html.includes('oauth-login.js?v=')) return html;
  if (!html.includes('<p class="lp-new-account">') || html.includes('id="lp-oauth"')) throw Error('Unexpected login template');
  return html.replace(/(<p class="lp-new-account">[^<]*<\/p>)/, '$1' + markup)
    .replace('</head>', '<link rel="stylesheet" href="oauth-login.css?v=20261031-multibranding">\n</head>')
    .replace('</body>', '<script src="oauth-login.js?v=20261031-multibranding"></script>\n</body>');
}

function callbackPreview() {
  const html = fs.readFileSync(path.join(root, 'platform/auth-callback.html'), 'utf8');
  if (html.includes('oauth-login.js?v=')) return html;
  return html
    .replace('<script src="auth-callback.js', '<script src="oauth-login.js?v=20261031-multibranding"></script>\n<script src="auth-callback.js');
}

module.exports = { loginPreview, callbackPreview };
