// game.js — 入口
const config = require('./js/config.js');
const { createThree } = require('./js/render/three_adapter.js');
const { createARContext } = require('./js/ar/ar_context.js');
const { createPlaceholder } = require('./js/render/creatures.js');

const info = wx.getSystemInfoSync();
const pixelRatio = Math.min(2, info.pixelRatio); // 性能：钳制
const canvas = wx.createCanvas();
canvas.width = info.windowWidth * pixelRatio;
canvas.height = info.windowHeight * pixelRatio;

const { THREE, renderer, scene, camera } = createThree(canvas);
const { CREATURES } = require('./js/render/creatures.js');
const ar = createARContext({ canvas, THREE, renderer, scene, camera, scanTimeoutMs: config.planes.scanTimeoutMs });

let creatureObj = null;
function ensureCreature() {
  if (creatureObj) return;
  let center;
  if (ar.mode === 'vk') {
    const anchor = ar.getPlaneAnchor();
    if (!anchor) return; // 平面还没锁定，下一帧再试
    const m = new THREE.Matrix4().fromArray(anchor.transform);
    const p = new THREE.Vector3();
    m.decompose(p, new THREE.Quaternion(), new THREE.Vector3());
    center = p;
    ar.setTracking(false); // 锚已锁：停锚点矩阵更新
  } else {
    center = ar.getSpawnCenter();
  }
  creatureObj = createPlaceholder(THREE, scene, CREATURES[0], center); // Task 12 起换刷怪
}

ar.start().then(({ mode }) => {
  console.log('AR mode:', mode);
  ar.loop(() => {
    ensureCreature();
    const frame = ar.renderFrame();
    if (mode === 'vk' && frame) renderer.autoClearColor = false; // 相机底图已画，不清屏（无底图帧不清屏会糊屏）
    renderer.render(scene, camera);
    renderer.state.setCullFace(THREE.CullFaceNone); // 官方 demo 同款：背景 quad 不参与背面剔除
  });
});

wx.onHide(() => { ar.stop(); });
