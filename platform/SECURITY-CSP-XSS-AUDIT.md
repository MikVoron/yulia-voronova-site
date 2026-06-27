# CSP и остаточный XSS-аудит SmartPlate

Дата проверки: 2026-06-27.

## Область проверки

Проверены production-страницы `index.html`, `recipe.html`, `category.html`,
`ingredient.html`, `cabinet.html`, `login.html`, `admin.html`, а также общие источники разметки
`data-v2.js`, `header-nav.js`, `cabinet.js` и `admin.js`.

Встроенный Tawk требует динамические WebSocket-хосты: в одной DevTools-сессии
виджет последовательно обращался к `vsb25.tawk.to`, `vsb75.tawk.to` и
`vsb85.tawk.to`. Надёжная встраиваемая версия потребовала бы wildcard в
`connect-src`, что противоречит принятой политике CSP.

Поэтому кнопки поддержки используют официальный Tawk Direct Chat Link внутри
модального iframe, который создаётся только после клика. В production CSP
добавлен единственный точный источник `https://tawk.to` в `frame-src` и
`child-src`. Скрипты и WebSocket Tawk исполняются в документе поставщика, а не
в контексте SmartPlate. Wildcard-источники и широкое разрешение `https:` не
используются; email остаётся fallback.

## Inline scripts

| Страница | Встроенные `<script>` | Внешние first-party scripts |
|---|---:|---:|
| `index.html` | 1 | 4 |
| `recipe.html` | 1 | 4 |
| `category.html` | 1 | 4 |
| `ingredient.html` | 1 | 4 |
| `cabinet.html` | 0 | 5 |
| `login.html` | 1 | 2 |
| `admin.html` | 0 | 2 |

Итого: 4 больших встроенных script-блока. Именно они, вместе с HTML-
обработчиками, пока не позволяют удалить `'unsafe-inline'` из `script-src`.

## Inline handlers

После первого этапа миграции в самих HTML-файлах остаются:

| Страница | `on*=` обработчики | Основные оставшиеся группы |
|---|---:|---|
| `index.html` | 36 | header, фильтры, модальная тарелка |
| `recipe.html` | 56 | header, balance UI, карусель шагов, модальные окна |
| `category.html` | 32 | header, фильтры, модальные окна |
| `cabinet.html` | 52 | профиль, оплата, журнал, настройки |
| `login.html` | 0 | страница очищена от inline handlers |
| `admin.html` | 49 | вкладки, фильтры и статические modal actions |

В `cabinet.js` остаются 8 статических обработчиков внутри шаблонов. В
`admin.js` подстановка данных в JavaScript-атрибуты удалена полностью.

До этого этапа только в шести HTML-файлах было 277 обработчиков; теперь 225.
Полный актуальный список воспроизводится командой:

```powershell
rg -n "\son[a-z]+\s*=" platform/index.html platform/recipe.html platform/category.html platform/cabinet.html platform/login.html platform/admin.html
rg -n "on(click|submit|error|change|input|keydown|mouseenter|mouseleave)=" platform/cabinet.js platform/admin.js
```

## Проверка `innerHTML`

Проверены все 158 присваиваний `innerHTML` в целевых страницах и общих
скриптах:

| Файл | Количество |
|---|---:|
| `index.html` | 29 |
| `recipe.html` | 36 |
| `category.html` | 23 |
| `login.html` | 5 |
| `cabinet.js` | 36 |
| `admin.js` | 23 |
| `data-v2.js` | 4 |
| `header-nav.js` | 2 |

Результат проверки:

- статические каркасы и SVG не принимают пользовательские данные;
- имена, отзывы, feedback, заметки, названия рецептов и категорий проходят
  через `escHtml` / `esc`, числа нормализуются через `Number`, простой текст
  записывается через `textContent`;
- avatar в кабинете теперь создаётся через `createElement` и
  `replaceChildren`, а не строкой HTML;
- текст ошибки API на входе записывается через `textContent`; тексты ошибок
  рецепта экранируются;
- строки из рецептов больше не вставляются внутрь `onclick` / `onerror`;
  действия передаются через `data-*` и обрабатываются `addEventListener`;
- URL видео разрешены только для HTTPS-хостов YouTube, VK Video и Dzen.
  Неизвестный протокол или домен не становится iframe или кликабельной
  fallback-ссылкой.

`innerHTML` остаётся техническим долгом даже в экранированных шаблонах:
ошибка в одном новом поле может снова открыть XSS. Новые компоненты следует
строить через DOM API (`textContent`, `setAttribute`, `replaceChildren`) либо
через общий безопасный renderer.

## План перехода CSP

1. Вынести четыре встроенных блока в `index-page.js`, `recipe-page.js`,
   `category-page.js`, `login.js` и подключать их с `defer`.
2. Переносить оставшиеся обработчики партиями: `login` готов; далее
   `admin`, header/drawer, фильтры, plate modal, затем сложный balance UI.
3. Для статического nginx-сайта основной вариант — внешние first-party
   скрипты. Для редкого неизбежного inline bootstrap использовать SHA-256
   hash. Nonce применять только если HTML начнёт формироваться на каждый
   запрос; постоянный nonce безопасности не даёт.
4. Сначала включить `Content-Security-Policy-Report-Only` без
   `'unsafe-inline'` в `script-src`, собрать нарушения обычных сценариев и
   исправить их.
5. После чистого отчёта включить enforced CSP. `'unsafe-inline'` в
   `style-src` убирать отдельным этапом после переноса inline styles.

Запрещено добавлять `https:` или `*`. Текущий allowlist аналитики и iframe
должен расширяться только под подтверждённый пользовательский сценарий.
