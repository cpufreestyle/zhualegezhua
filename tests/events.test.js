const { test } = require('node:test');
const assert = require('node:assert');
const { createBus } = require('../js/core/events.js');

test('on/emit 传递 payload', () => {
  const bus = createBus();
  let got = null;
  bus.on('hit', (p) => { got = p; });
  bus.emit('hit', { x: 1 });
  assert.deepStrictEqual(got, { x: 1 });
});

test('off 后不再收到', () => {
  const bus = createBus();
  let n = 0;
  const off = bus.on('e', () => { n += 1; });
  off();
  bus.emit('e');
  assert.strictEqual(n, 0);
});

test('emit 时移除监听不影响本次广播（快照）', () => {
  const bus = createBus();
  const seen = [];
  bus.on('e', () => seen.push('a'));
  bus.on('e', () => { seen.push('b'); bus.off('e', () => seen.push('c')); });
  bus.on('e', () => seen.push('c'));
  bus.emit('e');
  assert.deepStrictEqual(seen, ['a', 'b', 'c']);
});
