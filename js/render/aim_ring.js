// js/render/aim_ring.js — 收缩瞄准圈可视化：世界空间 RingGeometry，每帧按判定同一时钟缩放
const { circleRadius } = require('../game/hit_circles.js');
const COLOR_IDLE = 0xffffff;
const COLOR_AIM = 0xffd166;

function createAimRing(THREE, scene) {
  const logicalH = wx.getSystemInfoSync().windowHeight; // 判定用逻辑像素，与 throw_system 一致
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.92, 1.0, 40),
    new THREE.MeshBasicMaterial({ color: COLOR_IDLE, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthTest: false })
  );
  ring.visible = false;
  ring.renderOrder = 999;
  ring.frustumCulled = false;
  scene.add(ring);
  const _wp = new THREE.Vector3(); // 世界坐标复用向量：环的落点，绝不被矩阵变换污染
  const _cs = new THREE.Vector3(); // 相机系复用向量：applyMatrix4 会改写自身，必须与 _wp 分开

  return {
    update(camera, targetObj, elapsedMs, config, inFlight) {
      if (!targetObj) { ring.visible = false; return; }
      const r_px = circleRadius(elapsedMs, config);
      targetObj.getWorldPosition(_wp);
      _cs.copy(_wp).applyMatrix4(camera.matrixWorldInverse); // 世界→相机系，长度即深度 d
      const d = _cs.length();
      const tanHalfFov = 1 / Math.abs(camera.projectionMatrix.elements[5]); // m11(列主序 elements[5]) = 1/tan(fov/2)
      const worldR = (r_px * 2 * tanHalfFov * d) / logicalH; // 屏幕像素半径 → 世界半径
      ring.material.color.setHex(inFlight ? COLOR_AIM : COLOR_IDLE); // 简化方案：出手瞬间金色，平时白色
      ring.position.set(_wp.x, _wp.y + 0.05, _wp.z); // 略抬 0.05 减少与精灵的深度冲突
      ring.scale.setScalar(worldR);
      // 两种 AR 模式下 camera.quaternion 都可能不是最新（VK 直写矩阵），从 matrixWorld 提取朝向最稳
      ring.quaternion.setFromRotationMatrix(camera.matrixWorld);
      ring.visible = true;
    },
  };
}
module.exports = { createAimRing };
