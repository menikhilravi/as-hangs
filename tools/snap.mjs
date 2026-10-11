#!/usr/bin/env node
// snap.mjs — headless-Chrome test harness for Cosmogenesis pages.
// Loads a page, records console output / exceptions / failed loads, measures FPS,
// optionally performs scripted interactions, and saves PNG screenshots.
//
// Usage:
//   node tools/snap.mjs <page.html> [options]
// Options:
//   --out <dir>        screenshot dir (default .snap/shots/<page-basename>)
//   --w <px> --h <px>  viewport (default 1440x900)
//   --mobile           shorthand for 390x844 @2x with touch
//   --wait <ms>        wait after load before first shot (default 2500)
//   --shots <n>        number of timed screenshots (default 3)
//   --interval <ms>    gap between timed shots (default 2000)
//   --actions <json|@file>  scripted steps, run after --wait, before timed shots. Steps:
//        {"click":[x,y]} {"dblclick":[x,y]} {"drag":[[x1,y1],[x2,y2]],"steps":20}
//        {"move":[x,y]} {"key":"Space"} {"type":"hello"} {"wheel":[x,y,dy]}
//        {"eval":"js expression"} {"wait":ms} {"shot":"name"}
//   --eval <js>        evaluate expression at the end and print result
//   --quiet            only print summary JSON
//   --save <js> <file> evaluate js (must return a base64 string) at the end and write the decoded bytes to file
//   --cpu <n>          throttle the CPU n× (e.g. 4 ≈ a mid-range phone)
//   --audio            tap everything routed to the speakers; save audio.wav + audio-spectrogram.png in the out dir
// Exit code 1 if any uncaught exception / console.error / failed load occurred.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

const argv = process.argv.slice(2);
if (!argv.length || argv[0] === '--help') { console.log(fs.readFileSync(new URL(import.meta.url)).toString().split('\n').slice(1, 25).join('\n')); process.exit(0); }
const opt = { w: 1440, h: 900, wait: 2500, shots: 3, interval: 2000, dpr: 1, mobile: false, quiet: false };
let target = null;
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  const next = () => argv[++i];
  if (a === '--out') opt.out = next();
  else if (a === '--w') opt.w = +next();
  else if (a === '--h') opt.h = +next();
  else if (a === '--wait') opt.wait = +next();
  else if (a === '--shots') opt.shots = +next();
  else if (a === '--interval') opt.interval = +next();
  else if (a === '--actions') { let s = next(); if (s.startsWith('@')) s = fs.readFileSync(s.slice(1), 'utf8'); opt.actions = JSON.parse(s); }
  else if (a === '--eval') opt.evalEnd = next();
  else if (a === '--mobile') { opt.mobile = true; opt.w = 390; opt.h = 844; opt.dpr = 2; }
  else if (a === '--dpr') opt.dpr = +next();
  else if (a === '--quiet') opt.quiet = true;
  else if (a === '--audio') opt.audio = true;
  else if (a === '--cpu') opt.cpu = +next();
  else if (a === '--save') { opt.saveExpr = next(); opt.saveFile = next(); }
  else target = a;
}
const [tPath, tQuery] = target.split(/(?=[?#])/);
const url = /^(https?|file):/.test(target) ? target : pathToFileURL(path.resolve(tPath)).href + (tQuery || '');
const base = path.basename(tPath).replace(/\.html?$/, '');
const outDir = path.resolve(opt.out || path.join(ROOT, '.snap/shots', base + (opt.mobile ? '-mobile' : '')));
fs.mkdirSync(outDir, { recursive: true });
const tmpRoot = path.join(ROOT, '.snap/tmp');
fs.mkdirSync(tmpRoot, { recursive: true });
const profile = fs.mkdtempSync(path.join(tmpRoot, 'prof-'));

const chrome = spawn(CHROME, [
  '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
  '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--mute-audio',
  '--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--enable-webgl', '--use-angle=metal',
  '--allow-file-access-from-files', '--autoplay-policy=no-user-gesture-required',
  `--window-size=${opt.w},${opt.h}`, 'about:blank',
], { stdio: ['ignore', 'ignore', 'pipe'] });

const cleanup = () => { try { chrome.kill('SIGKILL'); } catch {} setTimeout(() => { try { fs.rmSync(profile, { recursive: true, force: true }); } catch {} }, 300); };
process.on('exit', cleanup);
const hardTimeout = setTimeout(() => { console.error("snap: hard timeout"); cleanup(); process.exit(2); }, +(process.env.SNAP_TIMEOUT || 180000));

const wsUrl = await new Promise((res, rej) => {
  let buf = '';
  chrome.stderr.on('data', d => { buf += d; const m = buf.match(/DevTools listening on (ws:\/\/\S+)/); if (m) res(m[1]); });
  chrome.on('exit', c => rej(new Error('chrome exited ' + c + '\n' + buf)));
  setTimeout(() => rej(new Error('chrome start timeout\n' + buf)), 20000);
});
const port = new URL(wsUrl).port;
const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const pageTarget = list.find(t => t.type === 'page');
const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r, { once: true }));
let msgId = 0; const pending = new Map(); const listeners = [];
ws.addEventListener('message', ev => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); }
  else if (m.method) listeners.forEach(fn => fn(m));
});
const send = (method, params = {}) => new Promise((res, rej) => { const id = ++msgId; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })); });
const sleep = ms => new Promise(r => setTimeout(r, ms));

const logs = []; const errors = []; const t0 = Date.now();
const stamp = () => ((Date.now() - t0) / 1000).toFixed(1) + 's';
const fmtArgs = args => args.map(a => a.value !== undefined ? (typeof a.value === 'string' ? a.value : JSON.stringify(a.value)) : (a.description || a.type)).join(' ');
listeners.push(m => {
  if (m.method === 'Runtime.consoleAPICalled') {
    const text = fmtArgs(m.params.args || []);
    const entry = `[${stamp()}] console.${m.params.type}: ${text}`;
    logs.push(entry);
    if (m.params.type === 'error' || m.params.type === 'assert') errors.push(entry);
  } else if (m.method === 'Runtime.exceptionThrown') {
    const d = m.params.exceptionDetails;
    const entry = `[${stamp()}] UNCAUGHT: ${d.exception?.description || d.text} @ ${d.url || ''}:${d.lineNumber}:${d.columnNumber}`;
    logs.push(entry); errors.push(entry);
  } else if (m.method === 'Log.entryAdded') {
    const e = m.params.entry;
    const entry = `[${stamp()}] log.${e.level} (${e.source}): ${e.text} ${e.url || ''}`;
    logs.push(entry);
    if (e.level === 'error' && !/favicon/.test(e.text + (e.url || ''))) errors.push(entry);
  }
});

await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable');
await send('Emulation.setDeviceMetricsOverride', { width: opt.w, height: opt.h, deviceScaleFactor: opt.dpr, mobile: opt.mobile });
if (opt.mobile) await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
if (opt.cpu) await send('Emulation.setCPUThrottlingRate', { rate: opt.cpu });
await send('Page.addScriptToEvaluateOnNewDocument', { source: `
  window.__snap = { frames: 0, start: performance.now() };
  (function tick(){ window.__snap.frames++; requestAnimationFrame(tick); })();
` });

if (opt.audio) await send('Page.addScriptToEvaluateOnNewDocument', { source: `
  (function(){
    const orig = AudioNode.prototype.connect;
    const taps = new WeakMap(); window.__snapAudioBufs = []; window.__snapAudioSR = 0;
    function tapFor(ctx){ let t = taps.get(ctx); if (t) return t;
      t = ctx.createScriptProcessor(4096, 2, 2); window.__snapAudioSR = ctx.sampleRate;
      t.onaudioprocess = e => { const a = e.inputBuffer.getChannelData(0), b = e.inputBuffer.getChannelData(1); const m = new Float32Array(a.length * 2); for (let i = 0; i < a.length; i++) { m[2 * i] = a[i]; m[2 * i + 1] = b[i]; } window.__snapAudioBufs.push(m); };
      taps.set(ctx, t); const z = ctx.createGain(); z.gain.value = 0; orig.call(t, z); orig.call(z, ctx.destination); return t; }
    AudioNode.prototype.connect = function(dest, ...rest){ const r = orig.call(this, dest, ...rest);
      try { if (dest instanceof AudioDestinationNode) { const t = tapFor(this.context); if (this !== t) orig.call(this, t); } } catch (e) { console.warn('snap audio tap failed', e); }
      return r; };
    window.__snapAudioStereo = () => { const bufs = window.__snapAudioBufs; let n = 0; for (const b of bufs) n += b.length; const o = new Float32Array(n); let k = 0; for (const b of bufs) { o.set(b, k); k += b.length; } return o; };
    window.__snapAudio = () => { const st = window.__snapAudioStereo(), o = new Float32Array(st.length >> 1); for (let i = 0; i < o.length; i++) o[i] = (st[2 * i] + st[2 * i + 1]) * .5; return o; };
  })();` });
const loaded = new Promise(r => listeners.push(m => { if (m.method === 'Page.loadEventFired') r(); }));
await send('Page.navigate', { url });
await Promise.race([loaded, sleep(15000)]);
await sleep(opt.wait);

const evalJS = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) return 'EVAL ERROR: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
};
const shots = [];
const shot = async (name) => {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  const f = path.join(outDir, name + '.png');
  fs.writeFileSync(f, Buffer.from(r.data, 'base64'));
  shots.push(path.relative(ROOT, f));
};
const mouse = (type, x, y, extra = {}) => send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1, ...extra });
const KEYS = { Space: [' ', 'Space', 32], Enter: ['Enter', 'Enter', 13], Escape: ['Escape', 'Escape', 27], ArrowLeft: ['ArrowLeft', 'ArrowLeft', 37], ArrowRight: ['ArrowRight', 'ArrowRight', 39], ArrowUp: ['ArrowUp', 'ArrowUp', 38], ArrowDown: ['ArrowDown', 'ArrowDown', 40], Tab: ['Tab', 'Tab', 9] };

let actionIndex = 0;
for (const step of opt.actions || []) {
  actionIndex++;
  try {
    if (step.click) { const [x, y] = step.click; await mouse('mouseMoved', x, y, { button: 'none' }); await mouse('mousePressed', x, y); await mouse('mouseReleased', x, y); }
    else if (step.dblclick) { const [x, y] = step.dblclick; await mouse('mousePressed', x, y, { clickCount: 2 }); await mouse('mouseReleased', x, y, { clickCount: 2 }); }
    else if (step.move) { await mouse('mouseMoved', step.move[0], step.move[1], { button: 'none' }); }
    else if (step.drag) {
      const [[x1, y1], [x2, y2]] = step.drag; const n = step.steps || 20;
      await mouse('mouseMoved', x1, y1, { button: 'none' }); await mouse('mousePressed', x1, y1);
      for (let k = 1; k <= n; k++) { await mouse('mouseMoved', x1 + (x2 - x1) * k / n, y1 + (y2 - y1) * k / n, { buttons: 1 }); await sleep(16); }
      await mouse('mouseReleased', x2, y2);
    }
    // held gestures with shots in between: down → to (moves with the button held) → up
    else if (step.down) { const [x, y] = step.down; await mouse('mouseMoved', x, y, { button: 'none' }); await mouse('mousePressed', x, y); globalThis.__last = [x, y]; }
    else if (step.to) {
      const [x2, y2] = step.to, [x1, y1] = globalThis.__last || step.to, n = step.steps || 20;
      for (let k = 1; k <= n; k++) { await mouse('mouseMoved', x1 + (x2 - x1) * k / n, y1 + (y2 - y1) * k / n, { buttons: 1 }); await sleep(16); }
      globalThis.__last = [x2, y2];
    }
    else if (step.up) { const [x, y] = step.up === true ? (globalThis.__last || [0, 0]) : step.up; await mouse('mouseReleased', x, y); }
    else if (step.wheel) { const [x, y, dy] = step.wheel; await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x, y, deltaX: 0, deltaY: dy }); }
    else if (step.key) {
      const [key, code, kc] = KEYS[step.key] || [step.key, step.code || ('Key' + step.key.toUpperCase()), step.key.toUpperCase().charCodeAt(0)];
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: kc, text: key.length === 1 ? key : undefined });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: kc });
    }
    else if (step.type) { await send('Input.insertText', { text: step.type }); }
    else if (step.eval) { const v = await evalJS(step.eval); logs.push(`[${stamp()}] eval#${actionIndex}: ${JSON.stringify(v)?.slice(0, 2000)}`); }
    else if (step.wait) await sleep(step.wait);
    else if (step.shot) await shot(step.shot);
  } catch (e) { errors.push(`[${stamp()}] ACTION ${actionIndex} FAILED: ${e.message}`); }
}

const f0 = await evalJS('window.__snap ? window.__snap.frames : 0'); const tf0 = Date.now();
for (let i = 0; i < opt.shots; i++) {
  if (i > 0) await sleep(opt.interval);
  await shot(`t${i}`);
}
if (opt.shots <= 1) await sleep(1000);
const f1 = await evalJS('window.__snap ? window.__snap.frames : 0');
const fps = Math.round((f1 - f0) / ((Date.now() - tf0) / 1000));
const info = await evalJS(`(() => {
  const c = document.createElement('canvas'); const g = c.getContext('webgl2');
  const dbg = g && g.getExtension('WEBGL_debug_renderer_info');
  return { title: document.title, webgl2: !!g, renderer: g ? (dbg ? g.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : g.getParameter(g.RENDERER)) : null,
    floatRT: !!(g && g.getExtension('EXT_color_buffer_float')),
    bodyScrollW: document.documentElement.scrollWidth, innerW: innerWidth,
    canvases: document.querySelectorAll('canvas').length };
})()`);

let audioSummary;
if (opt.audio) {
  const b64 = await evalJS(`(() => { const x = window.__snapAudioStereo ? window.__snapAudioStereo() : new Float32Array(0); const i16 = new Int16Array(x.length); let pk = 0; for (let i = 0; i < x.length; i++) { const v = Math.max(-1, Math.min(1, x[i])); i16[i] = v * 32767; pk = Math.max(pk, Math.abs(v)); } const u8 = new Uint8Array(i16.buffer); let s = ''; for (let i = 0; i < u8.length; i += 32768) s += String.fromCharCode.apply(null, u8.subarray(i, i + 32768)); return JSON.stringify({ sr: window.__snapAudioSR || 48000, n: x.length, peak: pk, data: btoa(s) }); })()`);
  const a = JSON.parse(b64); const pcm = Buffer.from(a.data, 'base64');
  const hdr = Buffer.alloc(44); hdr.write('RIFF', 0); hdr.writeUInt32LE(36 + pcm.length, 4); hdr.write('WAVE', 8); hdr.write('fmt ', 12); hdr.writeUInt32LE(16, 16); hdr.writeUInt16LE(1, 20); hdr.writeUInt16LE(2, 22); hdr.writeUInt32LE(a.sr, 24); hdr.writeUInt32LE(a.sr * 4, 28); hdr.writeUInt16LE(4, 32); hdr.writeUInt16LE(16, 34); hdr.write('data', 36); hdr.writeUInt32LE(pcm.length, 40);
  fs.writeFileSync(path.join(outDir, 'audio.wav'), Buffer.concat([hdr, pcm]));
  const spectroSrc = fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), 'spectro.js'), 'utf8');
  await evalJS(spectroSrc + `; window.__snapStats = analyse(window.__snapAudio(), ${a.sr}, 'captured audio'); 1`);
  const st = await evalJS('JSON.stringify(window.__snapStats)');
  await shot('audio-spectrogram');
  audioSummary = { seconds: +(a.n / 2 / a.sr).toFixed(2), peak: +a.peak.toFixed(3), stats: st ? JSON.parse(st) : null, wav: path.relative(ROOT, path.join(outDir, 'audio.wav')) };
}
if (opt.saveExpr) { const b = await evalJS(opt.saveExpr); if (typeof b === 'string' && !b.startsWith('EVAL ERROR')) fs.writeFileSync(opt.saveFile, Buffer.from(b, 'base64')); else errors.push('save failed: ' + String(b).slice(0, 300)); }
let endEval;
if (opt.evalEnd) endEval = await evalJS(opt.evalEnd);

const summary = { page: target, url, viewport: `${opt.w}x${opt.h}@${opt.dpr}`, fps, info, errors: errors.length, shots, ...(audioSummary ? { audio: audioSummary } : {}), ...(endEval !== undefined ? { eval: endEval } : {}) };
if (!opt.quiet) { console.log('--- console / errors ---'); logs.forEach(l => console.log(l)); if (!logs.length) console.log('(none)'); console.log('--- summary ---'); }
if (errors.length && opt.quiet) errors.forEach(e => console.log(e));
console.log(JSON.stringify(summary, null, 2));
if (info && info.bodyScrollW > info.innerW + 1) console.log(`WARNING: horizontal overflow (scrollWidth ${info.bodyScrollW} > ${info.innerW})`);
clearTimeout(hardTimeout);
ws.close(); cleanup();
setTimeout(() => process.exit(errors.length ? 1 : 0), 400);
