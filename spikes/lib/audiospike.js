// audiospike.js — render audio offline in JS, show waveform + spectrogram (via spectro.js `analyse`), expose WAV as base64.
// Usage: AUDIOSPIKE.render(sr => Float32Array | [L, R], { title })  — then snap with:
//   --save "AUDIOSPIKE.wavB64()" out.wav   and a screenshot of the spectrogram.
(function () {
  const A = {};
  A.render = async function (fn, { title = 'spike', sr = 48000 } = {}) {
    const out = await fn(sr);
    const L = Array.isArray(out) ? out[0] : out, R = Array.isArray(out) ? out[1] : out;
    let peak = 0; for (let i = 0; i < L.length; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
    const g = peak > 0.98 ? 0.98 / peak : 1;
    const mono = new Float32Array(L.length);
    for (let i = 0; i < L.length; i++) { L[i] *= g; R[i] *= g; mono[i] = (L[i] + R[i]) * .5; }
    A.L = L; A.R = R; A.sr = sr; A.peak = peak;
    if (window.analyse) A.stats = window.analyse(mono, sr, title);
    A.done = true;
    return A.stats;
  };
  A.wavB64 = function () {
    const n = A.L.length, buf = new ArrayBuffer(44 + n * 4), v = new DataView(buf);
    const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    w(0, 'RIFF'); v.setUint32(4, 36 + n * 4, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true);
    v.setUint16(22, 2, true); v.setUint32(24, A.sr, true); v.setUint32(28, A.sr * 4, true); v.setUint16(32, 4, true); v.setUint16(34, 16, true);
    w(36, 'data'); v.setUint32(40, n * 4, true);
    for (let i = 0; i < n; i++) { v.setInt16(44 + i * 4, Math.max(-1, Math.min(1, A.L[i])) * 32767, true); v.setInt16(46 + i * 4, Math.max(-1, Math.min(1, A.R[i])) * 32767, true); }
    const u8 = new Uint8Array(buf); let s = ''; for (let i = 0; i < u8.length; i += 32768) s += String.fromCharCode.apply(null, u8.subarray(i, i + 32768));
    return btoa(s);
  };
  A.wait = () => new Promise(r => { const k = () => A.done ? r(A.stats) : setTimeout(k, 100); k(); });
  window.AUDIOSPIKE = A;
})();
