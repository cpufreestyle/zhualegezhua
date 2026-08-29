// game.js — 入口
const config = require('./js/config.js');
const { createThree } = require('./js/render/three_adapter.js');
const { createARContext } = require('./js/ar/ar_context.js');
const { createCreature, CREATURES } = require('./js/render/creatures.js');
const { updateFades, prefetchCreatures, disposeCreature } = require('./js/render/gltf_loader.js');
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
let creatures = [];      // [{data, obj, ai, radius}]
let roundOver = false;
let waveSpawned = false;
let screenState = 'start'; // 'start' | 'dex' | 'play' | 'result'
let loopGen = 0;           // AR 会话代际：旧会话回调凭 gen 失配自愈失效
let currentMode = null;
let ar = null;             // 每局/每次回前台新建（ar.stop 永久失效，不可复用）
const screens = createScreens({ THREE, bus, config, canvas });
const effects = createEffects(THREE, scene);
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
  ar = createARContext({ canvas, THREE, renderer, scene, camera, scanTimeoutMs: config.planes.scanTimeoutMs });
  ar.start().then(({ mode }) => {
    currentMode = mode;
    console.log('AR mode:', mode);
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

      if (creatures.length === 0 && !roundOver) spawnWave();

      // AI：内部维护位置，回调直接写 mesh
      creatures.forEach((c) => c.ai.update(dtMs, (p) => { c.obj.position.x = p.x; c.obj.position.z = p.z; }));

      // 目标：离相机最近的精灵
      if (creatures.length) {
        cameraWorld.setFromMatrixPosition(camera.matrixWorld);
        let best = null, bd = 1e9;
        creatures.forEach((c) => {
          const d = c.obj.position.distanceToSquared(cameraWorld);
          if (d < bd) { bd = d; best = c; }
        });
        thrower.setTarget(best);
      } else {
        thrower.setTarget(null);
      }

      thrower.update(dtMs);
      effects.update(dtMs);
      updateFades(dtMs); // GLB 换模后的淡入推进

      if (!roundOver && waveSpawned && (creatures.length === 0 || (save.balls <= 0 && !thrower.hasBallInFlight()))) {
        roundOver = true;
        bus.emit('round:end', { reason: creatures.length === 0 ? 'fled' : 'balls' });
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
  const r = eco.spendBall(save);
  if (!r.ok) return;
  save = r.state;
  save.stats.throws += 1;
  store.save(save);
});

bus.on('ball:creature', ({ creature, id, zone }) => {
  if (!creatures.includes(creature)) return; // 已被捕获/逃跑的引用忽略
  const c = creature;
  save.stats.hits += 1;
  const caught = rollCapture(c.data, zone, Math.random, config);
  if (caught) {
    const isNew = !save.dex[id];
    save.dex[id] = { caught: (save.dex[id] ? save.dex[id].caught : 0) + 1, firstAt: Date.now() };
    save.stats.catches += 1;
    const bonus = eco.applyCatch(save, isNew, config);
    save = bonus.state;
    creatures = creatures.filter((x) => x !== c);
    const pos = c.obj.getWorldPosition(new THREE.Vector3()); // 移除前取世界坐标：粒子在其处爆发
    disposeCreature(c.obj); // 回收 GLB GPU 资源后再移除
    scene.remove(c.obj);
    bus.emit('creature:caught', { id, zone, isNew, gained: bonus.gained, pos });
  } else {
    const { flee } = reactToFailedCapture(c.data, Math.random, config);
    if (flee) {
      creatures = creatures.filter((x) => x !== c);
      disposeCreature(c.obj); // 回收 GLB GPU 资源后再移除
      scene.remove(c.obj);
      bus.emit('creature:fled', { id });
    } else {
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
  save.balls = Math.max(save.balls, config.economy.startBalls);
  store.save(save);
  screens.hide();
  screenState = 'play';
  thrower.setEnabled(true);
  startARSession();
}

bus.on('ball:ground', () => {});
bus.on('creature:caught', (payload) => { // 捕捉成功：粒子爆发 + 预取其余精灵 GLB（命中 HTTP 缓存，下次出场即换模）
  effects.burst(payload.pos);
  prefetchCreatures(THREE);
});
bus.on('round:end', ({ reason }) => {
  thrower.setEnabled(false); // 结算页吞掉触摸，防止误扔球
  screenState = 'result';
  screens.show('result', save, reason);
  ar.stop();
  loopGen += 1; // 立即作废本局循环回调（gyro 的 rAF 永远在重排，stop 杀不死）
  menuLoop();
  console.log('[round] end — balls:', save.balls, 'caught:', save.stats.catches);
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
});

screens.show('start', save);
thrower.setEnabled(!screens.visible); // HUD 在场时吞触摸（初始即菜单态）
menuLoop();

wx.onHide(() => { if (ar) ar.stop(); });
wx.onShow(() => { if (screenState === 'play') startARSession(); }); // 对局中回前台：全新会话接续
