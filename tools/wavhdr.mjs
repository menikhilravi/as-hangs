// node tools/wavhdr.mjs raw.pcm out.wav [sr] [channels] — wrap raw int16 PCM in a WAV header
import fs from 'node:fs';
const [,, inp, out, sr = 48000, ch = 2] = process.argv; const pcm = fs.readFileSync(inp); const h = Buffer.alloc(44);
h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8); h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(+ch, 22);
h.writeUInt32LE(+sr, 24); h.writeUInt32LE(sr * 2 * ch, 28); h.writeUInt16LE(2 * ch, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
fs.writeFileSync(out, Buffer.concat([h, pcm])); fs.unlinkSync(inp);
