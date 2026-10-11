
// Audio analysis harness. A page under test exposes window.__render = async (sr) => Float32Array | [L, R]
// (or we load ?src=file.js which must define it). Draws waveform + log-frequency spectrogram + stats,
// and puts a JSON summary in window.__stats for snap.mjs --eval.
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) { let b = n >> 1; for (; j & b; b >>= 1) j ^= b; j ^= b; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
  for (let len = 2; len <= n; len <<= 1) {
    const a = -2 * Math.PI / len, wr = Math.cos(a), wi = Math.sin(a);
    for (let i = 0; i < n; i += len) { let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) { const ur = re[i + k], ui = im[i + k], vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci, vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k] = ur + vr; im[i + k] = ui + vi; re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi; const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t; } } }
}
window.analyse = function (x, sr, title) {
  const W = 1400, H = 700; let c = document.getElementById('__spec'); if (!c) { c = document.createElement('canvas'); c.id='__spec'; c.style.cssText='position:fixed;left:0;top:0;z-index:99999;background:#000'; document.body.appendChild(c); } c.width = W; c.height = H; const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
  // waveform (top 120px) as RMS envelope
  const cols = W, per = Math.max(1, Math.floor(x.length / cols)); let peak = 0, sum2 = 0;
  for (let i = 0; i < x.length; i++) { const v = Math.abs(x[i]); if (v > peak) peak = v; sum2 += x[i] * x[i]; }
  g.fillStyle = '#6cf';
  for (let col = 0; col < cols; col++) { let m = 0, r = 0; for (let k = 0; k < per; k++) { const v = x[col * per + k] || 0; m = Math.max(m, Math.abs(v)); r += v * v; } r = Math.sqrt(r / per);
    g.globalAlpha = .35; g.fillRect(col, 60 - m * 58, 1, m * 116); g.globalAlpha = 1; g.fillRect(col, 60 - r * 58, 1, r * 116); }
  // spectrogram
  const N = 2048, hop = Math.max(64, Math.floor(x.length / W)), top = 130, sh = H - top - 20;
  const re = new Float32Array(N), im = new Float32Array(N), win = new Float32Array(N).map((_, i) => .5 - .5 * Math.cos(2 * Math.PI * i / N));
  const fmin = 40, fmax = sr / 2, img = g.createImageData(W, sh); const cent = []; const avgSpec = new Float64Array(N / 2); const dbs = new Float32Array(W * sh).fill(-999); let dbMax = -999;
  for (let col = 0; col < W; col++) {
    const s0 = col * hop; if (s0 + N > x.length) break;
    for (let i = 0; i < N; i++) { re[i] = x[s0 + i] * win[i]; im[i] = 0; } fft(re, im);
    let cn = 0, cd = 0;
    for (let k = 1; k < N / 2; k++) { const p = re[k] * re[k] + im[k] * im[k]; avgSpec[k] += p; cn += p * k * sr / N; cd += p; }
    cent.push(cd > 1e-12 ? cn / cd : 0);
    for (let y = 0; y < sh; y++) { const f = fmin * Math.pow(fmax / fmin, 1 - y / sh); const k = Math.min(N / 2 - 1, Math.round(f * N / sr));
      const p = re[k] * re[k] + im[k] * im[k]; const db = 10 * Math.log10(p + 1e-12); dbs[y * W + col] = db; if (db > dbMax) dbMax = db; } }
  for (let y = 0; y < sh; y++) for (let col = 0; col < W; col++) { const db = dbs[y * W + col]; const v = db === -999 ? 0 : Math.max(0, Math.min(1, (db - dbMax + 90) / 90));
      const o = (y * W + col) * 4; img.data[o] = 255 * Math.min(1, v * 1.8); img.data[o + 1] = 255 * Math.max(0, v * 1.6 - .5); img.data[o + 2] = 255 * Math.max(0, .6 - Math.abs(v - .35) * 2) + 255 * Math.max(0, v - .85) * 4; img.data[o + 3] = 255; }
  g.putImageData(img, 0, top);
  g.fillStyle = '#888'; for (const f of [100, 250, 500, 1000, 2000, 4000, 8000, 16000]) { if (f > fmax) continue; const y = top + sh * (1 - Math.log(f / fmin) / Math.log(fmax / fmin)); g.fillRect(0, y, 8, 1); g.fillText(f >= 1000 ? f / 1000 + 'k' : f, 10, y + 4); }
  g.fillStyle = '#fff'; g.fillText(`${title || ''}  ${(x.length / sr).toFixed(2)}s  peak ${peak.toFixed(3)}  rms ${Math.sqrt(sum2 / x.length).toFixed(4)}`, 10, 12);
  // long-term spectrum peak
  let bk = 1; for (let k = 1; k < N / 2; k++) if (avgSpec[k] > avgSpec[bk]) bk = k;
  const meanCent = cent.reduce((a, b) => a + b, 0) / Math.max(1, cent.length);
  // clap-rate / onset periodicity: autocorrelation of RMS envelope at 5 ms frames
  const fr = Math.floor(sr * .005), env = []; for (let i = 0; i + fr < x.length; i += fr) { let r = 0; for (let k = 0; k < fr; k++) r += x[i + k] * x[i + k]; env.push(Math.sqrt(r / fr)); }
  const em = env.reduce((a, b) => a + b, 0) / env.length; const e2 = env.map(v => v - em);
  let best = 0, bestLag = 0; for (let lag = 40; lag < 400 && lag < e2.length / 2; lag++) { let s = 0, n = 0; for (let i = 0; i + lag < e2.length; i++) { s += e2[i] * e2[i + lag]; n++; } s /= n; if (s > best) { best = s; bestLag = lag; } }
  let var0 = 0; for (const v of e2) var0 += v * v; var0 /= e2.length;
  window.__stats = { dur: +(x.length / sr).toFixed(2), peak: +peak.toFixed(4), rms: +Math.sqrt(sum2 / x.length).toFixed(5), specPeakHz: Math.round(bk * sr / N), meanCentroidHz: Math.round(meanCent),
    envPeriodicity: { lagMs: bestLag * 5, hz: bestLag ? +(1000 / (bestLag * 5)).toFixed(2) : 0, strength: +(best / (var0 || 1)).toFixed(3) }, nan: x.some ? x.some(Number.isNaN) : false };
  
  return window.__stats;
};
