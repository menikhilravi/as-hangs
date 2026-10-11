import fs from 'node:fs';
const src = fs.readFileSync(new URL('../../src/physics2d.js', import.meta.url), 'utf8');
const Phys = new Function(src + '; return Phys;')();
// 1) a column of 6 blocks must stand still
{
  const W = Phys.createWorld();
  for (let i = 0; i < 6; i++) { const b = Phys.makeBody([[-0.5, i * 0.8], [0.5, i * 0.8], [0.5, i * 0.8 + 0.79], [-0.5, i * 0.8 + 0.79]]); b.dynamic = true; Phys.add(W, b); }
  let t = 0; for (; t < 6 && !W.asleep; t += 1 / 120) Phys.step(W, 1 / 120);
  const top = W.bodies[5];
  console.log('column: asleep', W.asleep, 'after', t.toFixed(2), 's; top block drift x', top.x.toFixed(4), 'y', top.y.toFixed(3), 'angle', top.a.toFixed(4));
}
// 2) a catenary arch of free voussoirs with the crown blocks knocked out: must fall, pile, and sleep
{
  const W = Phys.createWorld();
  const span = 16, rise = 13, n = 30, thick = 1.0;
  let lo = 0.05, hi = 1e4; for (let i = 0; i < 200; i++) { const m = Math.sqrt(lo * hi); if (m * (Math.cosh(span / 2 / m) - 1) > rise) lo = m; else hi = m; }
  const a = Math.sqrt(lo * hi), f = x => rise - a * (Math.cosh(x / a) - 1);
  const pts = []; for (let i = 0; i <= 400; i++) { const x = -span / 2 + span * i / 400; pts.push([x, f(x)]); }
  const cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const L = cum.at(-1); const at = s => { let i = 1; while (i < cum.length - 1 && cum[i] < s) i++; const t = (s - cum[i - 1]) / (cum[i] - cum[i - 1]); return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t]; };
  const jt = s => { const p = at(Math.max(0, s - 0.05)), q = at(Math.min(L, s + 0.05)); const l = Math.hypot(q[0] - p[0], q[1] - p[1]); return [(q[0] - p[0]) / l, (q[1] - p[1]) / l]; };
  for (let k = 0; k < n; k++) {
    if (k === 14 || k === 15) continue;
    const s0 = L * k / n + 0.01, s1 = L * (k + 1) / n - 0.01, c0 = at(s0), c1 = at(s1), t0 = jt(s0), t1 = jt(s1);
    const n0 = [-t0[1], t0[0]], n1 = [-t1[1], t1[0]], h = thick / 2;
    const q = [[c0[0] - n0[0] * h, c0[1] - n0[1] * h], [c1[0] - n1[0] * h, c1[1] - n1[1] * h], [c1[0] + n1[0] * h, c1[1] + n1[1] * h], [c0[0] + n0[0] * h, c0[1] + n0[1] * h]];
    const b = Phys.makeBody(q); b.dynamic = true; Phys.add(W, b);
  }
  let t = 0, ev = 0, maxV = 0, minY = 1e9; const t0 = Date.now();
  for (; t < 12 && !W.asleep; t += 1 / 120) { ev += Phys.step(W, 1 / 120).length; for (const b of W.bodies) { maxV = Math.max(maxV, Math.hypot(b.vx, b.vy)); minY = Math.min(minY, ...b.wv.map(v => v[1])); } }
  const ys = W.bodies.map(b => b.y);
  console.log('arch collapse: asleep', W.asleep, 'after', t.toFixed(2), 's; impacts', ev, '; max speed', maxV.toFixed(1), 'm/s; lowest vertex', minY.toFixed(3), 'm; max resting height', Math.max(...ys).toFixed(2), 'm; cpu', Date.now() - t0, 'ms');
}
