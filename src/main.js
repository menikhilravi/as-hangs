// main.js — boot, input, the coupling between the two worlds, and the frame loop.
'use strict';
(() => {
  const Q = new URLSearchParams(location.search);
  const canvas = document.getElementById('c');
  const gl = GL.init(canvas);
  if (!gl || !GL.floatRT) { document.body.classList.add('nogl'); return; }
  // a lost GPU context (driver reset, memory pressure) restarts cleanly
  canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); document.body.classList.add('lost'); });
  canvas.addEventListener('webglcontextrestored', () => location.reload());
  document.addEventListener('visibilitychange', () => { const A = Sound.A; if (A.ctx) { if (document.hidden) A.ctx.suspend(); else A.ctx.resume(); } });
  addEventListener('keydown', e => { if (e.key === 'm' || e.key === 'M') { Sound.setMuted(!Sound.A.muted); } });
  Render.init(); Stone.init(); Workshop.init();

  const SCALE = 20, PITCH = 0.032, TAP_MASS = 3;
  const view = { split: 0.5 };
  const chains = [];
  // a chain's static equilibrium under its weights: what the stone answers to, so the masons needn't wait for the swinging to stop
  function equilibrium(c, from = c.P, steps = 300) {
    const q = { ...c, P: from.slice(), O: from.slice(), loads: new Map(c.loads), hold: -1 };
    for (let k = 0; k < steps; k++) Chain.step(q, 1 / 240, 0.97);
    return Chain.nodes(q);
  }
  // all chains at rest together (a chain hooked onto another pulls on it): sets each chain's eq
  function equilibriumAll(steps = 300) {
    const qs = chains.map(c => ({ ...c, P: c.P.slice(), O: c.P.slice(), loads: new Map(c.loads), hold: -1 }));
    qs.forEach((q, i) => { const g = chains[i].glue; q.glue = g ? { c: qs[chains.indexOf(g.c)], k: g.k } : null; });
    for (let k = 0; k < steps; k++) Chain.stepAll(qs, 1 / 240, 0.97);
    qs.forEach((q, i) => { chains[i].eq = Chain.nodes(q); });
  }
  const eqKey = c => [...c.loads].map(([k, m]) => k + ':' + m.toFixed(2)).join(',') + '|' + c.free + '|' + c.b[0].toFixed(4) + '|' + (c.glue ? chains.indexOf(c.glue.c) + ':' + c.glue.k : '');
  function addChain(opts, seed) {
    const c = Chain.create({ pitch: PITCH, ...opts });
    // settle with the same step the live loop uses, so the stone is built from the shape the chain will actually hold
    for (let k = 0; k < 2400; k++) Chain.step(c, 1 / 240, k < 1800 ? 0.97 : 0.9985);
    c.eq = Chain.nodes(c); c.eqKey = eqKey(c); c.eqAge = 1; c.tried = '';
    c.st = Structure.create({ seed, free: c.free }); c.st.init(c.eq, c.free);
    c.prevAng = new Float64Array(c.n + 1);
    chains.push(c); return c;
  }
  const chain = addChain({ span: 0.8, length: +(Q.get('len') || 1.72) }, 3);   // the arch
  const SIDE = innerHeight > innerWidth ? 0.5 : 0.56, DANGLE = 0.5;
  if (!Q.has('single')) { addChain({ span: 0, x0: -SIDE, length: DANGLE, free: true }, 7); addChain({ span: 0, x0: SIDE, length: DANGLE, free: true }, 11); }
  const RISE = Math.max(...Chain.nodes(chain).map(p => -p[1])) * SCALE;
  const loose = c => c.free && !c.glue;   // hanging from one hook with its end free (a hooked-on end is not loose)
  const hooks = () => { const h = []; for (const c of chains) { h.push(c.a[0]); if (!c.free) h.push(c.b[0]); } if (input.hookAt !== null) h.push(input.hookAt); return h; };
  // loose ends carry an open hook, along the last link
  const ends = () => chains.filter(c => c.free || c.glue).map(c => { const n = c.n, dx = c.P[2 * n] - c.P[2 * n - 2], dy = c.P[2 * n + 1] - c.P[2 * n - 1], l = Math.hypot(dx, dy) || 1; return [c.P[2 * n], c.P[2 * n + 1], dx / l, dy / l]; });

  const cam = { pos: [0, +(Q.get('eye') || 5), -(+(Q.get('dist') || 42))], tanH: 0.4, shift: 0, haze: 2.4e-5 };
  cam.shift = -cam.pos[1] / -cam.pos[2];
  const camB = () => ({ pos: [cam.pos[0] / SCALE, -cam.pos[1] / SCALE, cam.pos[2] / SCALE], tanH: cam.tanH, shift: cam.shift });

  let W = 0, H = 0;
  // the bulb hangs on its cord from a hook in the ceiling and swings if pushed
  const bulb = { top: [-0.66, 0, -0.42], L: 0.36, ax: 0, az: 0, vx: 0, vz: 0, held: false };
  const lamp = [-0.66, -0.36, -0.42];
  function bulbStep(dt) {
    if (!bulb.held) for (let k = 0; k < 4; k++) {
      const h = dt / 4, w2 = 9.81 / bulb.L;
      bulb.vx += (-w2 * Math.sin(bulb.ax) - 0.28 * bulb.vx) * h; bulb.vz += (-w2 * Math.sin(bulb.az) - 0.28 * bulb.vz) * h;
      bulb.ax += bulb.vx * h; bulb.az += bulb.vz * h;
    }
    lamp[0] = bulb.top[0] + bulb.L * Math.sin(bulb.ax); lamp[2] = bulb.top[2] + bulb.L * Math.sin(bulb.az);
    lamp[1] = -bulb.L * Math.cos(bulb.ax) * Math.cos(bulb.az);
    return bulb.held || Math.abs(bulb.ax) + Math.abs(bulb.az) + Math.abs(bulb.vx) + Math.abs(bulb.vz) > 2e-4;
  }
  function resize() {
    // a budget of about a million traced pixels: a laptop renders a little under its CSS size, a big monitor much less, a phone at size
    const scale = +(Q.get('scale') || Math.min(1, Math.sqrt(950000 / (innerWidth * innerHeight))));
    W = Math.max(2, Math.round(innerWidth * scale)); H = Math.max(2, Math.round(innerHeight * scale));
    canvas.width = W; canvas.height = H;
    Render.resize(W, H, view.split);
    const Ht = Render.R.top[0].h, sxMax = 0.5 * W / Ht, D = -cam.pos[2];
    const tanFitH = ((RISE + 0.7 - cam.pos[1]) / D - cam.shift) / 0.8;
    const tanFitW = ((chains.length > 1 ? SIDE + 0.06 : 0.4) * SCALE + (H > W ? 0.9 : 2.6)) / D / sxMax;
    cam.tanBase = Math.max(tanFitH, tanFitW); cam.tanH = Math.max(cam.tanBase, cam.tanFit || 0);
  }

  resize(); addEventListener('resize', resize);
  const SUN_AZ = +(Q.get('az') || 112), GOLD = +(Q.get('elev') || 8.5);
  Stone.buildSunTable(SUN_AZ, -3.5, GOLD + 0.5);   // (the evening's sky light, measured once)
  Stone.setSun(GOLD, SUN_AZ);
  // the day: left alone, the sun goes down into twilight; a touch brings the working light back
  const day = { elev: GOLD, set: GOLD, setT: 0, idle: 0, L0: 0, relit: false };
  const lum = c => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  day.L0 = lum(Stone.S.sh);
  function runDay(dt) {
    const busy = chains.some(c => c.st.S.phase !== 'standing') || input.down;
    day.idle = busy ? 0 : day.idle + dt * (Q.has('fastday') ? 12 : 1);
    const target = day.idle > 45 ? Math.max(-3.2, GOLD - (day.idle - 45) * 0.13) : GOLD;
    const rate = target > day.elev ? 3 : 0.13 * (Q.has('fastday') ? 12 : 1);   // dusk falls slowly; the light comes back quickly when someone returns
    day.elev += Math.sign(target - day.elev) * Math.min(Math.abs(target - day.elev), rate * dt);
    day.setT += dt; day.relit = false;
    if (Math.abs(day.elev - day.set) > 0.05 && day.setT > (rate > 1 ? 0.1 : 0.4)) { Stone.setSun(day.elev, SUN_AZ); day.set = day.elev; day.setT = 0; day.relit = true; }
    const dusk = Math.min(1, Math.max(0, (GOLD - day.elev) / (GOLD + 3.2)));
    Sound.setDusk(dusk);
    return { dusk, exp: Math.min(7, Math.pow(day.L0 / Math.max(1e-4, lum(Stone.S.sh)), 0.62)) };
  }

  // ---------- screen ↔ workshop plane (z = 0) ----------
  function toModel(cx, cy) {
    const hs = innerHeight * view.split, ys = innerHeight - hs; // split line in CSS px from the top
    const sx = (cx - innerWidth / 2) / hs;
    let sy, dirY;
    const top = cy < ys;
    if (top) { sy = (ys - cy) / hs; dirY = sy * cam.tanH + cam.shift; }      // the stone world, mirrored down to the chain
    else { sy = (cy - ys) / hs; dirY = -(sy * cam.tanH + cam.shift); }
    const c = camB().pos; const d = [sx * cam.tanH, top ? -dirY : dirY, 1];
    const t = -c[2] / d[2];
    return { x: c[0] + d[0] * t, y: c[1] + d[1] * t, top };
  }
  // the bulb in CSS pixels (the workshop camera, shifted lens)
  function bulbScreen() {
    const hs = innerHeight * view.split, ys = innerHeight - hs, c = camB().pos, dz = lamp[2] - c[2];
    return [innerWidth / 2 + (lamp[0] - c[0]) / dz / cam.tanH * hs, ys + (-(lamp[1] - c[1]) / dz - cam.shift) / cam.tanH * hs];
  }
  const metresPerPx = () => cam.tanH * (-camB().pos[2]) / (innerHeight * view.split);
  const grabRadius = () => Math.max(0.05, 34 * metresPerPx());

  // ---------- weights ----------
  // a weight within two links of another is the same weight
  function crowding(c, i, except = -1) { for (const [k] of c.loads) if (k !== except && Math.abs(k - i) <= 2) return k; return -1; }
  const dropping = [];   // weights taken off: they fall to the floor
  function takeOff(c, k, x = c.P[2 * k], y = c.P[2 * k + 1]) {
    const m = c.loads.get(k); Chain.setLoad(c, k, 0);
    dropping.push({ x, y, v: 0, m, seed: k * 7.1, pan: panOf(c, k) });
    clinkBurst(c, k, 5);
  }
  // (the workshop has twelve sacks of shot; a new weight needs one of them to be free)
  const sacksInUse = () => chains.reduce((n, c) => n + c.loads.size, 0);
  function hang(c, k, m) {
    if (!c.loads.has(k) && sacksInUse() >= 12) { clinkBurst(c, k, 3); return; }
    Chain.setLoad(c, k, m); Sound.sack(panOf(c, k), Math.min(1.4, 0.5 + m / 10)); clinkBurst(c, k, 6);
  }

  // ---------- input ----------
  // tap bare chain: hang a weight · tap a weight: take it off · pull a link down: a weight that grows as you pull, hung when you
  // let go · drag a weight: slide it along the chain, or off it · lift a loose end to the ceiling: hook it in
  const input = { down: false, id: -1, startX: 0, startY: 0, t0: 0, moved: 0, node: -1, c: null, sack: undefined, pv: null, off: false, ptr: null, hookAt: null };
  function nearestNode(m) { let best = { i: -1, d: 1e9, c: null }; for (const c of chains) { const r = Chain.nearest(c, m.x, m.y); if (r.d < best.d) best = { ...r, c }; } return best; }
  // a weight's sack hangs below its link: pointing at the sack counts as pointing at the weight
  function sackAt(m) {
    let best = null, bd = 1e9;
    for (const c of chains) for (const [k, mass] of c.loads) {
      const sz = 0.021 * Math.pow(Math.max(mass, 0.5), 0.38), sx = c.P[2 * k], sy = c.P[2 * k + 1] - 0.051 - 1.2 * sz;   // as drawn
      const d = Math.hypot(m.x - sx, m.y - sy); if (d < sz * 1.3 + grabRadius() * 0.3 && d < bd) { bd = d; best = { c, k }; }
    }
    return best;
  }
  canvas.addEventListener('pointerdown', e => {
    Sound.unlock();
    if (input.down) return;   // one hand at a time: a second finger doesn't take over the first's gesture
    canvas.setPointerCapture(e.pointerId);
    // the bulb: a press on it takes hold of it, a tap pushes it
    { const bs = bulbScreen(); if (Math.hypot(e.clientX - bs[0], e.clientY - bs[1]) < 26) { Object.assign(input, { down: true, id: e.pointerId, startX: e.clientX, startY: e.clientY, t0: performance.now(), moved: 0, node: -1, c: null, bulb: true, bt: performance.now() }); bulb.held = true; bulb.vx = bulb.vz = 0; Sound.clink(-0.8, 0.25); e.preventDefault(); return; } }
    const m = toModel(e.clientX, e.clientY), nn = nearestNode(m);
    // a finger on the chain itself means the chain, even where another weight's sack hangs close by (steep flanks)
    for (const c of chains) if (c.glue && Math.hypot(c.P[2 * c.n] - m.x, c.P[2 * c.n + 1] - m.y) < grabRadius() * 0.6) { nn.i = c.n; nn.c = c; nn.d = 0; }
    let sk = sackAt(m); if (sk && nn.i > 0 && nn.d < grabRadius() * 0.35 && Math.abs(nn.i - sk.k) > 2 && nn.c === sk.c) sk = null;
    Object.assign(input, { down: true, id: e.pointerId, startX: e.clientX, startY: e.clientY, lastY: e.clientY, startTop: m.top, t0: performance.now(), moved: 0, node: -1, c: null, sack: undefined, pv: null, off: false, ptr: m, rest0: null });
    if (sk || (nn.i > 0 && nn.d < grabRadius())) {
      const c = sk ? sk.c : nn.c, i = sk ? sk.k : nn.i; input.c = c; input.node = i;
      input.off2 = [c.P[2 * i] - m.x, c.P[2 * i + 1] - m.y];
      input.sack = sk ? sk.k : [...c.loads.keys()].find(k => Math.abs(k - i) <= 1);
      if (input.sack === undefined) {
        c.hold = i; c.holdPos = [c.P[2 * i], c.P[2 * i + 1]];
        if (!loose(c)) input.pv = { P: c.P.slice(), O: c.P.slice(), m: 0, base: c.loads.get(i) || 0 };
      }
      clinkBurst(c, i, 3);
    }
    e.preventDefault();
  });
  canvas.addEventListener('pointermove', e => {
    const m = toModel(e.clientX, e.clientY);
    if (!input.down || e.pointerId !== input.id) { const bs = bulbScreen(); canvas.style.cursor = (sackAt(m) || nearestNode(m).d < grabRadius() || Math.hypot(e.clientX - bs[0], e.clientY - bs[1]) < 26) ? 'grab' : 'default'; return; }
    input.moved = Math.max(input.moved, Math.hypot(e.clientX - input.startX, e.clientY - input.startY)); input.ptr = m;
    input.lastY = input.startTop ? 2 * input.startY - e.clientY : e.clientY;   // (in the sky, pulling the arch up is pulling the chain down)
    input.lastX = e.clientX;
    if (input.bulb) {
      // swing the bulb toward the finger (in the plane of the cord's hook), remembering how fast it was moving
      const mm = toModel(e.clientX, e.clientY), d = 2.1 - 0.42, s = d / 2.1, x = (mm.x) * s, a = Math.max(-0.7, Math.min(0.7, Math.asin(Math.max(-1, Math.min(1, (x - bulb.top[0]) / bulb.L)))));
      const now = performance.now(), dtp = Math.max(8, now - input.bt) / 1000; bulb.vx = (a - bulb.ax) / dtp * 0.6; bulb.ax = a; input.bt = now; e.preventDefault(); return;
    }
    const c = input.c;
    if (c) {
      canvas.style.cursor = 'grabbing';
      const want = [m.x + input.off2[0], m.y + input.off2[1]];
      if (input.fill && Math.hypot(e.clientX - input.fill.x, e.clientY - input.fill.y) > 14 && !input.fill.done) { input.fill = null; input.moved = 99; }   // moving on: it was a slide after all
      if (input.fill) { /* filling: the finger holds still */ }
      else if (input.sack !== undefined && input.moved > 6) {
        // slide the weight to the link nearest the finger, or pull it right off the chain
        const nk = Chain.nearest(c, m.x, m.y + 0.04);
        if (nk.d > 0.1) input.off = true;
        else if (input.off && nk.d < 0.06) input.off = false;
        if (!input.off && nk.i > 0 && nk.i !== input.sack && (loose(c) ? false : crowding(c, nk.i, input.sack) < 0)) {
          const mass = c.loads.get(input.sack); Chain.setLoad(c, input.sack, 0); Chain.setLoad(c, nk.i, mass); input.sack = nk.i;
          if (Math.random() < 0.6) Sound.clink(panOf(c, nk.i), 0.4);
        }
      } else if (input.sack === undefined) {
        // a chain is heavy: it follows a pulling finger only part of the way (so a small pull makes a small weight)
        const rest = input.rest0 || (input.rest0 = [c.P[2 * input.node], c.P[2 * input.node + 1]]);
        const k = c.free ? 1 : 0.55;
        c.holdPos = reachable(c, input.node, rest[0] + (want[0] - rest[0]) * k, rest[1] + (want[1] - rest[1]) * k, c.free ? 1 : 0.985);
        if (c.glue && input.node === c.n && Math.hypot(want[0] - rest[0], want[1] - rest[1]) > 0.08) {
          // a hooked-on end yanked hard comes off
          c.glue = null; Sound.clink(panOf(c, c.n), 1); clinkBurst(c, c.n, 6);
        }
        // a loose end lifted near the ceiling: a hook appears where it would catch
        input.hookAt = loose(c) && input.node === c.n && c.holdPos[1] > c.a[1] - 0.08 ? Chain.attachX(c, c.holdPos[0]) : null;
        // a loose end brought to another chain catches on its nearest link
        input.glueAt = null;
        if (loose(c) && input.node === c.n && input.hookAt === null) {
          let best = null, bd = 0.028;
          for (const o of chains) if (o !== c && !loose(o) && !o.glue) for (let j = 3; j <= o.n - 3; j++) { const d = Math.hypot(o.P[2 * j] - c.holdPos[0], o.P[2 * j + 1] - c.holdPos[1]); if (d < bd && ![...o.loads.keys()].some(q => Math.abs(q - j) <= 1)) { bd = d; best = { c: o, k: j }; } }
          if (best) { input.glueAt = best; c.holdPos = [best.c.P[2 * best.k], best.c.P[2 * best.k + 1]]; }
          const tag = best ? best.k + chains.indexOf(best.c) * 1000 : -1;
          if (tag !== input.glueTag) { if (best) Sound.clink(panOf(best.c, best.k), 0.7); input.glueTag = tag; }
        }
      }
    }
    e.preventDefault();
  });
  const end = e => {
    if (!input.down || e.pointerId !== input.id) return;
    input.down = false;
    if (input.bulb) {
      bulb.held = false; input.bulb = false;
      if (input.moved < 7) { const dir = Math.random() < 0.5 ? -1 : 1; bulb.vx += dir * 1.4; bulb.vz += (Math.random() - 0.5) * 1.2; Sound.clink(-0.8, 0.35); }
      return;
    }
    const i = input.node, c = input.c;
    if (input.fill) {
      Sound.sack(panOf(c, input.fill.k), 0.6);
    } else if (c && i > 0) {
      const tap = input.moved < 7 && performance.now() - input.t0 < 350;
      window.__lastRelease = { i, tap, moved: input.moved, m: input.pv ? input.pv.m : 0 };
      if (input.sack !== undefined) {
        if (tap) takeOff(c, input.sack);
        else if (input.off) {
          // carried off its chain: hung on whatever chain (or open hook) it is let go over, or dropped
          const tg = nearestNode(input.ptr), o = tg.c, mass = c.loads.get(input.sack);
          const node = !o || tg.d > grabRadius() * 0.8 ? -1 : loose(o) ? (tg.i >= o.n - 3 ? o.n : -1) : Math.max(5, Math.min(o.n - 5, tg.i));
          if (node > 0 && !(o.loads.has(node)) && (loose(o) || crowding(o, node) < 0)) { Chain.setLoad(c, input.sack, 0); Chain.setLoad(o, node, mass); Sound.sack(panOf(o, node), 0.8); clinkBurst(o, node, 6); }
          else takeOff(c, input.sack, input.ptr.x, input.ptr.y);
        }
      } else if (input.glueAt && i === c.n) {
        // hooked onto another chain's link: a chain hanging from a chain (a flying buttress, once it is stone)
        if (c.loads.has(c.n)) takeOff(c, c.n);
        c.glue = input.glueAt; Sound.clink(panOf(c, i), 1.2); clinkBurst(c, i, 8); clinkBurst(input.glueAt.c, input.glueAt.k, 5);
      } else if (loose(c) && i === c.n && !tap && c.P[2 * i + 1] > c.a[1] - 0.08) {
        // the loose end lifted to the ceiling: hook it in
        if (c.loads.has(c.n)) takeOff(c, c.n);
        if (Chain.attach(c, c.P[2 * i])) { Sound.clink(panOf(c, i), 1.2); clinkBurst(c, i, 8); }
      } else if (tap && !loose(c)) {
        const k = crowding(c, i);
        if (k >= 0) takeOff(c, k); else hang(c, Math.max(5, Math.min(c.n - 5, i)), TAP_MASS);   // (not right by a hook)
      } else if (tap && loose(c) && i >= c.n - 2) {
        // the open hook at a loose end takes a sack (the column above gets a finial)
        if (c.loads.has(c.n)) takeOff(c, c.n); else hang(c, c.n, TAP_MASS);
      } else if (tap) {
        // a loose chain just swings
        for (let k = 1; k <= c.n; k++) { const w = Math.exp(-Math.pow((k - i) / 6, 2)); c.O[2 * k] = c.P[2 * k] - 0.0016 * w; }
        clinkBurst(c, i, 5);
      } else if (input.pv && input.pv.m > 0.8) {
        // the weight that grew under the finger takes over from it, joining any weight too close for a turret of its own
        const k = crowding(c, i), node = k >= 0 ? k : i;
        hang(c, node, Math.min(40, (c.loads.get(node) || 0) + input.pv.m));
      }
    }
    if (c) c.hold = -1;
    Object.assign(input, { node: -1, c: null, sack: undefined, pv: null, off: false, hookAt: null, glueAt: null, rest0: null, fill: null });
    canvas.style.cursor = 'default';
  };
  canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end);
  // (some mobile browsers only let sound start from the end of a touch or a click)
  for (const ev of ['pointerup', 'touchend', 'click']) addEventListener(ev, () => Sound.unlock(), { passive: true });
  addEventListener('contextmenu', e => e.preventDefault());

  // the weight a pull would hang: a copy of the chain hangs free with a sack at the held link, and the sack's mass is nudged each
  // frame until the copy's link sits where the finger holds the real one
  // the weight a pull would hang: the further down the finger has pulled, the heavier (a fifth of the half-screen ≈ a heavy sack)
  function growWeight(c, pv) {
    const hs = innerHeight * view.split, drop = Math.max(0, (input.lastY ?? input.startY) - input.startY) / hs;
    pv.m += (Math.min(30, Math.max(0, (drop - 0.025) * 70)) - pv.m) * 0.35;
  }

  // the held node can't leave the region the chain can reach from both hooks
  function reachable(c, i, x, y, slack = 1) {
    const la = i * c.seg * slack, lb = (c.n - i) * c.seg * slack;
    let p = [x, Math.min(y, c.a[1] - 0.004)];
    const cons = c.free ? [[c.a, la]] : [[c.a, la], [c.b, lb]];
    for (let k = 0; k < 6; k++) for (const [h, l] of cons) { const dx = p[0] - h[0], dy = p[1] - h[1], d = Math.hypot(dx, dy); if (d > l) { p = [h[0] + dx / d * l, h[1] + dy / d * l]; } }
    return p;
  }
  const panOf = (c, i) => Math.max(-1, Math.min(1, c.P[2 * i] / 0.7));
  function clinkBurst(c, i, n) { for (let k = 0; k < n; k++) setTimeout(() => Sound.clink(panOf(c, Math.max(1, Math.min(c.n - 1, i + Math.round((Math.random() - .5) * 8)))), 0.5 + Math.random() * 0.6), k * (12 + Math.random() * 40)); }

  // chain rattle from motion: link angles changing quickly make links knock
  function chainActivity(c) {
    let act = 0, at = 0;
    for (let i = 1; i < c.n; i++) {
      const ax = c.P[2 * i] - c.P[2 * i - 2], ay = c.P[2 * i + 1] - c.P[2 * i - 1], bx = c.P[2 * i + 2] - c.P[2 * i], by = c.P[2 * i + 3] - c.P[2 * i + 1];
      const ang = Math.atan2(ax * by - ay * bx, ax * bx + ay * by);
      const d = Math.abs(ang - c.prevAng[i]); c.prevAng[i] = ang; act += d; if (d > 0.02 && Math.random() < d * 2) at = i;
    }
    return { act, at };
  }

  // ---------- the opening: fade in, then the piece performs its own verb once ----------
  const intro = { t: 0, dropped: false, falling: null, epigraph: 0, touched: false };
  const epi = document.getElementById('epigraph');
  canvas.addEventListener('pointerdown', () => { intro.touched = true; intro.idle = 0; day.idle = 0; if (intro.epigraph === 1) hideEpigraph(); }, { capture: true });
  function hideEpigraph() { if (!epi) return; epi.classList.remove('on'); intro.epigraph = 2; }
  function runIntro(dt) {
    const realDt = Math.min(0.25, (performance.now() - (intro.wall || performance.now())) / 1000); intro.wall = performance.now();
    intro.t += Math.max(dt, realDt);
    if (!intro.dropped && intro.t > 2.0 && !intro.touched && !Q.has('nointro')) {
      intro.dropped = true;
      const node = Math.round(chain.n * 0.6);   // on the shoulder, where a turret sits square on the arch's back
      intro.falling = { node, y: -0.06, v: 0, m: 3.4 };
    }
    if (intro.falling) {
      const f = intro.falling; f.v += 9.81 * dt * 0.5; f.y -= f.v * dt;   // a short fall from just under the ceiling
      const ty = chain.P[2 * f.node + 1];
      if (f.y <= ty) { Chain.setLoad(chain, f.node, f.m); chain.P[2 * f.node + 1] -= 0.012; Sound.sack(panOf(chain, f.node), 1.1); clinkBurst(chain, f.node, 7); intro.falling = null; intro.waitTower = true; }
    }
    // still untouched once the turret stands and the line has been read: shot pours into the sack until the stone gives way, and the
    // masons build it again in the new shape — the whole verb, shown once
    if (!intro.touched && !intro.poured && intro.t > 16 && !Q.has('nointro') && chain.st.S.phase === 'standing' && chain.st.S.towers.length && chain.loads.size) {
      intro.poured = true; intro.fill = { k: [...chain.loads.keys()][0], t: 0 };
    }
    if (intro.fill) {
      const f = intro.fill;
      if (intro.touched || chain.st.S.phase !== 'standing' || f.t > 14) intro.fill = null;
      else {
        f.t += dt; Chain.setLoad(chain, f.k, Math.min(30, chain.loads.get(f.k) + (0.6 + 0.9 * f.t) * dt));
        f.pour = (f.pour || 0) + dt * 12; while (f.pour > 1) { f.pour -= 1; Sound.clink(panOf(chain, f.k), 0.1 + 0.1 * Math.random()); }
      }
    }
    // left alone for a long while, the line comes back for a moment
    intro.idle = (intro.idle || 0) + dt;
    if (intro.idle > 75 && intro.epigraph === 2 && epi) { intro.idle = 0; intro.epigraph = 1; epi.classList.add('on'); setTimeout(() => { if (intro.epigraph === 1) hideEpigraph(); }, 9000); }
    // the line appears once the stone has first answered the chain (a turret on it, or a rebuild), whoever hung the weight
    const answered = chains.some(c => c.st.S.phase === 'standing' && (c.st.S.towers.length || c.st.S.built > 0));
    if (answered && intro.epigraph === 0 && !input.down && intro.t > 3) {
      intro.waitTower = false; intro.epigraph = 1; if (epi) epi.classList.add('on');
      setTimeout(() => { if (intro.epigraph === 1) hideEpigraph(); }, 9000);
    }
  }

  // ---------- someone standing on the plain, for scale (1.75 m, in a hat, looking up at the arch) ----------
  const figure = (() => {
    const fx = +(Q.get('fx') || 4.6), fz = -3.6, out = [];
    const box = (x0, y0, x1, y1, dz, k) => out.push({ q: [[fx + x0, y0], [fx + x1, y0], [fx + x1, y1], [fx + x0, y1]], z0: fz - dz, z1: fz + dz, mat: 3, seed: 9000 + k, uid: 990000 + k });
    box(-0.16, 0, -0.03, 0.86, 0.09, 1); box(0.03, 0, 0.16, 0.86, 0.09, 2);                 // legs
    out.push({ q: [[fx - 0.17, 0.84], [fx + 0.17, 0.84], [fx + 0.21, 1.46], [fx - 0.21, 1.46]], z0: fz - 0.13, z1: fz + 0.13, mat: 3, seed: 9003, uid: 990003 });   // coat
    box(-0.29, 0.9, -0.2, 1.43, 0.07, 4); box(0.2, 0.9, 0.29, 1.43, 0.07, 5);                // arms
    box(-0.085, 1.46, 0.085, 1.69, 0.1, 6);                                                  // head
    box(-0.17, 1.67, 0.17, 1.7, 0.17, 7); box(-0.1, 1.7, 0.1, 1.79, 0.1, 8);                 // hat
    return Q.has('nofigure') ? [] : out;
  })();

  // ---------- dust motes in the lamplight: placed, blurred by the lens and lit here, drawn by the compositor ----------
  const MOTES = { n: 56, A: new Float32Array(224), B: new Float32Array(224) };
  const hh = n => { const x = Math.sin(n * 127.1) * 43758.5453; return x - Math.floor(x); };
  function updateMotes(time) {
    const hs = innerHeight * view.split, split = Render.R.bot[0].h, pxs = split / hs, c = camB().pos, fpx = split / cam.tanH, E = [560, 340, 150];
    let m = 0;
    for (let i = 0; i < 56; i++) {
      const b = [lamp[0] + (hh(i) - 0.5) * 1.1, -0.06 - hh(i + 3.1) * 0.8, -0.95 + hh(i + 7.7) * 1.2];
      const t = time * (0.05 + 0.05 * hh(i + 1.3));
      const p = [b[0] + Math.sin(t * 3.1 + i) * 0.05, b[1] + Math.sin(t * 2.3 + i * 1.7) * 0.035 + ((time * 0.006 * (hh(i + 2) - 0.3)) % 0.2), b[2] + Math.sin(t * 2.7 + i * 2.3) * 0.05];
      const d = [p[0] - c[0], p[1] - c[1], p[2] - c[2]]; if (d[2] < 0.05) continue;
      const sx = 0.5 * Render.R.W + d[0] / d[2] * fpx, sy = split - (-d[1] / d[2] - cam.shift) * fpx;
      const coc = Math.max(0.55, Math.min(6, Math.abs(1 / d[2] - 1 / 2.1) * 2.1 * 9)) * Math.max(0.6, pxs);
      const tl = [lamp[0] - p[0], lamp[1] - p[1], lamp[2] - p[2]], dl = Math.hypot(...tl), dv = Math.hypot(...d);
      const mu = -(d[0] * tl[0] + d[1] * tl[1] + d[2] * tl[2]) / (dv * dl), g = 0.6, ph = (1 - g * g) / Math.pow(1 + g * g - 2 * g * mu, 1.5);
      const tw = 0.55 + 0.45 * Math.sin(time * (1.5 + 2 * hh(i + 9)) + i), k = ph * tw * 1.2e-2 * (Math.PI * 0.022 * 0.022) / (dl * dl);
      MOTES.A.set([sx, sy, coc, dv], m * 4); MOTES.B.set([E[0] * k, E[1] * k, E[2] * k, 0], m * 4); m++;
    }
    MOTES.n = m; return MOTES;
  }

  // ---------- the chain's mirror image over the stone ----------
  // Each chain's inverted image is drawn over its stone: the line of thrust the stone has to contain, gold where the stone holds it
  // comfortably, warming to red near the stone's edge. It rests faintly while someone is at work, brightens under a hand or when the
  // weights change, and fades away when the day ends.
  const ghost = { c: null, a: 0, hold: 0, calm: 0 };
  function updateGhost(dt) {
    if (input.down && input.c) { ghost.c = input.c; ghost.hold = 1.4; }
    for (const c of chains) if (c.eqAge === 0 && !(input.down && input.c === c) && c.eqKey !== c.ghostKey) { c.ghostKey = c.eqKey; if (frame > 2) { ghost.c = c; ghost.hold = 2.2; } }
    ghost.hold -= dt;
    ghost.a += ((ghost.hold > 0 ? 1 : 0) - ghost.a) * Math.min(1, dt * (ghost.hold > 0 ? 6 : 1.6));
    // the line rests faintly on every arch while someone is at work
    ghost.calm += ((day.idle < 7 && intro.t > 3 ? 0.55 : 0) - ghost.calm) * Math.min(1, dt * 0.8);   // (and goes a few seconds after the hands do)
    const out = [];
    for (const c of chains) {
      const a = c === ghost.c ? Math.max(ghost.a * 0.9, ghost.calm) : (loose(c) ? 0 : ghost.calm);
      if (a < 0.01) continue;
      const S = c.st.S, live = input.down && input.c === c, nodes = live ? Chain.nodes(c) : c.eq, E = S.eccS, nJ = E.length;
      if (out.length) out.push([0, 0, 0, -1]);
      for (let i = 0; i <= c.n; i += (i + 2 > c.n ? c.n - i || 1 : 2)) {
        const p = Structure.toStone(nodes[i]), j = Math.min(nJ - 1, Math.max(0, Math.round(i / c.n * (nJ + 1)) - 1));
        out.push([p[0], p[1], S.phase === 'standing' && nJ ? Math.min(1, Math.abs(E[j] || 0)) : 0, a]);
      }
    }
    return out.length ? out : null;
  }

  // ---------- the two worlds, coupled ----------
  const windowK = { set: 1 };
  let lastHookAt = null, zooming = false, strainedLast = false, last = performance.now(), frame = 0, lastStoneSig = '', chainAcc = 0, capTop = 1e6, capBot = 1e6, stillTop = 0, stillBot = 0;
  const fixedFrames = Q.has('spp') ? +Q.get('spp') : 0;
  window.__state = { frames: 0 };
  function tick(now) {
    const dt = Math.min(1 / 20, (now - last) / 1000 || 1 / 60); last = now;   // (a slow device still sees things happen in real time)
    if (input.pv && input.c && !input.fill) growWeight(input.c, input.pv);
    // a press held still fills the sack under the finger with shot (or hangs a new one there and fills it): the heavy loads
    if (input.down && input.c && !input.bulb && !input.fill && input.moved < 6 && now - input.t0 > 550) {
      const c = input.c, k = input.sack ?? (loose(c) ? (input.node >= c.n - 2 ? c.n : -1) : (crowding(c, input.node) >= 0 ? crowding(c, input.node) : input.node));
      if (k > 0) {
        c.hold = -1; input.pv = null;
        if (!c.loads.has(k)) hang(c, k, 1.5);
        if (c.loads.has(k)) { input.fill = { c, k, t: 0, x: input.lastX ?? input.startX, y: input.lastY ?? input.startY }; input.sack = k; }
      }
    }
    if (input.fill && input.fill.c.st.S.phase !== 'standing' && input.fill.c.st.S.phase !== 'building') input.fill.done = true;   // the stone gave way: the sack is full
    if (input.fill && !input.fill.done) {
      const f = input.fill; f.t += dt;
      const m = Math.min(30, (f.c.loads.get(f.k) || 0) + (1.2 + 1.6 * f.t) * dt); Chain.setLoad(f.c, f.k, m);
      f.pour = (f.pour || 0) + dt * (14 + 10 * Math.random());
      while (f.pour > 1) { f.pour -= 1; Sound.clink(panOf(f.c, f.k), 0.12 + 0.12 * Math.random()); }
    }
    for (const c of chains) if (c.st.S.build) c.st.S.build.hurry = input.down ? 2.5 : 1;
    // chains: fixed 1/240 s steps so their stretch (and so their rest shape) never depends on the frame rate
    chainAcc += dt; let nsteps = 0; while (chainAcc >= 1 / 240 && nsteps < 12) { Chain.stepAll(chains, 1 / 240, 0.9972); chainAcc -= 1 / 240; nsteps++; }
    let moving = false;
    for (const c of chains) {
      // the room is redrawn while a chain moves at all: swinging, or led slowly by a hand (its held link moving), or a sack on it
      // filling (a slow sag is still a change; drawing over it would smear)
      const hp = c.hold >= 0 ? c.holdPos[0] * 1e4 + c.holdPos[1] : null, led = hp !== null && hp !== c.lastHold; c.lastHold = hp;
      moving = moving || c.energy > 1.2e-4 || led;
      const { act, at } = chainActivity(c);
      if (act > 0.06 && at && Math.random() < Math.min(0.9, act * 1.5)) Sound.clink(panOf(c, at), Math.min(1.2, act * 3));
    }
    if (bulbStep(dt)) moving = true;
    if (input.fill || intro.fill || (input.pv && input.pv.m > 0.6)) moving = true;
    for (let k = dropping.length - 1; k >= 0; k--) { const d = dropping[k]; d.v += 9.81 * dt; d.y -= d.v * dt; moving = true; if (d.y < -2.4) { setTimeout(() => Sound.sack(d.pan, 0.9), 0); dropping.splice(k, 1); } }
    runIntro(dt);
    // stone world: each structure judged against its own chain — the live chain while a hand is on it, its equilibrium otherwise
    const events = [];
    for (const c of chains) {
      const touching = (input.down && input.c === c) || (intro.fill && c === chain);
      if (!touching) { const key = eqKey(c); if (key !== c.eqKey) { equilibriumAll(); for (const o of chains) if (o !== c && o.glue && (o.glue.c === c || c.glue && c.glue.c === o)) o.eqAge = 0; c.eqKey = key; c.eqAge = 0; } else c.eqAge += dt; } else c.eqAge = 0;
      c.st.update(dt, (touching ? Chain.nodes(c) : c.eq).map(Structure.toStone), touching && !input.fill && !intro.fill);
      events.push(...c.st.S.events);
    }
    for (const c of chains) {
      const S = c.st.S, mode = c.glue ? 'butt' : c.free ? 'col' : 'arch';
      if (c.mode && c.mode !== mode && S.phase === 'standing') c.st.collapse(Math.floor(S.joints.length / 2), [0, -1]);   // hooked or unhooked: the stone it was is no longer carried
      c.mode = mode;
      if (c.glue && S.phase === 'standing' && c.glue.c.st.S.phase !== 'standing' && c.glue.c.st.S.phase !== 'building') c.st.collapse(Math.floor(S.joints.length / 2), [0, -1]);
    }
    events.push(...Structure.stepLoose(dt));
    for (const ev of events) {
      const pan = ev.x !== undefined ? Math.max(-1, Math.min(1, ev.x / 14)) : 0;
      if (ev.type === 'knock') Sound.knock(pan, ev.s, ev.big);
      else if (ev.type === 'crack') Sound.crack(pan, ev.s ?? 1);
      else if (ev.type === 'rumble') Sound.rumble(ev.s || 1);
      else if (ev.type === 'rope') Sound.rope(pan, 1);
      else if (ev.type === 'wood') { const n = ev.s >= 1 ? 5 : 2; for (let k = 0; k < n; k++) setTimeout(() => Sound.wood(pan + (Math.random() - .5) * 0.6, (0.5 + Math.random() * .5) * Math.min(1, ev.s + 0.3)), k * 60); }
      else if (ev.type === 'creak') { if (Math.random() < 0.6) Sound.grind(pan, 0.4 + 0.6 * ev.s); else Sound.crack(pan, 0.2 * ev.s); }
      if (ev.type === 'dust') Dust.add(ev.x, ev.y, ev.s);
    }
    for (const c of chains) {
      const S = c.st.S;
      if ((input.down && input.c === c) || (intro.fill && c === chain)) continue;
      const opts = c.glue ? { host: c.glue.c.eq } : null;
      if ((S.phase === 'rubble' || S.phase === 'none') && c.eqAge > 0.25 && (!c.glue || c.glue.c.st.S.phase === 'standing')) c.st.startBuild(c.st.targetFor(c.eq, c.loads, c.free, opts), true);
      else if (S.phase === 'standing') {
        // a weight taken off (or moved, or made heavier) brings its turret down at once; new weights get turrets
        // a weight taken off or moved: its turret is taken down; a weight made heavier: its turret is raised
        const raise = [];
        for (const t of [...S.towers]) {
          const m = [t.node, ...(t.also || [])].reduce((a, k) => a + (c.loads.get(k) || 0), 0);
          if (!c.loads.has(t.node) || (t.also || []).some(k => !c.loads.has(k))) c.st.dismantle(t);
          else if (m > t.mass + 0.6 && c.eqAge > 0.2) raise.push({ tower: t, k: t.node, m: m - t.mass });
        }
        if (raise.length && !input.fill) { const tg = c.st.targetFor(c.eq, c.loads, c.free, opts); tg.raise = raise; c.st.startBuild(tg, false); }
        const tag = c.eqKey + '#' + S.built + '#' + S.towers.length;
        // (only on an arch that will carry them: one that is about to fail is left to fail)
        if (c.eqAge > 0.2 && c.tried !== tag && [...c.loads.keys()].some(k => !S.towers.some(t => t.node === k || (t.also || []).includes(k))) && c.st.safeFor(c.eq.map(Structure.toStone))) { c.tried = tag; c.st.startBuild(c.st.targetFor(c.eq, c.loads, c.free, opts), false); }
      }
    }
    // the frame: wide and tall enough for every hook and every building
    {
      let top = 0; for (const c of chains) for (const r of c.st.S.standing) for (const p of r.q) top = Math.max(top, p[1]);
      for (const c of chains) if (c.st.S.build) for (const tw of c.st.S.build.towers) for (const r of tw.blocks) for (const p of r.q) top = Math.max(top, p[1]);
      const D = -cam.pos[2], Ht = Render.R.top[0].h, sxMax = 0.5 * W / Ht;
      let wide = 0; for (const c of chains) wide = Math.max(wide, Math.abs(c.a[0]), Math.abs(c.free ? c.a[0] : c.b[0]));
      const need = Math.max(cam.tanBase, ((top + 1.2 - cam.pos[1]) / D - cam.shift) / 0.92, (wide * SCALE + (H > W ? 1.6 : 2.6)) / D / sxMax);
      cam.tanFit = cam.tanFit || cam.tanBase; const prevT = cam.tanH;
      // the camera steps back promptly when the building outgrows the frame, and comes back in only slowly, once all is quiet
      const calm = chains.every(c => c.st.S.phase === 'standing') && !input.down;
      cam.calmT = calm ? (cam.calmT || 0) + dt : 0;
      if (need > cam.tanFit * 1.02) cam.tanFit += (need - cam.tanFit) * Math.min(1, dt * 1.4);
      else if (need < cam.tanFit * 0.97 && cam.calmT > 6) cam.tanFit += (need - cam.tanFit) * Math.min(1, dt * 0.18);
      cam.tanH = Math.max(cam.tanBase, cam.tanFit);
      if (Math.abs(cam.tanH - prevT) > 1e-4) { stillTop = 0; stillBot = 0; zooming = true; } else zooming = false;
    }
    // render data
    const list = [...chains.flatMap(c => c.st.renderList()), ...Structure.looseRecs(), ...figure];
    const busy = chains.some(c => c.st.S.phase !== 'standing') || (Structure.loose.length && !Structure.world.asleep) || Structure.busy();
    const sig = list.length + ':' + chains.map(c => c.st.S.poseSig || '').join('|') + ':' + ((busy || strainedLast) ? now : '');
    strainedLast = busy;
    const dayNow = runDay(dt);
    const stoneMoved = sig !== lastStoneSig || zooming || day.relit; lastStoneSig = sig;
    if (stoneMoved) Stone.setBlocks(list);
    const sacks = chains.flatMap(c => [...c.loads].map(([i, m]) => ({ x: c.P[2 * i], y: c.P[2 * i + 1], m, seed: i * 7.1 })));
    if (input.c && input.sack !== undefined && input.off) { const s = sacks.find(s => s.seed === input.sack * 7.1); if (s) { s.x = input.ptr.x; s.y = input.ptr.y + 0.03; } moving = true; }
    if (input.pv && input.pv.m > 0.6) { const c = input.c, i = input.node; const s = sacks.find(s => s.seed === i * 7.1); if (s) s.m = input.pv.base + input.pv.m; else if (sacksInUse() < 12) sacks.push({ x: c.P[2 * i], y: c.P[2 * i + 1], m: input.pv.m, seed: i * 7.1 }); }
    for (const d of dropping) sacks.push({ x: d.x, y: d.y, m: d.m, seed: d.seed });
    if (intro.falling) { sacks.push({ x: chain.P[2 * intro.falling.node], y: intro.falling.y, m: intro.falling.m, seed: 3.3 }); moving = true; }
    Workshop.W.sacks = sacks;
    if (zooming) moving = true;
    if (moving || frame === 0 || input.hookAt !== lastHookAt) { Workshop.setChains(chains.map(c => Chain.nodes(c)), PITCH, hooks(), ends()); if (input.hookAt !== lastHookAt) { moving = true; lastHookAt = input.hookAt; } }

    // the cellar's window is daylight too: it fades as the sun goes down (and the room re-lights gently, without losing resolution)
    { const want = 1 - 0.85 * dayNow.dusk; if (Math.abs(want - windowK.set) > 0.025) { windowK.set = want; stillBot = 0; capBot = Math.min(capBot, 6); } }
    const R = Render.R;
    // A moving world is traced at reduced resolution and denoised (cheap, and motion hides it); once still it is traced at full
    // resolution from a fresh start and the picture refines into it. The workshop drops whenever anything in it moves; the stone
    // stays sharp (even while it falls or is rebuilt) unless a hand is on a chain or there is a great deal of stone in play.
    const motionBot = moving || frame < 2, motionTop = stoneMoved && ((input.down && W * H > 600000) || list.length > 280);   // the stone stays sharp except under a hand on a big screen
    stillTop = stoneMoved ? 0 : stillTop + 1; stillBot = motionBot ? 0 : stillBot + 1;
    capTop = zooming ? 1 : stoneMoved ? 20 : capTop * 1.15 + 1; capBot = zooming ? 1 : motionBot ? 5 : capBot * 1.15 + 1;   // (a moving camera keeps no history)
    let traceTop = !Q.has('notop') && (fixedFrames ? R.nTop < fixedFrames : stillTop < 420), traceBot = !Q.has('nobot') && (fixedFrames ? R.nBot < fixedFrames : stillBot < 420);
    // two still worlds refining at full resolution take turns, so the frame rate holds while the picture clears
    if (traceTop && traceBot && !motionTop && !motionBot && stillTop > 2 && stillBot > 2 && !fixedFrames) { if (frame & 1) traceTop = false; else traceBot = false; }
    if (traceTop) {
      const T = motionTop ? R.topM : R.top;
      if (!motionTop && R.fullTop === 0) capTop = 0;   // back to full resolution: start its history over
      if (motionTop && R.fullTop === 1 && frame > 2) Render.seed(R.top, R.topM);
      Stone.trace(T[1], T[0], cam, frame, Math.min(capTop, 1e6), stillTop < 3); const t = T[0]; T[0] = T[1]; T[1] = t; R.nTop++;
      R.freshTop = motionTop ? 0 : (R.fullTop === 0 ? 4 : Math.max(0, (R.freshTop || 0) - 1)); R.fullTop = motionTop ? 0 : 1;
    }
    if (traceBot) {
      const T = motionBot ? R.botM : R.bot;
      if (!motionBot && R.fullBot === 0) capBot = 0;
      if (motionBot && R.fullBot === 1 && frame > 2) Render.seed(R.bot, R.botM);
      Workshop.trace(T[1], T[0], camB(), frame, Math.min(capBot, 1e6), { focus: -cam.pos[2] / SCALE, moved: stillBot < 3, bounces: +(Q.get("bounces") || 2), clampL: motionBot ? 2.5 : 9, lamp, lampTop: bulb.top, windowK: windowK.set }); const t = T[0]; T[0] = T[1]; T[1] = t; R.nBot++;
      R.freshBot = motionBot ? 0 : (R.fullBot === 0 ? 4 : Math.max(0, (R.freshBot || 0) - 1)); R.fullBot = motionBot ? 0 : 1;
    }
    Dust.update(dt);
    const fade = Q.has('nointro') ? 1 : Math.min(1, 0.1 + 0.9 * Math.pow(intro.t / 1.5, 1.4));   // up from a dim dusk, never a black screen
    const ropes = [...chains.flatMap(c => c.st.ropeList()), ...Structure.awayRopeList()];
    Render.composite({ ropes, ghost: updateGhost(dt), motes: updateMotes(now / 1000), expTop: +(Q.get('exp') || 0.74) * fade * dayNow.exp, expBot: +(Q.get('expb') || 1.0) * fade, cam, sun: Stone.S.sun, sunIrr: Stone.S.sunIrr, amb: Stone.S.groundBounce.map(v => v * 2.5) });
    frame++; const S0 = chain.st.S;
    window.__state = { frames: frame, phase: S0.phase, phases: chains.map(c => c.st.S.phase), loads: [...chain.loads], hinges: S0.hinges, strain: +S0.strain.toFixed(2), loose: Structure.loose.length, energy: chain.energy, towers: S0.towers.length, pv: input.pv ? +input.pv.m.toFixed(2) : 0, tan: +cam.tanH.toFixed(3) };
    window.__snap = window.__state;
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
  window.__ready = () => !fixedFrames || Render.R.nTop >= fixedFrames;
  addEventListener('resize', () => { stillTop = stillBot = 0; });
  window.__chain = chain; window.__chains = chains; window.__toModel = toModel;
  // project a chain node to CSS pixels (for scripted tests)
  window.__nodeScreen = (i, ci = 0) => {
    const hs = innerHeight * view.split, ys = innerHeight - hs, c = camB().pos, ch = chains[ci];
    const x = ch.P[2 * i], y = ch.P[2 * i + 1], dz = -c[2];
    const sx = (x - c[0]) / dz / cam.tanH, sy = (-(y - c[1]) / dz - cam.shift) / cam.tanH;
    return [Math.round(innerWidth / 2 + sx * hs), Math.round(ys + sy * hs)];
  };
})();
