// game.js — 入口
const config = require('./js/config.js');
const { createThree } = require('./js/render/three_adapter.js');
const { createARContext } = require('./js/ar/ar_context.js');
const { createCreature, CREATURES, byId } = require('./js/render/creatures.js');
const { updateFades, prefetchCreatures, disposeCreature } = require('./js/render/gltf_loader.js');
const { createAimRing } = require('./js/render/aim_ring.js');
const { createBus } = require('./js/core/events.js');
const { rollEncounter } = require('./js/meta/spawn.js');
const { createRuntime, reactToFailedCapture } = require('./js/game/creature_ai.js');
const { createThrowSystem } = require('./js/game/throw_system.js');
const { rollCapture } = require('./js/game/catch_resolver.js');
const eco = require('./js/meta/economy.js');
const { createStorage } = require('./js/meta/storage.js');
const { createScreens } = require('./js/ui/screens.js');
const { createEffects } = require('./js/ui/effects.js');

const info = wx.getSystemInfoSync();
const pixelRatio = Math.min(2, info.pixelRatio); // 性能：钳制
const canvas = wx.createCanvas();
canvas.width = info.windowWidth * pixelRatio;
canvas.height = info.windowHeight * pixelRatio;

const { THREE, renderer, scene, camera } = createThree(canvas);
const bus = createBus();
const store = createStorage(wx, config);
let save = store.load();
const ballsMeta = require('./js/meta/balls.js');
const daily = require('./js/meta/daily.js'); // 每日任务：结算页任务区 + 领取
const nowIso = () => new Date().toISOString(); // 今日 ISO：任务进度/领取共用时间基准
const { createPhoto, applyRefBonus } = require('./js/ui/photo.js'); // 捕捉瞬间截图合成 + 分享 + ref 裂变判定
const photo = createPhoto({ canvas }); // canvas 顶部已创建，依赖就绪
try {
  const ref = applyRefBonus(save, wx.getLaunchOptionsSync && wx.getLaunchOptionsSync().query, config, ballsMeta.grantBalls);
  if (ref.granted) {
    save = ref.state;
    store.save(save);
    wx.showToast && wx.showToast({ title: '新手礼 +10 球', icon: 'none' });
  }
} catch (e) { /* 老环境无 getLaunchOptionsSync：跳过 */ }
let selectedBall = 'normal'; // 局内当前球种（HUD 切换，Task 6 提供按钮）
let lastReason = '';     // 结算原因缓存：任务领取后重绘结算页需复用
let lastCaughtName = ''; // 最近捕获精灵名：Task 7 捕捉瞬间浮层用
let creatures = [];      // [{data, obj, ai, radius}]
let roundOver = false;
let waveSpawned = false;
let screenState = 'start'; // 'start' | 'dex' | 'play' | 'result'
let caughtThisRound = 0;   // 本局捕捉数：结算文案判定"全清"
let fledThisRound = 0;     // 本局逃跑数：结算文案判定"跑光"
let loopGen = 0;           // AR 会话代际：旧会话回调凭 gen 失配自愈失效
let currentMode = null;
let ar = null;             // 每局/每次回前台新建（ar.stop 永久失效，不可复用）
let scanFallback = false;  // 扫描二次超时后本局强制经典模式（开局重置，下一局重试 VK）
let scanStartedAt = 0;     // VK 会话开始时刻：看门狗计时基准，0 = 看门狗停表
let scanToastShown = false; // 首次超时提示只弹一次
const screens = createScreens({ THREE, bus, config, canvas });
const effects = createEffects(THREE, scene);
const aimRing = createAimRing(THREE, scene);
const thrower = createThrowSystem({ THREE, scene, camera, canvas, config, bus });
const cameraWorld = new THREE.Vector3();

function anchorCenter() {
  if (ar.mode === 'vk') {
    const anchor = ar.getPlaneAnchor();
    if (!anchor) return null; // 平面还没锁定
    const p = new THREE.Vector3();
    new THREE.Matrix4().fromArray(anchor.transform).decompose(p, new THREE.Quaternion(), new THREE.Vector3());
    ar.setTracking(false); // 锚已锁：停锚点矩阵更新
    return p;
  }
  return ar.getSpawnCenter();
}

function spawnWave() {
  creatures.forEach((c) => { disposeCreature(c.obj); scene.remove(c.obj); }); // 先回收 GLB GPU 资源再移除
  creatures = [];
  const center = anchorCenter();
  if (!center) return;
  thrower.setGroundY(center.y + 0.02);
  rollEncounter(CREATURES, Math.random, config).forEach((data) => {
    const home = {
      x: center.x + (Math.random() - 0.5) * 0.6,
      y: center.y,
      z: center.z + (Math.random() - 0.5) * 0.6,
    };
    const obj = createCreature(THREE, scene, data, home);
    const ai = createRuntime(data, { x: home.x, y: home.y, z: home.z }, Math.random, config);
    creatures.push({ data, obj, ai, radius: 0.22 });
  });
  waveSpawned = true;
}

function startARSession() { // 每次进对局/回前台都开全新会话：旧会话已被 stop 永久关闭
  loopGen += 1;
  const gen = loopGen; // 捕获代际：被更新的会话顶掉后旧回调立即作废
  ar = createARContext({ canvas, THREE, renderer, scene, camera, scanTimeoutMs: config.planes.scanTimeoutMs, preferGyro: scanFallback });
  ar.start().then(({ mode, reason }) => {
    currentMode = mode;
    if (mode === 'vk') { scanStartedAt = Date.now(); scanToastShown = false; } else { scanStartedAt = 0; } // 看门狗只盯 VK 会话
    screens.setCornerLabel(mode === 'gyro' ? '经典模式' : ''); // 右上角标识：经典模式常驻，VK 擦除
    if (mode === 'gyro' && reason && reason.indexOf('VK 启动失败') === 0) { // VK 报错多为相机权限被拒：引导去设置开启
      wx.showModal && wx.showModal({
        title: '摄像头权限',
        content: '需要摄像头权限才能开启 AR 模式，可在设置中开启',
        confirmText: '去设置',
        success: (r) => { if (r.confirm && wx.openSetting) wx.openSetting({}); },
      });
    }
    let lastT = Date.now();
    let acc = 0;
    const frameMs = 1000 / config.fpsCap; // FPS 上限：rAF 回调约 60Hz，不足一帧则跳过（小游戏画布保留上帧）
    ar.loop(() => {
      if (gen !== loopGen) return; // 旧会话遗留回调：直接吞掉
      const now = Date.now();
      acc += Math.min(100, now - lastT); // 巨帧钳到 100ms（切后台恢复等）
      lastT = now;
      if (acc < frameMs) return; // FPS 上限：不足一个渲染周期直接跳过
      const dtMs = Math.min(100, acc); // 本帧推进量 = 距上次“渲染帧”的累计时长
      acc = 0;

      // 扫描看门狗：VK 迟迟锁不到平面 → 先提示换环境，二次超时本局降级经典模式
      if (currentMode === 'vk' && scanStartedAt) {
        if (ar.getPlaneAnchor()) {
          scanStartedAt = 0; // 锚已锁定：看门狗停表（spawnWave 可能因精灵残留不跑，这里直查锚）
        } else {
          const elapsed = Date.now() - scanStartedAt;
          if (elapsed >= config.planes.scanTimeoutMs + config.planes.secondTimeoutMs && !scanFallback) {
            scanFallback = true; // 二次超时：下次 startARSession 以 preferGyro 强制经典模式
            ar.stop();
            loopGen += 1;
            startARSession();
            return;
          } else if (elapsed >= config.planes.scanTimeoutMs && !scanToastShown) {
            scanToastShown = true;
            wx.showToast && wx.showToast({ title: '换个亮一点的桌面试试', icon: 'none' });
          }
        }
      }

      if (creatures.length === 0 && !roundOver && screens.state !== 'moment') spawnWave(); // moment 门控同步封 spawnWave：最后一击后浮层展示期间不得偷生新波（否则结算页永远不来）

      // AI：内部维护位置，回调直接写 mesh
      creatures.forEach((c) => c.ai.update(dtMs, (p) => { c.obj.position.x = p.x; c.obj.position.z = p.z; }));

      // 目标：离相机最近的精灵
      let best = null;
      if (creatures.length) {
        cameraWorld.setFromMatrixPosition(camera.matrixWorld);
        let bd = 1e9;
        creatures.forEach((c) => {
          const d = c.obj.position.distanceToSquared(cameraWorld);
          if (d < bd) { bd = d; best = c; }
        });
      }
      thrower.setTarget(best);
      aimRing.update(camera, best && screenState === 'play' ? best.obj : null, Date.now() - thrower.getAimStartAt(), config, thrower.hasBallInFlight()); // 瞄准圈与判定共用同一时钟/半径

      thrower.update(dtMs);
      effects.update(dtMs);
      updateFades(dtMs); // GLB 换模后的淡入推进

      if (!roundOver && waveSpawned && screens.state !== 'moment' && (creatures.length === 0 || (!ballsMeta.hasAnyBall(save) && !thrower.hasBallInFlight()))) {
        // screens.state==='moment' 门控：最后一击的捕捉浮层至少完整展示一轮（用户可点分享），结算页延迟到浮层关闭后
        roundOver = true;
        bus.emit('round:end', { reason: creatures.length === 0 ? (fledThisRound === 0 ? 'cleared' : 'fled') : 'balls' });
      }

      const frame = ar.renderFrame();
      if (currentMode === 'vk' && frame) renderer.autoClearColor = false; // 相机底图已画，不清屏
      renderer.render(scene, camera);
      renderer.state.setCullFace(THREE.CullFaceNone); // 官方 demo 同款：背景 quad 不参与背面剔除

      renderer.autoClearColor = false; // HUD 透叠在 3D 上：第二次渲染禁止清色（gyro renderFrame 已置 true）
      renderer.render(screens.scene2, screens.cam2);
    });
  });
}

let menuLast = Date.now();
function menuLoop() { // 菜单/结算页渲染循环：3D 静态底 + HUD 透叠，进对局后自停（保持不封顶：渲染极廉价）
  const now = Date.now();
  updateFades(Math.min(100, now - menuLast)); // 结算页仍可能有未完成的模型淡入
  menuLast = now;
  if (screenState === 'play') return;
  renderer.autoClearColor = true;
  renderer.render(scene, camera);
  renderer.autoClearColor = false; // HUD pass 不清色，保住 3D 底
  renderer.render(screens.scene2, screens.cam2);
  canvas.requestAnimationFrame(menuLoop);
}

bus.on('ball:thrown', () => {
  const r = ballsMeta.spendBall(save, selectedBall);
  if (!r.ok) { thrower.cancelBall(); return; } // 扣球失败撤回已生成的球（球先出后扣失败 = 免费投掷）
  save = r.state;
  save.stats.throws += 1;
  // 隐藏彩蛋：累计每 10 次出手 +1 甜甜圈球
  const egg = ballsMeta.donutEasterEgg(save, save.stats.throws);
  if (egg.granted) {
    save = egg.state;
    wx.showToast && wx.showToast({ title: '🍩 出手彩蛋 +1 甜甜圈球', icon: 'none' });
  }
  store.save(save);
  bus.emit('hud:refresh');
});

bus.on('ball:creature', ({ creature, id, zone }) => {
  if (!creatures.includes(creature)) return; // 已被捕获/逃跑的引用忽略
  const c = creature;
  save.stats.hits += 1;
  const caught = rollCapture(c.data, zone, Math.random, config, selectedBall);
  if (caught) {
    const isNew = !save.dex[id];
    save.dex[id] = { caught: (save.dex[id] ? save.dex[id].caught : 0) + 1, firstAt: Date.now() };
    save.stats.catches += 1;
    caughtThisRound += 1; // 结算文案用：区分"全清"与"跑光"
    if (c.data.rarity === 'legendary') { // 传说捕获：+1 大师球
      save = ballsMeta.grantBalls(save, { master: 1 }).state;
      wx.showToast && wx.showToast({ title: '捕获传说精灵！大师球 +1', icon: 'none' });
    }
    const dexCount = Object.keys(save.dex).length;
    if (dexCount === 8 && !save.dexFullBonus) { // 图鉴全收集：+30 大师球（dex 满后条件天然一次性）
      save = ballsMeta.grantBalls(save, { master: 30 }).state;
      save.dexFullBonus = true; // 入存档标记：图鉴满 +30 只发一次（重启后不再重发）
      wx.showToast && wx.showToast({ title: '图鉴全收集！大师球 +30', icon: 'none' });
    }
    const bonus = eco.applyCatch(save, isNew, config);
    save = bonus.state;
    creatures = creatures.filter((x) => x !== c);
    lastCaughtName = byId(id).name; // Task 7 捕捉瞬间浮层标题用
    screens.showCatchMoment(save, lastCaughtName); // Task 6 的浮层：拦截触摸（screens.visible → thrower 已禁用路径不变）
    thrower.setEnabled(false); // 浮层期间禁滑动投掷（浮层按钮可点，关闭时恢复）
    photo.captureMoment(); // 趁粒子未散截取当前帧（异步 success 回调，但 canvas 内容在下一渲染前稳定）
    const pos = c.obj.getWorldPosition(new THREE.Vector3()); // 移除前取世界坐标：粒子在其处爆发
    disposeCreature(c.obj); // 回收 GLB GPU 资源后再移除
    scene.remove(c.obj);
    bus.emit('creature:caught', { id, zone, isNew, gained: bonus.gained, pos });
  } else {
    const { flee } = reactToFailedCapture(c.data, Math.random, config);
    if (flee) {
      creatures = creatures.filter((x) => x !== c);
      const fpos = c.obj.getWorldPosition(new THREE.Vector3()); // 移除前取世界坐标：逃跑烟尘在其处爆发
      fledThisRound += 1;
      disposeCreature(c.obj); // 回收 GLB GPU 资源后再移除
      scene.remove(c.obj);
      bus.emit('creature:fled', { id, pos: fpos });
    } else {
      const ballDef = ballsMeta.typeDef(selectedBall, config);
      if (ballDef.freezeMs > 0) c.ai.freezeUntil = Date.now() + ballDef.freezeMs; // 甜甜圈球：冻结命中者 c（按 id find 会误冻同种双生）
      bus.emit('creature:struggle', { id }); // Task 14 effects 做缩放抖动
    }
  }
  store.save(save);
});

function startRound() { // 开新对局：清场 → 补球 → 重启 AR 会话
  creatures.forEach((c) => { disposeCreature(c.obj); scene.remove(c.obj); }); // 清掉上局残留精灵（先回收 GLB GPU 资源），否则回合结束条件死锁
  creatures = [];
  roundOver = false;
  waveSpawned = false;
  caughtThisRound = 0; // 开局清零本局计数
  fledThisRound = 0;
  scanFallback = false; // 新的一局重试 VK（上局降级不影响本局）
  save.balls = Math.max(save.balls, config.economy.startBalls);
  store.save(save);
  screens.hide();
  screenState = 'play';
  thrower.setEnabled(true);
  startARSession();
  screens.drawPlayHud(save, selectedBall); // 局内 HUD 三球条
}

bus.on('ball:ground', () => {});
bus.on('ball:select', ({ type }) => {
  const cnt = ballsMeta.countOf(save, type);
  if (cnt > 0) {
    selectedBall = type;
    thrower.setBallColor(ballsMeta.typeDef(type, config).color);
    bus.emit('hud:refresh');
  }
});
bus.on('hud:refresh', () => {
  if (screenState !== 'play' || screens.state === 'moment') return; // 捕捉瞬间浮层显示中不重绘三球条（会擦掉浮层）
  screens.drawPlayHud(save, selectedBall);
}); // 局内重绘三球条（出手扣球/切换球种后）
// 初始球色：白色（normal）
thrower.setBallColor(ballsMeta.typeDef('normal', config).color);
bus.on('creature:caught', (payload) => { // 捕捉成功：粒子爆发 + 预取其余精灵 GLB（命中 HTTP 缓存，下次出场即换模）
  effects.burst(payload.pos);
  prefetchCreatures(THREE);
});
bus.on('creature:struggle', ({ id }) => { // 挣扎：缩放抖动反馈（未抓到也未逃跑）
  const c = creatures.find((x) => x.data.id === id);
  if (c) effects.shake(c.obj);
});
bus.on('creature:fled', ({ pos }) => effects.burst(pos, 0x9aa0a6)); // 逃跑：原地灰色烟尘
bus.on('round:end', ({ reason }) => {
  lastReason = reason; // 缓存结算原因：任务领取后重绘结算页复用
  thrower.setEnabled(false); // 结算页吞掉触摸，防止误扔球
  screenState = 'result';
  screens.show('result', save, reason);
  ar.stop();
  loopGen += 1; // 立即作废本局循环回调（gyro 的 rAF 永远在重排，stop 杀不死）
  scanStartedAt = 0; // 看门狗停表（本局循环已死，无帧可跑）
  aimRing.update(camera, null, 0, config); // 显式隐藏瞄准圈（menuLoop 不跑 update）
  menuLoop();
});

bus.on('ui:tap', ({ tag, state }) => {
  if (state === 'start' && tag === 'play') {
    startRound(); // 内部已含 hide/置 play 态/启用投掷 + 清场重启 AR
  } else if (state === 'start' && tag === 'dex') {
    screens.show('dex', save);
  } else if (state === 'dex' && tag === 'back') {
    screens.show('start', save);
  } else if (state === 'dex' && tag === 'share') {
    wx.shareAppMessage({ title: '我在房间里抓到了小精灵！来抓个抓～' });
    const r = eco.applyDailyShare(save, new Date().toISOString(), config);
    if (r.ok) { save = r.state; store.save(save); }
    screens.show('dex', save); // 重绘刷新球数（未领成功则原样重进）
  } else if (state === 'result' && tag === 'play') {
    startRound();
  } else if (state === 'result' && tag === 'dex') {
    screens.show('dex', save);
  }
  // 局内球种切换：drawPlayHud 芯片命中（独立 if：不挂在 screenState 链上，tag 自带语义）
  if (tag && tag.indexOf('ball:') === 0) { bus.emit('ball:select', { type: tag.slice(5) }); return; }
  // 结算页任务领取：领奖 → 入档 → 重绘结算页（任务行/球数刷新）
  if (tag && tag.indexOf('claim:') === 0) {
    const r = daily.claim(save, tag.slice(6), nowIso(), config);
    if (r.ok) {
      save = ballsMeta.grantBalls(r.state, r.grant).state;
      store.save(save);
      screens.show('result', save, lastReason);
      wx.showToast && wx.showToast({ title: '任务奖励已领取', icon: 'none' });
    }
    return;
  }
  // 捕捉瞬间浮层按钮（一局中途，不能 show('result')——局还没结束）：关浮层回对局
  if (tag === 'shareMoment') {
    photo.shareCatchMoment(lastCaughtName);
    save.stats.shares += 1;
    save = daily.recordProgress(save, 'shares', 1, nowIso(), config).state;
    store.save(save);
    screens.hide(); // 关浮层回对局
    thrower.setEnabled(true);
    screens.drawPlayHud(save, selectedBall); // hide 清了 HUD 画布：立即恢复三球条（否则死区到下次出手）
    return;
  }
  if (tag === 'continue') {
    screens.hide();
    thrower.setEnabled(true);
    screens.drawPlayHud(save, selectedBall); // 同上：恢复三球条
    return;
  }
});

screens.show('start', save);
thrower.setEnabled(!screens.visible); // HUD 在场时吞触摸（初始即菜单态）
menuLoop();

wx.onHide(() => { if (ar) ar.stop(); });
wx.onShow(() => { if (screenState === 'play') startARSession(); }); // 对局中回前台：全新会话接续
