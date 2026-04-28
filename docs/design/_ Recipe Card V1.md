# ТЗ: Карточка рецепта (V1 — NYT-style unified card)

## Контекст
Текущие карточки в каталоге визуально разорваны: фото — отдельная карточка с тенью, заголовок/время/ккал — текст под ней на фоне страницы. Нужно объединить фото и текст в **одну цельную карточку** в стиле [NYT Cooking](https://cooking.nytimes.com/).

## Где интегрировать
- Каталог рецептов (главная, страница категории, поиск)
- Везде, где сейчас рендерится карточка рецепта в плиточном виде

---

## Визуальная структура

```
┌─────────────────────────┐
│ ┌─────────────────────┐ │  ← фото со скруглением только сверху
│ │     [фото 4:3]    🔖│ │     bookmark icon top-right
│ │                     │ │
│ └─────────────────────┘ │
│ Пшенники с яблоком      │  ← serif H3, 22px, weight 600
│ ★★★★★ 4.8 (124)         │  ← звёзды + рейтинг + (отзывы)
│ 🕐 20 мин · Лёгкая       │  ← meta inline
│ 🌿 без варки пшёнки      │  ← опциональный tip (italic, accent2)
│ ─────────────────────── │  ← border-top divider
│ КАЛОРИЙНОСТЬ    110 ккал│  ← uppercase label + большое число accent
└─────────────────────────┘
```

## Стили

```css
.recipe-card {
  background: #fff;
  border-radius: 6px;
  overflow: hidden;
  box-shadow: 0 1px 3px rgba(0,0,0,.06), 0 8px 24px rgba(26,26,26,.06);
  transition: all .2s ease;
  cursor: pointer;
  display: flex;
  flex-direction: column;
}
.recipe-card:hover {
  box-shadow: 0 1px 3px rgba(0,0,0,.08), 0 12px 32px rgba(26,26,26,.1);
  transform: translateY(-2px);
}

/* Фото */
.recipe-card__media { position: relative; aspect-ratio: 4/3; background: #eee; }
.recipe-card__img   { width: 100%; height: 100%; object-fit: cover; display: block; }
.recipe-card__bookmark {
  position: absolute; top: 10px; right: 10px;
  width: 34px; height: 34px; border-radius: 50%;
  background: rgba(255,255,255,.95);
  display: flex; align-items: center; justify-content: center;
  box-shadow: 0 2px 6px rgba(0,0,0,.15);
  border: none; cursor: pointer;
}

/* Тело */
.recipe-card__body { padding: 16px 16px 18px; display: flex; flex-direction: column; flex: 1; }

.recipe-card__title {
  font-family: 'Cormorant Garamond', Georgia, serif;
  font-size: 22px; font-weight: 600; line-height: 1.15;
  color: #1a1a1a; letter-spacing: -.005em;
  margin-bottom: 8px;
}

.recipe-card__rating {
  display: flex; align-items: center; gap: 6px;
  margin-bottom: 10px;
}
.recipe-card__rating-stars { display: flex; gap: 1px; color: #e8400a; }
.recipe-card__rating-text  { font-size: 11px; color: #8a7d6f; font-weight: 500; }

.recipe-card__meta {
  display: flex; align-items: center; gap: 10px;
  font-size: 12px; color: #3a3a3a; font-weight: 500;
  margin-bottom: 12px;
}
.recipe-card__meta-dot {
  width: 3px; height: 3px; border-radius: 50%; background: #8a7d6f;
}

.recipe-card__tip {
  font-size: 12px; color: #c2845a; font-style: italic;
  margin-bottom: 10px;
  display: flex; align-items: center; gap: 5px;
}

.recipe-card__footer {
  margin-top: auto; padding-top: 10px;
  border-top: 1px solid #e8dfd0;
  display: flex; align-items: baseline; justify-content: space-between;
}
.recipe-card__kcal-label {
  font-size: 11px; color: #8a7d6f; font-weight: 600;
  letter-spacing: .08em; text-transform: uppercase;
}
.recipe-card__kcal-value {
  font-size: 18px; font-weight: 700; color: #e8400a;
}
.recipe-card__kcal-value small {
  font-size: 11px; font-weight: 600; color: #3a3a3a;
}
```

## HTML-разметка

```html
<article class="recipe-card" data-recipe-id="123">
  <div class="recipe-card__media">
    <img class="recipe-card__img" src="/img/recipe.jpg" alt="Пшенники с яблоком" loading="lazy">
    <button class="recipe-card__bookmark" aria-label="В избранное">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#1a1a1a" stroke-width="2" stroke-linejoin="round">
        <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
      </svg>
    </button>
  </div>
  <div class="recipe-card__body">
    <h3 class="recipe-card__title">Пшенники с яблоком</h3>

    <div class="recipe-card__rating">
      <span class="recipe-card__rating-stars">
        <!-- 5 SVG звёзд, заполненных по rating -->
      </span>
      <span class="recipe-card__rating-text">4.8 (124)</span>
    </div>

    <div class="recipe-card__meta">
      <span><svg .../> 20 мин</span>
      <span class="recipe-card__meta-dot"></span>
      <span>Лёгкая</span>
    </div>

    <div class="recipe-card__tip">🌿 без варки пшёнки</div>

    <div class="recipe-card__footer">
      <span class="recipe-card__kcal-label">калорийность</span>
      <span class="recipe-card__kcal-value">110 <small>ккал</small></span>
    </div>
  </div>
</article>
```

## Звёздочки (helper)
```js
function renderStars(rating) {
  const rounded = Math.round(rating);
  return Array.from({length: 5}, (_, i) => i < rounded
    ? '<svg width="11" height="11" viewBox="0 0 24 24" fill="#e8400a" stroke="#e8400a" stroke-width="2"><polygon points="12 2 15 9 22 10 17 15 18 22 12 18 6 22 7 15 2 10 9 9 12 2"/></svg>'
    : '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#e8400a" stroke-width="2"><polygon points="12 2 15 9 22 10 17 15 18 22 12 18 6 22 7 15 2 10 9 9 12 2"/></svg>'
  ).join('');
}
```

## Иконки SVG (inline)
- **Bookmark**: `<path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>`
- **Clock**: `<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>`
- **Star**: `<polygon points="12 2 15 9 22 10 17 15 18 22 12 18 6 22 7 15 2 10 9 9 12 2"/>`

## Сетка каталога
```css
.recipe-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 20px;
}
@media (max-width: 1024px) { .recipe-grid { grid-template-columns: repeat(3, 1fr); } }
@media (max-width: 768px)  { .recipe-grid { grid-template-columns: repeat(2, 1fr); gap: 14px; } }
@media (max-width: 480px)  { .recipe-grid { grid-template-columns: 1fr; } }
```

## Шрифты
В `<head>` уже должен быть подключён Cormorant Garamond:
```html
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600&display=swap" rel="stylesheet">
```

## Данные карточки (модель)
```ts
{
  id: number,
  title: string,
  img: string,            // 4:3 предпочтительно, минимум 800×600
  time: string,           // "20 мин"
  difficulty: string,     // "Лёгкая" | "Средняя" | "Сложная"
  kcal: number,           // 110
  tip?: string,           // "без варки пшёнки" — опционально
  rating: number,         // 4.8
  reviews: number,        // 124
  isBookmarked: boolean,
}
```

## Поведение
- Клик по карточке (кроме кнопки bookmark) → переход на страницу рецепта
- Клик по bookmark → toggle избранного, иконка заполняется (`fill="#1a1a1a"`)
- Hover → лёгкое поднятие (translateY -2px) + усиленная тень

## Что НЕ переносим из старой карточки
- ❌ Pill-кнопка «💬 Отзыв» внизу фото (отзывы видны через рейтинг)
- ❌ Декоративная плашка «звезда + чёрточка» в углу фото
- ❌ Серый фон-разделитель между фото и текстом

## Что меняем по сравнению с текущей версией
| Было | Стало |
|---|---|
| Фото и текст — отдельные блоки | Одна карточка, общая тень и фон |
| Sans-serif заголовок | **Serif** заголовок (Cormorant Garamond) |
| Декоративная звезда без числа | **Реальный рейтинг**: 5 звёзд + 4.8 (124) |
| Время и сложность как отдельные пилюли | Inline meta-строка с разделителем-точкой |
| «110 ккал» обычным текстом | Подвал-разделитель с uppercase-меткой и крупным числом |

## Эталоны
- `Recipe Card Variants.html` (артборд V1) — живой прототип
- https://cooking.nytimes.com/ — стилистика-референс

## Файлы для изменения
- `recipe-card.html` или соответствующий компонент карточки
- `style-v4.css` — добавить блок `.recipe-card` (или вынести в отдельный файл)
- Шаблон рендеринга списка рецептов в каталоге
