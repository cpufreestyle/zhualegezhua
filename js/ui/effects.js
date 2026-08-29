// js/ui/effects.js — 捕捉成功粒子爆发：单 THREE.Points 复用，update 零分配
function createEffects(THREE, scene) {
  const COUNT = 30;
  const positions = new Float32Array(COUNT * 3); // BufferGeometry 直接持有，burst 后逐帧改写
  const vels = []; // 纯数组 30×[vx, vy, vz]，避免每次 burst 重建
  for (let i = 0; i < COUNT; i++) vels.push([0, 0, 0]);

  const geo = new THREE.BufferGeometry();
  geo.addAttribute('position', new THREE.BufferAttribute(positions, 3)); // r108：无 setAttribute（r110+）
  const points = new THREE.Points(
    geo,
    new THREE.PointsMaterial({ color: 0xffd166, size: 0.05 })
  );
  points.visible = false;
  points.frustumCulled = false; // 包围球固定在原点，粒子飞散时防止整体被剔除
  scene.add(points);
  let life = 0; // 剩余寿命（秒）

  function burst(center) {
    for (let i = 0; i < COUNT; i++) {
      positions[i * 3] = center.x;
      positions[i * 3 + 1] = center.y;
      positions[i * 3 + 2] = center.z;
      const a = Math.random() * Math.PI * 2; // 水平圆周方向
      const r = 0.3 + Math.random() * 0.8;   // 半径 0.3~1.1
      vels[i][0] = Math.cos(a) * r;
      vels[i][1] = 1.2 + Math.random();      // 垂直向上抬升
      vels[i][2] = Math.sin(a) * r;
    }
    life = 0.8;
    points.visible = true;
    geo.attributes.position.needsUpdate = true;
  }

  function update(dtMs) {
    if (!points.visible) return;
    const dt = dtMs / 1000;
    life -= dt;
    for (let i = 0; i < COUNT; i++) { // 就地累加，零分配
      positions[i * 3] += vels[i][0] * dt;
      positions[i * 3 + 1] += vels[i][1] * dt;
      positions[i * 3 + 2] += vels[i][2] * dt;
    }
    geo.attributes.position.needsUpdate = true;
    if (life <= 0) points.visible = false;
  }

  return { burst, update };
}
module.exports = { createEffects };
