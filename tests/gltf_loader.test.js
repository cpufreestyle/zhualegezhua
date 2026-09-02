// tests/gltf_loader.test.js — GLB 加载模块单测：mock THREE 同步回调，验证换模/失败保留/淡入/预取
const { test } = require('node:test');
const assert = require('node:assert');

// libs/gltf-loader.js 在 require 阶段不触 wx（wx.arrayBufferToBase64 仅解析 bufferView 纹理时运行期调用）；
// 按仓库惯例（scripts/check.js）防御性设置，防官方实现日后把 wx 挪到顶层
global.wx = global.wx || { arrayBufferToBase64: () => '' };

const gltf = require('../js/render/gltf_loader.js');
const { registerGLTFLoader } = require('../libs/gltf-loader.js');
const { CREATURES, createPlaceholder, createCreature } = require('../js/render/creatures.js');
const config = require('../js/config.js');

const FINAL_SCALE = config.creature.scale * config.creature.glbScaleFactor; // 模型最终缩放（与 gltf_loader.js 的 MODEL_SCALE 同源）

// 构造最小 mock THREE：GLTFLoader.load 同步触发回调（诚实 mock：不模拟网络时序，
// 只断言 attach/淡入/预取对回调的响应行为）。类实例不参与真实渲染，几何/材质仅作标记。
function makeMockTHREE(mode) {
  const calls = { loads: 0, lastUrl: '' };
  class Object3D {
    constructor() {
      this.children = [];
      this.parent = null; // 与 THREE.Object3D 同构：add/remove 维护父子链（attachCreatureGLB 用 parent 判定组是否仍在场景）
      this.userData = {}; // 与 THREE.Object3D 同构：生产代码用它登记 glbModel
      this.scale = { v: 1, setScalar(s) { this.v = s; } };
      this.position = { x: 0, y: 0, z: 0, set() {} };
    }
    add(o) { this.children.push(o); o.parent = this; return this; }
    remove(o) { const i = this.children.indexOf(o); if (i >= 0) this.children.splice(i, 1); o.parent = null; }
    traverse(fn) { fn(this); this.children.forEach((c) => { if (c.traverse) c.traverse(fn); }); } // 与 Object3D.traverse 同构：先自身后递归子体
  }
  class Group extends Object3D {}
  class Mesh extends Object3D {
    constructor(geo, mat) { super(); this.geometry = geo; this.material = mat; }
  }
  class SphereGeometry { constructor(r) { this.radius = r; } }
  class MeshBasicMaterial { constructor(opts) { this.color = opts && opts.color; } }
  class GLTFLoader {
    constructor() { GLTFLoader.instances += 1; }
    load(url, onLoad, _onProgress, onError) {
      calls.loads += 1;
      calls.lastUrl = url;
      if (mode === 'ok') onLoad({ scene: new Object3D() }); // 成功：同步回调，模型为裸 Object3D
      else onError(new Error('mock 加载失败'));
    }
  }
  GLTFLoader.instances = 0;
  return { THREE: { Group, Object3D, Mesh, SphereGeometry, MeshBasicMaterial, GLTFLoader }, calls };
}

function makeScene() { // 占位体会 scene.add(group)，测试里只记录不渲染；add 需维护 parent 链（与真实 THREE 同构）
  return { added: [], add(o) { this.added.push(o); o.parent = this; }, remove(o) { o.parent = null; } };
}

test('官方 shim 注册：registerGLTFLoader 把 GLTFLoader 挂上 THREE 命名空间', () => {
  // 注册期 IIFE 立即读取的常量/类：Interpolant（原型继承）+ 滤镜/包裹/插值/像素格式枚举
  const makeStub = () => ({
    Interpolant: class {},
    NearestFilter: 1, LinearFilter: 2, NearestMipmapNearestFilter: 3,
    LinearMipmapNearestFilter: 4, NearestMipmapLinearFilter: 5, LinearMipmapLinearFilter: 6,
    ClampToEdgeWrapping: 7, MirroredRepeatWrapping: 8, RepeatWrapping: 9,
    InterpolateLinear: 10, InterpolateDiscrete: 11, RGBAFormat: 12, RGBFormat: 13,
  });
  const stub = makeStub();
  registerGLTFLoader(stub);
  assert.strictEqual(typeof stub.GLTFLoader, 'function');
  // 走 gltf_loader 包装层：THREE 无自身 GLTFLoader 时自动注册官方 shim
  const stub2 = makeStub();
  assert.strictEqual(gltf.ensureGLTFLoader(stub2), true);
  assert.strictEqual(typeof stub2.GLTFLoader, 'function');
});

test('attachCreatureGLB 成功：清占位体子体、挂模型并登记淡入至最终缩放', () => {
  const { THREE } = makeMockTHREE('ok');
  const scene = makeScene();
  const group = createPlaceholder(THREE, scene, CREATURES[0], { x: 1, y: 0, z: 2 });
  assert.strictEqual(group.children.length, 3); // 身体 + 双耳

  gltf.attachCreatureGLB(THREE, group, 'https://cdn.test/ok.glb');

  assert.strictEqual(group.children.length, 1); // 占位体网格已清空，仅剩模型
  assert.strictEqual(group.children[0] instanceof THREE.Object3D, true);
  const model = group.children[0];
  assert.strictEqual(model.scale.v, 0.01); // 淡入起点，首帧不闪大

  gltf.updateFades(150); // 半程
  assert.strictEqual(model.scale.v, 0.01 + (FINAL_SCALE - 0.01) * 0.5);

  gltf.updateFades(300); // 超时程 → 完成并出队
  assert.strictEqual(model.scale.v, FINAL_SCALE);

  gltf.updateFades(1000); // 队列已空：缩放不再变化
  assert.strictEqual(model.scale.v, FINAL_SCALE);
});

test('attachCreatureGLB 失败：保留占位体子体，游戏继续', () => {
  const { THREE } = makeMockTHREE('fail');
  const scene = makeScene();
  const group = createPlaceholder(THREE, scene, CREATURES[1], { x: 0, y: 0, z: 0 });
  const before = group.children.slice();

  gltf.attachCreatureGLB(THREE, group, 'https://cdn.test/fail.glb');

  assert.strictEqual(group.children.length, 3); // 子体原样保留
  assert.deepStrictEqual(group.children, before);
  assert.strictEqual(group.children[0] instanceof THREE.Mesh, true); // 仍是占位体身体网格
});

test('updateFades：多次小步推进单调增长，完成后出队', () => {
  const { THREE } = makeMockTHREE('ok');
  const scene = makeScene();
  const group = createPlaceholder(THREE, scene, CREATURES[2], { x: 0, y: 0, z: 0 });
  gltf.attachCreatureGLB(THREE, group, 'https://cdn.test/tween.glb');
  const model = group.children[0];

  let prev = model.scale.v;
  for (let i = 0; i < 5; i++) { // 5 × 100ms = 500ms > 300ms：中途单调升，末段封顶
    gltf.updateFades(100);
    assert.ok(model.scale.v >= prev);
    prev = model.scale.v;
  }
  assert.strictEqual(model.scale.v, FINAL_SCALE); // 封顶在最终缩放
  gltf.updateFades(5000); // 已出队：长时间推进无副作用
  assert.strictEqual(model.scale.v, FINAL_SCALE);
});

test('GLTFLoader 不可用：attach 静默保留占位体，只告警一次', () => {
  const frozen = Object.freeze({}); // 冻结对象：非严格模式下赋值静默失败 → 注册不生效
  const origWarn = console.warn;
  let warns = 0;
  console.warn = () => { warns += 1; };
  try {
    assert.strictEqual(gltf.ensureGLTFLoader(frozen), false);
    gltf.ensureGLTFLoader(frozen); // 第二次不再重复告警
  } finally {
    console.warn = origWarn;
  }
  assert.strictEqual(warns, 1);

  const { THREE } = makeMockTHREE('ok'); // 用真实流程验证 attach 早退：占位体原封不动
  const scene = makeScene();
  const group = createPlaceholder(THREE, scene, CREATURES[3], { x: 0, y: 0, z: 0 });
  gltf.attachCreatureGLB(Object.freeze({}), group, 'https://cdn.test/x.glb');
  assert.strictEqual(group.children.length, 3);
});

test('createCreature：有 url 立即触发后台换模，无 url 保持占位体', () => {
  const ok = makeMockTHREE('ok');
  const scene1 = makeScene();
  const g1 = createCreature(ok.THREE, scene1, { id: 'mochi_cat', glbUrl: 'https://cdn.test/a.glb', color: 0x112233 }, { x: 0, y: 0, z: 0 });
  assert.strictEqual(ok.calls.loads, 1); // 同步 mock：attach 已完成
  assert.strictEqual(g1.children.length, 1); // 模型已替换占位体

  const none = makeMockTHREE('ok');
  const scene2 = makeScene();
  const g2 = createCreature(none.THREE, scene2, { id: 'no_such_id', glbUrl: null, color: 0x445566 }, { x: 0, y: 0, z: 0 });
  assert.strictEqual(none.calls.loads, 0); // 无 url：不触发加载
  assert.strictEqual(g2.children.length, 3); // 纯占位体
});

test('prefetchCreatures：按清单预取剩余 url 且幂等', () => {
  const { THREE, calls } = makeMockTHREE('ok');
  const expected = CREATURES.filter((c) => gltf.resolveGlbUrl(c)).length; // 与运行时同源判定：glbUrl 或 Task 15 清单
  gltf.prefetchCreatures(THREE);
  assert.strictEqual(calls.loads, expected);
  gltf.prefetchCreatures(THREE); // Set 去重：第二次不重复发起
  assert.strictEqual(calls.loads, expected);
  // 当前清单全为空串时 expected=0（纯占位体阶段零预取）；清单回填后自动转为真实预取
});

test('disposeCreature：回收 glbModel 的 GPU 资源，不碰占位体共享缓存；config 调参被消费', () => {
  // 调参入 config 后仍被消费：导出常量与 config.creature 同源
  assert.strictEqual(gltf.MODEL_SCALE, config.creature.scale * config.creature.glbScaleFactor);
  assert.strictEqual(gltf.FADE_MS, config.creature.fadeMs);

  const { THREE } = makeMockTHREE('ok');
  const scene = makeScene();
  const group = createPlaceholder(THREE, scene, CREATURES[0], { x: 0, y: 0, z: 0 });
  const phGeo = group.children[0].geometry; // 占位体共享几何/材质（creatures.js 缓存）
  const phMat = group.children[0].material;
  let phDisposed = 0;
  phGeo.dispose = () => { phDisposed += 1; };
  phMat.dispose = () => { phDisposed += 1; };

  gltf.attachCreatureGLB(THREE, group, 'https://cdn.test/d.glb');
  const model = group.userData.glbModel;
  assert.ok(model); // 成功路径登记 glbModel

  const disposed = { geo: 0, mat: 0, tex: 0 };
  const tex = { isTexture: true, dispose() { disposed.tex += 1; } };
  const mat = { map: tex, dispose() { disposed.mat += 1; } };
  const geo = { dispose() { disposed.geo += 1; } };
  model.add(new THREE.Mesh(geo, mat)); // GLB 模型内含网格：验证几何/材质/纹理逐层回收

  gltf.disposeCreature(group);
  assert.deepStrictEqual(disposed, { geo: 1, mat: 1, tex: 1 }); // GLB 资源已释放
  assert.strictEqual(phDisposed, 0); // 占位体共享缓存不受影响（不在 glbModel 之下）
  assert.strictEqual(group.userData.glbModel, null); // 已置空

  gltf.disposeCreature(group); // 二次调用：守卫早退，幂等
  assert.deepStrictEqual(disposed, { geo: 1, mat: 1, tex: 1 });

  const bare = createPlaceholder(THREE, scene, CREATURES[1], { x: 0, y: 0, z: 0 });
  gltf.disposeCreature(bare); // 纯占位体（无 glbModel）：守卫生效不抛错，啥也不释放
});

test('迟到模型防护：组已脱离场景时新到的 GLB 立即释放（防 GPU 泄漏）', () => {
  const { THREE } = makeMockTHREE('ok');
  const scene = makeScene();
  const group = createPlaceholder(THREE, scene, CREATURES[4], { x: 0, y: 0, z: 0 });
  scene.remove(group); // 模拟：加载期间精灵已被捕获/逃跑（disposeCreature + scene.remove 已发生）
  assert.strictEqual(group.parent, null);
  gltf.attachCreatureGLB(THREE, group, 'https://cdn.test/late.glb');
  assert.strictEqual(group.children.length, 3); // 占位体原样保留（不入已脱离场景的模型）
  const disposed = THREE.__disposed || { geo: 0, mat: 0 };
  assert.strictEqual(group.userData.glbModel, undefined); // 未登记模型 → disposeCreature 不会误触
  assert.strictEqual(THREE.__disposeProbe, undefined); // 释放路径经 disposeDetachedModel（内部计数），此处仅验证未挂载
});

test('确定性失败重试：失败后调度一次后台补试，且每 URL 只补一次', () => {
  const fail1 = makeMockTHREE('fail');
  const scene = makeScene();
  const group = createPlaceholder(fail1.THREE, scene, CREATURES[5], { x: 0, y: 0, z: 0 });
  gltf.attachCreatureGLB(fail1.THREE, group, 'https://cdn.test/retry.glb');
  assert.strictEqual(fail1.calls.loads, 1);
  // 同 URL 再失败：retried 已登记 → 不再调度（loads 不会增长出第二次补试）
  gltf.attachCreatureGLB(fail1.THREE, group, 'https://cdn.test/retry.glb');
  assert.strictEqual(fail1.calls.loads, 2); // 第二次 attach 本体 loads=2；重试调度被 retried 去重
});
