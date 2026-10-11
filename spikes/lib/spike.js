// spike.js — scaffolding for progressive (accumulating) shader spikes. Classic script; needs glkit.js (+ ptlib.js if used).
// Usage: SPIKE.run({ trace: glslString, display?: glslString, samples: 256, scale: 1, uniforms: () => ({...}) })
// The trace shader gets `uniform sampler2D prev;` and must write the running mean: mix(prev, new, 1/(F+1)).
// URL params: ?spp=N (samples to accumulate), ?scale=s (render scale), ?t=seconds (fixed time).
(function () {
  const Q = new URLSearchParams(location.search);
  const SPIKE = { Q };
  SPIKE.run = function (opt) {
    const c = document.createElement('canvas');
    document.body.appendChild(c);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const scale = +(Q.get('scale') || opt.scale || 1);
    const W = Math.round(innerWidth * dpr * scale), H = Math.round(innerHeight * dpr * scale);
    c.width = W; c.height = H;
    c.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;display:block';
    const gl = GLK.init(c); SPIKE.gl = gl;
    const acc = [GLK.target(gl, W, H), GLK.target(gl, W, H)];
    const trace = GLK.program(gl, GLK.common + (GLK.pt || '') + '\nuniform sampler2D prev;\n' + opt.trace);
    const display = GLK.program(gl, GLK.common + '\nuniform sampler2D img;\n' + (opt.display || `
      void main(){ vec3 c = texture(img, uv).rgb; c = tonemap(c);
        float g = (hash2(gl_FragCoord.xy + float(F)) - .5) / 255.; o = vec4(toSRGB(c) + g, 1.); }`));
    const spp = +(Q.get('spp') || opt.samples || 128);
    const fixedT = Q.has('t') ? +Q.get('t') : null;
    let f = 0, t0 = performance.now();
    SPIKE.reset = () => { f = 0; };
    SPIKE.state = { done: false, frames: 0 };
    const extra = opt.uniforms || (() => ({}));
    function frame(now) {
      const T = fixedT !== null ? fixedT : (now - t0) / 1000;
      if (f < spp || opt.animate) {
        const u = Object.assign({ R: [W, H], T, F: { i: opt.animate ? 0 : f }, M: SPIKE.mouse || [0, 0, 0, 0], prev: acc[f & 1] }, extra(T, f));
        GLK.draw(gl, trace, u, acc[(f + 1) & 1]);
        f++;
      }
      GLK.draw(gl, display, Object.assign({ img: acc[f & 1], R: [W, H], F: { i: f } }, opt.displayUniforms ? opt.displayUniforms(T) : {}), null);
      SPIKE.state = { done: f >= spp, frames: f, w: W, h: H };
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
    addEventListener('pointermove', e => { SPIKE.mouse = [e.clientX * dpr * scale, (innerHeight - e.clientY) * dpr * scale, e.buttons, 0]; });
    return { gl, canvas: c };
  };
  // Wait helper for snap.mjs: {"eval":"SPIKE.wait()"} resolves when accumulation is done.
  SPIKE.wait = () => new Promise(r => { const k = () => SPIKE.state.done ? r(SPIKE.state) : setTimeout(k, 100); k(); });
  window.SPIKE = SPIKE;
})();
