// chain.js — the hanging chain: a 2D position-based simulation in model metres (hooks on the ceiling at y = 0).
// Nodes are link joints; each segment is one link. Point loads (sacks) add mass at nodes. A finger can hold one node.
'use strict';
const Chain = (() => {
  function create({ span = 0.8, length = 1.75, pitch = 0.032, x0 = 0, y0 = -0.031, free = false } = {}) {
    const n = Math.max(8, Math.round(length / pitch));
    const seg = length / n;
    const P = new Float64Array(2 * (n + 1)), O = new Float64Array(2 * (n + 1)), M = new Float64Array(n + 1);
    const a = [x0 - span / 2, y0], b = [x0 + span / 2, y0];
    // start on a parabola with the right length, then relax
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      if (free) { P[2 * i] = a[0]; P[2 * i + 1] = y0 - length * t; }    // hangs straight down from its one hook
      else { P[2 * i] = a[0] + (b[0] - a[0]) * t; P[2 * i + 1] = y0 - 4 * t * (1 - t) * Math.sqrt(Math.max(0, length * length - span * span)) * 0.5; }
      O[2 * i] = P[2 * i]; O[2 * i + 1] = P[2 * i + 1]; M[i] = 1;
    }
    const c = { n, seg, P, O, M, a, b, span, length, free, hold: -1, holdPos: [0, 0], loads: new Map(), energy: 0, settled: 0 };
    for (let k = 0; k < 600; k++) step(c, 1 / 120, 0.9);
    c.settled = 1;
    return c;
  }
  // loads: node index -> extra mass (in link masses)
  function setLoad(c, i, m) { if (m > 0) c.loads.set(i, m); else c.loads.delete(i); c.settled = 0; }
  // one step = integrate, then constraint sweeps, then bookkeeping; split so that chains hooked onto one another can be solved
  // together (stepAll), sweep by sweep
  const invMass = (c, i) => (i === 0 || (i === c.n && !c.free) || i === c.hold) ? 0 : 1 / (1 + (c.loads.get(i) || 0));
  function integrate(c, dt, damp) {
    const { n, P, O } = c, g = 9.81;
    let e = 0;
    const last = c.free ? n : n - 1;
    for (let i = 1; i <= last; i++) {
      const k = 2 * i;
      const vx = (P[k] - O[k]) * damp, vy = (P[k + 1] - O[k + 1]) * damp;
      O[k] = P[k]; O[k + 1] = P[k + 1];
      P[k] += vx; P[k + 1] += vy - g * dt * dt;
      e += vx * vx + vy * vy;
    }
    c.energy = e / (dt * dt) / n;
    if (c.hold >= 0) { P[2 * c.hold] = c.holdPos[0]; P[2 * c.hold + 1] = c.holdPos[1]; }
  }
  function sweep(c, it) {
    const { n, P, seg } = c, fwd = it & 1;   // alternate sweep direction for symmetric convergence
    for (let s = 0; s < n; s++) {
      const i = fwd ? s : n - 1 - s, j = i + 1;
      const ia = 2 * i, ib = 2 * j;
      const dx = P[ib] - P[ia], dy = P[ib + 1] - P[ia + 1], d = Math.hypot(dx, dy) || 1e-12;
      const wa = invMass(c, i), wb = invMass(c, j), ws = wa + wb; if (ws === 0) continue;
      const k = (d - seg) / (d * ws);
      P[ia] += dx * k * wa; P[ia + 1] += dy * k * wa; P[ib] -= dx * k * wb; P[ib + 1] -= dy * k * wb;
    }
    P[0] = c.a[0]; P[1] = c.a[1]; if (!c.free) { P[2 * n] = c.b[0]; P[2 * n + 1] = c.b[1]; }
  }
  function settle(c, dt) { if (c.energy < 1e-5 && c.hold < 0) c.settled = Math.min(1, c.settled + dt * 2); else c.settled = 0; }
  function step(c, dt, damp = 0.995) { integrate(c, dt, damp); for (let it = 0; it < 24; it++) sweep(c, it); settle(c, dt); }
  // a loose end hooked onto another chain's link: the two points are one, weighted by what hangs there
  function glue(b) {
    const a = b.glue.c, k = b.glue.k, n = b.n, P = a.P, Q = b.P;
    const wa = invMass(a, k), wb = invMass(b, n), ws = wa + wb; if (ws === 0) return;
    const dx = Q[2 * n] - P[2 * k], dy = Q[2 * n + 1] - P[2 * k + 1];
    P[2 * k] += dx * wa / ws; P[2 * k + 1] += dy * wa / ws; Q[2 * n] -= dx * wb / ws; Q[2 * n + 1] -= dy * wb / ws;
  }
  function stepAll(list, dt, damp) {
    for (const c of list) integrate(c, dt, damp);
    for (let it = 0; it < 24; it++) { for (const c of list) sweep(c, it); for (const c of list) if (c.glue) glue(c); }
    for (const c of list) settle(c, dt);
  }
  // relax to static equilibrium quickly (used when building from a configuration)
  function relax(c, iters = 400) { for (let k = 0; k < iters; k++) step(c, 1 / 120, 0.85); }
  function nodes(c) { const out = []; for (let i = 0; i <= c.n; i++) out.push([c.P[2 * i], c.P[2 * i + 1]]); return out; }
  function nearest(c, x, y) { let best = -1, bd = 1e9; for (let i = 1; i <= (c.free ? c.n : c.n - 1); i++) { const d = Math.hypot(c.P[2 * i] - x, c.P[2 * i + 1] - y); if (d < bd) { bd = d; best = i; } } return { i: best, d: bd }; }
  // where a free end would hook into the ceiling near x: never so far that the chain hangs taut (it would make a flat lintel,
  // not an arch), never on top of its own hook
  function attachX(c, x) {
    // outward only (away from the middle of the room, where the main arch stands): a new arch never crosses another's feet
    const reach = c.length * 0.72, out = Math.sign(c.a[0]) || 1, d = (x - c.a[0]) * out;
    return c.a[0] + out * Math.max(0.1 * c.length, Math.min(reach, d));
  }
  function attach(c, x) {
    x = attachX(c, x);
    c.b = [x, c.a[1]]; c.free = false; c.span = Math.abs(x - c.a[0]); c.settled = 0;
    return true;
  }
  return { create, step, stepAll, relax, nodes, nearest, setLoad, attach, attachX };
})();
