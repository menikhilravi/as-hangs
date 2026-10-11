// glkit.js — minimal WebGL2 helpers for sensory spikes. Classic script (works from file://); exposes window.GLK.
(function () {
  const GLK = {};
  const VS = `#version 300 es
  in vec2 p; out vec2 uv;
  void main(){ uv = p * .5 + .5; gl_Position = vec4(p, 0., 1.); }`;

  GLK.init = function (canvas, opts = {}) {
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, preserveDrawingBuffer: true, powerPreference: 'high-performance', ...opts });
    if (!gl) throw new Error('WebGL2 unavailable');
    GLK.floatRT = !!gl.getExtension('EXT_color_buffer_float');
    gl.getExtension('OES_texture_float_linear');
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.__tri = buf;
    return gl;
  };

  function compile(gl, type, src) {
    const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(s);
      const lines = src.split('\n').map((l, i) => (i + 1 + '').padStart(4) + ' ' + l);
      const m = /0:(\d+)/.exec(log || ''); const at = m ? +m[1] : 0;
      console.error(log + '\n' + lines.slice(Math.max(0, at - 4), at + 3).join('\n'));
      throw new Error('shader compile failed');
    }
    return s;
  }

  // fs: fragment source without #version; gets `in vec2 uv; out vec4 o;` and common uniforms prepended.
  GLK.program = function (gl, fs, extraHeader = '') {
    const head = `#version 300 es
precision highp float; precision highp int; precision highp sampler2D;
in vec2 uv; out vec4 o;
uniform vec2 R; uniform float T; uniform int F; uniform vec4 M;
${extraHeader}
`;
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, VS));
    gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, head + fs));
    gl.bindAttribLocation(p, 0, 'p');
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) { console.error(gl.getProgramInfoLog(p)); throw new Error('link failed'); }
    p.__u = {};
    return p;
  };

  GLK.target = function (gl, w, h, { float = true, linear = true } = {}) {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    const fl = float && GLK.floatRT;
    gl.texImage2D(gl.TEXTURE_2D, 0, fl ? gl.RGBA32F : gl.RGBA8, w, h, 0, gl.RGBA, fl ? gl.FLOAT : gl.UNSIGNED_BYTE, null);
    const f = linear ? gl.LINEAR : gl.NEAREST;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, f); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, f);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { tex: t, fb, w, h };
  };

  GLK.texture = function (gl, w, h, data, { float = false, linear = true, wrap = 'clamp' } = {}) {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    if (float) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, w, h, 0, gl.RGBA, gl.FLOAT, data);
    else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
    const f = linear ? gl.LINEAR : gl.NEAREST, wr = wrap === 'repeat' ? gl.REPEAT : gl.CLAMP_TO_EDGE;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, f); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, f);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wr); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wr);
    return t;
  };

  // draw(prog, {uniformName: value | {tex, unit}}, target|null)
  GLK.draw = function (gl, prog, uniforms, target) {
    gl.useProgram(prog);
    let unit = 0;
    for (const k in uniforms) {
      let loc = prog.__u[k]; if (loc === undefined) loc = prog.__u[k] = gl.getUniformLocation(prog, k);
      if (loc === null) continue;
      const v = uniforms[k];
      if (v && v.tex !== undefined) { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, v.tex); gl.uniform1i(loc, unit++); }
      else if (v instanceof WebGLTexture) { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, v); gl.uniform1i(loc, unit++); }
      else if (typeof v === 'number') gl.uniform1f(loc, v);
      else if (v && v.i !== undefined) gl.uniform1i(loc, v.i);
      else if (v && v.v2 !== undefined) gl.uniform2fv(loc, v.v2);
      else if (v && v.f !== undefined) gl.uniform1fv(loc, v.f);
      else if (v && v.v3 !== undefined) gl.uniform3fv(loc, v.v3);
      else if (v.length === 2) gl.uniform2fv(loc, v);
      else if (v.length === 3) gl.uniform3fv(loc, v);
      else if (v.length === 4) gl.uniform4fv(loc, v);
      else if (v.length === 9) gl.uniformMatrix3fv(loc, false, v);
      else if (v.length === 16) gl.uniformMatrix4fv(loc, false, v);
      else gl.uniform1fv(loc, v);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fb : null);
    const w = target ? target.w : gl.drawingBufferWidth, h = target ? target.h : gl.drawingBufferHeight;
    gl.viewport(0, 0, w, h);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.__tri);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  // Shared GLSL: hashing, tone mapping (AgX-ish filmic), noise.
  GLK.common = `
  #define PI 3.14159265359
  uint _h(uint x){ x ^= x >> 16; x *= 0x7feb352dU; x ^= x >> 15; x *= 0x846ca68bU; x ^= x >> 16; return x; }
  float hash1(uint x){ return float(_h(x)) / 4294967296.; }
  float hash2(vec2 p){ uvec2 q = uvec2(ivec2(floor(p))); return hash1(q.x * 1973U + q.y * 9277U + 26699U); }
  float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
    return mix(mix(hash2(i), hash2(i+vec2(1,0)), f.x), mix(hash2(i+vec2(0,1)), hash2(i+vec2(1,1)), f.x), f.y); }
  float fbm(vec2 p){ float s = 0., a = .5; for (int i = 0; i < 6; i++){ s += a * vnoise(p); p = p * 2.03 + 17.1; a *= .5; } return s; }
  // Filmic tone map (Hable-like shoulder, gentle toe), then sRGB.
  vec3 tonemap(vec3 x){ x = max(x, 0.); vec3 a = x * (2.51 * x + .03), b = x * (2.43 * x + .59) + .14; return clamp(a / b, 0., 1.); }
  vec3 toSRGB(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1. / 2.4)) - .055, step(.0031308, c)); }
  `;

  window.GLK = GLK;
})();
