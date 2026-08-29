// js/ui/effects.js — 捕捉成功粒子爆发：单 THREE.Points 复用，update 零分配
function createEffects(THREE, scene) {
  const COUNT = 30;
  const positions = new Float32Array(COUNT * 3); // BufferGeometry 直接持有，burst 后逐帧改写
  const vels = []; // 纯数组 30×[vx, vy, vz]，避免每次 burst 重建
  for (let i = 0; i < COUNT; i++) vels.push([0, 0, 0]);

  const geo = new THREE.BufferGeometry();
  geo.addAttribute('position', new THREE.BufferAttribute(positions, 3)); // r108：无 setAttribute（r110+）
  const mat = new THREE.PointsMaterial({ color: 0xffd166, size: 0.05 }); // 抽出引用：burst 换色（捕捉金/逃跑灰）复用同一材质
  const points = new THREE.Points(geo, mat);
  points.visible = false;
  points.frustumCulled = false; // 包围球固定在原点，粒子飞散时防止整体被剔除
  scene.add(points);
  let life = 0; // 剩余寿命（秒）
  const shakes = []; // 挣扎抖动队列：[{obj, base, t}]，t 为剩余时长（秒）

  function burst(center, color) {
    mat.color.setHex(color === undefined ? 0xffd166 : color); // 默认金色；逃跑烟尘传灰色
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

  function shake(obj) { // 挣扎抖动：记录基准缩放，0.35s 衰减正弦后归位
    shakes.push({ obj, base: obj.scale.x, t: 0.35 });
  }

  function update(dtMs) {
    const dt = dtMs / 1000;
    if (points.visible) { // 粒子：仅存活期推进（不能整体 early-return，挣扎抖动多发生在无粒子时）
      life -= dt;
      for (let i = 0; i < COUNT; i++) { // 就地累加，零分配
        positions[i * 3] += vels[i][0] * dt;
        positions[i * 3 + 1] += vels[i][1] * dt;
        positions[i * 3 + 2] += vels[i][2] * dt;
      }
      geo.attributes.position.needsUpdate = true;
      if (life <= 0) points.visible = false;
    }
    for (let i = shakes.length - 1; i >= 0; i--) { // 抖动：倒序遍历（边遍边删）
      const s = shakes[i];
      s.t -= dt;
      if (s.t <= 0) {
        s.obj.scale.setScalar(s.base); // 归位后移除
        shakes.splice(i, 1);
      } else {
        s.obj.scale.setScalar(s.base * (1 + 0.25 * Math.sin(s.t * 40) * (s.t / 0.35))); // 振幅随剩余时间线性衰减
      }
    }
  }

  return { burst, shake, update };
}
module.exports = { createEffects };
