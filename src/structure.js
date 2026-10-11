// structure.js — the stone world's structures. Each mirrors one chain: an arch (chain hung from two hooks) or a column
// (chain hanging free). A structure stands while the line of thrust stays inside its stone, cracks open at a few joints as the
// line nears the edge, falls as rigid blocks when it has hinges enough, and is rebuilt along its chain.
// Every stone arrives and leaves on a rope from above: lifted from the rubble, carried and set down, or lowered new from the sky.
// Fallen stones from every structure share one physics world and any rebuild may reuse them.
'use strict';
const Structure = (() => {
  const SC = 20;                 // stone metres per workshop metre
  const THICK = 1.05, DEPTH = 1.7, BLOCK = 0.95, GAP = 0.016, COURSE = 0.72;   // (joints a finger wide: no sky through them)
  const ROPE_TOP = 90;
  const PRE = 0.22, FLIGHT = 0.85, LAND = PRE + FLIGHT, RETRACT = 0.25;   // rope comes down, stone travels, rope goes back up
  const world = Phys.createWorld();
  const loose = [];              // {body, rec, owner, rest}
  const all = [];                // structures
  const away = [];               // leftover rubble being hoisted away
  const toStone = ([x, y]) => [x * SC, -y * SC];

  // ---------- geometry ----------
  function resample(pts) {
    const cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    const L = cum[cum.length - 1];
    const at = s => { s = Math.max(0, Math.min(L, s)); let i = 1; while (i < cum.length - 1 && cum[i] < s) i++; const t = (s - cum[i - 1]) / ((cum[i] - cum[i - 1]) || 1); return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t]; };
    const tan = s => { const a = at(s - 0.06), b = at(s + 0.06); const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [(b[0] - a[0]) / l, (b[1] - a[1]) / l]; };
    return { L, at, tan, cum };
  }
  let uidN = 0;
  function rec(q, mat, seed, kind, k, zpad = 0) { return { q, z0: -DEPTH / 2 - zpad, z1: DEPTH / 2 + zpad, mat, seed, kind, k, uid: ++uidN }; }
  function convexQuad(q) {
    let sgn = 0;
    for (let i = 0; i < 4; i++) { const a = q[i], b = q[(i + 1) % 4], c = q[(i + 2) % 4]; const cr = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]); if (Math.abs(cr) < 1e-9) continue; if (sgn && Math.sign(cr) !== sgn) return false; sgn = Math.sign(cr); }
    return true;
  }
  // convex hull of four points as a counter-clockwise quad (a triangle gets its longest edge split)
  function hullQuad(pts) {
    const P = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]), cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lo = [], hi = [];
    for (const p of P) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
    for (let i = P.length - 1; i >= 0; i--) { const p = P[i]; while (hi.length >= 2 && cr(hi[hi.length - 2], hi[hi.length - 1], p) <= 0) hi.pop(); hi.push(p); }
    const h = [...lo.slice(0, -1), ...hi.slice(0, -1)];
    while (h.length < 4) { let bi = 0, bl = -1; for (let i = 0; i < h.length; i++) { const a = h[i], b = h[(i + 1) % h.length], l = Math.hypot(b[0] - a[0], b[1] - a[1]); if (l > bl) { bl = l; bi = i; } } const a = h[bi], b = h[(bi + 1) % h.length]; h.splice(bi + 1, 0, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]); }
    return h.slice(0, 4);
  }
  function ccw(q) { const area = q.reduce((s2, p, i2) => s2 + p[0] * q[(i2 + 1) % 4][1] - q[(i2 + 1) % 4][0] * p[1], 0); return area < 0 ? [q[1], q[0], q[3], q[2]] : q; }
  // voussoirs along a stone-world centreline that starts at the springing; free = a column (open top)
  function archGeometry(centre, seed, free) {
    const { L, at, tan } = resample(centre);
    const spring = centre[0][1];
    const n = free ? Math.max(3, Math.round(L / BLOCK)) : Math.max(7, (Math.round(L / BLOCK) | 1)), h = THICK / 2;
    const J = [];
    for (let k = 0; k <= n; k++) {
      const s = L * k / n, c = at(s), t = tan(s), m = [-t[1], t[0]];
      let i = [c[0] - m[0] * h, c[1] - m[1] * h], e = [c[0] + m[0] * h, c[1] + m[1] * h];
      if (k === 0 || (k === n && !free)) { // horizontal bed joints at a springing
        const fix = q => [q[0] + t[0] / (Math.abs(t[1]) > 1e-3 ? t[1] : 1e-3) * (spring - q[1]), spring];
        i = fix(i); e = fix(e);
      }
      J.push({ c, m, h, i, e, t, s });
    }
    const vous = [];
    for (let k = 0; k < n; k++) {
      const a = J[k], b = J[k + 1], g = GAP / 2, ta = k === 0 ? [0, 0] : a.t, tb = (k === n - 1 && !free) ? [0, 0] : b.t;
      let q = ccw([[a.i[0] + ta[0] * g, a.i[1] + ta[1] * g], [b.i[0] - tb[0] * g, b.i[1] - tb[1] * g], [b.e[0] - tb[0] * g, b.e[1] - tb[1] * g], [a.e[0] + ta[0] * g, a.e[1] + ta[1] * g]]);
      if (!convexQuad(q)) {
        // at a sharp kink (a pointed apex) a face would turn inside out: the mason cuts it to a short edge instead
        const tm = [(a.t[0] + b.t[0]) / 2, (a.t[1] + b.t[1]) / 2], l = Math.hypot(tm[0], tm[1]) || 1, u = [tm[0] / l, tm[1] / l];
        const shorten = (p0, p1) => { const m = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2]; return [[m[0] - u[0] * 0.02, m[1] - u[1] * 0.02], [m[0] + u[0] * 0.02, m[1] + u[1] * 0.02]]; };
        let Q = [[a.i[0], a.i[1]], [b.i[0], b.i[1]], [b.e[0], b.e[1]], [a.e[0], a.e[1]]];
        if ((Q[1][0] - Q[0][0]) * u[0] + (Q[1][1] - Q[0][1]) * u[1] < 0.04) { const [p0, p1] = shorten(Q[0], Q[1]); Q[0] = p0; Q[1] = p1; }
        if ((Q[2][0] - Q[3][0]) * u[0] + (Q[2][1] - Q[3][1]) * u[1] < 0.04) { const [p0, p1] = shorten(Q[3], Q[2]); Q[3] = p0; Q[2] = p1; }
        q = ccw(Q);
        if (!convexQuad(q)) q = hullQuad(q);   // still kinked: its convex hull (a sliver of overlap at a sharp apex is invisible)
      }
      const r = rec(q, 0, seed * 101 + k * 1.37, 'voussoir', k);
      // a stone whose bed is steep enough stands on the one below while the arch is unfinished; flatter ones need centering
      const tm = [(a.t[0] + b.t[0]) / 2, (a.t[1] + b.t[1]) / 2];
      r.steep = free || Math.abs(tm[1]) > 0.92 * Math.hypot(tm[0], tm[1]);   // steeper than ~67°
      vous.push(r);
    }
    const foot = [];
    for (const k of free ? [0] : [0, n]) {
      const j = J[k]; const xs = [j.i[0], j.e[0]]; const x0 = Math.min(...xs) - 0.35, x1 = Math.max(...xs) + 0.35;
      foot.push(rec([[x0, 0], [x1, 0], [x1, spring - GAP], [x0, spring - GAP]], 0, seed * 101 + 77 + k, 'footing', k, 0.25));
    }
    return { vous, foot, J, n, spring, L, at, free };
  }
  // the arch's back at x: the crossing of its extrados nearest yRef (null off the arch)
  function extradosAt(arch, x, yRef) {
    let best = null;
    for (let k = 0; k < arch.J.length - 1; k++) {
      const a = arch.J[k].e, b = arch.J[k + 1].e;
      if ((a[0] - x) * (b[0] - x) > 0 || a[0] === b[0]) continue;
      const y = a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0]);
      if (best === null || Math.abs(y - yRef) < Math.abs(best - yRef)) best = y;
    }
    return best;
  }
  const towerHalfWidth = slope => Math.max(0.5, Math.min(0.8, 0.8 / Math.sqrt(Math.max(1, slope))));
  // a turret for a weight hung at arc length sArc: a seat of courses cut to the arch's back, level courses on one course grid
  // (so neighbouring turrets read as one wall) and a pointed cap. Its height carries the weight.
  // the arch's back at height y on one side (dir = -1 the left leg, +1 the right): where a corbel meets the leg
  function extradosXAt(arch, y, dir) {
    let best = null;
    for (let k = 0; k < arch.J.length - 1; k++) {
      const a = arch.J[k].e, b = arch.J[k + 1].e;
      if ((a[1] - y) * (b[1] - y) > 0 || a[1] === b[1]) continue;
      const x = a[0] + (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]);
      if (best === null || x * dir > best * dir) best = x;
    }
    return best;
  }
  // is there room beside this leg for a pier (other structures' stones keep their distance)?
  function pierFits(arch, dir, c, self) {
    const J0 = arch.J[dir < 0 ? 0 : arch.n], footX = dir < 0 ? Math.min(J0.i[0], J0.e[0]) - 0.35 : Math.max(J0.i[0], J0.e[0]) + 0.35;
    for (const o of all) if (o.S !== self) for (const r of o.S.standing) {
      let x0 = 1e9, x1 = -1e9; for (const [x] of r.q) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); }
      const gap = dir < 0 ? footX - x1 : x0 - footX; if (gap > -0.3 && gap < 0.55) return false;
    }
    return true;
  }
  function towerGeometry(arch, sArc, mass, seed, self = null) {
    const c = arch.at(sArc), a0 = arch.at(sArc - 0.5), a1 = arch.at(sArc + 0.5);
    const slope = Math.abs(a1[1] - a0[1]) / (Math.abs(a1[0] - a0[0]) + 1e-3);
    const hw = towerHalfWidth(slope);
    const blocks = [];
    let cx, top0, k = 0, add, hwP = null;
    const crown = arch.at(arch.L / 2)[0], dir = c[0] < crown ? -1 : 1;
    const eTop = slope > 2.0 ? extradosXAt(arch, c[1] + 0.2, dir) : null;
    const pierRoom = eTop !== null;
    if (arch.free && !(self && self.butt) && sArc >= arch.L - 0.35) {
      // the top of a column: a level capital, then the turret courses and a finial (the weight on the column's chain)
      const jt = arch.J[arch.n]; cx = jt.c[0];
      const y0 = Math.max(jt.i[1], jt.e[1]) + GAP;
      add = (q, kk) => blocks.push(rec(ccw(q), 0, seed + kk * 3.1, 'tower', kk, -0.1));
      add([[cx - 0.72, y0], [cx + 0.72, y0], [cx + 0.72, y0 + 0.32], [cx - 0.72, y0 + 0.32]], k++);   // the capital, a little wider
      top0 = y0 + 0.32; hwP = 0.5;
    } else if (pierRoom && pierFits(arch, dir, c, self)) {
      // on a steep leg the load is carried as a Gothic buttress: a pier rising from the plain against the leg (its inner face cut to
      // the leg's slope), and the pinnacle on its level top
      const J0 = arch.J[dir < 0 ? 0 : arch.n], footX = dir < 0 ? Math.min(J0.i[0], J0.e[0]) - 0.35 : Math.max(J0.i[0], J0.e[0]) + 0.35;
      const legX = y => y < arch.spring ? footX : (extradosXAt(arch, y, dir) ?? footX);
      const yTop = Math.ceil((c[1] + 0.25) / COURSE) * COURSE;
      // as deep as the neighbours allow (a pillar or another arch may stand close by)
      let room = 0.95;
      for (const o of all) if (o.S !== self) for (const r of [...o.S.standing, ...(o.S.build ? o.S.build.towers.flatMap(t => t.blocks) : [])]) {
        let x0 = 1e9, x1 = -1e9, y0 = 1e9; for (const [x, y] of r.q) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); }
        if (y0 > yTop) continue;
        const gap = dir < 0 ? footX - x1 : x0 - footX; if (gap > -0.3) room = Math.min(room, gap - 0.12);
      }
      const xo = footX + dir * room;
      add = (q, kk) => blocks.push(rec(ccw(q), 0, seed + kk * 3.1, 'tower', kk, -0.12));
      for (let y0 = 0; y0 < yTop - 1e-6; y0 += COURSE) {
        const y1 = Math.min(yTop, y0 + COURSE), xa = legX(y0 + GAP) + dir * GAP, xb = legX(y1) + dir * GAP;
        add([[xo, y0 + (y0 > 0 ? GAP : 0)], [xa, y0 + (y0 > 0 ? GAP : 0)], [xb, y1], [xo, y1]], k++);
      }
      const xi = legX(yTop) + dir * GAP;
      cx = (xo + xi) / 2; top0 = yTop;
      hwP = Math.min(0.8, Math.abs(xi - xo) / 2 - 0.08);
    } else {
      const yRef = c[1] + THICK / 2, ex = x => extradosAt(arch, x, yRef) ?? 0;
      cx = c[0]; const xL = cx - hw, xR = cx + hw;
      let yL = ex(xL), yR = ex(xR);
      const yC = ex(cx);
      if (yC > yL + 0.12 && yC > yR + 0.12) {
        // on a pointed crown the back of the arch falls away on both sides: the seat is cut to it in vertical strips
        top0 = Math.ceil((yC + 0.3) / COURSE) * COURSE;
        add = (q, kk) => blocks.push(rec(ccw(q), 0, seed + kk * 3.1, 'tower', kk, -0.15));
        const NS = 2;   // two strips: their undersides are the crown's two slopes
        for (let i = 0; i < NS; i++) {
          const x0 = xL + (xR - xL) * i / NS, x1 = xL + (xR - xL) * (i + 1) / NS;
          let y0 = ex(x0), y1 = ex(x1);
          // keep the strip above the stone along its whole width
          let lift2 = 0; for (let kk = 1; kk < 4; kk++) { const x = x0 + (x1 - x0) * kk / 4; lift2 = Math.max(lift2, ex(x) - (y0 + (y1 - y0) * kk / 4)); }
          y0 += lift2 + GAP; y1 += lift2 + GAP;
          add([[x0 + GAP / 2, y0], [x1 - GAP / 2, y1], [x1 - GAP / 2, top0], [x0 + GAP / 2, top0]], k++);
        }
        yL = yR = top0;   // (the generic seat below is skipped)
      }
      if (k === 0) {
      // lift the seat so the curve of the arch never pokes through it
      let lift = 0; for (let kk = 1; kk < 8; kk++) { const x = xL + (xR - xL) * kk / 8; lift = Math.max(lift, ex(x) - (yL + (yR - yL) * kk / 8)); }
      yL += lift + GAP; yR += lift + GAP;
      // work with the seat rising to the right and mirror back
      const flip = yL > yR; if (flip) [yL, yR] = [yR, yL];
      const m = (yR - yL) / (xR - xL), lineX = y => xL + (y - yL) / m;
      add = (q, kk) => blocks.push(rec(ccw(flip ? q.map(([x, y]) => [2 * cx - x, y]) : q), 0, seed + kk * 3.1, 'tower', kk, -0.15));
      top0 = Math.ceil((yR + 0.3) / COURSE) * COURSE;
      if (yR - yL < 0.6) add([[xL, yL], [xR, yR], [xR, top0], [xL, top0]], k++);
      else {
        const nW = Math.max(1, Math.round((yR - yL) / COURSE)), eps = Math.max(0.03, 0.03 * m);
        for (let i = 0; i < nW; i++) {
          const y0 = i === 0 ? yL + eps : yL + (yR - yL) * i / nW, y1 = yL + (yR - yL) * (i + 1) / nW;
          add([[xL, y0], [lineX(y0), y0], [lineX(y1), y1], [xL, y1]], k++);
        }
        add([[xL, yR + GAP], [xR, yR + GAP], [xR, top0], [xL, top0]], k++);
      }
      }
      add = (q, kk) => blocks.push(rec(ccw(q), 0, seed + kk * 3.1, 'tower', kk, -0.15));   // courses above are symmetric anyway
    }
    // one weight unit ≈ 0.64 m of arch (1.05 × 1.7 m section) = 1.14 m³, carried over a 1.6 × 1.4 m plan
    const courses = Math.max(1, Math.round(1.14 / (1.6 * 1.4) * mass / COURSE)), hwT = hwP ?? hw;
    let y = top0;
    if (!(arch.free && !(self && self.butt) && sArc >= arch.L - 0.35)) {
      // a level plinth, projecting a hand's breadth all round: the turret stands on a bed the mason cut for it
      add([[cx - hwT - 0.09, y + GAP], [cx + hwT + 0.09, y + GAP], [cx + hwT + 0.09, y + 0.2], [cx - hwT - 0.09, y + 0.2]], k++);
      y += 0.2;
    }
    for (let i = 0; i < courses; i++) { const w = hwT * (1 - 0.012 * Math.min(i, 6)); add([[cx - w, y + GAP], [cx + w, y + GAP], [cx + w, y + COURSE], [cx - w, y + COURSE]], k++); y += COURSE; }
    const w = hwT * 0.9;
    add([[cx - w, y + GAP], [cx + w, y + GAP], [cx + 0.03, y + 1.3], [cx - 0.03, y + 1.3]], 99);
    return blocks;
  }
  // timber centering under the stones that need it: a rib under each, posts down to the ground
  function centeringGeometry(arch, from, to) {
    const out = [], J = arch.J;
    const below = k => { const j = J[k]; return [j.i[0] - j.m[0] * 0.04, j.i[1] - j.m[1] * 0.04]; };
    for (let k = from; k <= to; k++) {
      const a = below(k), b = below(k + 1), ma = J[k].m, mb = J[k + 1].m;
      out.push(rec(ccw([[a[0] - ma[0] * 0.28, a[1] - ma[1] * 0.28], [b[0] - mb[0] * 0.28, b[1] - mb[1] * 0.28], b, a]), 1, 500 + k, 'centering', k, -0.45));
    }
    const x0 = below(from)[0], x1 = below(to + 1)[0], posts = Math.max(2, Math.round(Math.abs(x1 - x0) / 3.5) + 1);
    for (let p = 0; p < posts; p++) {
      const k = Math.round(from + (to + 1 - from) * (p + 0.5) / posts), a = below(k), y = a[1] - 0.28 * Math.abs(J[k].m[1]) - 0.05;
      if (y > 0.6) out.push(rec([[a[0] - 0.12, 0], [a[0] + 0.12, 0], [a[0] + 0.12, y], [a[0] - 0.12, y]], 1, 600 + p, 'centering', 100 + p, -0.5));
    }
    return out;
  }

  // ---------- the line of thrust vs the joints ----------
  function eccentricities(joints, thrust) {
    const out = [];
    for (const j of joints) {
      let best = 1e9;
      for (let i = 0; i < thrust.length - 1; i++) {
        const p = thrust[i], q = thrust[i + 1];
        const dx = q[0] - p[0], dy = q[1] - p[1];
        const den = dx * j.m[1] - dy * j.m[0]; if (Math.abs(den) < 1e-9) continue;
        const ux = j.c[0] - p[0], uy = j.c[1] - p[1];
        const t = (ux * j.m[1] - uy * j.m[0]) / den; if (t < -0.01 || t > 1.01) continue;
        const s = (ux * dy - uy * dx) / den;
        if (Math.abs(s) < Math.abs(best)) best = s;
      }
      out.push(best === 1e9 ? 9 : best / j.h);
    }
    return out;
  }
  function centroid(q) { return [q.reduce((s, p) => s + p[0], 0) / q.length, q.reduce((s, p) => s + p[1], 0) / q.length]; }
  function ease(x) { return x < 0 ? 0 : x > 1 ? 1 : x * x * (3 - 2 * x); }
  const clamp01 = x => x < 0 ? 0 : x > 1 ? 1 : x;
  const angOf = q => Math.atan2(q[1][1] - q[0][1], q[1][0] - q[0][0]);
  function wrap(a) { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; }
  // place polygon q (given in its final pose, centroid cq) at centre p, turned by ang
  function placeAt(q, cq, p, ang) { const c = Math.cos(ang), s = Math.sin(ang); return q.map(([x, y]) => { const ox = x - cq[0], oy = y - cq[1]; return [p[0] + c * ox - s * oy, p[1] + s * ox + c * oy]; }); }
  function bez(P, t) { const s = 1 - t, a = s * s * s, b = 3 * s * s * t, c = 3 * s * t * t, d = t * t * t; return [a * P[0][0] + b * P[1][0] + c * P[2][0] + d * P[3][0], a * P[0][1] + b * P[1][1] + c * P[2][1] + d * P[3][1]]; }
  const topOf = q => Math.max(q[0][1], q[1][1], q[2][1], q[3][1]);
  // ropes are drawn by the compositor as lines (a ray tracer aliases anything this thin): just where each one ends
  function rope(x, y0) { return { x, y0 }; }

  function addStatic(r) { const b = Phys.makeBody(r.q); b.dynamic = false; Phys.add(world, b); r.sbody = b; return b; }
  function makeLoose(recs, kick = [0, 0], spin = 0, near = () => 1, owner = -1) {
    for (const r of recs) {
      if (r.sbody) { Phys.remove(world, r.sbody); r.sbody = null; }
      const b = Phys.makeBody(r.q); b.dynamic = true;
      const f = near(r), v0 = r.vel || [0, 0]; r.vel = null;
      b.vx = v0[0] + kick[0] * f * (0.6 + 0.8 * Math.random()); b.vy = v0[1] + kick[1] * f * (0.6 + 0.8 * Math.random()); b.w = spin * f * (Math.random() - 0.5) + (v0[0] || v0[1] ? (Math.random() - 0.5) * 2.2 : 0);
      Phys.add(world, b); r.body = b;
      loose.push({ body: b, rec: r, owner, rest: 0 });
    }
  }
  const speedOf = b => (b.dynamic === false ? 0 : Math.hypot(b.vx, b.vy) + Math.abs(b.w) * b.r);
  // a stone taken from the heap: the frozen stones that may have rested on it fall again if they must
  function lift(body) {
    Phys.remove(world, body);
    for (const l of loose) if (l.frozen && Math.abs(l.body.x - body.x) < 1.9 && l.body.y > body.y - 0.2) { l.frozen = false; l.body.dynamic = true; l.anchor = null; }
  }

  // ---------- hoisting ----------
  // A job sets one stone: at t0 a rope comes down to a stone lying in the rubble (or a new stone starts down from the sky), at
  // t0 + PRE it lifts, it lands at t0 + LAND, and the rope is gone by t0 + LAND + RETRACT.
  function claim(j, span, preferInside) {
    const cb = centroid(j.r.q);
    let best = null, bc = 40;
    for (const l of loose) {
      const b = l.body;
      if (!world.asleep && speedOf(b) > 0.3) continue;
      let cost = Math.abs(b.x - cb[0]) + 0.3 * Math.abs(b.y - cb[1]);
      // a stone with another on top of it waits; stones under the arch go first, so the site is clear for the centering
      for (const o of loose) if (o !== l && o.body.y > b.y + 0.25 && Math.abs(o.body.x - b.x) < 0.9) { cost += 6; break; }
      if (preferInside && span && b.x > span[0] && b.x < span[1]) cost -= 5;
      if (cost < bc) { bc = cost; best = l; }
    }
    if (best) {
      loose.splice(loose.indexOf(best), 1);
      best.body.dynamic = false; best.body.vx = best.body.vy = best.body.w = 0;   // held by the rope: an obstacle, not a faller
      j.src = best; j.start = best.body.wv.map(v => v.slice());
    } else { j.src = null; j.start = j.r.q.map(([x, y]) => [x, y + 45]); }
    const ca = centroid(j.start), dx = cb[0] - ca[0];
    if (j.src) { const yc = Math.max(ca[1], cb[1]) + 2.2 + 0.06 * Math.abs(dx); j.path = [ca, [ca[0], yc], [cb[0], yc], cb]; }
    else j.path = [ca, [cb[0], ca[1] - 6], [cb[0], cb[1] + 4], cb];
    j.da = wrap(angOf(j.start) - angOf(j.r.q));
    j.cb = cb;
    // the stone's own outline in the set stone's frame: a reused stone of another cut reshapes as it travels (the mason's dressing)
    const c = Math.cos(-j.da), sn = Math.sin(-j.da);
    j.from = j.start.map(([x, y]) => { const ox = x - ca[0], oy = y - ca[1]; return [c * ox - sn * oy, sn * ox + c * oy]; });
    j.to = j.r.q.map(([x, y]) => [x - cb[0], y - cb[1]]);
  }
  // the stone's pose and its rope at time tt since the job began
  function hoistPose(j, tt) {
    if (tt < PRE && j.src) { const top = topOf(j.start), c = centroid(j.start); return { q: j.start, rope: rope(c[0], top + (ROPE_TOP - top) * (1 - ease(tt / PRE))) }; }
    const fly = j.src ? (tt - PRE) / FLIGHT : tt / LAND;
    if (fly < 1) {
      const u = j.src ? ease(fly) : 1 - Math.pow(1 - clamp01(fly), 2.2);
      const p = bez(j.path, u);
      // it turns to its set angle while carried, and leans a little against the carry's acceleration
      const h = 0.03, xa = bez(j.path, Math.max(0, u - h))[0], xb = bez(j.path, Math.min(1, u + h))[0];
      const acc = (xb - 2 * p[0] + xa) / Math.pow(h * FLIGHT, 2);
      const lean = Math.max(-0.07, Math.min(0.07, -acc / 9.81 * 0.5)) * (j.src ? 1 : 0);
      const ang = j.da * (1 - ease((fly - 0.1) / 0.6)) + lean, mo = ease((fly - 0.15) / 0.6);
      const local = j.to.map((v, k) => [j.from[k][0] + (v[0] - j.from[k][0]) * mo, j.from[k][1] + (v[1] - j.from[k][1]) * mo]);
      const q = placeAt(local, [0, 0], p, ang);
      return { q, rope: rope(p[0], topOf(q) - 0.05) };
    }
    const top = topOf(j.r.q), r = clamp01((tt - LAND) / RETRACT);
    return { q: j.r.q, rope: r < 1 ? rope(j.cb[0], top + (ROPE_TOP - top) * ease(r)) : null };
  }

  // ---------- one structure ----------
  function create(opts = {}) {
    const S = {
      phase: 'none', standing: [], joints: [], towers: [], build: null, arch: null, collapseT: 0, doom: 0,
      eccS: [], hinges: 0, strain: 0, worst: 0, events: [], seed: opts.seed || 1, built: 0, free: !!opts.free, id: all.length,
    };
    function placeStanding(arch, towers) {
      for (const r of S.standing) if (r.sbody && r.kind !== 'footing') { Phys.remove(world, r.sbody); r.sbody = null; }
      S.standing = [...arch.foot, ...arch.vous, ...towers.flatMap(t => t.blocks)];
      for (const r of S.standing) if (!r.sbody) addStatic(r);   // standing stones are obstacles for falling ones
      S.joints = arch.J.slice(1, arch.free ? arch.J.length : -1).map(j => ({ c: j.c, m: j.m, h: j.h }));
      if (arch !== S.arch || S.eccS.length !== S.joints.length) S.eccS = S.joints.map(() => 0);
      S.arch = arch; S.towers = towers; S.phase = 'standing'; S.free = arch.free; S.doom = 0;
    }
    function collapse(worstJoint, dir) {
      if (S.phase === 'building' && S.build && !S.build.full) {
        // turrets going up when the arch gives way: stones on ropes drop where they are
        for (const j of S.build.jobs) {
          if (j.state === 'rope' && j.src) { j.src.body.dynamic = true; loose.push(j.src); }
          else if (j.state === 'fly') { const p = hoistPose(j, S.build.t - j.t0); makeLoose([{ ...j.r, q: p.q }], [0, 0], 0.3, () => 1, S.id); }
        }
        S.build = null; S.phase = 'standing';
      }
      if (S.phase !== 'standing') return;
      // stones set down on this structure (a turret waiting to be taken away) fall with it
      for (const l of loose) if (l.frozen && l.owner === S.id) { l.frozen = false; l.body.dynamic = true; l.anchor = null; }
      const posed = new Map(renderList().map(r => [r.uid, r]));
      for (const r of S.standing) { const p = posed.get(r.uid); if (p && r.kind !== 'footing') { r.vel = [(centroid(p.q)[0] - centroid(r.q)[0]) * 1.3 + (Math.random() - 0.5) * 1.2, (centroid(p.q)[1] - centroid(r.q)[1]) * 1.3 + Math.random() * 0.3]; r.q = p.q; } }
      const moving = S.standing.filter(r => r.kind !== 'footing');
      const nJ = Math.max(1, S.joints.length);
      if (S.free) {
        // a column goes over like a felled tree: all one way, the higher stones faster, breaking up as it lands
        const side = Math.sign(dir[0]) || (Math.random() < 0.5 ? -1 : 1), base = S.arch ? S.arch.spring : 0;
        for (const r of moving) { const h = centroid(r.q)[1] - base; r.vel = [side * (0.35 + 0.22 * h) + (Math.random() - 0.5) * 0.3, -0.1 * h * Math.random()]; }
        makeLoose(moving, [0, 0], 1.0, () => 1, S.id);
        for (const l of loose.slice(-moving.length)) l.body.w -= side * 0.25;
      } else makeLoose(moving, [dir[0] * 1.0, dir[1] * 1.0], 1.0, r => r.kind === 'voussoir' ? 0.35 + 0.65 * Math.exp(-Math.pow((r.k - worstJoint) / (nJ * 0.18), 2)) : 0.6, S.id);
      if (S.arch) for (let k = 1; k < S.arch.J.length - 1; k += 3) S.events.push({ type: 'dust', x: S.arch.J[k].c[0], y: S.arch.J[k].c[1], s: 0.35 });
      S.events.push({ type: 'crack', x: S.arch ? S.arch.J[Math.min(worstJoint + 1, S.arch.J.length - 1)].c[0] : 0, s: 1 }, { type: 'rumble', s: S.free ? 0.6 : 1 });
      S.standing = S.standing.filter(r => r.kind === 'footing'); S.towers = []; S.joints = []; S.phase = 'collapsing'; S.collapseT = 0;
    }
    // a turret no longer carrying anything is taken down by the masons: its stones stay where they are until a rope lifts them away
    // (top first), or a new turret claims them
    function dismantle(tower) {
      makeLoose(tower.blocks, [0, 0], 0, () => 0, S.id);
      for (const l of loose.slice(-tower.blocks.length)) { l.frozen = true; l.body.dynamic = false; l.body.vx = l.body.vy = l.body.w = 0; l.rest = 1.5; }
      S.standing = S.standing.filter(r => !tower.blocks.includes(r));
      S.towers = S.towers.filter(t => t !== tower);
    }
    function topple(tower) {
      makeLoose(tower.blocks, [(Math.random() - 0.5) * 2, 0.5], 1.2, () => 1, S.id);
      S.standing = S.standing.filter(r => !tower.blocks.includes(r));
      S.towers = S.towers.filter(t => t !== tower);
      S.events.push({ type: 'crack', x: centroid(tower.blocks[0].q)[0], s: 0.5 });
    }
    const boxOf = blocks => { let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9; for (const b of blocks) for (const [x, y] of b.q) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); } return [x0, x1, y0, y1]; };
    const overlaps = (a, b) => a[0] < b[1] - 0.02 && b[0] < a[1] - 0.02 && a[2] < b[3] - 0.02 && b[2] < a[3] - 0.02;
    function towersFor(arch, nodes, loads, keep = [], grows = []) {
      const centre = nodes.map(toStone), out = [], boxes = keep.flatMap(t => t.blocks.map(b => boxOf([b])));
      for (const [i, m] of [...loads].sort((a, b) => b[1] - a[1])) {
        if (keep.some(t => t.node === i || (t.also || []).includes(i))) continue;
        let s = 0; for (let k = 1; k <= i; k++) s += Math.hypot(centre[k][0] - centre[k - 1][0], centre[k][1] - centre[k - 1][1]);
        // a turret that would run into a heavier neighbour stops a course short of it; with no room at all, its weight joins the
        // neighbour's turret (one taller turret where two would collide)
        let blocks = towerGeometry(arch, s, m, 1000 + i * 17 + S.id * 333, S);
        const hits = () => blocks.some(b => { const bb = boxOf([b]); return boxes.some(o => overlaps(o, bb)); });
        while (blocks.length > 1 && hits()) { const cap = blocks.pop(); if (blocks.length > 1 && blocks[blocks.length - 1].k !== 99) { blocks.pop(); const top = blocks[blocks.length - 1], y = topOf(top.q); const c = centroid(top.q)[0], w = Math.abs(top.q[1][0] - top.q[0][0]) * 0.45; blocks.push(rec([[c - w, y + GAP], [c + w, y + GAP], [c + 0.03, y + 1.3], [c - 0.03, y + 1.3]], 0, cap.seed, 'tower', 99, -0.15)); } }
        if (hits()) {
          const touches = t => t.blocks.some(b => { const bb = boxOf([b]); return blocks.some(x => overlaps(boxOf([x]), bb)); });
          const host = out.find(touches);
          if (host) { host.mass += m; host.also = [...(host.also || []), i]; host.blocks = towerGeometry(arch, host.s, host.mass, 1000 + host.node * 17 + S.id * 333, S); }
          else { const kept = keep.find(touches); if (kept) grows.push({ tower: kept, k: i, m }); }
          continue;
        }
        boxes.push(...blocks.map(b => boxOf([b]))); out.push({ node: i, mass: m, s, blocks });
      }
      return out;
    }
    function targetFor(nodes, loads, free, opts = null) {
      let centre = nodes.map(toStone);
      if (opts && opts.host) {
        // a flying buttress: the line of the hooked chain, from its own footing up to where it meets the host arch's back
        const host = opts.host.map(toStone), clear = THICK / 2 + 0.06;
        const distHost = p => { let d = 1e9; for (let i = 0; i < host.length - 1; i++) { const a = host[i], b = host[i + 1], ab = [b[0] - a[0], b[1] - a[1]], t = Math.max(0, Math.min(1, ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1]) / (ab[0] * ab[0] + ab[1] * ab[1] || 1))); d = Math.min(d, Math.hypot(p[0] - a[0] - ab[0] * t, p[1] - a[1] - ab[1] * t)); } return d; };
        let cut = centre.length - 1;
        for (let i = 1; i < centre.length; i++) if (distHost(centre[i]) < clear) { cut = i; break; }
        let lo = 0, hi = 1; const a = centre[cut - 1], b = centre[cut];
        for (let it = 0; it < 20; it++) { const m = (lo + hi) / 2, p = [a[0] + (b[0] - a[0]) * m, a[1] + (b[1] - a[1]) * m]; if (distHost(p) < clear) hi = m; else lo = m; }
        centre = [...centre.slice(0, cut), [a[0] + (b[0] - a[0]) * lo, a[1] + (b[1] - a[1]) * lo]];
        free = true; S.butt = true;
      } else S.butt = false;
      const arch = archGeometry(centre, S.seed, free);
      return { arch, nodes, loads, towers: towersFor(arch, nodes, loads) };
    }
    function startBuild(target, full) {
      const A = full ? target.arch : S.arch;
      const grows = [];
      const towers = full ? target.towers : towersFor(S.arch, target.nodes, target.loads, S.towers, grows);
      if (!full && !towers.length && !grows.length && !(target.raise || []).length) return;
      // a turret taking on another weight is raised: its cap comes off (the masons reuse it) and courses go on
      const raise = [];
      for (const g of (target.raise || [])) grows.push(g);
      for (const g of grows) {
        const T = g.tower; if (raise.some(r => r.T === T)) { const r = raise.find(r => r.T === T); r.m += g.m; r.ks.push(g.k); continue; }
        raise.push({ T, m: g.m, ks: [g.k] });
      }
      for (const r of raise) {
        const T = r.T, merged = towerGeometry(S.arch, T.s, T.mass + r.m, 1000 + T.node * 17 + S.id * 333, S);
        const keepN = T.blocks.length - 1, cap = T.blocks[keepN];
        S.standing = S.standing.filter(b => b !== cap); makeLoose([cap], [0, 0], 0, () => 0, S.id);
        const lc = loose[loose.length - 1]; lc.frozen = true; lc.body.dynamic = false; lc.body.vx = lc.body.vy = lc.body.w = 0;
        r.extra = merged.slice(keepN);
        T.blocks = [...T.blocks.slice(0, keepN), ...r.extra]; T.mass += r.m; T.also = [...new Set([...(T.also || []), ...r.ks])].filter(k => k !== T.node);
      }
      const jobs = [], B = { full, arch: A, towers, keep: full ? [] : S.towers, jobs, t: 0, centering: [], cIn: 1e9, struck: 1e9 };
      let t = 0.1, last = -1;
      const push = (r, gap, extra = {}) => { t = Math.max(t, last + 0.05); jobs.push({ r, t0: t, state: 'wait', ...extra }); last = t; t += gap * (0.45 + 1.1 * Math.random() * Math.random() + 0.2 * Math.random()); };
      if (full) {
        const V = A.vous, n = V.length;
        if (A.free) for (let k = 0; k < n; k++) push(V[k], 0.17);   // a column goes up course by course
        else {
          // the steep haunches first, from both feet (each stone stands on the one below), then the centering, then the crown from
          // both sides, the keystone last
          let a = 0, b = n - 1;
          while (a <= b && (V[a].steep || V[b].steep)) { if (V[a].steep) push(V[a++], 0.09); if (a <= b && V[b].steep) push(V[b--], 0.09); }
          if (a <= b) {
            B.centering = centeringGeometry(A, Math.max(0, a - 1), Math.min(n - 1, b + 1)).map((r, i) => ({ r, tin: 0, i }));
            B.cIn = t; t += 1.0; last = t - 0.05;
            B.centering.forEach(c => c.tin = B.cIn + c.i * 0.04);
            while (a < b) { push(V[a++], 0.12); if (a < b) push(V[b--], 0.12); }
            t += 0.3; push(V[a], 0.4, { key: true });
          } else if (jobs.length) jobs[jobs.length - 1].key = true;
        }
        B.keyLand = jobs.length ? jobs[jobs.length - 1].t0 + LAND : 0;
        if (B.centering.length) B.struck = B.keyLand + 0.45;
        t = Math.max(t, B.keyLand + 0.25);
      }
      // turrets rise together, course by course (a raised turret's new courses with them)
      const lists = [...towers.map(tw => tw.blocks), ...raise.map(r => r.extra)];
      const rows = Math.max(0, ...lists.map(l => l.length));
      for (let k = 0; k < rows; k++) for (const l of lists) if (l[k]) push(l[k], 0.09);
      const end = Math.max(jobs.length ? last + LAND + RETRACT : 0, B.struck < 1e9 ? B.struck + 2.15 + 0.05 * Math.max(0, B.centering.length - 1) : 0);
      B.done = end + 0.1;
      S.build = B;
      if (full) {
        for (const r of S.standing) if (r.kind !== 'footing' && r.sbody) { Phys.remove(world, r.sbody); r.sbody = null; }
        S.standing = S.standing.filter(r => r.kind === 'footing');
        // a changed footprint (a free chain hooked up) brings new footings
        for (const f of A.foot) if (!S.standing.some(r => Math.abs(centroid(r.q)[0] - centroid(f.q)[0]) < 0.5)) { S.standing.push(f); addStatic(f); }
      }
      S.phase = 'building';
    }
    // strain made visible. With four hinges the arch is a mechanism (Heyman): three rigid pieces turning about cracks that open
    // as V-gaps, alternately at the intrados and the extrados; the loaded side drops. With fewer, the cracks just begin to open.
    const rotAbout = (p, c, a) => { const ca = Math.cos(a), sa = Math.sin(a), x = p[0] - c[0], y = p[1] - c[1]; return [c[0] + ca * x - sa * y, c[1] + sa * x + ca * y]; };
    function strainPose() {
      if (S.phase !== 'standing' || !S.arch || !S.eccS.length) return null;
      const J = S.arch.J, n = J.length - 1, free = S.arch.free, E = S.eccS;
      const peaks = [];
      for (let i = 0; i < E.length; i++) { const a = Math.abs(E[i]); if (a < 0.8) continue; if ((i > 0 && Math.abs(E[i - 1]) > a) || (i < E.length - 1 && Math.abs(E[i + 1]) >= a)) continue; peaks.push(i); }
      if (!peaks.length) return null;
      peaks.sort((a, b) => Math.abs(E[b]) - Math.abs(E[a]));
      const worst = Math.abs(E[peaks[0]]);
      if (!free && worst > 1 && peaks.length >= 2) {
        // hinges along the arch, their signs alternating; the springings complete the set when the line leaves the stone at
        // fewer than four joints
        let h = peaks.slice(0, 4).map(i => i + 1).sort((a, b) => a - b), sg = h.map(j => Math.sign(E[j - 1]));
        if (h.length === 2) { h = [0, ...h, n]; sg = [-sg[0], ...sg, -sg[1]]; }
        else if (h.length === 3) { if (Math.abs(E[h[0] - 1]) < Math.abs(E[h[2] - 1])) { h = [0, ...h]; sg = [-sg[0], ...sg]; } else { h = [...h, n]; sg = [...sg, -sg[2]]; } }
        const P = h.map((j, k) => sg[k] > 0 ? J[j].e : J[j].i), L2 = Math.hypot(P[2][0] - P[1][0], P[2][1] - P[1][1]);
        // under a hand the mechanism is shown boldly; left alone, its cracks only just open (until it goes)
        const amp = (0.015 + 0.115 * Math.min(1, Math.max(0, (worst - 1) / 1.3))) * (S.heldNow || S.doom > 0 ? 1 : 0.3 + 0.7 * Math.min(1, (S.creep || 0) / 2.5));
        // choose the turning direction that opens the first crack rather than closing it
        const t1 = J[h[0]].t, other = sg[0] > 0 ? J[h[0]].i : J[h[0]].e;
        let th = amp; { const q = rotAbout(other, P[0], th); if ((q[0] - other[0]) * t1[0] + (q[1] - other[1]) * t1[1] < 0) th = -th; }
        const P2 = rotAbout(P[1], P[0], th);
        const f = ps => { const q = rotAbout(P[2], P[3], ps); return Math.hypot(q[0] - P2[0], q[1] - P2[1]) - L2; };
        let ps = 0; for (let it = 0; it < 8; it++) { const d = (f(ps + 1e-4) - f(ps - 1e-4)) / 2e-4; if (Math.abs(d) < 1e-9) break; ps -= f(ps) / d; }
        const P3 = rotAbout(P[2], P[3], ps);
        const al = Math.atan2(P3[1] - P2[1], P3[0] - P2[0]) - Math.atan2(P[2][1] - P[1][1], P[2][0] - P[1][0]);
        if (!isFinite(ps) || Math.abs(ps) > 0.6 || Math.abs(al) > 0.6) return null;
        // every hinge must open on the side away from its pivot; if one would close (stone into stone) it isn't a real mechanism
        const rel = [th, al - th, ps - al, -ps];
        for (let q = 0; q < 4; q++) {
          const j = J[h[q]], other = sg[q] > 0 ? j.i : j.e, mv = rotAbout(other, P[q], rel[q]);
          if ((mv[0] - other[0]) * j.t[0] + (mv[1] - other[1]) * j.t[1] < -1e-4) return null;
        }
        const pose = (k, p) => {
          if (k < h[0] || k >= h[3]) return p;
          if (k < h[1]) return rotAbout(p, P[0], th);
          if (k >= h[2]) return rotAbout(p, P[3], ps);
          const q = rotAbout(p, P[1], al); return [q[0] + P2[0] - P[1][0], q[1] + P2[1] - P[1][1]];
        };
        return { pose, hinges: h };
      }
      return null;   // short of a mechanism the stone stays rigid; the line of thrust drawn over it shows how close it is
    }
    function update(dt, thrust, held) {
      S.events.length = 0;
      if ((S.phase === 'standing' || (S.phase === 'building' && !S.build.full)) && S.joints.length) {
        const e = eccentricities(S.joints, thrust);
        // the moment a hand lets go the stone is judged on the chain as it now hangs, not on what the hand was showing
        const k = S.wasHeld && !held ? 1 : Math.min(1, dt / 0.35); S.wasHeld = held; S.heldNow = held;
        for (let i = 0; i < e.length; i++) S.eccS[i] = S.eccS[i] + (Math.max(-3, Math.min(3, e[i])) - S.eccS[i]) * k;
        let hinges = 0, worst = 0, wi = 0;
        S.eccS.forEach((v, i) => { if (Math.abs(v) > 1) hinges++; if (Math.abs(v) > Math.abs(worst)) { worst = v; wi = i; } });
        S.hinges = hinges; S.strain = Math.max(0, Math.abs(worst) - 0.7) / 0.3; S.worst = wi;
        S.poseSig = S.strain > 0.01 ? S.eccS.map(v => Math.round(v * 60)).join(',') : '';
        // an arch needs four hinges to move, a column topples about one; while a hand holds the chain only a violent pull breaks it
        // (while a hand holds the chain it is only a preview: the stone strains and cracks open, and is judged when the hand lets go)
        const failing = !held && ((S.free ? Math.abs(worst) > 2.2 : hinges >= 4) || Math.abs(worst) > (S.free ? 2.2 : 1.9));
        // badly strained but short of a mechanism, an arch doesn't stand like that for long: the cracked joints spall and it gives way
        S.creep = !held && Math.abs(worst) > 1.35 ? (S.creep || 0) + dt : Math.max(0, (S.creep || 0) - dt);
        S.doom = failing || S.creep > 2.5 ? S.doom + dt : 0;
        if (S.doom > 0 && Math.random() < dt * 9) { const j = S.joints[wi]; S.events.push({ type: 'creak', x: j.c[0], y: j.c[1], s: 1 }, { type: 'dust', x: j.c[0], y: j.c[1] - 0.3, s: 0.3 }); }
        if (S.doom > 0.85) {
          const j = S.joints[wi]; collapse(wi, [j.m[0] * Math.sign(worst), j.m[1] * Math.sign(worst)]);
        } else if (S.strain > 0.15) {
          // stone grinds as the cracks open (the more so the faster they open), and now and then while they stay open
          if (Math.random() < dt * 0.7 * S.strain + 6 * Math.max(0, S.strain - (S.strainPrev || 0))) { const j = S.joints[wi]; S.events.push({ type: 'creak', x: j.c[0], y: j.c[1], s: Math.min(1, S.strain / 2) }); }
          S.eccS.forEach((v, i) => { if (Math.abs(v) > 0.85 && Math.random() < dt * 3 * (Math.abs(v) - 0.7)) { const j = S.joints[i]; S.events.push({ type: 'dust', x: j.c[0], y: j.c[1] - 0.3, s: 0.25 }); } });
        }
      }
      S.strainPrev = S.strain;
      if (S.phase === 'collapsing') {
        S.collapseT += dt;
        const mine = loose.filter(l => l.owner === S.id);
        S.quiet = (world.asleep || mine.every(l => speedOf(l.body) < 0.3)) ? (S.quiet || 0) + dt : 0;
        if (S.collapseT > 4 || (S.collapseT > 1.3 && S.quiet > 0.35)) S.phase = 'rubble';
      }
      if (S.phase === 'building') {
        const B = S.build; B.t += dt * (B.hurry || 1);
        const span = B.arch && !B.arch.free ? [Math.min(B.arch.J[0].i[0], B.arch.J[B.arch.n].i[0]), Math.max(B.arch.J[0].i[0], B.arch.J[B.arch.n].i[0])] : null;
        for (const j of B.jobs) {
          if (j.state === 'done') continue;
          const tt = B.t - j.t0;
          if (j.state === 'wait' && tt >= 0) { claim(j, span, B.t < B.cIn); j.state = 'rope'; if (j.src || Math.random() < 0.4) S.events.push({ type: 'rope', x: centroid(j.src ? j.start : j.r.q)[0] }); }
          if (j.state === 'rope' && tt >= PRE) { if (j.src) lift(j.src.body); j.state = 'fly'; }
          if (j.state === 'fly' && tt >= LAND) {
            j.state = 'set'; S.standing.push(j.r); const c = j.cb;
            S.events.push({ type: 'knock', x: c[0], y: c[1], s: j.key ? 1.6 : 0.45 + 0.3 * Math.random(), big: j.key }, { type: 'dust', x: c[0], y: c[1] - 0.4, s: j.key ? 0.6 : 0.2 });
          }
          if (j.state === 'set' && tt >= LAND + RETRACT) j.state = 'done';
        }
        for (const c of B.centering) if (!c.landed && B.t >= c.tin + 1.0) { c.landed = true; if (c.i % 3 === 0) S.events.push({ type: 'wood', x: centroid(c.r.q)[0], s: 0.5 }); }
        if (!B.struckDone && B.t > B.struck) { B.struckDone = true; S.events.push({ type: 'wood', x: 0, s: 1 }, { type: 'creak', x: 0, y: 5, s: 0.6 }); }
        if (B.t > B.done) { placeStanding(B.arch, [...B.keep, ...B.towers]); S.build = null; S.built++; S.events.push({ type: 'built' }); }
      }
    }
    let ropes = [];
    function ropeList() { return ropes; }
    function renderList() {
      ropes = [];
      const sp = strainPose();
      if (sp) {
        const out = [], towerBlock = new Map();
        for (const t of S.towers) { let best = 0, bd = 1e9; const cx = centroid(t.blocks[0].q)[0]; S.arch.vous.forEach((v, k) => { const d = Math.abs(centroid(v.q)[0] - cx); if (d < bd) { bd = d; best = k; } }); for (const b of t.blocks) towerBlock.set(b, best); }
        for (const r of S.standing) {
          if (r.kind === 'voussoir') out.push({ ...r, q: r.q.map(p => sp.pose(r.k, p)) });
          else if (towerBlock.has(r)) { const k = towerBlock.get(r); out.push({ ...r, q: r.q.map(p => sp.pose(k, p)) }); }
          else out.push(r);
        }
        return out;
      }
      const out = [...S.standing];
      if (S.phase === 'building') {
        const B = S.build;
        // centering: lowered in on ropes, struck (dropped a hand's breadth as the wedges are knocked out), lifted away
        for (const c of B.centering) {
          const tt = B.t - c.tin; if (tt < 0) continue;
          const top = topOf(c.r.q), cx = centroid(c.r.q)[0];
          let dy = 0, ropeY = null;
          if (tt < 1.0) { dy = 30 * Math.pow(1 - ease(tt), 1.6); ropeY = top + dy; }
          else if (tt < 1.3) ropeY = top + (ROPE_TOP - top) * ease((tt - 1.0) / 0.3);
          const ts = B.t - B.struck - c.i * 0.05;
          if (ts > 0) {
            dy = -0.12 * ease(ts / 0.15);
            if (ts > 0.5) { const u = (ts - 0.5) / 1.4; ropeY = top - 0.12 + (ROPE_TOP - top) * (1 - ease(u / 0.25)); if (u > 0.25) { dy += 34 * Math.pow((u - 0.25) / 0.75, 2); ropeY = top + dy; } }
          }
          if (dy > 40) continue;
          out.push({ ...c.r, q: c.r.q.map(([x, y]) => [x, y + dy]) });
          if (ropeY !== null && ropeY < ROPE_TOP) ropes.push(rope(cx, ropeY));
        }
        for (const j of B.jobs) {
          if (j.state === 'wait' || j.state === 'done') continue;
          const p = hoistPose(j, B.t - j.t0);
          if (j.state !== 'set') out.push({ ...j.r, q: p.q });
          if (p.rope) ropes.push(p.rope);
        }
      }
      return out;
    }
    function init(nodes, free) { const t = targetFor(nodes, new Map(), free); placeStanding(t.arch, t.towers); }
        // would the standing arch carry this line of thrust? (asked before building turrets for new weights)
    function safeFor(thrust) {
      if (!S.joints.length) return true;
      const e = eccentricities(S.joints, thrust); let h = 0, w = 0; for (const v of e) { if (Math.abs(v) > 1) h++; w = Math.max(w, Math.abs(v)); }
      return S.free ? !(h >= 1 && w > 1.25) : (h < 4 && w < 1.9);
    }
    const api = { S, init, update, renderList, ropeList, targetFor, startBuild, collapse, topple, dismantle, safeFor };
    all.push(api);
    return api;
  }

  // the loose stones of every structure share one world; leftover rubble is hoisted away once nobody is building
  const lastKnock = new Map(); let clock = 0;
  function stepLoose(dt) {
    const events = []; clock += dt;
    if (loose.length && !world.asleep) {
      const nsub = Math.max(2, Math.ceil(dt * 120));   // never more than 1/120 s a step, however slow the frame
      for (let k = 0; k < nsub; k++) for (const e of Phys.step(world, dt / nsub)) {
        // a pair of stones knocks once, not every time a jammed contact re-forms
        if ((lastKnock.get(e.k) || -9) > clock - 0.35) continue;
        lastKnock.set(e.k, clock);
        if (e.j > 900) events.push({ type: 'knock', x: e.x, y: e.y, s: Math.min(2, e.j / 9000), big: e.j > 14000 });
        if (e.j > 4000 && (e.ground || Math.random() < 0.35)) events.push({ type: 'dust', x: e.x, y: e.y, s: Math.min(1.4, e.j / (e.ground ? 14000 : 22000)) });
      }
      for (const l of loose) l.rec.q = l.body.wv.map(v => v.slice());
      // a stone that has stopped going anywhere (wedged, or trembling on a pile) is set down for good: it becomes an obstacle, so
      // one restless stone can't keep the whole heap awake (and grinding)
      for (const l of loose) {
        if (l.frozen) continue;
        const b = l.body;
        if (!l.anchor || Math.hypot(b.x - l.anchor[0], b.y - l.anchor[1]) > 0.06 || Math.abs(b.a - l.anchor[2]) > 0.05) { l.anchor = [b.x, b.y, b.a]; l.still = 0; }
        else if ((l.still += dt) > 1.2) { l.frozen = true; b.dynamic = false; b.vx = b.vy = b.w = 0; }
      }
      if (lastKnock.size > 400) lastKnock.clear();
    }
    for (const l of loose) l.rest = (world.asleep || l.frozen || speedOf(l.body) < 0.05) ? l.rest + dt : 0;
    const busy = all.some(s => (s.S.phase === 'building' && s.S.build.full) || s.S.phase === 'collapsing' || s.S.phase === 'rubble');
    away.T = (away.T || 0) + dt;
    if (!busy && away.T > 0.2) {
      const l = loose.filter(x => x.rest > 1.5).sort((a, b) => b.body.y - a.body.y)[0];
      if (l) {
        away.T = 0; loose.splice(loose.indexOf(l), 1); l.body.dynamic = false; l.body.vx = l.body.vy = l.body.w = 0;
        away.push({ l, t: 0, q: l.body.wv.map(v => v.slice()) }); events.push({ type: 'rope', x: l.body.x });
      }
    }
    for (let i = away.length - 1; i >= 0; i--) {
      const a = away[i]; a.t += dt;
      if (a.t >= PRE && !a.lifted) { a.lifted = true; lift(a.l.body); }
      if (a.t > PRE + 2.2) away.splice(i, 1);
    }
    return events;
  }
  let awayRopes = [];
  function looseRecs() {
    awayRopes = [];
    const out = loose.map(l => l.rec);
    for (const a of away) {
      const c = centroid(a.q), top = topOf(a.q);
      if (a.t < PRE) { out.push(a.l.rec); awayRopes.push(rope(c[0], top + (ROPE_TOP - top) * (1 - ease(a.t / PRE)))); continue; }
      const u = (a.t - PRE) / 2.2, dy = 60 * u * u * (0.4 + 0.6 * u);
      out.push({ ...a.l.rec, q: a.q.map(([x, y]) => [x, y + dy]) }); awayRopes.push(rope(c[0], top + dy - 0.05));
    }
    return out;
  }
  const busy = () => away.length > 0;
  return { create, stepLoose, looseRecs, awayRopeList: () => awayRopes, loose, world, all, toStone, SC, eccentricities, towerHalfWidth, busy };
})();
