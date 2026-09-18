// js/ar/vk_session.js — 真 AR：VKSession v2 平面检测 + YUV 相机背景（移植自官方 demo）
const NEAR = 0.001;
const FAR = 1000;

function initCameraQuad(gl) {
  const currentProgram = gl.getParameter(gl.CURRENT_PROGRAM); // 官方 demo 同款：进出都还原当前 program
  const vs = `
    attribute vec2 a_position;
    attribute vec2 a_texCoord;
    uniform mat3 displayTransform;
    varying vec2 v_texCoord;
    void main() {
      vec3 p = displayTransform * vec3(a_position, 0);
      gl_Position = vec4(p, 1);
      v_texCoord = a_texCoord;
    }`;
  const fs = `
    precision highp float;
    uniform sampler2D y_texture;
    uniform sampler2D uv_texture;
    varying vec2 v_texCoord;
    void main() {
      float Y = texture2D(y_texture, v_texCoord).r;
      vec2 uv = texture2D(uv_texture, v_texCoord).ra;
      float U = uv.x - 0.5;
      float V = uv.y - 0.5;
      gl_FragColor = vec4(Y + 1.402 * V, Y - 0.344 * U - 0.714 * V, Y + 1.772 * U, 1.0);
    }`;
  const compile = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    return s;
  };
  const program = gl.createProgram();
  const vertShaderSlot = compile(gl.VERTEX_SHADER, vs);
  const fragShaderSlot = compile(gl.FRAGMENT_SHADER, fs);
  gl.attachShader(program, vertShaderSlot);
  gl.attachShader(program, fragShaderSlot);
  gl.linkProgram(program);
  gl.deleteShader(vertShaderSlot); // 链接完成后句柄即可释放（官方 demo 同款）
  gl.deleteShader(fragShaderSlot);
  gl.useProgram(program);
  gl.uniform1i(gl.getUniformLocation(program, 'y_texture'), 5);
  gl.uniform1i(gl.getUniformLocation(program, 'uv_texture'), 6);
  const dt = gl.getUniformLocation(program, 'displayTransform');

  const ext = gl.getExtension('OES_vertex_array_object');
  if (!ext) throw new Error('OES_vertex_array_object 不可用'); // 由 ar_context 捕获 → 降级经典模式（开发者工具/老设备）
  const vao = ext.createVertexArrayOES();
  ext.bindVertexArrayOES(vao);
  const posAttr = gl.getAttribLocation(program, 'a_position');
  const pos = gl.createBuffer();
  vao.posBuffer = pos; // 官方 demo 同款：句柄挂在 VAO 上便于清理
  gl.bindBuffer(gl.ARRAY_BUFFER, pos);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([1, 1, -1, 1, 1, -1, -1, -1]), gl.STATIC_DRAW);
  gl.vertexAttribPointer(posAttr, 2, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(posAttr);
  const tcAttr = gl.getAttribLocation(program, 'a_texCoord');
  const tc = gl.createBuffer();
  vao.texcoordBuffer = tc; // 同上
  gl.bindBuffer(gl.ARRAY_BUFFER, tc);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([1, 1, 0, 1, 1, 0, 0, 0]), gl.STATIC_DRAW);
  gl.vertexAttribPointer(tcAttr, 2, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(tcAttr);
  ext.bindVertexArrayOES(null);
  gl.useProgram(currentProgram);
  return { program, dt, ext, vao };
}

function createVKAR(canvas, THREE, renderer) {
  const gl = renderer.getContext();
  const cam = initCameraQuad(gl);
  let session = null;
  let planeAnchor = null; // 首个锁定的平面锚
  let tracking = true;

  function renderCameraBackground(frame) {
    gl.disable(gl.DEPTH_TEST);
    const { yTexture, uvTexture } = frame.getCameraTexture(gl, 'yuv');
    const displayTransform = frame.getDisplayTransform();
    if (!yTexture || !uvTexture) return;
    const curProgram = gl.getParameter(gl.CURRENT_PROGRAM);
    const curActiveTex = gl.getParameter(gl.ACTIVE_TEXTURE);
    const curVAO = gl.getParameter(gl.VERTEX_ARRAY_BINDING);
    gl.useProgram(cam.program);
    cam.ext.bindVertexArrayOES(cam.vao);
    gl.uniformMatrix3fv(cam.dt, false, displayTransform);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.activeTexture(gl.TEXTURE0 + 5);
    const b5 = gl.getParameter(gl.TEXTURE_BINDING_2D);
    gl.bindTexture(gl.TEXTURE_2D, yTexture);
    gl.activeTexture(gl.TEXTURE0 + 6);
    const b6 = gl.getParameter(gl.TEXTURE_BINDING_2D);
    gl.bindTexture(gl.TEXTURE_2D, uvTexture);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindTexture(gl.TEXTURE_2D, b6);
    gl.activeTexture(gl.TEXTURE0 + 5);
    gl.bindTexture(gl.TEXTURE_2D, b5);
    gl.useProgram(curProgram);
    gl.activeTexture(curActiveTex);
    cam.ext.bindVertexArrayOES(curVAO);
  }

  return {
    isSupported() { return typeof wx.isVKSupport === 'function' && wx.isVKSupport('v2'); },
    start(onReady) {
      session = wx.createVKSession({ track: { plane: { mode: 3 } }, version: 'v2', gl });
      session.start((err) => {
        if (err) return onReady(err);
        session.on('addAnchors', (anchors) => {
          if (!planeAnchor && tracking) planeAnchor = anchors.find((a) => a.type === 0) || null;
        });
        session.on('updateAnchors', (anchors) => {
          if (!planeAnchor || !tracking) return;
          const u = anchors.find((a) => a.id === planeAnchor.id);
          if (u) planeAnchor.transform = u.transform;
        });
        session.on('removeAnchors', (anchors) => {
          if (planeAnchor && anchors.some((a) => a.id === planeAnchor.id)) planeAnchor = null;
        });
        onReady(null);
      });
    },
    getPlaneAnchor() { return planeAnchor; },
    // 锚定后调用 false：不再处理锚点矩阵更新。注：VK 引擎级平面追踪无法中途关闭，此处省事件处理开销
    setTracking(v) { tracking = v; },
    renderFrame(camera) {
      const frame = session && session.getVKFrame(canvas.width, canvas.height);
      if (!frame) return null;
      renderCameraBackground(frame);
      if (frame.camera) { // 官方相机对齐方式
        camera.matrixAutoUpdate = false;
        camera.matrixWorldInverse.fromArray(frame.camera.viewMatrix);
        camera.matrixWorld.getInverse(camera.matrixWorldInverse);
        camera.projectionMatrix.fromArray(frame.camera.getProjectionMatrix(NEAR, FAR));
        camera.projectionMatrixInverse.getInverse(camera.projectionMatrix);
      }
      return frame;
    },
    loop(cb) {
      const onFrame = () => {
        if (!session) return; // destroy 后一次性干净退出，防 TypeError
        cb();
        session.requestAnimationFrame(onFrame);
      };
      session.requestAnimationFrame(onFrame);
    },
    stop() { try { session.destroy(); } catch (e) { /* 已销毁 */ } session = null; },
  };
}
module.exports = { createVKAR };
