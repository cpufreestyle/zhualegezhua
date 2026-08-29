const KEY = 'zlgz_save_v1';
const VERSION = 1;

function defaultState(config) {
  return {
    v: VERSION,
    balls: config.economy.startBalls,
    dex: {},
    stats: { throws: 0, hits: 0, catches: 0 },
    lastDailyShare: null,
  };
}
// 纯函数：非法/未来版本返回 null，调用方回退默认档；未来加字段在此补迁移步骤
function migrate(raw) {
  if (!raw || typeof raw !== 'object' || raw.v !== VERSION) return null;
  return raw;
}
function createStorage(wxLike, config) {
  return {
    load() { return migrate(wxLike.getStorageSync(KEY)) || defaultState(config); },
    save(state) { wxLike.setStorageSync(KEY, state); },
  };
}
module.exports = { KEY, VERSION, defaultState, migrate, createStorage };
