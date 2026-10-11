// physics2d.js — a small 2D rigid-body solver for falling masonry: convex polygons, a ground plane, friction.
// Separating-axis collision with reference/incident face clipping (after Box2D), sequential impulses with
// accumulated, warm-started impulses, Baumgarte position bias, and whole-scene sleeping.
'use strict';
const Phys = (() => {
  const G = -9.81, SLOP = 0.004, BIAS = 0.18, MU = 0.62, MU_GROUND = 0.75;

  function cross(ax, ay, bx, by) { return ax * by - ay * bx; }
  // body from a world-space convex polygon (CCW)
  function makeBody(poly, density = 2300, depth = 1.6) {
    let A = 0, cx = 0, cy = 0;
    const n = poly.length;
    for (let i = 0; i < n; i++) { const [x0, y0] = poly[i], [x1, y1] = poly[(i + 1) % n]; const c = cross(x0, y0, x1, y1); A += c; cx += (x0 + x1) * c; cy += (y0 + y1) * c; }
    A *= 0.5; cx /= (6 * A); cy /= (6 * A);
    const local = poly.map(([x, y]) => [x - cx, y - cy]);
    let I = 0;
    for (let i = 0; i < n; i++) { const [x0, y0] = local[i], [x1, y1] = local[(i + 1) % n]; const c = cross(x0, y0, x1, y1); I += c * (x0 * x0 + x0 * x1 + x1 * x1 + y0 * y0 + y0 * y1 + y1 * y1); }
    I = I / 12 * density * depth;
    const m = Math.abs(A) * density * depth;
    let r = 0; for (const [x, y] of local) r = Math.max(r, Math.hypot(x, y));
    return { x: cx, y: cy, a: 0, vx: 0, vy: 0, w: 0, invM: 1 / m, invI: 1 / Math.abs(I), m, local, r, wv: local.map(v => [v[0] + cx, v[1] + cy]), nrm: [], awake: true };
  }
  function update(b) {
    const c = Math.cos(b.a), s = Math.sin(b.a);
    b.wv = b.local.map(([x, y]) => [b.x + c * x - s * y, b.y + s * x + c * y]);
    const n = b.wv.length; b.nrm = [];
    for (let i = 0; i < n; i++) { const p = b.wv[i], q = b.wv[(i + 1) % n]; const ex = q[0] - p[0], ey = q[1] - p[1], l = Math.hypot(ex, ey) || 1; b.nrm.push([ey / l, -ex / l]); }
  }
  // max separation of B's vertices along A's edge normals
  function maxSep(A, B) {
    let best = -1e9, edge = 0;
    for (let i = 0; i < A.wv.length; i++) {
      const n = A.nrm[i], p = A.wv[i]; let m = 1e9;
      for (const v of B.wv) { const d = n[0] * (v[0] - p[0]) + n[1] * (v[1] - p[1]); if (d < m) m = d; }
      if (m > best) { best = m; edge = i; }
    }
    return { sep: best, edge };
  }
  function clip(v1, v2, n, off, id) {
    const out = []; const d1 = n[0] * v1.p[0] + n[1] * v1.p[1] - off, d2 = n[0] * v2.p[0] + n[1] * v2.p[1] - off;
    if (d1 <= 0) out.push(v1); if (d2 <= 0) out.push(v2);
    if (d1 * d2 < 0) { const t = d1 / (d1 - d2); out.push({ p: [v1.p[0] + t * (v2.p[0] - v1.p[0]), v1.p[1] + t * (v2.p[1] - v1.p[1])], id: id }); }
    return out;
  }
  function collide(A, B) {
    const sa = maxSep(A, B); if (sa.sep > 0) return null;
    const sb = maxSep(B, A); if (sb.sep > 0) return null;
    let ref, inc, ie, flip;
    if (sb.sep > sa.sep + 0.001) { ref = B; inc = A; ie = sb.edge; flip = true; } else { ref = A; inc = B; ie = sa.edge; flip = false; }
    const rn = ref.nrm[ie];
    // incident edge: most anti-parallel normal
    let ii = 0, md = 1e9; for (let i = 0; i < inc.nrm.length; i++) { const d = inc.nrm[i][0] * rn[0] + inc.nrm[i][1] * rn[1]; if (d < md) { md = d; ii = i; } }
    let pts = [{ p: inc.wv[ii], id: ii * 4 + 1 }, { p: inc.wv[(ii + 1) % inc.wv.length], id: ii * 4 + 2 }];
    const r1 = ref.wv[ie], r2 = ref.wv[(ie + 1) % ref.wv.length];
    const tx = r2[0] - r1[0], ty = r2[1] - r1[1], tl = Math.hypot(tx, ty) || 1, t = [tx / tl, ty / tl];
    pts = clip(pts[0], pts[1], [-t[0], -t[1]], -(t[0] * r1[0] + t[1] * r1[1]), 7); if (pts.length < 2) return null;
    pts = clip(pts[0], pts[1], t, t[0] * r2[0] + t[1] * r2[1], 9); if (pts.length < 2) return null;
    const front = rn[0] * r1[0] + rn[1] * r1[1];
    const cs = [];
    for (const q of pts) { const sep = rn[0] * q.p[0] + rn[1] * q.p[1] - front; if (sep <= 0.004) cs.push({ p: q.p, sep, id: (ie * 64 + q.id) * (flip ? -1 : 1) }); }
    if (!cs.length) return null;
    const n = flip ? [-rn[0], -rn[1]] : rn;   // normal points from A to B
    return { n, cs };
  }

  let uid = 0;
  function createWorld() { return { bodies: [], arbiters: new Map(), sleepT: 0, asleep: false, events: [] }; }
  function add(W, body) { W.bodies.push(body); body.id = W.bodies.length - 1; body.uid = ++uid; update(body); wake(W); return body; }
  function remove(W, body) { const i = W.bodies.indexOf(body); if (i < 0) return; W.bodies.splice(i, 1); W.bodies.forEach((x, k) => x.id = k); wake(W); }
  function wake(W) { W.asleep = false; W.sleepT = 0; }

  function solveContact(A, B, c, dt, mu) {
    // relative velocity at the contact
    const r1x = c.p[0] - A.x, r1y = c.p[1] - A.y, r2x = c.p[0] - (B ? B.x : c.p[0]), r2y = c.p[1] - (B ? B.y : c.p[1]);
    const bvx = B ? B.vx - B.w * r2y : 0, bvy = B ? B.vy + B.w * r2x : 0;
    const dvx = bvx - (A.vx - A.w * r1y), dvy = bvy - (A.vy + A.w * r1x);
    const n = c.n, vn = dvx * n[0] + dvy * n[1];
    let dPn = c.mn * (-vn + c.bias);
    const Pn0 = c.Pn; c.Pn = Math.max(Pn0 + dPn, 0); dPn = c.Pn - Pn0;
    apply(A, B, n[0] * dPn, n[1] * dPn, r1x, r1y, r2x, r2y);
    const tx = n[1], ty = -n[0];
    const dvx2 = (B ? B.vx - B.w * r2y : 0) - (A.vx - A.w * r1y), dvy2 = (B ? B.vy + B.w * r2x : 0) - (A.vy + A.w * r1x);
    const vt = dvx2 * tx + dvy2 * ty;
    let dPt = c.mt * (-vt);
    const maxPt = mu * c.Pn, Pt0 = c.Pt; c.Pt = Math.max(-maxPt, Math.min(maxPt, Pt0 + dPt)); dPt = c.Pt - Pt0;
    apply(A, B, tx * dPt, ty * dPt, r1x, r1y, r2x, r2y);
  }
  function apply(A, B, px, py, r1x, r1y, r2x, r2y) {
    A.vx -= px * A.invM; A.vy -= py * A.invM; A.w -= A.invI * cross(r1x, r1y, px, py);
    if (B) { B.vx += px * B.invM; B.vy += py * B.invM; B.w += B.invI * cross(r2x, r2y, px, py); }
  }
  function prep(A, B, c, dt) {
    const r1x = c.p[0] - A.x, r1y = c.p[1] - A.y, r2x = B ? c.p[0] - B.x : 0, r2y = B ? c.p[1] - B.y : 0;
    const n = c.n, rn1 = cross(r1x, r1y, n[0], n[1]), rn2 = cross(r2x, r2y, n[0], n[1]);
    const kn = A.invM + (B ? B.invM : 0) + A.invI * rn1 * rn1 + (B ? B.invI * rn2 * rn2 : 0);
    c.mn = 1 / kn;
    const t = [n[1], -n[0]], rt1 = cross(r1x, r1y, t[0], t[1]), rt2 = cross(r2x, r2y, t[0], t[1]);
    const kt = A.invM + (B ? B.invM : 0) + A.invI * rt1 * rt1 + (B ? B.invI * rt2 * rt2 : 0);
    c.mt = 1 / kt;
    c.bias = Math.min(2, -BIAS / dt * Math.min(0, c.sep + SLOP));   // overlaps are pushed apart, but never launched
    // a hard impact bounces a little (restitution), judged on the velocities from before this step's impulses (vn0, set earlier)
    if (c.vn0 < -2.5) c.bias = Math.max(c.bias, -0.08 * c.vn0);   // stone barely bounces
  }
  function warm(A, B, c) {
    const r1x = c.p[0] - A.x, r1y = c.p[1] - A.y, r2x = B ? c.p[0] - B.x : 0, r2y = B ? c.p[1] - B.y : 0, n = c.n, t = [n[1], -n[0]];
    apply(A, B, n[0] * c.Pn + t[0] * c.Pt, n[1] * c.Pn + t[1] * c.Pt, r1x, r1y, r2x, r2y);
  }
  function approach(A, B, c) {
    const r1x = c.p[0] - A.x, r1y = c.p[1] - A.y, r2x = B ? c.p[0] - B.x : 0, r2y = B ? c.p[1] - B.y : 0;
    const bvx = B ? B.vx - B.w * r2y : 0, bvy = B ? B.vy + B.w * r2x : 0;
    return (bvx - (A.vx - A.w * r1y)) * c.n[0] + (bvy - (A.vy + A.w * r1x)) * c.n[1];
  }

  // one fixed step; returns impact events {x, y, j (impulse), ground}
  function step(W, dt, iters = 14) {
    if (W.asleep) return [];
    const bodies = W.bodies; const events = [];
    for (const b of bodies) { if (!b.dynamic) continue; b.vy += G * dt; b.vx *= 0.9995; b.vy *= 0.9995; b.w *= 0.998; }
    // contacts
    const live = new Map();
    for (let i = 0; i < bodies.length; i++) {
      const A = bodies[i];
      // ground
      if (A.dynamic) {
        const cs = [];
        A.wv.forEach((v, k) => { if (v[1] < 0.004) cs.push({ p: [v[0], v[1]], sep: v[1], id: k, n: [0, -1] }); });
        if (cs.length) live.set('g' + A.uid, { A, B: null, cs, mu: MU_GROUND });
      }
      for (let j = i + 1; j < bodies.length; j++) {
        const B = bodies[j];
        if (!A.dynamic && !B.dynamic) continue;
        const dx = A.x - B.x, dy = A.y - B.y, rr = A.r + B.r + 0.02; if (dx * dx + dy * dy > rr * rr) continue;
        const m = collide(A, B); if (!m) continue;
        m.cs.forEach(c => { c.n = m.n; });
        live.set(A.uid + ':' + B.uid, { A, B, cs: m.cs, mu: MU });
      }
    }
    // warm-start matching
    for (const [k, arb] of live) {
      const old = W.arbiters.get(k);
      for (const c of arb.cs) { c.Pn = 0; c.Pt = 0; if (old) { const o = old.cs.find(q => q.id === c.id); if (o) { c.Pn = o.Pn; c.Pt = o.Pt; } } }
    }
    W.arbiters = live;
    // static bodies have zero inverse mass for the solver
    const swapMass = b => { if (!b.dynamic) { b._im = b.invM; b._ii = b.invI; b.invM = 0; b.invI = 0; } };
    const restore = b => { if (!b.dynamic && b._im !== undefined) { b.invM = b._im; b.invI = b._ii; } };
    bodies.forEach(swapMass);
    for (const arb of live.values()) for (const c of arb.cs) { c.vn0 = approach(arb.A, arb.B, c); prep(arb.A, arb.B, c, dt); }
    for (const arb of live.values()) for (const c of arb.cs) warm(arb.A, arb.B, c);
    const preV = new Map();
    for (const arb of live.values()) for (const c of arb.cs) preV.set(c, 0);
    for (let it = 0; it < iters; it++) for (const arb of live.values()) for (const c of arb.cs) solveContact(arb.A, arb.B, c, dt, arb.mu);
    bodies.forEach(restore);
    // impact events from large normal impulses on new contacts
    for (const [k, arb] of live) {
      let jmax = 0, px = 0, py = 0; for (const c of arb.cs) if (c.Pn > jmax) { jmax = c.Pn; px = c.p[0]; py = c.p[1]; }
      const isNew = !W._prevKeys || !W._prevKeys.has(k);
      if (isNew && jmax > 0) events.push({ x: px, y: py, j: jmax, ground: !arb.B, k });
    }
    W._prevKeys = new Set(live.keys());
    // integrate
    let energy = 0, nd = 0;
    for (const b of bodies) { if (!b.dynamic) continue; nd++; b.x += b.vx * dt; b.y += b.vy * dt; b.a += b.w * dt; update(b); energy += b.vx * b.vx + b.vy * b.vy + b.w * b.w * b.r * b.r; }
    if (energy < 0.004 * Math.max(1, nd)) { W.sleepT += dt; if (W.sleepT > 0.8) { W.asleep = true; for (const b of bodies) { b.vx = b.vy = b.w = 0; } } } else W.sleepT = 0;
    return events;
  }
  return { makeBody, createWorld, add, remove, wake, step, update };
})();
