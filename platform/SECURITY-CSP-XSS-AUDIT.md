# CSP и остаточный XSS-аудит SmartPlate

Дата проверки: 2026-06-27. CSP-миграция обновлена 2026-07-13.

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

13 июля все исполняемые inline `<script>` вынесены во внешние first-party
файлы без изменения порядка выполнения: `index-bootstrap.js`, `index-page.js`,
`recipe-page.js`, `category-page.js`, `ingredient-page.js` и `login.js`. В целевых HTML-файлах
исполняемых inline script-блоков больше нет.

Дополнительная проверка всей production-папки выявила и закрыла inline-блоки
в `auth-callback.html`, `recipe-editor.html` и `popup-preview.html`. Для них
добавлены `auth-callback.js`, `recipe-editor-access-level.js`,
`recipe-editor.js` и `popup-preview.js`. Поиск по всем `platform/*.html`
теперь не находит исполняемых `<script>` без `src`.

Enforced CSP использует `script-src-elem 'self'`, поэтому новый inline
`<script>` блокируется в CSP3-браузерах. Атрибуты-обработчики временно
разрешены отдельным `script-src-attr 'unsafe-inline'`. Параллельно включена
`Content-Security-Policy-Report-Only` с `script-src-attr 'none'`: она показывает
оставшиеся обработчики, но не ломает production до окончания миграции.

| Страница | Встроенные `<script>` | Внешние first-party scripts |
|---|---:|---:|
| `index.html` | 0 | 6 |
| `recipe.html` | 0 | 5 |
| `category.html` | 0 | 5 |
| `ingredient.html` | 0 | 5 |
| `cabinet.html` | 0 | 5 |
| `login.html` | 0 | 3 |
| `admin.html` | 0 | 2 |

В основных пользовательских страницах встроенных script-блоков больше нет.
Полностью удалить fallback `'unsafe-inline'` пока не позволяют HTML-
обработчики и поддержка старых браузеров без `script-src-attr`.

## Inline handlers

После следующих production-партий `admin.html`, `popup-preview.html` и общей
навигации пяти основных страниц
полностью очищены от event attributes. Авторизованный smoke админки проверил
все девять вкладок, фильтры и безопасные modal actions; публичный smoke preview
проверил toast, paywall toast и закрытие modal через кнопку, backdrop и Escape.
В обоих тестах нет enforced CSP violations, JavaScript-ошибок и неуспешных
HTTP-ответов.

Общие burger/drawer, plate launchers, profile и logout controls перенесены в
`header-nav.js`. Авторизованный mobile smoke на `index`, `category`,
`ingredient`, `recipe` и `cabinet` подтвердил открытие/закрытие drawer и plate
modal без CSP-, JavaScript- и HTTP-ошибок.

36 видимых filter-actions на `index` и `category` перенесены в page scripts.
Production-smoke проверил time, difficulty, tag, popular, раскрытие
дополнительных фильтров и сброс. На `ingredient` удалены семь невидимых
footer-dropdown без существующих owner-кнопок; они не были частью доступного
интерфейса и могли выбрасывать исключение при программном вызове.

15 статических plate/comments modal controls перенесены в page scripts на
`index`, `category`, `ingredient`, `recipe` и `cabinet`. Авторизованный
production-smoke подтвердил открытие plate и закрытие кнопкой/backdrop на всех
пяти страницах, а также оба способа закрытия comments на `category` и
`ingredient`; ошибок CSP, JavaScript и HTTP нет.

Последние три статических обработчика `index.html` — сворачивание и повторное
открытие гостевого тура, а также отправка hero search — перенесены в
`index-page.js`. Desktop/mobile production-smoke подтвердил оба состояния тура,
возврат фокуса на кнопку повторного открытия и переход поиска на
`category.html`; CSP- и JavaScript-ошибок, а также горизонтального overflow нет.
Один `onclick` кнопки новостей появляется только из известного JS-шаблона и
учтён в отдельном остатке JavaScript ниже.

Все 16 статических event attributes `recipe.html` перенесены в
`recipe-page.js`: mini balance status, back-to-top, добавление в тарелку,
balance/guest modals и grocery modal. Desktop/mobile production-smoke
подтвердил мышь и клавиатуру, гостевой prompt, прокрутку и grocery controls;
enforced CSP- и JavaScript-ошибок, а также горизонтального overflow нет.

Все 19 статических controls `recipe-editor.html` перенесены в
`recipe-editor.js`, включая составное действие nutrition panel и четыре группы
добавок. Изолированный production frontend-smoke без API-записей подтвердил
каждый listener-маршрут, slug, AI-panel, добавление ингредиента/шага/добавок,
preview и success modal; enforced CSP- и JavaScript-ошибок нет.

Все 42 event attributes `cabinet.html` перенесены в существующий
`data-cabinet-action` dispatcher и прямые field listeners. Изолированный
production frontend-smoke без реальных платежей и API-записей подтвердил
profile, payment wizard, history export, feedback, dietary и newsletter
маршруты; enforced CSP- и JavaScript-ошибок нет. Наблюдаемый в живом DOM
`onclick` кнопки продления создаётся JS-шаблоном и учтён в остатке ниже.

Статические production HTML-файлы теперь очищены:

| Страница | `on*=` обработчики | Основные оставшиеся группы |
|---|---:|---|
| `index.html` | 0 | статические handlers полностью перенесены |
| `recipe.html` | 0 | статические handlers полностью перенесены |
| `category.html` | 0 | статические handlers полностью перенесены |
| `ingredient.html` | 0 | статические handlers полностью перенесены |
| `recipe-editor.html` | 0 | статические handlers полностью перенесены |
| `cabinet.html` | 0 | статические handlers полностью перенесены |
| `login.html` | 0 | страница очищена от inline handlers |
| `admin.html` | 0 | 50 статических controls перенесены в `admin.js` |
| `popup-preview.html` | 0 | 11 preview actions перенесены в `popup-preview.js` |

В JavaScript-шаблонах остаётся 90 обработчиков: `recipe-page.js` — 39,
`ingredient-page.js` — 20, `cabinet.js` и `index-page.js` — по 9,
`category-page.js` — 6, `recipe-editor.js` — 5 и `data-v2.js` — 2.
В `header-nav.js` и `admin.js` подстановка данных в JavaScript-атрибуты
удалена полностью.

В production HTML обработчиков не осталось; 90 всё ещё создаётся
JS-шаблонами.
Полный актуальный список воспроизводится командой:

```powershell
rg -n "\son[a-z]+\s*=" platform -g "*.html" -g "*.js"
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

1. ✅ Вынести встроенные блоки в first-party JS без изменения порядка
   выполнения. Выполнено 13 июля для `index`, `recipe`, `category`,
   `ingredient`, `login`.
2. Переносить оставшиеся обработчики партиями: `login`, `admin`,
   `popup-preview`, общие header/drawer controls и статические фильтры готовы;
   статические plate/comments modal controls и `index.html` также готовы;
   `recipe.html`, `recipe-editor.html` и `cabinet.html` также готовы; далее
   обработчики JS-шаблонов.
3. Для статического nginx-сайта основной вариант — внешние first-party
   скрипты. Для редкого неизбежного inline bootstrap использовать SHA-256
   hash. Nonce применять только если HTML начнёт формироваться на каждый
   запрос; постоянный nonce безопасности не даёт.
4. ✅ Включить `Content-Security-Policy-Report-Only` без
   `'unsafe-inline'` в `script-src` и с `script-src-attr 'none'`. Включено в
   production 13 июля. Desktop/mobile smoke основных страниц прошёл без
   JavaScript-ошибок; CSP-лог содержит только ожидаемые Report-Only нарушения
   от ещё не перенесённых event attributes, блокировок внешних scripts нет.
5. После чистого отчёта включить enforced CSP. `'unsafe-inline'` в
   `style-src` убирать отдельным этапом после переноса inline styles.

Запрещено добавлять `https:` или `*`. Текущий allowlist аналитики и iframe
должен расширяться только под подтверждённый пользовательский сценарий.
