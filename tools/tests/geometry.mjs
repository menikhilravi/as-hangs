// geometry.mjs — fuzz the stone geometry: random weights on the arch's chain, every block must be a finite, convex, counter-clockwise
// quad of real size, and no two turrets may overlap.
import fs from 'node:fs';
const read = f => fs.readFileSync(new URL('../../src/' + f, import.meta.url), 'utf8');
const Chain = new Function(read('chain.js') + '; return Chain;')();
const Phys = new Function(read('physics2d.js') + '; return Phys;')();
const Structure = new Function('Phys', read('structure.js') + '; return Structure;')(Phys);
let rs = 12345; const rnd = () => ((rs = (rs * 1664525 + 1013904223) >>> 0) / 4294967296);
const area = q => q.reduce((s, p, i) => s + p[0] * q[(i + 1) % 4][1] - q[(i + 1) % 4][0] * p[1], 0) / 2;
const convex = q => { let sgn = 0; for (let i = 0; i < 4; i++) { const a = q[i], b = q[(i + 1) % 4], c = q[(i + 2) % 4]; const cr = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]); if (Math.abs(cr) < 1e-9) continue; if (sgn && Math.sign(cr) !== sgn) return false; sgn = Math.sign(cr); } return true; };
const box = b => { let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9; for (const [x, y] of b.q) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); } return [x0, x1, y0, y1]; };
let bad = 0, tests = 0, blocks = 0, towers = 0, overl = 0;
for (let t = 0; t < 150; t++) {
  const c = Chain.create({ span: 0.8, length: 1.72, pitch: 0.032 });
  const nW = 1 + Math.floor(rnd() * 6);
  for (let k = 0; k < nW; k++) Chain.setLoad(c, 2 + Math.floor(rnd() * (c.n - 4)), 1 + rnd() * (rnd() < 0.2 ? 20 : 5));
  for (let k = 0; k < 1500; k++) Chain.step(c, 1 / 240, 0.97);
  const st = Structure.create({ seed: 3 });
  const tg = st.targetFor(Chain.nodes(c), c.loads, false);
  const all = [...tg.arch.vous, ...tg.arch.foot, ...tg.towers.flatMap(x => x.blocks)];
  tests++; blocks += all.length; towers += tg.towers.length;
  for (const b of all) {
    const a = area(b.q);
    if (!b.q.every(p => isFinite(p[0]) && isFinite(p[1])) || a < 0.01 || !convex(b.q)) { bad++; if (bad < 6) console.log('bad block', b.kind, b.k, a.toFixed(3), JSON.stringify(b.q.map(p => p.map(v => +v.toFixed(2))))); }
  }
  for (let i = 0; i < tg.towers.length; i++) for (let j = i + 1; j < tg.towers.length; j++)
    for (const a of tg.towers[i].blocks) for (const b of tg.towers[j].blocks) { const A = box(a), B = box(b); if (A[0] < B[1] - 0.05 && B[0] < A[1] - 0.05 && A[2] < B[3] - 0.05 && B[2] < A[3] - 0.05) overl++; }
}
console.log(`${tests} shapes, ${blocks} blocks, ${towers} turrets: ${bad} bad blocks, ${overl} overlapping turret block pairs`);
process.exit(bad || overl ? 1 : 0);
