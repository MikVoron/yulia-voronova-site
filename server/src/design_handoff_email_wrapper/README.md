# Handoff: Email-обёртка «Умной тарелки» — Вариант A (Editorial Masthead)

## Что это

Новая брендированная обёртка для всех писем SmartPlate, реализующая **Вариант A — Editorial Masthead** (выбран как основной стандарт). Обёртка задаёт повторяемые элементы письма — внешний фон, шапку бренда, контейнер текста, CTA-кнопку, блок помощи и подвал — и подставляет в них содержимое конкретного письма через `{{BODY}}`.

**Цель внедрения:** переписать функции в `server/src/email.js` так, чтобы они генерировали HTML из фрагментов ниже.

## Про файлы в этом пакете

Файлы в `fragments/` — это **готовая email-вёрстка**, а не абстрактный дизайн-референс. В отличие от веб-UI, эти фрагменты **переносятся в код почти как есть**: вся критичная стилизация уже инлайн, вёрстка table-based и протестирована на устойчивость в почтовых клиентах. Задача — встроить эти строки в функции `email.js`, подставив переменные на места плейсхолдеров. Не нужно перекладывать это на flex/grid или внешний CSS — для email это сломает совместимость.

`preview/variant-a-editorial.html` — собранное письмо с примерным телом, чтобы видеть итоговый вид. Текст внутри — демонстрационный плейсхолдер, в продакшене на его месте будет реальный `body`.

## Fidelity

**High-fidelity.** Цвета, типографика, отступы и размеры — финальные. Воспроизводить точно.

---

## Целевой код

Файл: `server/src/email.js`

Функции (сигнатуры из ТЗ — сохранить):

| Функция | Назначение |
|---|---|
| `wrap(body, unsubscribeToken, showSupportFooter)` | Общая обёртка письма |
| `wrapService(body)` | Сервисное письмо = `wrap(body, null, true)` (всегда с блоком помощи, без отписки) |
| `btn(text, url)` | Основная CTA-кнопка (вставляется внутрь `body`) |

## Схема сборки

```
wrap(body, unsubscribeToken, showSupportFooter):
  WRAPPER                          // fragments/wrapper.html
    {{BODY}}          ← body       // может содержать btn(text,url)
    {{SUPPORT_BLOCK}} ← showSupportFooter ? HELP_BLOCK : ''
    {{FOOTER}}        ← FOOTER, где {{UNSUBSCRIBE_LINK}} зависит от unsubscribeToken
```

### Маппинг плейсхолдеров

| Плейсхолдер | Файл-источник | Чем заменить |
|---|---|---|
| `{{BODY}}` | `wrapper.html` | Аргумент `body` (HTML письма; CTA вставляется сюда через `btn()`) |
| `{{SUPPORT_BLOCK}}` | `wrapper.html` | `help-block.html` если `showSupportFooter === true`, иначе пустая строка `''` |
| `{{FOOTER}}` | `wrapper.html` | `footer.html` |
| `{{TEXT}}` | `cta-button.html` | Подпись кнопки (`text`) |
| `{{URL}}` | `cta-button.html` | Ссылка кнопки (`url`) |
| `{{UNSUBSCRIBE_LINK}}` | `footer.html` | Если `unsubscribeToken` задан — блок отписки (см. ниже), иначе `''` |

### Значение `{{UNSUBSCRIBE_LINK}}`

Показывать **только** для новостной рассылки (когда передан `unsubscribeToken`). Заменять на:

```html
&nbsp;&nbsp;·&nbsp;&nbsp;<a href="https://app.voronova.online/unsubscribe?token={{TOKEN}}" style="color:#777777; text-decoration:underline;">Отписаться от рассылки</a>
```

Подставив реальный `unsubscribeToken` вместо `{{TOKEN}}`. Для сервисных и админ-писем — пустая строка.

### Пример реализации (Node.js)

```js
const fs = require('fs');
const path = require('path');
const F = (name) => fs.readFileSync(path.join(__dirname, 'email-fragments', name), 'utf8');
// или захардкодить строки прямо в email.js

const WRAPPER = F('wrapper.html');
const HELP    = F('help-block.html');
const FOOTER  = F('footer.html');
const CTA     = F('cta-button.html');

const esc = (s) => String(s).replace(/[<>&"]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c]));

function btn(text, url) {
  return CTA.replace('{{TEXT}}', esc(text)).replace('{{URL}}', url);
}

function wrap(body, unsubscribeToken, showSupportFooter) {
  const unsub = unsubscribeToken
    ? `&nbsp;&nbsp;·&nbsp;&nbsp;<a href="https://app.voronova.online/unsubscribe?token=${encodeURIComponent(unsubscribeToken)}" style="color:#777777; text-decoration:underline;">Отписаться от рассылки</a>`
    : '';
  const footer = FOOTER.replace('{{UNSUBSCRIBE_LINK}}', unsub);
  return WRAPPER
    .replace('{{BODY}}', body)
    .replace('{{SUPPORT_BLOCK}}', showSupportFooter ? HELP : '')
    .replace('{{FOOTER}}', footer);
}

function wrapService(body) {
  return wrap(body, null, true);
}
```

> Примечание: `String.replace` заменяет только первое вхождение — это и нужно (каждый плейсхолдер встречается один раз). Не используйте глобальную замену с regex без необходимости.

---

## Дизайн-токены

| Назначение | Значение |
|---|---|
| Внешний фон письма | `#efece6` (тёплый, темнее контейнера — рамка «страницы») |
| Контейнер / бумага | `#ffffff` |
| Тёплый фон (блок помощи) | `#faf8f5` |
| Граница | `#e5e5e5` |
| Чёрная авторская полоса | `#161616` |
| Акцент (оранжевый) | `#e8400a` |
| Тёмный акцент (ссылки) | `#c73208` |
| Основной текст | `#111111` |
| Вторичный текст | `#444444` |
| Третичный текст / подвал | `#777777` |
| Копирайт (приглушённый) | `#aaaaaa` |

### Типографика

- **Sans:** `'Montserrat', Arial, Helvetica, sans-serif`
- **Serif:** `'Playfair Display', Georgia, 'Times New Roman', serif`
- Веб-шрифты подключены `<link>` в `<head>`, но **обязательны fallback** — в Gmail/Mail.ru/Outlook бренд должен читаться в Georgia/Arial.

| Элемент | Шрифт / размер / начертание |
|---|---|
| Авторская полоса | Montserrat 11px / 700 / letter-spacing 2px / uppercase / #fff |
| Eyebrow «Персональный помощник…» | Montserrat 10px / 700 / letter-spacing 3px / uppercase / #777 |
| Бренд «Умная тарелка» | Playfair 34px / 700 / letter-spacing −0.5px («тарелка» — `#e8400a`) |
| Заголовок письма (в body) | Playfair 27px / 700 / line-height 1.2 |
| Основной текст | Montserrat 16px / 400 / line-height 1.65 / #444 |
| CTA-кнопка | Montserrat 16px / 700, фон `#161616`, текст #fff, radius 4px, padding 17×38px (высота ≈50px) |
| Блок помощи | Montserrat 13px / line-height 1.6 / #444, ссылки `#c73208` подчёркнутые |
| Подвал | Montserrat 12px / #777; копирайт 11px / #aaa |

### Размеры и отступы

- Максимальная ширина контейнера: **600px** (`width:600px; max-width:600px`).
- Внешний отступ (outer cell): `28px 16px`.
- Горизонтальные падинги контента: **32px** на десктопе, **22px** на мобильном (класс `.em-pad` + media-query ≤600px).
- Адаптив: контейнер `width:100%`, фиксированных ширин шире экрана нет → нет горизонтальной прокрутки на мобильном.

---

## Совместимость (учтено в вёрстке — сохранить при правках)

- **Gmail** — все критичные стили инлайн; `<style>`/media-query только как улучшение.
- **Outlook (Word-движок)** — только таблицы и `bgcolor`; `border-radius` игнорируется (кнопка деградирует в прямоугольник — это ок); задан `<o:OfficeDocumentSettings><o:PixelsPerInch>96`.
- **Mail.ru / Яндекс** — table-layout + инлайн-стили держатся; адаптив через `max-width` и проценты.
- **Картинки отключены** — бренд набран **текстом**, не изображением; вариант A фото не использует вовсе.

### Чего не делать (сломает email)

- Не переводить на `flex` / `grid` / внешний CSS / CSS-переменные.
- Не убирать инлайн-стили в пользу классов.
- Не делать бренд картинкой.
- Не использовать `hover`, `position`, JS, SVG как единственный способ что-то показать.

---

## Обязательные элементы (чек-лист приёмки)

- [ ] Шапка: `Юлия Воронова` · `Нутрициолог`, бренд `Умная тарелка` («тарелка» оранжевая), подпись `Персональный помощник в питании`.
- [ ] `{{BODY}}` подставляется как есть, обёртка не задаёт заголовок письма.
- [ ] CTA `btn(text, url)` работает с подписями: «Открыть Умную тарелку», «Оформить подписку», «Продлить подписку», «Посмотреть рецепт», «Открыть личный кабинет», «Проверить оплату в админке».
- [ ] Блок помощи — **точный текст** из ТЗ, ссылки `mailto:hello@voronova.online` и `https://app.voronova.online/cabinet.html?tab=feedback`, показывается только при `showSupportFooter`.
- [ ] Подвал: бренд + ссылка на `https://app.voronova.online/` (подпись «Открыть платформу», **не** «voronova.online»); отписка — только для рассылки и не конкурирует с CTA.
- [ ] Письмо читаемо без картинок и без веб-шрифтов; на мобильном нет горизонтальной прокрутки.

---

## Файлы пакета

```
README.md                        ← этот файл
fragments/
  wrapper.html                   ← общая обёртка, плейсхолдеры {{BODY}} {{SUPPORT_BLOCK}} {{FOOTER}}
  cta-button.html                ← CTA, плейсхолдеры {{TEXT}} {{URL}}
  help-block.html                ← сервисный блок помощи (значение {{SUPPORT_BLOCK}})
  footer.html                    ← подвал, плейсхолдер {{UNSUBSCRIBE_LINK}}
preview/
  variant-a-editorial.html       ← собранное письмо с примерным телом (визуальный эталон)
```
