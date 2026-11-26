import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const errs = []; let fails = 0;
const ok = (c, m, x = '') => { console.log((c ? 'PASS ' : 'FAIL ') + m, x); if (!c) fails++; };
const S = '/home/claude/ember-isle/shots/';
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
await ctx.route((u) => u.hostname !== 'localhost', (r) => r.abort());
const p = await ctx.newPage(); p.on('pageerror', (e) => errs.push(e.message));
await p.goto('http://localhost:8787/far', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(3500);
await p.evaluate(() => { window.__ember.lockQuality(); window.__ember.idleAfter = 3600000; window.__ember.setHour(11); });
await p.click('#pick-animal button:nth-child(1)'); await p.click('#enter'); await p.waitForTimeout(5000);
const go = async (x, z, wait = 3500, cam = [0.6, 0.5, 9]) => { await p.evaluate(([x, z, cam]) => { const e = window.__ember; e.teleport(x, z, 0); e.cam(...cam); }, [x, z, cam]); await p.waitForTimeout(wait); };
const run = (label) => p.evaluate((label) => { const e = window.__ember, i = e.actions.indexOf(label); if (i < 0) return e.actions.join(' | '); e.run(i); return 'ok'; }, label);
const done = () => p.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('ember.quests') || '{}')));
const sheet = () => p.evaluate(() => document.getElementById('sheet-title').textContent + ' :: ' + [...document.querySelectorAll('#sheet-body .row')].map((r) => r.textContent).join(' | ') + ' :: ' + document.getElementById('sheet-note').textContent);
const goal = () => p.evaluate(() => document.getElementById('goal').hidden ? '' : document.getElementById('goal-text').textContent + (document.getElementById('goal-arrow').style.display === 'none' ? '' : ' [arrow]'));
ok(/Greet the Mapmaker/.test(await goal()) && /arrow/.test(await goal()), 'the far shore says what is asked, with an arrow', await goal());
const W = await p.evaluate(() => { const w = window.__ember.world; return { m: { x: w.mapmaker.x, z: w.mapmaker.z }, b: window.__ember.mapBoard, pages: w.logPages.map((q) => ({ x: q.x, z: q.z })) }; });
await go(W.m.x + 2, W.m.z + 1.2, 2500); ok((await run('Greet the Mapmaker')) === 'ok', 'greet the Mapmaker'); await p.waitForTimeout(9000);
ok((await done()).includes('lr-mapmaker'), 'that is the first quest', (await done()).join());
await go(W.b.x + 1.5, W.b.z + 2.4, 2500); await run('Look at the map'); await p.waitForTimeout(700); await p.keyboard.press('Escape'); await p.waitForTimeout(12000);
ok((await done()).includes('lr-map'), 'looking at the map is the second', (await done()).join());
await p.screenshot({ path: S + 'q1.png' });
await go(W.pages[1].x + 0.3, W.pages[1].z + 0.5, 12000, [0.4, 0.5, 5]); await p.screenshot({ path: S + 'q2.png' });
ok((await run('Pick up the page')) === 'ok', 'a page can be picked up in the hollow tree', await run('zz')); await p.waitForTimeout(1500);
let sh = await sheet(); ok(/second page/.test(sh) && /badger/.test(sh) && /1 of 6/.test(sh), 'and read', sh.slice(0, 160)); await p.screenshot({ path: S + 'q3.png' }); await p.keyboard.press('Escape');
ok((await run('Pick up the page')) !== 'ok', 'it is gone from the ground');
await p.waitForTimeout(30000);
let d = await done(); ok(['lr-woods', 'lr-tree', 'lr-page'].every((q) => d.includes(q)), 'woods, tree and page quests follow', d.join());
// the satchel
await p.evaluate(() => window.__ember.openJournal('satchel')); await p.waitForTimeout(500); sh = await sheet(); await p.screenshot({ path: S + 'q4.png' });
ok(/logbook · 1 of 6/.test(sh) && /second pagePress to read/.test(sh) && /A page is missing/.test(sh), 'the satchel holds the page', sh.slice(0, 300));
await p.evaluate(() => window.__ember.openJournal('quests')); await p.waitForTimeout(500); sh = await sheet(); await p.screenshot({ path: S + 'q5.png' });
ok(/The far shore · \d of 6/.test(sh) && /Under the hill/.test(sh) && !/Ashore/.test(sh), 'the journal lists Lantern Rock\'s quests', sh.slice(0, 200)); await p.keyboard.press('Escape');
// every page lies somewhere it can be reached
for (let i = 0; i < 6; i++) { if (i === 1) continue; await go(W.pages[i].x + 0.9, W.pages[i].z + 0.6, i === 3 ? 6000 : 2500, [0.4, 0.5, 5]); const pos = await p.evaluate(() => ({ x: window.__ember.me.x, z: window.__ember.me.z })); const r = await run('Pick up the page'); ok(r === 'ok', `page ${i + 1} can be picked up`, r === 'ok' ? '' : `${r} at ${pos.x.toFixed(1)},${pos.z.toFixed(1)} want ${W.pages[i].x.toFixed(1)},${W.pages[i].z.toFixed(1)}`); if (i === 0 || i === 5) await p.screenshot({ path: S + `q6_${i}.png` }); await p.waitForTimeout(900); await p.keyboard.press('Escape'); }
console.log(' ', await p.evaluate(() => window.__ember.log.slice(-4).join(' || ')));
console.log(errs.length ? [...new Set(errs)].slice(0, 5).join('\n') : 'no page errors', fails ? `${fails} FAILED` : '');
await browser.close();
