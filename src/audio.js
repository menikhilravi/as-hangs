// audio.js — every sound is synthesised: modal resonators for iron, stone and wood, granular grit, filtered-noise air.
// Events are pre-rendered into small buffers at start-up (with variations) and played through two rooms:
// the workshop (a small plastered room, close) and the plain (open air, 40 m away: quieter, later, duller).
'use strict';
const Sound = (() => {
  const A = { ctx: null, ready: false, muted: false, lastClink: 0, buffers: {} };
  let rs = 12345;
  const rnd = () => ((rs = (rs * 1664525 + 1013904223) >>> 0) / 4294967296);
  const rr = (a, b) => a + (b - a) * rnd();

  // ---------- synthesis primitives (pure JS, into Float32Array) ----------
  // modes: [{f, d (60 dB decay seconds), a}], excitation: impulse shaping (seconds of a raised-cosine strike)
  function modal(sr, dur, modes, strike = 0.0006) {
    const n = Math.ceil(dur * sr), out = new Float32Array(n);
    for (const m of modes) {
      const w = 2 * Math.PI * m.f / sr, k = Math.exp(-6.91 / (m.d * sr)), ph = rnd() * 6.283;
      // strike low-passes the mode: long contact time suppresses high modes
      const sAtt = 1 / (1 + Math.pow(m.f * strike * 2, 2));
      let amp = m.a * sAtt;
      for (let i = 0; i < n; i++) { out[i] += amp * Math.sin(w * i + ph); amp *= k; }
    }
    // soften the attack over the strike time
    const na = Math.max(2, Math.floor(strike * sr));
    for (let i = 0; i < na && i < n; i++) out[i] *= 0.5 - 0.5 * Math.cos(Math.PI * i / na);
    return out;
  }
  // filtered noise burst: one-pole bandpass-ish via two leaky integrators, with exponential envelope
  function noiseBurst(sr, dur, lo, hi, decay, attack = 0.001) {
    const n = Math.ceil(dur * sr), out = new Float32Array(n);
    const aLo = Math.exp(-2 * Math.PI * lo / sr), aHi = Math.exp(-2 * Math.PI * hi / sr);
    let l1 = 0, l2 = 0;
    for (let i = 0; i < n; i++) {
      const x = rnd() * 2 - 1;
      l1 = aHi * l1 + (1 - aHi) * x;          // low-pass at hi
      l2 = aLo * l2 + (1 - aLo) * l1;          // low-pass at lo
      const band = l1 - l2;                     // band between lo and hi
      const t = i / sr; const env = Math.min(1, t / attack) * Math.exp(-6.91 * t / decay);
      out[i] = band * env;
    }
    return out;
  }
  function mixInto(dst, src, at = 0, g = 1) { for (let i = 0; i < src.length && at + i < dst.length; i++) dst[at + i] += src[i] * g; return dst; }
  function norm(x, peak = 0.9) { let m = 0; for (const v of x) m = Math.max(m, Math.abs(v)); const k = m > 0 ? peak / m : 1; for (let i = 0; i < x.length; i++) x[i] *= k; return x; }

  // ---------- the sound library ----------
  // iron links touching: bright, short, inharmonic; heavier links lower
  function clinkBuf(sr) {
    // a rattle grain: 1–3 links touching within a few milliseconds, each a short inharmonic ring
    const x = new Float32Array(Math.ceil(0.16 * sr));
    const strikes = 1 + Math.floor(rnd() * 3);
    let at = 0;
    for (let s = 0; s < strikes; s++) {
      const base = rr(2100, 3900), modes = [];
      [1, 1.58, 2.27, 2.94, 3.79, 4.71].forEach((r, k) => modes.push({ f: base * r * rr(0.96, 1.04), d: rr(0.018, 0.06) / (1 + k * 0.5), a: 1 / (1 + k * 0.5) }));
      mixInto(x, modal(sr, 0.1, modes, rr(0.00006, 0.0002)), at, s === 0 ? 1 : rr(0.3, 0.7));
      mixInto(x, noiseBurst(sr, 0.005, 2500, 14000, 0.0018, 0.00005), at, 0.7);
      at += Math.floor(rr(0.003, 0.016) * sr);
    }
    return norm(x, 0.8);
  }
  // a limestone block set down on another: a dead, unpitched thock — a short low body (no drum-like sweep), a damped inharmonic
  // tock that differs from stone to stone, and the grit of the bed crunching under it
  function knockBuf(sr, size = 1) {
    const x = new Float32Array(Math.ceil(0.45 * sr));
    mixInto(x, noiseBurst(sr, 0.2, 45 / size, 420 / Math.sqrt(size), rr(0.05, 0.09) * Math.sqrt(size), 0.0012), 0, 2.4);   // body
    const f1 = rr(520, 1350) / Math.pow(size, 0.5), modes = [];
    const ratios = [1, rr(1.4, 1.9), rr(2.3, 2.9), rr(3.3, 4.2)];
    ratios.forEach((r, k) => modes.push({ f: f1 * r, d: rr(0.012, 0.035) / (1 + k * 0.6), a: rr(0.5, 1) / (1 + k * 0.8) }));
    mixInto(x, modal(sr, 0.2, modes, rr(0.0003, 0.0008)), 0, 0.55);
    mixInto(x, noiseBurst(sr, 0.03, 1500, 9000, rr(0.006, 0.014), 0.0003), 0, 0.45);   // contact crunch
    const grains = 3 + Math.floor(rnd() * 8);
    for (let g = 0; g < grains; g++) mixInto(x, noiseBurst(sr, 0.006, 2500, 11000, 0.002, 0.0002), Math.floor(rr(0.004, 0.06) * sr), rr(0.08, 0.25));
    return norm(x, 0.85);
  }
  // a crack running through stone: a train of sharp ticks over ~0.2 s, then a creak
  function crackBuf(sr) {
    const dur = rr(0.25, 0.45), x = new Float32Array(Math.ceil((dur + 0.3) * sr));
    let t = 0; const ticks = 6 + Math.floor(rnd() * 10);
    for (let i = 0; i < ticks; i++) { t += rr(0.004, 0.04) * (1 + i / ticks); const at = Math.floor(t * sr);
      mixInto(x, noiseBurst(sr, 0.012, 1500, 9000, rr(0.002, 0.006), 0.00005), at, rr(0.4, 1));
      if (rnd() < 0.4) mixInto(x, modal(sr, 0.08, [{ f: rr(1800, 3500), d: 0.03, a: 1 }], 0.0002), at, 0.3); }
    // creak: rough low-mid tone from friction
    const n = Math.ceil(0.3 * sr), cr = new Float32Array(n); let ph = 0; const f0 = rr(160, 260);
    for (let i = 0; i < n; i++) { const tt = i / sr; ph += 2 * Math.PI * f0 * (1 + 0.15 * Math.sin(tt * 37)) / sr; cr[i] = (Math.sin(ph) + 0.6 * Math.sin(2.01 * ph) + 0.3 * Math.sin(3.03 * ph)) * (rnd() * 0.6 + 0.4) * Math.exp(-tt / 0.08) * Math.min(1, tt / 0.01); }
    mixInto(x, cr, Math.floor(t * sr * 0.6), 0.35);
    return norm(x, 0.8);
  }
  // timber centering: hollow wooden knock
  function woodBuf(sr) {
    const f1 = rr(170, 320), modes = [];
    [1, 2.4, 3.9, 5.6].forEach((r, k) => modes.push({ f: f1 * r * rr(0.95, 1.05), d: rr(0.08, 0.16) / (1 + k * 0.8), a: 1 / (1 + k * 0.7) }));
    const x = modal(sr, 0.4, modes, rr(0.0008, 0.0018));
    mixInto(x, noiseBurst(sr, 0.03, 600, 4000, 0.01, 0.0005), 0, 0.4);
    return norm(x, 0.8);
  }
  // a sack of lead shot: soft low thud, then the shot settling (a few hundred tiny clicks)
  function sackBuf(sr) {
    const x = new Float32Array(Math.ceil(0.6 * sr));
    const n = Math.ceil(0.25 * sr); let ph = 0; const f0 = rr(110, 150);
    for (let i = 0; i < n; i++) { const t = i / sr; ph += 2 * Math.PI * f0 * (1 + 0.4 * Math.exp(-t / 0.015)) / sr; x[i] += Math.sin(ph) * Math.exp(-t / 0.05) * Math.min(1, t / 0.006); }
    mixInto(x, noiseBurst(sr, 0.06, 150, 1200, 0.03, 0.004), 0, 0.5);
    const grains = 160 + Math.floor(rnd() * 120);
    for (let g = 0; g < grains; g++) { const t = 0.01 + Math.pow(rnd(), 2.2) * 0.4; const at = Math.floor(t * sr);
      const f = rr(3500, 9000); const len = Math.floor(0.0025 * sr); const amp = rr(0.02, 0.08) * Math.exp(-t / 0.18);
      for (let i = 0; i < len && at + i < x.length; i++) x[at + i] += Math.sin(2 * Math.PI * f * i / sr) * amp * Math.exp(-i / (0.0006 * sr)); }
    return norm(x, 0.75);
  }
  // stone under strain: a gritty grind as a joint shifts, with grains trickling out of it
  function grindBuf(sr) {
    const dur = rr(0.25, 0.5), x = new Float32Array(Math.ceil(dur * sr));
    let b1 = 0, b2 = 0;
    for (let i = 0; i < x.length; i++) {
      const t = i / sr, env = Math.sin(Math.PI * Math.min(1, t / dur)) * (0.6 + 0.4 * Math.sin(t * 37 + rnd()));
      const w = rnd() * 2 - 1; b1 = 0.8 * b1 + 0.2 * w; b2 = 0.94 * b2 + 0.06 * b1;   // a rough band around 400 Hz–1.5 kHz
      x[i] = (b1 - b2) * env * (rnd() < 0.08 ? 3 : 1);
    }
    const grains = 20 + Math.floor(rnd() * 30);
    for (let g = 0; g < grains; g++) { const at = Math.floor(rnd() * x.length * 0.9), f = rr(1800, 4200), len = Math.floor(0.0015 * sr), a = rr(0.1, 0.35);
      for (let i = 0; i < len && at + i < x.length; i++) x[at + i] += Math.sin(2 * Math.PI * f * i / sr) * a * Math.exp(-i / (0.0004 * sr)); }
    return norm(x, 0.7);
  }
  // desert crickets at dusk: a few insects, each a train of short high chirps at its own rate
  function cricketBuf(sr, dur = 6) {
    const L = new Float32Array(Math.ceil(dur * sr)), R = new Float32Array(L.length);
    for (let c = 0; c < 3; c++) {
      const f = rr(3900, 4800), pulse = rr(0.012, 0.018), gap = rr(0.035, 0.05), per = rr(0.45, 0.9), pan = rr(-0.8, 0.8), amp = rr(0.4, 1);
      for (let t0 = rr(0, per); t0 < dur - 0.3; t0 += per * rr(0.92, 1.08)) {
        const nP = 2 + Math.floor(rnd() * 3);
        for (let p = 0; p < nP; p++) {
          const at = Math.floor((t0 + p * gap) * sr), n = Math.floor(pulse * sr);
          for (let i = 0; i < n && at + i < L.length; i++) { const v = Math.sin(2 * Math.PI * f * i / sr) * Math.sin(Math.PI * i / n) * amp; L[at + i] += v * (1 - pan) * 0.5; R[at + i] += v * (1 + pan) * 0.5; }
        }
      }
    }
    norm(L, 0.5); norm(R, 0.5); return [L, R];
  }
  // a hemp rope taking a stone's weight: a few stick-slip creaks
  function ropeBuf(sr) {
    const x = new Float32Array(Math.ceil(0.4 * sr));
    const n = 5 + Math.floor(rnd() * 6); let t = 0.005;
    for (let k = 0; k < n; k++) {
      const f = rr(380, 900), len = Math.floor(rr(0.008, 0.022) * sr), at = Math.floor(t * sr), amp = rr(0.4, 1) * Math.exp(-t / 0.15);
      let ph = 0;
      for (let i = 0; i < len && at + i < x.length; i++) { const u = i / len; ph += 2 * Math.PI * f * (1 + 0.25 * u) / sr; x[at + i] += (Math.sin(ph) + 0.6 * Math.sin(ph * 2.03) + (rnd() - 0.5) * 0.8) * amp * Math.sin(Math.PI * u); }
      t += rr(0.012, 0.045);
    }
    return norm(x, 0.6);
  }
  // collapse body: low rumble swelling and decaying, with debris grit
  function rumbleBuf(sr, dur = 2.4) {
    const n = Math.ceil(dur * sr), x = new Float32Array(n);
    let b = 0, b2 = 0;
    for (let i = 0; i < n; i++) { const t = i / sr; const wn = rnd() * 2 - 1; b = 0.996 * b + 0.004 * wn; b2 = 0.98 * b2 + 0.02 * wn;
      const env = Math.min(1, t / 0.08) * Math.exp(-t / 0.7); x[i] = (b * 9 + b2 * 0.6) * env; }
    mixInto(x, noiseBurst(sr, dur, 1200, 7000, 0.9, 0.05), 0, 0.12);
    return norm(x, 0.9);
  }
  // impulse responses: exponentially decaying noise with faster high-frequency decay
  function ir(sr, rt, { pre = 0.004, early = [], bright = 1 } = {}) {
    const n = Math.ceil((rt * 1.2 + pre) * sr), L = new Float32Array(n), R = new Float32Array(n);
    let l = 0, r = 0;
    for (let i = Math.floor(pre * sr); i < n; i++) {
      const t = i / sr; const lp = Math.exp(-2 * Math.PI * (9000 * bright * Math.exp(-t * 6 / rt)) / sr);
      l = lp * l + (1 - lp) * (rnd() * 2 - 1); r = lp * r + (1 - lp) * (rnd() * 2 - 1);
      const env = Math.exp(-6.91 * t / rt); L[i] = l * env; R[i] = r * env;
    }
    for (const e of early) { const at = Math.floor(e.t * sr); if (at < n) { L[at] += e.a * (e.pan < 0 ? 1 : 0.6); R[at] += e.a * (e.pan > 0 ? 1 : 0.6); } }
    return [L, R];
  }

  function makeBuffer(ctx, data, channels = 1) {
    const arr = Array.isArray(data) ? data : [data];
    const b = ctx.createBuffer(arr.length, arr[0].length, ctx.sampleRate);
    arr.forEach((d, i) => b.copyToChannel(d, i));
    return b;
  }

  // ---------- graph ----------
  function build(ctx) {
    const sr = ctx.sampleRate; rs = 9001;
    const B = A.buffers = { clink: [], knock: [], knockBig: [], crack: [], wood: [], sack: [], rumble: [], rope: [], grind: [] };
    for (let i = 0; i < 14; i++) B.clink.push(makeBuffer(ctx, clinkBuf(sr)));
    for (let i = 0; i < 16; i++) B.knock.push(makeBuffer(ctx, knockBuf(sr, rr(0.7, 1.4))));
    for (let i = 0; i < 6; i++) B.knockBig.push(makeBuffer(ctx, knockBuf(sr, rr(2, 2.8))));
    for (let i = 0; i < 5; i++) B.crack.push(makeBuffer(ctx, crackBuf(sr)));
    for (let i = 0; i < 6; i++) B.wood.push(makeBuffer(ctx, woodBuf(sr)));
    for (let i = 0; i < 4; i++) B.sack.push(makeBuffer(ctx, sackBuf(sr)));
    for (let i = 0; i < 2; i++) B.rumble.push(makeBuffer(ctx, rumbleBuf(sr)));
    for (let i = 0; i < 6; i++) B.rope.push(makeBuffer(ctx, ropeBuf(sr)));
    for (let i = 0; i < 6; i++) B.grind.push(makeBuffer(ctx, grindBuf(sr)));

    const master = ctx.createGain(); master.gain.value = 0.62;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -16; comp.knee.value = 6; comp.ratio.value = 14; comp.attack.value = 0.002; comp.release.value = 0.18;
    master.connect(comp); comp.connect(ctx.destination);
    // workshop: close, a small plastered room
    const wsIn = ctx.createGain(), wsDry = ctx.createGain(), wsVerb = ctx.createConvolver(), wsWet = ctx.createGain();
    wsVerb.buffer = makeBuffer(ctx, ir(sr, 0.55, { pre: 0.003, early: [{ t: 0.004, a: 0.5, pan: -1 }, { t: 0.007, a: 0.4, pan: 1 }, { t: 0.011, a: 0.3, pan: -1 }], bright: 0.8 }));
    wsDry.gain.value = 1; wsWet.gain.value = 0.35;
    wsIn.connect(wsDry); wsIn.connect(wsVerb); wsVerb.connect(wsWet); wsDry.connect(master); wsWet.connect(master);
    // the plain: far, open air; a ground reflection and a long faint landscape tail; air absorption
    const stIn = ctx.createGain(), stDelay = ctx.createDelay(1), stLP = ctx.createBiquadFilter(), stDry = ctx.createGain(), stVerb = ctx.createConvolver(), stWet = ctx.createGain();
    stDelay.delayTime.value = 42 / 343;                // you hear the stone 1/8 s after you see it
    stLP.type = 'lowpass'; stLP.frequency.value = 5200; stLP.Q.value = 0.5;
    stVerb.buffer = makeBuffer(ctx, ir(sr, 1.6, { pre: 0.012, early: [{ t: 0.02, a: 0.6, pan: 0 }], bright: 0.5 }));
    stDry.gain.value = 0.55; stWet.gain.value = 0.32;
    stIn.connect(stDelay); stDelay.connect(stLP); stLP.connect(stDry); stLP.connect(stVerb); stVerb.connect(stWet); stDry.connect(master); stWet.connect(master);
    // ambience: wind on the plain (gusting band-passed noise), room tone in the workshop
    const nb = ctx.createBuffer(2, sr * 8, sr);
    for (let c = 0; c < 2; c++) {   // pink noise (Kellet's filter)
      const d = nb.getChannelData(c); let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < d.length; i++) { const w = rnd() * 2 - 1; b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852; b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898; d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926; }
    }
    const wind = ctx.createBufferSource(); wind.buffer = nb; wind.loop = true;
    const wbp = ctx.createBiquadFilter(); wbp.type = 'bandpass'; wbp.frequency.value = 520; wbp.Q.value = 1.5;
    const wg = ctx.createGain(); wg.gain.value = 0.0;
    wind.connect(wbp); wbp.connect(wg); wg.connect(master);
    const room = ctx.createBufferSource(); room.buffer = nb; room.loop = true; room.playbackRate.value = 0.37;
    const rlp = ctx.createBiquadFilter(); rlp.type = 'bandpass'; rlp.frequency.value = 240; rlp.Q.value = 0.7;
    const rg = ctx.createGain(); rg.gain.value = 0.0;
    room.connect(rlp); rlp.connect(rg); rg.connect(master);
    wind.start(); room.start(0, 3.1);
    const crk = ctx.createBufferSource(); crk.buffer = makeBuffer(ctx, cricketBuf(sr)); crk.loop = true;
    const crkG = ctx.createGain(); crkG.gain.value = 0; crk.connect(crkG); crkG.connect(stIn); crk.start(); A.crickets = crkG;
    const hum = ctx.createGain(); hum.gain.value = 0; const humPan = ctx.createStereoPanner(); humPan.pan.value = -0.55; hum.connect(humPan); humPan.connect(wsIn);   // (the bulb hangs to the left)
    [[100, 1], [200, 0.55], [300, 0.3], [400, 0.16]].forEach(([f, a]) => { const o = ctx.createOscillator(); o.frequency.value = f * rr(0.998, 1.002); const g = ctx.createGain(); g.gain.value = a; o.connect(g); g.connect(hum); o.start(); });
    hum.gain.setTargetAtTime(0.0035, ctx.currentTime, 2);
    A.hum = hum;
    Object.assign(A, { master, wsIn, stIn, wind: { bp: wbp, g: wg }, room: { g: rg }, sr });
    // slow gusts
    const gust = () => {
      if (!A.ctx) return; const t = ctx.currentTime, lvl = A.windLevel ?? 0.3;
      // gusts swell and fall away; now and then a lull
      const lull = rnd() < 0.2;
      wg.gain.setTargetAtTime(lvl * (lull ? rr(0.08, 0.2) : rr(0.4, 1.5)), t, lull ? rr(1.5, 3) : rr(0.5, 2));
      wbp.frequency.setTargetAtTime(rr(380, 1100), t, rr(0.8, 2.5));
      A.gustTimer = setTimeout(gust, rr(1500, 4200));
    };
    gust();
    rg.gain.setTargetAtTime(0.09, ctx.currentTime, 1.5);
  }

  function play(buf, bus, { gain = 1, pan = 0, rate = 1, when = 0 } = {}) {
    if (!A.ctx || !A.ready || A.muted) return;
    const ctx = A.ctx, s = ctx.createBufferSource(); s.buffer = buf; s.playbackRate.value = rate;
    const g = ctx.createGain(); g.gain.value = gain;
    const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan));
    s.connect(g); g.connect(p); p.connect(bus);
    s.start(ctx.currentTime + when);
  }
  const pick = arr => arr[Math.floor(rnd() * arr.length)];

  // ---------- public event API ----------
  function unlock() {
    if (A.ctx) { if (A.ctx.state === 'suspended') A.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    A.ctx = new AC({ latencyHint: 'interactive' });
    // (iOS: a context made in a gesture can still start suspended; a silent sound played inside the gesture opens it)
    const b = A.ctx.createBuffer(1, 1, A.ctx.sampleRate), src = A.ctx.createBufferSource(); src.buffer = b; src.connect(A.ctx.destination); src.start(0);
    if (A.ctx.state === 'suspended') A.ctx.resume();
    build(A.ctx); A.ready = true;
  }
  function clink(pan, strength = 1) {
    if (!A.ready) return; const now = A.ctx.currentTime; if (now - A.lastClink < 0.012) return; A.lastClink = now;
    play(pick(A.buffers.clink), A.wsIn, { gain: 0.35 * Math.min(1.5, strength), pan, rate: rr(0.9, 1.15) });
  }
  function knock(pan, strength = 1, big = false) { if (!A.ready) return; play(pick(big ? A.buffers.knockBig : A.buffers.knock), A.stIn, { gain: 0.9 * Math.min(1.6, strength) * rr(0.75, 1.1), pan: pan * 0.7, rate: rr(0.88, 1.12) }); }
  function crack(pan, strength = 1) { if (!A.ready) return; play(pick(A.buffers.crack), A.stIn, { gain: 0.8 * strength, pan: pan * 0.7 }); }
  function wood(pan, strength = 1) { if (!A.ready) return; play(pick(A.buffers.wood), A.stIn, { gain: 0.7 * strength, pan: pan * 0.7, rate: rr(0.9, 1.1) }); }
  function sack(pan, strength = 1) { if (!A.ready) return; play(pick(A.buffers.sack), A.wsIn, { gain: 0.8 * strength, pan }); }
  function grind(pan, strength = 1) { if (!A.ready) return; play(pick(A.buffers.grind), A.stIn, { gain: 0.5 * strength, pan: pan * 0.7, rate: rr(0.8, 1.2) }); }
  function rope(pan, strength = 1) { if (!A.ready) return; play(pick(A.buffers.rope), A.stIn, { gain: 0.32 * strength, pan: pan * 0.7, rate: rr(0.85, 1.15) }); }
  function rumble(strength = 1) { if (!A.ready) return; play(pick(A.buffers.rumble), A.stIn, { gain: 1.1 * strength, rate: rr(0.85, 1.05) }); }
  function setWind(level) { A.windLevel = level; }
  // dusk: the crickets come in and the wind drops
  function setDusk(d) {
    if (!A.ctx || !A.crickets || Math.abs((A.dusk ?? -1) - d) < 0.01) return; A.dusk = d;
    A.crickets.gain.setTargetAtTime(0.16 * Math.max(0, d - 0.35) / 0.65, A.ctx.currentTime, 1.5);
    A.windLevel = 0.3 * (1 - 0.6 * d);
  }
  function setMuted(m) { A.muted = m; if (A.ctx) A.master.gain.setTargetAtTime(m ? 0 : 0.62, A.ctx.currentTime, 0.05); }

  // exposed for the offline test page
  const lib = { clinkBuf, knockBuf, crackBuf, woodBuf, sackBuf, rumbleBuf, ropeBuf, grindBuf, ir, modal, noiseBurst, mixInto, norm, seed: s => { rs = s; } };
  // test hooks: build the graph on any context (e.g. OfflineAudioContext) and drive events at fixed times
  const test = { attach(ctx){ A.ctx = ctx; build(ctx); A.ready = true; }, play, pick, rr };
  return { A, unlock, clink, knock, crack, wood, sack, rumble, rope, grind, setWind, setDusk, setMuted, lib, test };
})();
