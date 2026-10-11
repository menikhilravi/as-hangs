// build.mjs — inline src/ into one standalone page (dist/index.html, works from file://) and an Artifact fragment
// (dist/as-hangs.html: no doctype/html/head/body; the Artifact host wraps it).
import fs from 'node:fs';
import path from 'node:path';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const src = p => fs.readFileSync(path.join(ROOT, 'src', p), 'utf8');
const html = src('index.html');
const inlined = html.replace(/<script src="([^"]+)"><\/script>/g, (_, f) => `<script>\n${src(f).replace(/<\/script>/g, '<\\/script>')}\n</script>`);
fs.mkdirSync(path.join(ROOT, 'dist'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'dist/index.html'), inlined);
// fragment: title + style + body content
const title = /<title>[\s\S]*?<\/title>/.exec(inlined)[0];
const style = /<style>[\s\S]*?<\/style>/.exec(inlined)[0];
const body = /<body>([\s\S]*)<\/body>/.exec(inlined)[1];
fs.writeFileSync(path.join(ROOT, 'dist/as-hangs.html'), `${title}\n<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n${style}\n${body}`);
const kb = f => (fs.statSync(path.join(ROOT, f)).size / 1024).toFixed(1) + ' KB';
console.log('dist/index.html', kb('dist/index.html'), '· dist/as-hangs.html', kb('dist/as-hangs.html'));
