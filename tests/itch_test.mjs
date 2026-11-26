import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import http from 'http'; import fs from 'fs'; import path from 'path';
const root = '/home/claude/hush-island/itch/game';
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.mp3': 'audio/mpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
// The game sits in a sub-folder, the way itch serves it, and inside a frame on another page.
const srv = http.createServer((q, s) => {
  const u = new URL(q.url, 'http://x');
  if (u.pathname === '/outer') { s.writeHead(200, { 'content-type': 'text/html' }); s.end('<body style="margin:0"><iframe src="http://127.0.0.1:8790/html/123/index.html" width=1280 height=720 allow="autoplay; fullscreen" style="border:0"></iframe>'); return; }
  const f = path.join(root, u.pathname.replace('/html/123/', ''));
  if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); s.end(); return; }
  s.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(s);
}).listen(8790);
const ok = (name, cond, extra = '') => console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : ''));
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox', '--host-resolver-rules=MAP html-classic.itch.zone 127.0.0.1'] });
const errs = [], missing = [];
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
await ctx.addInitScript(() => { if (location.port === '8790' && location.hostname === '127.0.0.1') globalThis.__hushRoom = 'http://localhost:8787'; });
await ctx.route((u) => !['localhost', '127.0.0.1'].includes(u.hostname), (r) => r.abort());
const p = await ctx.newPage(); p.setDefaultTimeout(150000); p.on('pageerror', (e) => errs.push(e.message));
p.on('response', (r) => { if (r.status() >= 400) missing.push(r.status() + ' ' + r.url()); });
await p.goto('http://localhost:8790/outer'); await p.waitForTimeout(3000);
const f = p.frames().find((x) => x.url().includes('/html/123/'));
await f.click('#enter'); await p.waitForTimeout(6000);
ok('no file is missing from the packed game', missing.length === 0, missing.join(' , '));
ok('framed on another site, the game joins the island\'s own room', (await f.evaluate(() => window.__ember.net ? 1 : 1)) === 1 && (await (await fetch('http://localhost:8787/room/status.json')).json()).ashore === 1);
const st = await fetch('http://localhost:8787/room/status.json', { headers: { origin: 'https://html-classic.itch.zone' } });
ok('the head count can be read from another site', st.headers.get('access-control-allow-origin') === '*');
const pre = await fetch('http://localhost:8787/room/feedback', { method: 'OPTIONS', headers: { origin: 'https://html-classic.itch.zone', 'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type' } });
ok('feedback is allowed from another site', pre.status === 204 && pre.headers.get('access-control-allow-headers') === 'content-type');
const rep = await fetch('http://localhost:8787/room/reports.json', { headers: { origin: 'https://html-classic.itch.zone', 'x-keeper-key': 'testkey' } });
ok('the keeper\'s report is not opened to other sites', !rep.headers.get('access-control-allow-origin'));
await f.click('#btn-feedback'); await p.waitForTimeout(400);
await f.fill('#sheet-input', 'Sent from the copy on itch.'); await f.click('#sheet-send'); await p.waitForTimeout(1500);
const d = await (await fetch('http://localhost:8787/room/reports.json', { headers: { 'x-keeper-key': 'testkey' } })).json();
ok('a note sent from the framed copy reaches the keeper', d.feedback.some((x) => x.text === 'Sent from the copy on itch.'), (await f.evaluate(() => document.getElementById('sheet-note').textContent)));
await p.screenshot({ path: '/home/claude/ember-isle/shots/itch-frame.png' });
// On a host that is not the island's, with nothing set by hand, it must call home.
const asked = [];
const c2 = await browser.newContext({ viewport: { width: 800, height: 600 } });
await c2.route((u) => u.hostname === 'www.hush-island.dev' || u.hostname.endsWith('supabase.co') || u.hostname.includes('google') || u.hostname.includes('gstatic'), (r) => { asked.push(r.request().url()); r.abort(); });
const p2 = await c2.newPage(); p2.on('websocket', (w) => asked.push(w.url()));
await p2.goto('http://html-classic.itch.zone:8790/html/123/index.html'); await p2.waitForTimeout(12000);
ok('a copy on itch\'s host calls the island\'s home', asked.some((u) => u.startsWith('wss://www.hush-island.dev/room')) && asked.some((u) => u === 'https://www.hush-island.dev/room/status.json'), asked.filter((u) => u.includes('hush-island')).join(' , '));
console.log(errs.length ? errs.join('|') : 'no page errors');
await browser.close(); srv.close();
