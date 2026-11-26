import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const errs = []; let fails = 0;
const ok = (c, m, x = '') => { console.log((c ? 'PASS ' : 'FAIL ') + m, x); if (!c) fails++; };
const S = '/home/claude/ember-isle/shots/';
const visitor = async (name) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await ctx.route((u) => u.hostname !== 'localhost', (r) => r.abort());
  const p = await ctx.newPage(); p.setDefaultTimeout(150000); p.on('pageerror', (e) => errs.push(name + ': ' + e.message));
  await p.goto('http://localhost:8787/far', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(3500);
  await p.evaluate(() => { window.__ember.lockQuality(); window.__ember.idleAfter = 3600000; window.__ember.setHour(11); });
  await p.click('#pick-animal button:nth-child(1)'); await p.click('#rename'); await p.fill('#name-input', name); await p.click('#name-form button'); await p.waitForTimeout(300); await p.click('#enter'); await p.waitForTimeout(5000);
  return p;
};
const go = async (p, x, z, wait = 3500, cam = [0.6, 0.5, 9]) => { await p.evaluate(([x, z, cam]) => { const e = window.__ember; e.teleport(x, z, 0); e.cam(...cam); }, [x, z, cam]); await p.waitForTimeout(wait); };
const run = (p, label) => p.evaluate((label) => { const e = window.__ember, i = e.actions.indexOf(label); if (i < 0) return e.actions.join(' | '); e.run(i); return 'ok'; }, label);
const db = (p) => p.evaluate(async () => (await (await fetch('/room/db', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ op: 'list', coll: 'firsts' }) })).json()).rows.map(([id, d]) => id + '=' + d.name));
const sheet = (p) => p.evaluate(() => document.getElementById('sheet-title').textContent + ' :: ' + [...document.querySelectorAll('#sheet-body .row')].map((r) => r.textContent).join(' | ') + ' :: ' + document.getElementById('sheet-note').textContent);
const log = (p, n = 6) => p.evaluate((n) => window.__ember.log.slice(-n).join(' || '), n);

const a = await visitor('Mira');
const board = await a.evaluate(() => window.__ember.mapBoard);
await go(a, board.x + 1.5, board.z + 2.4, 2500, [0.2, 0.25, 5.5]); await a.screenshot({ path: S + 'm1.png' });
ok((await run(a, 'Look at the map')) === 'ok', 'the map can be looked at'); await a.waitForTimeout(600);
let sh = await sheet(a); ok(/far shore/.test(sh) && /Blank paper/.test(sh) && /1 of 8/.test(sh), 'an empty map is blank paper', sh.slice(0, 200)); await a.keyboard.press('Escape');
await go(a, -78, -8, 9000);                               // Whisper Woods
let rows = await db(a); ok(rows.includes('first-a-woods=Mira'), 'the first into the woods is recorded', rows.join(','));
ok(/nobody had stood here before you/.test(await log(a)), 'and is told so');
const b = await visitor('Odo');
await go(b, -78, -8, 8000);
rows = await db(b); ok(rows.filter((r) => r.startsWith('first-a-woods')).length === 1 && rows.includes('first-a-woods=Mira'), 'a second visitor does not take the woods', rows.join(','));
await go(b, -100, 132, 9000);                             // the Tide Flats: Odo is first
rows = await db(b); ok(rows.includes('first-a-flats=Odo'), 'but is first on the flats');
await a.waitForTimeout(1500); ok(/Tide Flats: Odo.* is the first to stand there/.test(await log(a, 10)), 'the first visitor hears of it', (await log(a, 3)).slice(0, 200));
await go(b, -265, -2, 45000);                             // the summit: Odo names the island
rows = await db(b); ok(rows.includes('first-s-summit=Odo'), 'the first on the summit is recorded', rows.join(','));
await a.waitForTimeout(1500);
ok(await a.evaluate(() => document.title.startsWith('Lantern Rock')), 'the island is named for everyone', await a.title());
await go(a, board.x + 1.5, board.z + 2.4, 3000, [0.2, 0.25, 5.5]); await a.screenshot({ path: S + 'm2.png' });
await run(a, 'Look at the map'); await a.waitForTimeout(600); sh = await sheet(a); await a.screenshot({ path: S + 'm3.png' });
ok(/Lantern Rock/.test(sh) && /Whisper Woods\.first walked by you/.test(sh) && /Tide Flats\. You have not been there\.first walked by Odo/.test(sh) && /top of the island\. You have not found it\.first found by Odo/.test(sh), 'the map sheet lists who was first', sh);
await a.keyboard.press('Escape');
ok((await run(a, 'Greet the Mapmaker')) === 'ok', 'the Mapmaker can be greeted'); await a.waitForTimeout(3500);
console.log(' ', await log(a, 2));
// the server will not take nonsense
const bad = await a.evaluate(async () => { const put = async (id, data) => (await fetch('/room/db', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ op: 'put', coll: 'firsts', id, data }) })).status; return [await put('first-a-woods', { place: 'first-a-woods', name: 'Zed', code: '' }), await put('first-x-woods', { place: 'first-x-woods', name: 'Zed', code: '' }), await put('first-a-point', { place: 'first-a-point', name: '', code: '' })]; });
ok(bad.join() === '409,403,403', 'the record refuses a second claim, a made-up place and an empty name', bad.join());
console.log(errs.length ? [...new Set(errs)].slice(0, 5).join('\n') : 'no page errors', fails ? `${fails} FAILED` : '');
await browser.close();
