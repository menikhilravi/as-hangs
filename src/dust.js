// dust.js — puffs of limestone dust: expanding, drifting, fading Gaussian blobs, rendered analytically per frame.
'use strict';
const Dust = (() => {
  const MAX = 40, puffs = [];
  const D = { data0: new Float32Array(MAX * 4), data1: new Float32Array(MAX * 4), n: 0 };
  // x, y in stone metres (arch plane), s = strength
  function add(x, y, s = 1, z = 0) {
    const n = 2 + Math.round(s * 4);
    const low = y < 1.5;   // stones hitting the ground throw dust that rolls outward along it
    for (let k = 0; k < n; k++) {
      if (puffs.length >= MAX) puffs.shift();
      const a = Math.random() * 6.283;
      puffs.push({ x: x + Math.cos(a) * 0.4 * Math.random(), y: Math.max(0.15, y + (Math.random() - 0.4) * 0.4), z: z + Math.sin(a) * 0.7,
        r: 0.18 + 0.28 * Math.random() * Math.min(1.4, s), grow: 0.35 + 0.7 * s, rho: 0.5 * Math.min(1.5, s) * (0.5 + 0.7 * Math.random()), age: 0,
        life: 2.2 + 2.8 * Math.random() * s, seed: Math.random() * 50,
        vx: Math.cos(a) * (low ? 1.2 : 0.4) * s + 0.25, vy: (low ? 0.15 : 0.1) + 0.25 * Math.random(), vz: Math.sin(a) * (low ? 0.9 : 0.3) * s });
    }
  }
  function update(dt) {
    for (let i = puffs.length - 1; i >= 0; i--) {
      const p = puffs[i]; p.age += dt;
      if (p.age > p.life) { puffs.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.vx *= 0.97; p.vz *= 0.97; p.vy *= 0.99; p.vx += 0.05 * dt;   // drag, and a light breeze from the left
      p.r += p.grow * dt * Math.exp(-p.age * 0.6);
    }
    D.n = puffs.length;
    puffs.forEach((p, i) => {
      const fade = Math.min(1, p.age / 0.15) * Math.pow(1 - p.age / p.life, 1.6);
      D.data0.set([p.x, p.y, p.z, p.r], i * 4);
      D.data1.set([p.rho * fade, p.seed, 0, 0], i * 4);
    });
    return D.n > 0;
  }
  // GLSL: integrate all puffs along a ray up to tmax; returns (in-scattered light, transmittance)
  const glsl = `
uniform vec4 uDust0[${MAX}]; uniform vec4 uDust1[${MAX}]; uniform int uNDust;
vec4 dustAlong(vec3 ro, vec3 rd, float tmax, vec3 sun, vec3 sunCol, vec3 amb){
  float tau = 0.; vec3 Ls = vec3(0);
  for (int i = 0; i < ${MAX}; i++){
    if (i >= uNDust) break;
    vec3 c = uDust0[i].xyz; float r = uDust0[i].w, rho = uDust1[i].x;
    if (rho <= 0.) continue;
    float tc = dot(c - ro, rd); vec3 cl = ro + rd * tc; float d2 = dot(cl - c, cl - c);
    if (d2 > 9. * r * r) continue;
    // a 3D Gaussian blob integrated along the line, clipped by the surface behind
    float clipT = clamp((tmax - tc) / r + .6, 0., 1.);
    float od = rho * r * 1.772 * exp(-d2 / (r * r)) * clipT;
    // lumpy: modulate by noise in the puff's own frame so it reads as billowing dust, not a ball
    vec2 q = (cl.xy - c.xy) / r * 1.6 + uDust1[i].y;
    od *= .35 + 1.3 * smoothstep(.25, .75, fbm2(q, 4));
    // light: sun through the puff (forward scattering) plus sky
    float mu = dot(rd, sun), g = .55; float ph = (1. - g * g) / (12.566 * pow(1. + g * g - 2. * g * mu, 1.5));
    vec3 col = vec3(.74, .69, .61) * (sunCol * ph * 1.2 + amb * .55);
    Ls += col * od * exp(-tau);
    tau += od;
  }
  return vec4(Ls, exp(-tau));
}`;
  return { D, add, update, glsl, MAX, puffs };
})();
