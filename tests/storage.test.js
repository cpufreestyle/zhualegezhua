const { test } = require('node:test');
const assert = require('node:assert');
const config = require('../js/config.js');
const st = require('../js/meta/storage.js');

function fakeWx() {
  const map = new Map();
  return {
    getStorageSync: (k) => map.get(k),
    setStorageSync: (k, v) => { map.set(k, JSON.parse(JSON.stringify(v))); },
  };
}

test('默认存档：30 球空图鉴', () => {
  const s = st.createStorage(fakeWx(), config).load();
  assert.strictEqual(s.v, 2);
  assert.strictEqual(s.balls, 30);
  assert.deepStrictEqual(s.dex, {});
  assert.deepStrictEqual(s.stats, { throws: 0, hits: 0, catches: 0, excellentHits: 0, shares: 0 });
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

const V1_SAVE = {
  v: 1, balls: 42,
  dex: { slime: { caught: 3, firstAt: 1 } },
  stats: { throws: 10, hits: 5, catches: 2 },
  lastDailyShare: null,
};

test('migrate：v1 → v2 补全新字段且保留老数据', () => {
  const m = st.migrate(V1_SAVE);
  assert.strictEqual(m.v, 2);
  assert.strictEqual(m.balls, 42);
  assert.deepStrictEqual(m.dex.slime, { caught: 3, firstAt: 1 });
  assert.deepStrictEqual(m.stats, { throws: 10, hits: 5, catches: 2, excellentHits: 0, shares: 0 });
  assert.strictEqual(m.masterBalls, 0);
  assert.strictEqual(m.donutBalls, 0);
  assert.strictEqual(m.dailyDate, null);
  assert.deepStrictEqual(m.dailyProgress, {});
  assert.deepStrictEqual(m.dailyClaimed, {});
  assert.strictEqual(m.refBonusClaimed, false);
});

test('migrate：v2 原样通过（幂等）', () => {
  const raw = st.migrate(V1_SAVE);
  assert.strictEqual(st.migrate(raw), raw);
});

test('defaultState：v2 新档含全部新字段', () => {
  const s = st.defaultState(config);
  assert.strictEqual(s.v, 2);
  assert.strictEqual(s.masterBalls, 0);
  assert.strictEqual(s.donutBalls, 0);
  assert.deepStrictEqual(s.stats, { throws: 0, hits: 0, catches: 0, excellentHits: 0, shares: 0 });
  assert.strictEqual(s.refBonusClaimed, false);
});

test('migrate：v3（未来版本）→ null 回默认档', () => {
  assert.strictEqual(st.migrate({ v: 3 }), null);
});
