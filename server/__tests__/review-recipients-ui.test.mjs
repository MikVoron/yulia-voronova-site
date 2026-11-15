import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import vm from 'node:vm';

const context = {window:{},document:{addEventListener(){}},Auth:{getUser:()=>null}};
vm.runInNewContext(fs.readFileSync(new URL('../../platform/review-discussions.js',import.meta.url),'utf8'),context);
const { replyText } = context.window.ReviewDiscussions;

describe('review reply recipient formatting', () => {
  it('adds a bold name without modifying the original message', () => {
    const text='Спасибо!\nПопробуйте ещё раз.';
    expect(replyText({authorName:'Женя',userId:'recipient'},text,'sender'))
      .toBe('<strong class="discussion-recipient">Женя</strong>, '+text);
  });

  it.each([null,'','   ',undefined])('omits the greeting when a name is absent: %j', authorName => {
    expect(replyText({authorName,author:'Аноним'},'Спасибо!','sender')).toBe('Спасибо!');
  });

  it('uses an explicitly chosen nickname even when it equals the anonymous label', () => {
    expect(replyText({authorName:'Аноним'},'Спасибо!','sender')).toContain('>Аноним</strong>, Спасибо!');
  });

  it('omits a greeting when the reviewer adds their own follow-up', () => {
    expect(replyText({authorName:'Женя',userId:'owner'},'Дополнение','owner')).toBe('Дополнение');
  });

  it.each(['Женя, спасибо!','женя: спасибо!','Женя! Спасибо!'])('emphasizes a typed greeting without duplicating it: %s', text => {
    expect(replyText({authorName:'Женя'},text,'sender').replace(/<[^>]+>/g,'')).toBe(text);
  });

  it('escapes both nicknames and messages', () => {
    const html=replyText({authorName:'<img src=x onerror=alert(1)>'},'<script>alert(2)</script>','sender');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<script');
    expect(html).toContain('&lt;img');
    expect(html).toContain('&lt;script');
  });
});
