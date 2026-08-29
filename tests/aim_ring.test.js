const { test } = require('node:test');
const assert = require('node:assert');
const config = require('../js/config.js');
const { createAimRing } = require('../js/render/aim_ring.js');

global.wx = { getSystemInfoSync: () => ({ windowHeight: 667 }) }; // 工厂内才读 wx（require 时不碰）

function makeTHREE() { // 最小 r108 仿件：只实现 aim_ring 用到的面
  class Vector3 {
    constructor() { this.x = 0; this.y = 0; this.z = 0; }
    copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
    applyMatrix4(m) { if (m && typeof m.applyMatrix4 === 'function') m.applyMatrix4(this); return this; }
    length() { return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z); }
  }
  class Mesh {
    constructor(geometry, material) {
      this.geometry = geometry; this.material = material; this.visible = true; this.renderOrder = 0; this.frustumCulled = true;
      this.scale = { setScalar(v) { this.s = v; } };
      this.position = { set(x, y, z) { this.p = [x, y, z]; } };
      this.quaternion = { setFromRotationMatrix() { this.billboarded = true; } };
    }
  }
  class MeshBasicMaterial { constructor() { this.color = { setHex(c) { this.c = c; } }; } }
  class Scene { constructor() { this.added = []; } add(o) { this.added.push(o); } }
  return { Vector3, Mesh, MeshBasicMaterial, RingGeometry: class {}, DoubleSide: 2, Scene };
}

const camera = { // 仿件：matrixWorldInverse 把向量压到 z=-2（d=2）；elements[5]=2（tanHalfFov=0.5）
  matrixWorldInverse: { applyMatrix4: (v) => { v.z = -2; return v; } },
  matrixWorld: {},
  projectionMatrix: { elements: [0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
};
const target = { position: { x: 0, y: 0, z: 0 }, getWorldPosition: (v) => { v.x = 0; v.y = 0; v.z = 0; return v; } };

test('构造时挂入场景且默认隐藏', () => {
  const THREE = makeTHREE(), scene = new THREE.Scene();
  const ring = createAimRing(THREE, scene), mesh = scene.added[0];
  ring.update(camera, null, 0, config); // 无目标 → 保持隐藏
  assert.strictEqual(scene.added.length, 1);
  assert.strictEqual(mesh.visible, false);
});

test('有目标按判定同一时钟缩放：elapsed 0 → r1=90 → 世界半径 ≈ 0.270，白色', () => {
  const THREE = makeTHREE(), scene = new THREE.Scene();
  const ring = createAimRing(THREE, scene), mesh = scene.added[0];
  ring.update(camera, target, 0, config, false);
  assert.strictEqual(mesh.visible, true);
  const expected = (config.circle.r1 * 2 * 0.5 * 2) / 667; // r_px*2*tanHalfFov*d/logicalH = 180/667
  assert.ok(Math.abs(mesh.scale.s - expected) < 1e-3, 'scale ' + mesh.scale.s + ' vs ' + expected);
  assert.strictEqual(mesh.material.color.c, 0xffffff);
  assert.strictEqual(mesh.quaternion.billboarded, true); // 朝向取自 camera.matrixWorld
});

test('出手中（inFlight）变金色', () => {
  const THREE = makeTHREE(), scene = new THREE.Scene();
  const ring = createAimRing(THREE, scene), mesh = scene.added[0];
  ring.update(camera, target, 400, config, true);
  assert.strictEqual(mesh.visible, true);
  assert.strictEqual(mesh.material.color.c, 0xffd166);
});
