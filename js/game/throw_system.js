// js/game/throw_system.js — 单球在场上：滑动出手 → 物理飞行 → 扫掠命中/落地
const { computeThrowVelocity } = require('./ballistics.js');
const { circleRadius, judgeHit } = require('./hit_circles.js');

function createThrowSystem({ THREE, scene, camera, canvas, config, bus }) {
  const BALL_R = 0.05;
  const info = wx.getSystemInfoSync(); // 逻辑分辨率缓存，避免每帧系统调用
  const logicalW = info.windowWidth;
  const logicalH = info.windowHeight;
  const state = {
    swipeStart: null, ball: null, vel: null, aimStartAt: 0, target: null,
    enabled: true, // Task 14 的 HUD 显示时置 false，吞掉触摸
    ballColor: 0xffffff, // 当前球色：随选中球种切换（game.js 的 setBallColor 写入），出手时取用
    groundY: 0.02,
    prev: new THREE.Vector3(), tmpA: new THREE.Vector3(), tmpB: new THREE.Vector3(), tmpC: new THREE.Vector3(),
  };

  function spawnBall() {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(BALL_R, 12, 12),
      new THREE.MeshBasicMaterial({ color: state.ballColor })
    );
    mesh.position.set(0, -0.2, -0.3); // 相机稍下方出手
    camera.add(mesh);
    return mesh;
  }

  wx.onTouchStart((e) => {
    if (!state.enabled) return;
    state.swipeStart = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() };
  });

  wx.onTouchEnd((e) => {
    if (!state.enabled || !state.swipeStart || state.ball) return;
    const end = e.changedTouches[0];
    const swipe = {
      dx: end.clientX - state.swipeStart.x,
      dy: end.clientY - state.swipeStart.y,
      ms: Date.now() - state.swipeStart.t,
    };
    state.swipeStart = null;
    const v = computeThrowVelocity(swipe, config);
    if (!v || !state.target) return;
    const camQuat = camera.getWorldQuaternion(new THREE.Quaternion());
    state.vel = new THREE.Vector3(v.vx, v.vy, -v.vz).applyQuaternion(camQuat); // 相机系：屏幕上方 = 相机前方(-z)，随设备朝向
    state.ball = spawnBall();
    state.aimStartAt = Date.now(); // 瞄准圈计时随出手重置
    bus.emit('ball:thrown');
  });

  // 扫掠球检测：线段 [prev, cur] 到目标中心最近距离（防高速隧穿）
  function sweptHit(prev, cur, center, radius) {
    const seg = state.tmpA.subVectors(cur, prev);
    const segLen2 = seg.lengthSq();
    const toC = state.tmpB.subVectors(center, prev);
    const t = segLen2 > 1e-9 ? Math.max(0, Math.min(1, toC.dot(seg) / segLen2)) : 0;
    const closest = seg.multiplyScalar(t).add(prev);
    return closest.distanceTo(center) <= BALL_R + radius;
  }

  return {
    setTarget(t) { state.target = t; },
    setEnabled(v) { state.enabled = v; },
    setGroundY(y) { state.groundY = y; },
    setBallColor(color) { state.ballColor = color; },
    // 扣球失败时撤回已生成的球（球先出后扣失败 = 免费投掷漏洞）；spawnBall 返回 mesh 本体，
    // 出手时挂 camera、update 首帧转挂 scene，故按实际父级摘除，任一阶段都能正确移除
    cancelBall() {
      if (!state.ball) return;
      if (state.ball.parent) state.ball.parent.remove(state.ball);
      state.ball = null; // TouchEnd 以 state.ball 为再投闸门：置空后下次滑动可立即重投
      state.vel = null;
    },
    hasBallInFlight() { return !!state.ball; },
    getAimStartAt() { return state.aimStartAt; }, // 瞄准圈可视化与判定共用同一时钟起点
    update(dtMs) {
      if (!state.ball) return;
      const dt = dtMs / 1000;
      const b = state.ball;
      if (b.parent !== scene) { // 出手后第一帧：相机局部坐标转世界系
        camera.localToWorld(b.position);
        scene.add(b);
      }
      state.prev.copy(b.position);
      state.vel.y += config.throw.gravity * dt;
      b.position.addScaledVector(state.vel, dt);

      const t = state.target;
      if (t) {
        const c = t.obj.getWorldPosition(state.tmpC);
        if (sweptHit(state.prev, b.position, c, t.radius)) {
          // 命中：球与精灵的屏幕投影距离 → 收缩圈分区
          const pa = state.tmpA.copy(b.position).project(camera);
          const pd = c.clone().project(camera);
          const sx = (pa.x - pd.x) * logicalW / 2;
          const sy = (pa.y - pd.y) * logicalH / 2;
          const zone = judgeHit(Math.hypot(sx, sy), circleRadius(Date.now() - state.aimStartAt, config), config);
          bus.emit('ball:creature', { creature: t, id: t.data.id, zone });
          scene.remove(b);
          state.ball = null; state.vel = null;
          return;
        }
      }
      if (b.position.y <= state.groundY) {
        bus.emit('ball:ground');
        scene.remove(b);
        state.ball = null; state.vel = null;
      }
    },
  };
}
module.exports = { createThrowSystem };
