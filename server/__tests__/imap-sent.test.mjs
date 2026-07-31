import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'module';
import { EventEmitter } from 'events';

const require = createRequire(import.meta.url);
const path = require('path');
const Module = require('module');
const sockets = [];
const connect = vi.fn();
let appendSentCopy;

function registerMock(moduleName, exports) {
  const resolved = require.resolve(moduleName);
  const mod = new Module(resolved);
  mod.exports = exports;
  mod.loaded = true;
  require.cache[resolved] = mod;
}

function makeSocket() {
  const socket = new EventEmitter();
  const writes = [];
  let rawWritten = false;
  socket.setTimeout = vi.fn();
  socket.end = vi.fn();
  socket.destroy = vi.fn();
  socket.write = (value) => {
    writes.push(value);
    const text = Buffer.isBuffer(value) ? '' : value;
    if (text.startsWith('A001 LOGIN')) process.nextTick(() => socket.emit('data', 'A001 OK logged in\r\n'));
    if (text.startsWith('A002 APPEND')) process.nextTick(() => socket.emit('data', '+ ready for literal\r\n'));
    if (Buffer.isBuffer(value)) rawWritten = true;
    if (rawWritten && text === '\r\n') process.nextTick(() => socket.emit('data', 'A002 OK appended\r\n'));
    if (text.startsWith('A003 LOGOUT')) process.nextTick(() => socket.emit('data', 'A003 OK logged out\r\n'));
  };
  process.nextTick(() => {
    socket.emit('secureConnect');
    socket.emit('data', '* OK IMAP ready\r\n');
  });
  sockets.push({ socket, writes });
  return socket;
}

beforeAll(() => {
  registerMock('tls', { connect });
  const modulePath = path.resolve(import.meta.dirname, '..', 'src', 'imap-sent.js');
  delete require.cache[require.resolve(modulePath)];
  appendSentCopy = require(modulePath).appendSentCopy;
});

beforeEach(() => {
  connect.mockClear();
  sockets.length = 0;
  process.env.IMAP_HOST = 'imap.example.test';
  process.env.IMAP_PORT = '993';
  process.env.IMAP_YULIA_USER = 'yulia@example.test';
  process.env.IMAP_YULIA_PASS = 'correct-horse-battery-staple';
  process.env.IMAP_YULIA_SENT_MAILBOX = 'Sent';
  connect.mockImplementation(() => makeSocket());
});

describe('IMAP sent copy', () => {
  it('appends a seen copy to the selected mailbox after SMTP delivery', async () => {
    const result = await appendSentCopy('yulia', Buffer.from('Subject: Test\r\n\r\nBody', 'utf8'));

    expect(result).toEqual({ saved: true });
    expect(connect).toHaveBeenCalledWith(expect.objectContaining({
      host: 'imap.example.test', port: 993, rejectUnauthorized: true
    }));
    expect(sockets[0].writes[0]).toContain('A001 LOGIN "yulia@example.test"');
    expect(sockets[0].writes[1]).toContain('A002 APPEND "Sent" (\\Seen) {21}');
    expect(sockets[0].writes.some(Buffer.isBuffer)).toBe(true);
    expect(sockets[0].socket.end).toHaveBeenCalled();
  });
});
