// gl.js — small WebGL2 layer: context, programs with readable errors, float targets, textures, full-screen draws.
'use strict';
const GL = (() => {
  const VS = `#version 300 es
  in vec2 p; out vec2 uv;
  void main(){ uv = p * .5 + .5; gl_Position = vec4(p, 0., 1.); }`;
  let gl = null;

  function init(canvas) {
    gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: false, stencil: false, preserveDrawingBuffer: false, powerPreference: 'high-performance' });
    if (!gl) return null;
    GL.floatRT = !!gl.getExtension('EXT_color_buffer_float');
    GL.floatLinear = !!gl.getExtension('OES_texture_float_linear');
    gl.getExtension('EXT_color_buffer_half_float');
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    GL.gl = gl; GL.tri = buf;
    return gl;
  }

  function compile(type, src, name) {
    const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS) && !gl.isContextLost()) {
      const log = gl.getShaderInfoLog(s) || '';
      const m = /0:(\d+)/.exec(log); const at = m ? +m[1] : 0;
      const lines = src.split('\n').map((l, i) => String(i + 1).padStart(4) + ' ' + l);
      console.error(`[${name}] ${log}\n` + lines.slice(Math.max(0, at - 5), at + 3).join('\n'));
      throw new Error('shader compile failed: ' + name);
    }
    return s;
  }

  // fragment source gets a standard header; `defs` is extra preamble (constants, includes)
  function program(name, fs, defs = '') {
    const head = `#version 300 es
precision highp float; precision highp int; precision highp sampler2D;
in vec2 uv; layout(location = 0) out vec4 o;
${defs}
`;
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl.VERTEX_SHADER, VS, name + '.vs'));
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, head + fs, name));
    gl.bindAttribLocation(p, 0, 'p');
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS) && !gl.isContextLost()) { console.error(name, gl.getProgramInfoLog(p)); throw new Error('link failed: ' + name); }
    p.u = {}; p.name = name;
    return p;
  }

  function texture(w, h, { format = 'rgba32f', filter = 'linear', wrap = 'clamp', data = null } = {}) {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    const F = {
      rgba32f: [gl.RGBA32F, gl.RGBA, gl.FLOAT],
      rgba16f: [gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT],
      rgba8: [gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE],
    }[format];
    gl.texImage2D(gl.TEXTURE_2D, 0, F[0], w, h, 0, F[1], F[2], data);
    const f = filter === 'linear' && (format !== 'rgba32f' || GL.floatLinear) ? gl.LINEAR : gl.NEAREST;
    const wr = wrap === 'repeat' ? gl.REPEAT : gl.CLAMP_TO_EDGE;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, f); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, f);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wr); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wr);
    t.w = w; t.h = h; t.fmt = F;
    return t;
  }
  function upload(t, data, w = t.w, h = t.h) {
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, w, h, t.fmt[1], t.fmt[2], data);
  }
  function target(w, h, opts = {}) {
    const fmt = opts.format || (GL.floatRT ? 'rgba32f' : 'rgba16f');
    const tex = texture(w, h, { ...opts, format: fmt });
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { tex, fb, w, h };
  }
  // multiple render targets: n float textures on one framebuffer
  function mrt(w, h, n, format) {
    const fmt = format || (GL.floatRT ? 'rgba32f' : 'rgba16f');
    const texs = []; const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    for (let i = 0; i < n; i++) { const t = texture(w, h, { format: fmt, filter: i === 0 ? 'linear' : 'nearest' }); texs.push(t); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.TEXTURE_2D, t, 0); }
    gl.drawBuffers(texs.map((_, i) => gl.COLOR_ATTACHMENT0 + i));
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { tex: texs[0], texs, fb, w, h };
  }
  function free(t) { if (t && t.texs) { t.texs.forEach(x => gl.deleteTexture(x)); gl.deleteFramebuffer(t.fb); return; } if (!t) return; if (t.fb) gl.deleteFramebuffer(t.fb); gl.deleteTexture(t.tex || t); }

  // uniforms: number → float; {i} → int; {f:[..]} → float[]; {v2:[..]} → vec2[]; {v4:[..]} → vec4[]; 2/3/4-arrays → vecN; 9/16 → mat
  function draw(p, uniforms, tgt, vp) {
    gl.useProgram(p);
    let unit = 0;
    for (const k in uniforms) {
      let loc = p.u[k]; if (loc === undefined) loc = p.u[k] = gl.getUniformLocation(p, k);
      if (loc === null) continue;
      const v = uniforms[k];
      if (v instanceof WebGLTexture) { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, v); gl.uniform1i(loc, unit++); }
      else if (v && v.tex instanceof WebGLTexture) { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, v.tex); gl.uniform1i(loc, unit++); }
      else if (typeof v === 'number') gl.uniform1f(loc, v);
      else if (typeof v === 'boolean') gl.uniform1i(loc, v ? 1 : 0);
      else if (v.i !== undefined) gl.uniform1i(loc, v.i);
      else if (v.f !== undefined) gl.uniform1fv(loc, v.f);
      else if (v.v2 !== undefined) gl.uniform2fv(loc, v.v2);
      else if (v.v3 !== undefined) gl.uniform3fv(loc, v.v3);
      else if (v.v4 !== undefined) gl.uniform4fv(loc, v.v4);
      else if (v.length === 2) gl.uniform2fv(loc, v);
      else if (v.length === 3) gl.uniform3fv(loc, v);
      else if (v.length === 4) gl.uniform4fv(loc, v);
      else if (v.length === 9) gl.uniformMatrix3fv(loc, false, v);
      else if (v.length === 16) gl.uniformMatrix4fv(loc, false, v);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, tgt ? tgt.fb : null);
    if (vp) gl.viewport(vp[0], vp[1], vp[2], vp[3]);
    else gl.viewport(0, 0, tgt ? tgt.w : gl.drawingBufferWidth, tgt ? tgt.h : gl.drawingBufferHeight);
    gl.bindBuffer(gl.ARRAY_BUFFER, GL.tri);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  return { init, program, texture, upload, target, mrt, free, draw };
})();
