const { test } = require('node:test');
const assert = require('node:assert');
const config = require('../js/config.js');
const st = require('../js/meta/storage.js');

function fakeWx() {
  const map = new Map();
  return {
    getStorageSync: (k) => map.get(k),
    setStorageSync: (k, v) => { map.set(k, v); },
  };
}

test('默认存档：30 球空图鉴', () => {
  const s = st.createStorage(fakeWx(), config).load();
  assert.strictEqual(s.v, 1);
  assert.strictEqual(s.balls, 30);
  assert.deepStrictEqual(s.dex, {});
  assert.deepStrictEqual(s.stats, { throws: 0, hits: 0, catches: 0 });
});

test('save 后 load 还原', () => {
  const wxLike = fakeWx();
  const store = st.createStorage(wxLike, config);
  const s = store.load();
  s.dex.slime = { caught: 3, firstAt: 1 };
  store.save(s);
  assert.deepStrictEqual(store.load().dex.slime, { caught: 3, firstAt: 1 });
});

test('migrate：脏数据/未来版本 → null（回默认档）', () => {
  assert.strictEqual(st.migrate(null), null);
  assert.strictEqual(st.migrate('garbage'), null);
  assert.strictEqual(st.migrate({ v: 999 }), null);
});

test('migrate：v1 原样通过', () => {
  const raw = { v: 1, balls: 5, dex: {}, stats: {}, lastDailyShare: null };
  assert.strictEqual(st.migrate(raw), raw);
});
