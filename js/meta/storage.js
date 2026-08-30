const KEY = 'zlgz_save_v1';
const VERSION = 2;

function defaultState(config) {
  return {
    v: VERSION,
    balls: config.economy.startBalls,
    masterBalls: 0,
    donutBalls: 0,
    dex: {},
    stats: { throws: 0, hits: 0, catches: 0, excellentHits: 0, shares: 0 },
    lastDailyShare: null,
    dailyDate: null,
    dailyProgress: {},
    dailyClaimed: {},
    refBonusClaimed: false,
  };
}
// 纯函数：非法/未来版本返回 null；v1 → v2 阶梯补字段（未来 v3 在此加下一档）
function migrate(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (raw.v === 2) return raw;
  if (raw.v === 1) {
    return {
      ...raw,
      v: 2,
      masterBalls: 0,
      donutBalls: 0,
      stats: { throws: 0, hits: 0, catches: 0, excellentHits: 0, shares: 0, ...raw.stats },
      dailyDate: null,
      dailyProgress: {},
      dailyClaimed: {},
      refBonusClaimed: false,
    };
  }
  return null; // v3+ 未来版本不降级，回默认档
}
function createStorage(wxLike, config) {
  return {
    load() { return migrate(wxLike.getStorageSync(KEY)) || defaultState(config); },
    save(state) { wxLike.setStorageSync(KEY, state); },
  };
}
module.exports = { KEY, VERSION, defaultState, migrate, createStorage };
