document.addEventListener('DOMContentLoaded', () => {


  // === Общая функция обновления слайдера ===
  function initSlider(id, displayId, states) {
    const range = document.getElementById(id);
    const display = document.getElementById(displayId);

    if (!range || !display) return;

    const update = (value) => {
      const numeric = parseInt(value);
      const percent = ((numeric - parseInt(range.min)) /
                      (parseInt(range.max) - parseInt(range.min))) * 100;

      const state = states[numeric];
      if (state) {
        range.style.background = `linear-gradient(to right, ${state.color} ${percent}%, #ccc ${percent}%)`;
        display.textContent = state.text;
        display.style.color = state.color;
        display.style.backgroundColor = 'transparent';
      }
    };

    update(range.value);
    range.addEventListener('input', e => update(e.target.value));
  }

  // === Инициализация слайдеров ===
  initSlider('stress-level', 'valueDisplay', {
    1: { text: "Минимальный уровень стресса", color: "#74c69d" },
    2: { text: "Низкий стресс", color: "#a5c974" },
    3: { text: "Умеренный стресс", color: "#f5c542" },
    4: { text: "Высокий стресс", color: "#f28e2b" },
    5: { text: "Постоянный ежедневный стресс", color: "#e76f51" }
  });

  initSlider('energy-level', 'energyDisplay', {
    1: { text: 'Низкий — вообще нет энергии', color: '#e76f51' },
    2: { text: 'Пониженный — энергии хватает на пару часов', color: '#f28482' },
    3: { text: 'Средний — энергии хватает на половину дня', color: '#f5c542' },
    4: { text: 'Повышенный — начинаю уставать ближе к вечеру', color: '#a8dadc' },
    5: { text: 'Высокий — энергии хватает на весь день', color: '#74c69d' }
  });

  initSlider('activity-level', 'activityDisplay', {
    1: { text: 'Малоподвижный — преимущественно сидячий образ жизни', color: '#e76f51' },
    2: { text: 'Умеренная активность — немного движения', color: '#f28482' },
    3: { text: 'Средняя активность — сбалансированный ритм', color: '#f5c542' },
    4: { text: 'Активный — регулярные занятия спортом', color: '#a8dadc' },
    5: { text: 'Высокоактивный — интенсивные нагрузки и движение', color: '#74c69d' }
  });
});
