// game.js — 入口
const config = require('./js/config.js');
const { createThree } = require('./js/render/three_adapter.js');
const { createARContext } = require('./js/ar/ar_context.js');
const { createPlaceholder, CREATURES } = require('./js/render/creatures.js');
const { createBus } = require('./js/core/events.js');
const { rollEncounter } = require('./js/meta/spawn.js');
const { createRuntime, reactToFailedCapture } = require('./js/game/creature_ai.js');
const { createThrowSystem } = require('./js/game/throw_system.js');
const { rollCapture } = require('./js/game/catch_resolver.js');
const eco = require('./js/meta/economy.js');
const { createStorage } = require('./js/meta/storage.js');

const info = wx.getSystemInfoSync();
const pixelRatio = Math.min(2, info.pixelRatio); // 性能：钳制
const canvas = wx.createCanvas();
canvas.width = info.windowWidth * pixelRatio;
canvas.height = info.windowHeight * pixelRatio;

const { THREE, renderer, scene, camera } = createThree(canvas);
const ar = createARContext({ canvas, THREE, renderer, scene, camera, scanTimeoutMs: config.planes.scanTimeoutMs });

const bus = createBus();
const store = createStorage(wx, config);
let save = store.load();
let creatures = [];      // [{data, obj, ai, radius}]
let roundOver = false;
let waveSpawned = false;
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
  creatures.forEach((c) => scene.remove(c.obj));
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
    const obj = createPlaceholder(THREE, scene, data, home);
    const ai = createRuntime(data, { x: home.x, y: home.y, z: home.z }, Math.random, config);
    creatures.push({ data, obj, ai, radius: 0.22 });
  });
  waveSpawned = true;
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
    scene.remove(c.obj);
    bus.emit('creature:caught', { id, zone, isNew, gained: bonus.gained });
  } else {
    const { flee } = reactToFailedCapture(c.data, Math.random, config);
    if (flee) {
      creatures = creatures.filter((x) => x !== c);
      scene.remove(c.obj);
      bus.emit('creature:fled', { id });
    } else {
      bus.emit('creature:struggle', { id }); // Task 14 effects 做缩放抖动
    }
  }
  store.save(save);
});

bus.on('ball:ground', () => {});
bus.on('round:end', () => { thrower.setEnabled(false); console.log('[round] end — balls:', save.balls, 'caught:', save.stats.catches); }); // Task 14 换结算 UI

ar.start().then(({ mode }) => {
  console.log('AR mode:', mode);
  ar.loop(() => {
    if (creatures.length === 0 && !roundOver) spawnWave();

    // AI：内部维护位置，回调直接写 mesh
    creatures.forEach((c) => c.ai.update(33, (p) => { c.obj.position.x = p.x; c.obj.position.z = p.z; }));

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

    thrower.update(33);

    if (!roundOver && waveSpawned && (creatures.length === 0 || (save.balls <= 0 && !thrower.hasBallInFlight()))) {
      roundOver = true;
      bus.emit('round:end');
    }

    const frame = ar.renderFrame();
    if (mode === 'vk' && frame) renderer.autoClearColor = false; // 相机底图已画，不清屏
    renderer.render(scene, camera);
    renderer.state.setCullFace(THREE.CullFaceNone); // 官方 demo 同款：背景 quad 不参与背面剔除
  });
});

wx.onHide(() => { ar.stop(); });
