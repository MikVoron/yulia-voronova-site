const test = require('node:test');
const assert = require('node:assert/strict');
const { parseTelegramPosts } = require('../update-blog');

function message(number, text, classes = 'tgme_widget_message js-widget_message') {
    return `<div class="tgme_widget_message_wrap"><div class="${classes}" data-post="voronova_nutrition/${number}"><div class="tgme_widget_message_text js-message_text">${text}</div></div></div>`;
}

test('excludes actual pin and contact formats, then fills all six cards with older content', () => {
    const contact = 'Для связи со мной нажмите кнопку «Написать» 👇';
    const pinned = '<a class="tgme_widget_message_author_name">Юлия Воронова|Еда и Здоровье</a> pinned «<span class="tgme_widget_service_strong_text">' + contact + '</span>»';
    const html = Array.from({ length: 6 }, (_, index) => message(358 + index, `Содержательная статья ${index}`)).join('')
        + message(364, contact)
        + message(365, pinned, 'tgme_widget_message text_not_supported_wrap service_message user-color-16 js-widget_message');
    assert.deepEqual(parseTelegramPosts(html).map(post => post.postNumber), [363, 362, 361, 360, 359, 358]);
});

test('preserves articles with contact text or pin instructions and continues excluding old service formats', () => {
    const html = message(367, 'Channel photo updated')
        + message(366, 'Channel name was changed to Юлия Воронова')
        + message(365, 'Для связи со мной нажмите кнопку "Написать". 👇')
        + message(364, 'Как закрепить пост (pinned) в канале<br>Полезная инструкция для читателей.')
        + message(363, 'Полезная статья о питании<br>Для связи со мной нажмите кнопку «Написать» 👇');
    assert.deepEqual(parseTelegramPosts(html).map(post => post.postNumber), [364, 363]);
});
