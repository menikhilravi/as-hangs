// render.js — accumulation targets for each world, then the camera: exposure, lens glare (bloom), tone map, grain.
'use strict';
const Render = (() => {
  let MS = 0.7, MSB = 0.58;   // resolution of the pictures traced while a world moves (the soft, defocused room takes less); a small
  // screen can afford more
  const R = { top: null, bot: null, topM: null, botM: null, fullTop: 1, fullBot: 1, frameTop: 0, nTop: 0, nBot: 0, hdr: null, mips: [] };
  let pCombine, pDown, pUp, pFinal;
  const combineFS = `
uniform sampler2D uTop; uniform sampler2D uTopSig; uniform sampler2D uBot; uniform vec2 uRes;
// each world has a full-resolution accumulator and a half-resolution one used while it moves; a still world refines from the
// half-resolution picture to the full one as samples arrive
uniform sampler2D uTopM; uniform sampler2D uTopSigM; uniform sampler2D uBotM; uniform float uFullTop; uniform float uFullBot;
uniform float uFreshTop; uniform float uFreshBot;   // 1 for the first frames back at full resolution (only then is the reduced picture a stand-in)
// hoisting ropes: vertical lines at z = 0 from y0 up out of the sky, drawn here with exact coverage
uniform vec4 uRopes[64]; uniform int uNRopes;
// the workshop camera and lamp, for dust motes drifting in the lamplight (drawn here, so the room keeps converging)
uniform sampler2D uBotSig;
// the chain's mirror image over the stone (Hooke's line of thrust): gold where the stone contains it, red where it has left the stone
// (x, y, danger, alpha); alpha < 0 starts a new line
uniform vec4 uGhost[128]; uniform int uNGhost; uniform float uGhostA; uniform vec4 uGhostBox;
uniform float uSplit; uniform float uExpTop; uniform float uExpBot;
uniform vec3 uCam; uniform float uTanH; uniform float uShift; uniform vec3 uSun; uniform vec3 uSunIrr; uniform vec3 uAmb;
vec3 ghostLine(vec3 c, vec3 rd, float inStone){
  float hTop = uRes.y * (1. - uSplit), pxPerM = hTop / (-uCam.z * uTanH);
  float tz = -uCam.z / rd.z; vec2 P = uCam.xy + rd.xy * tz;
  if (P.x < uGhostBox.x || P.x > uGhostBox.z || P.y < uGhostBox.y || P.y > uGhostBox.w) return c;
  float d = 1e9, dang = 0., al = 0.;
  for (int i = 0; i < 127; i++){
    if (i + 1 >= uNGhost) break; vec4 A = uGhost[i], B = uGhost[i + 1];
    if (A.w < 0. || B.w < 0.) continue;
    vec2 ab = B.xy - A.xy; float h = clamp(dot(P - A.xy, ab) / max(dot(ab, ab), 1e-9), 0., 1.), dd = length(P - A.xy - ab * h);
    if (dd < d){ d = dd; dang = mix(A.z, B.z, h); al = mix(A.w, B.w, h); }
  }
  float w = d * pxPerM, core = 1. - smoothstep(.5, 1.5, w), halo = exp(-w * w / 30.);
  // at rest it is drawn as a fine dotted line (an annotation, plainly not part of the stone); under a hand it is solid
  if (al < .6){ float along = (P.x + P.y) * .7 * pxPerM; core *= mix(smoothstep(.15, .45, abs(fract(along / 7.) - .5) * 2.), 1., smoothstep(.45, .7, al)); halo *= .4; }
  // gold where the stone holds it comfortably, warming to red as it nears the stone's edge; red where it has left the stone
  vec3 col = inStone > .5 ? mix(vec3(1.35, .92, .42), vec3(1.9, .4, .16), smoothstep(.3, 1., dang)) : vec3(1.9, .4, .16);
  float k = al * (inStone > .5 ? .55 + .45 * smoothstep(.2, 1., dang) : 1.);
  return c + col * (core + .35 * halo) * k;
}
vec3 ropes(vec3 c, vec3 rd, float tmax, float px){
  float hTop = uRes.y * (1. - uSplit), pxPerM = hTop / (-uCam.z * uTanH);
  float tz = -uCam.z / rd.z; if (tz > tmax + .05) return c;          // something stands in front of the rope plane
  float y = uCam.y + rd.y * tz;
  vec3 col = vec3(.15, .115, .08) * (uSunIrr * .22 / 3.14159 + uAmb * .9);
  for (int i = 0; i < 64; i++){
    if (i >= uNRopes) break; vec4 r = uRopes[i];
    if (y < r.y) continue;
    float sx = .5 * uRes.x + (r.x - uCam.x) * pxPerM, wpx = r.z * 2. * pxPerM;
    float cover = clamp(min(wpx, 1.) * (1. - smoothstep(max(wpx, 1.) * .5 - .5, max(wpx, 1.) * .5 + .5, abs(px - sx))), 0., 1.);
    cover *= smoothstep(r.y, r.y + .08, y);
    c = mix(c, col, cover);
  }
  return c;
}
// dust motes, placed and lit on the CPU: (screen x, y, blur radius px, distance) and colour
uniform vec4 uMoteA[56]; uniform vec4 uMoteB[56]; uniform int uNMotes;
vec3 motes(vec3 c, vec2 fc, float tSurf){
  for (int i = 0; i < 56; i++){
    if (i >= uNMotes) break; vec4 A = uMoteA[i];
    vec2 dd = fc - A.xy; float r2 = dot(dd, dd), cc = A.z * A.z;
    if (r2 > cc * 9. || A.w > tSurf + .02) continue;
    c += uMoteB[i].rgb * exp(-r2 / cc) / cc;
  }
  return c;
}
void main(){
  vec2 fc = gl_FragCoord.xy; float split = uSplit * uRes.y; vec3 c;
  if (fc.y >= split){
    vec2 t = vec2(fc.x / uRes.x, (fc.y - split) / (uRes.y - split));
    vec4 full = texture(uTop, t); float w = uFullTop * (uFreshTop > .5 ? smoothstep(1., 3., full.a) : 1.);
    c = mix(texture(uTopM, t).rgb, full.rgb, w);
    if (uNDust > 0 || uNRopes > 0 || uGhostA > .003){
      float hTop = uRes.y - split;
      vec3 rd = normalize(vec3((fc.x - .5 * uRes.x) / hTop * uTanH, (fc.y - split) / hTop * uTanH + uShift, 1.));
      vec4 sg = w > .5 ? texture(uTopSig, t) : texture(uTopSigM, t);
      float tmax = sg.y < 0. ? 1e5 : sg.y;   // (the sky has no distance)
      c = ropes(c, rd, tmax, fc.x);
      if (uGhostA > .003) c = ghostLine(c, rd, sg.x > -.5 ? 1. : 0.);   // (ids ≥ 0 are stones; the plain and sky are −1)
      if (uNDust > 0){ vec4 dl = dustAlong(uCam, rd, tmax, uSun, uSunIrr, uAmb); c = c * dl.a + dl.rgb; }
    }
    c *= uExpTop;
  }
  else { vec2 t = vec2(fc.x / uRes.x, (split - fc.y) / split); vec4 full = texture(uBot, t); float w = uFullBot * (uFreshBot > .5 ? smoothstep(1., 3., full.a) : 1.);
    c = mix(texture(uBotM, t).rgb, full.rgb, w);
    if (uNMotes > 0) c = motes(c, fc, texture(uBotSig, t).y);
    c *= uExpBot; }
  o = vec4(c, 1.);
}`;
  // dual-filter style down/up sampling
  const downFS = `
uniform sampler2D uSrc; uniform vec2 uTexel;
void main(){
  vec2 t = uTexel;
  vec3 c = texture(uSrc, uv).rgb * 4.;
  c += texture(uSrc, uv + vec2(-t.x, -t.y)).rgb + texture(uSrc, uv + vec2(t.x, -t.y)).rgb + texture(uSrc, uv + vec2(-t.x, t.y)).rgb + texture(uSrc, uv + t).rgb;
  o = vec4(min(c / 8., vec3(60.)), 1.);
}`;
  const upFS = `
uniform sampler2D uSrc; uniform sampler2D uBase; uniform vec2 uTexel; uniform float uMix;
void main(){
  vec2 t = uTexel;
  vec3 c = texture(uSrc, uv + vec2(-2. * t.x, 0.)).rgb + texture(uSrc, uv + vec2(2. * t.x, 0.)).rgb + texture(uSrc, uv + vec2(0., -2. * t.y)).rgb + texture(uSrc, uv + vec2(0., 2. * t.y)).rgb;
  c += (texture(uSrc, uv + vec2(-t.x, t.y)).rgb + texture(uSrc, uv + vec2(t.x, t.y)).rgb + texture(uSrc, uv + vec2(-t.x, -t.y)).rgb + texture(uSrc, uv + vec2(t.x, -t.y)).rgb) * 2.;
  c /= 12.;
  o = vec4(texture(uBase, uv).rgb + c * uMix, 1.);
}`;
  const finalFS = `
uniform sampler2D uHdr; uniform sampler2D uBloom; uniform vec2 uRes; uniform float uBloomK; uniform int uFrame; uniform float uSplit;
void main(){
  vec2 fc = gl_FragCoord.xy, t = fc / uRes;
  vec3 c = texture(uHdr, t).rgb;
  c = mix(c, texture(uBloom, t).rgb / 6., uBloomK);
  c = filmic(c);
  vec2 q = t - .5; c *= 1. - .26 * dot(q * vec2(1.05, 1.), q * vec2(1.05, 1.)) * 1.5;
  c = toSRGB(c);
  float g = (h21(fc + float(uFrame % 64) * 17.) - .5) * (2.2 / 255.);
  o = vec4(c + g, 1.);
}`;
  // a world starting to move begins its reduced-resolution history from its converged full-resolution picture (no flash of noise)
  const seedFS = `
uniform sampler2D uSrc; uniform sampler2D uSrcSig; uniform float uScale;
layout(location = 1) out vec4 oSig;
void main(){ o = texture(uSrc, uv); o.a = min(o.a, 12.); oSig = texelFetch(uSrcSig, ivec2(gl_FragCoord.xy / uScale), 0); }`;
  let pSeed, pDenoise;
  function seed(from, to) { GL.draw(pSeed, { uSrc: from[0].texs[0], uSrcSig: from[0].texs[1], uScale: to[0].w / from[0].w }, to[0]); }
  // denoise: an edge-aware à-trous step over an accumulation buffer — it never blends across another surface or a depth step,
  // and fades out as samples accumulate (a converged picture passes through untouched)
  const denoiseFS = `
uniform sampler2D uCol; uniform sampler2D uSig; uniform sampler2D uIn; uniform int uStep;
void main(){
  ivec2 p = ivec2(gl_FragCoord.xy), sz = textureSize(uCol, 0) - 1;
  vec4 c0 = texelFetch(uCol, p, 0); vec3 x0 = texelFetch(uIn, p, 0).rgb; vec4 s0 = texelFetch(uSig, p, 0);
  float n = max(c0.a, 1.);
  if (n >= 64.) { o = vec4(x0, c0.a); return; }
  float l0 = dot(x0, vec3(.2126, .7152, .0722));
  if (uStep == 1 && n < 24.){
    // a lone spark among few samples is replaced by its neighbourhood (same surface only)
    vec3 m = vec3(0); float cnt = 0.;
    for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++){ if (i == 0 && j == 0) continue; ivec2 q = clamp(p + ivec2(i, j), ivec2(0), sz); if (abs(texelFetch(uSig, q, 0).x - s0.x) > .5) continue; m += texelFetch(uIn, q, 0).rgb; cnt += 1.; }
    if (cnt > 3.){ m /= cnt; float lm = dot(m, vec3(.2126, .7152, .0722)); if (l0 > 2.5 * lm + .05) { x0 = m; l0 = lm; } }
  }
  float sigL = .9 * (l0 + .03) / sqrt(n);
  vec3 acc = vec3(0); float ws = 0.;
  float k[3] = float[3](.375, .25, .0625);
  for (int j = -2; j <= 2; j++) for (int i = -2; i <= 2; i++){
    ivec2 q = clamp(p + ivec2(i, j) * uStep, ivec2(0), sz);
    vec4 sq = texelFetch(uSig, q, 0);
    if (abs(sq.x - s0.x) > .5 || abs(sq.y - s0.y) > max(.03, s0.y * .03)) continue;
    vec3 x = texelFetch(uIn, q, 0).rgb;
    float w = k[abs(i)] * k[abs(j)] * exp(-abs(dot(x, vec3(.2126, .7152, .0722)) - l0) / sigL);
    acc += x * w; ws += w;
  }
  o = vec4(acc / max(ws, 1e-6), c0.a);
}`;
  function denoise(T, F) { GL.draw(pDenoise, { uCol: T[0].texs[0], uSig: T[0].texs[1], uIn: T[0].texs[0], uStep: { i: 1 } }, F[0]); GL.draw(pDenoise, { uCol: T[0].texs[0], uSig: T[0].texs[1], uIn: F[0].tex, uStep: { i: 2 } }, F[1]); return F[1]; }
  function init() {
    pSeed = GL.program('seed', seedFS, GLSL.common);
    pDenoise = GL.program('denoise', denoiseFS, GLSL.common);
    pCombine = GL.program('combine', combineFS, GLSL.common + Dust.glsl);
    pDown = GL.program('down', downFS, GLSL.common);
    pUp = GL.program('up', upFS, GLSL.common);
    pFinal = GL.program('final', finalFS, GLSL.common);
  }
  function resize(W, H, split) {
    for (const k of ['top', 'bot', 'topM', 'botM', 'topF', 'botF', 'topMF', 'botMF']) if (R[k]) { GL.free(R[k][0]); GL.free(R[k][1]); }
    if (R.hdr) GL.free(R.hdr); R.mips.forEach(m => { GL.free(m.d); GL.free(m.u); });
    const ht = Math.round(H * (1 - split)), hb = H - ht;
    const small = W * H < 600000; MS = small ? 1 : 0.7; MSB = small ? 0.8 : 0.58;
    R.top = [GL.mrt(W, ht, 2), GL.mrt(W, ht, 2)];
    R.bot = [GL.mrt(W, hb, 2), GL.mrt(W, hb, 2)];
    const mw = Math.max(1, Math.round(W * MS)), mt = Math.max(1, Math.round(ht * MS)), bw = Math.max(1, Math.round(W * MSB)), mb = Math.max(1, Math.round(hb * MSB));
    R.topM = [GL.mrt(mw, mt, 2), GL.mrt(mw, mt, 2)];
    R.botM = [GL.mrt(bw, mb, 2), GL.mrt(bw, mb, 2)];
    const F = (w, h) => [GL.target(w, h, { format: 'rgba16f' }), GL.target(w, h, { format: 'rgba16f' })];
    R.topF = F(W, ht); R.botF = F(W, hb); R.topMF = F(mw, mt); R.botMF = F(bw, mb);
    R.hdr = GL.target(W, H, { format: 'rgba16f' });
    R.mips = [];
    let w = W, h = H;
    for (let i = 0; i < 6; i++) { w = Math.max(1, w >> 1); h = Math.max(1, h >> 1); R.mips.push({ d: GL.target(w, h, { format: 'rgba16f' }), u: GL.target(w, h, { format: 'rgba16f' }) }); }
    R.nTop = R.nBot = 0; R.W = W; R.H = H; R.split = split;
  }
  const MA = new Float32Array(224);
  function ghostBox(g) { let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9; for (const p of g) if (p[3] >= 0) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); } return [x0 - 1, y0 - 1, x1 + 1, y1 + 1]; }
  const GD = new Float32Array(512);
  function ghostData(g) { GD.fill(0); if (g) g.slice(0, 128).forEach((p, i) => GD.set(p, i * 4)); return GD; }
  const RD = new Float32Array(256);
  function ropeData(list) { RD.fill(0); list.slice(0, 64).forEach((r, i) => RD.set([r.x, r.y0, 0.04, 0], i * 4)); return RD; }
  function composite(opts) {
    const gl = GL.gl;
    const d = Dust.D, cam = opts.cam || {};
    const tF = R.fullTop ? denoise(R.top, R.topF) : null, bF = R.fullBot ? denoise(R.bot, R.botF) : null;
    const tM = R.fullTop < 1 || R.blendTop ? denoise(R.topM, R.topMF) : R.topMF[1], bM = R.fullBot < 1 || R.blendBot ? denoise(R.botM, R.botMF) : R.botMF[1];
    GL.draw(pCombine, { uTop: tF ? tF.tex : R.top[0].texs[0], uTopSig: R.top[0].texs[1], uBot: bF ? bF.tex : R.bot[0].texs[0], uTopM: tM.tex, uTopSigM: R.topM[0].texs[1], uBotM: bM.tex, uTopCount: R.top[0].texs[0], uBotCount: R.bot[0].texs[0], uFullTop: R.fullTop, uFullBot: R.fullBot, uFreshTop: R.freshTop || 0, uFreshBot: R.freshBot || 0, uRes: [R.W, R.H], uSplit: R.split, uExpTop: opts.expTop, uExpBot: opts.expBot,
      uCam: cam.pos || [0, 0, 0], uTanH: cam.tanH || 0.4, uShift: cam.shift || 0, uSun: opts.sun || [0, 1, 0], uSunIrr: opts.sunIrr || [1, 1, 1], uAmb: opts.amb || [.2, .2, .2],
      uDust0: { v4: d.data0 }, uDust1: { v4: d.data1 }, uNDust: { i: d.n }, uRopes: { v4: ropeData(opts.ropes || []) }, uNRopes: { i: Math.min(64, (opts.ropes || []).length) },
      uGhost: { v4: ghostData(opts.ghost) }, uNGhost: { i: opts.ghost ? Math.min(128, opts.ghost.length) : 0 }, uGhostA: opts.ghost && opts.ghost.length ? 1 : 0,
      uBotSig: R.bot[0].texs[1], uMoteA: { v4: opts.motes ? opts.motes.A : MA }, uMoteB: { v4: opts.motes ? opts.motes.B : MA }, uNMotes: { i: opts.motes ? opts.motes.n : 0 },
      uGhostBox: opts.ghost && opts.ghost.length ? ghostBox(opts.ghost) : [0, 0, 0, 0] }, R.hdr);
    let src = R.hdr;
    for (const m of R.mips) { GL.draw(pDown, { uSrc: src.tex, uTexel: [1 / src.w, 1 / src.h] }, m.d); src = m.d; }
    // upsample: start from the smallest, accumulate into each level's 'u'
    let up = R.mips[R.mips.length - 1].d;
    for (let i = R.mips.length - 2; i >= 0; i--) { const m = R.mips[i]; GL.draw(pUp, { uSrc: up.tex, uBase: m.d.tex, uTexel: [1 / up.w, 1 / up.h], uMix: 1.0 }, m.u); up = m.u; }
    GL.draw(pFinal, { uHdr: R.hdr.tex, uBloom: up.tex, uRes: [gl.drawingBufferWidth, gl.drawingBufferHeight], uBloomK: opts.bloom ?? 0.06, uFrame: { i: R.frameTop++ }, uSplit: R.split }, null);
  }
  return { R, init, resize, composite, seed };
})();
