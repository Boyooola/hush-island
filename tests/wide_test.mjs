import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const errs = []; let fails = 0;
const ok = (c, m, x = '') => { console.log((c ? 'PASS ' : 'FAIL ') + m, x); if (!c) fails++; };
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
await ctx.route((u) => u.hostname !== 'localhost', (r) => r.abort());
const p = await ctx.newPage(); p.setDefaultTimeout(150000); p.on('pageerror', (e) => errs.push(e.message));
await p.goto('http://localhost:8787/far', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(3500);
await p.evaluate(() => { const e = window.__ember; e.lockQuality(); e.idleAfter = 3600000; e.setHour(11); e.setRain(0); e.setFog(false); document.querySelector('#pick-animal button:nth-child(1)').click(); document.querySelector('#enter').click(); });
await p.waitForTimeout(7000);
const go = async (x, z, wait = 2500) => { await p.evaluate(([x, z]) => { const e = window.__ember; e.teleport(x, z, 0); }, [x, z]); await p.waitForTimeout(wait); };
const run = (label) => p.evaluate((label) => { const e = window.__ember, i = e.actions.findIndex((a) => a && a.startsWith(label)); if (i < 0) return e.actions.join(' | '); e.run(i); return 'ok'; }, label);
const log = (n = 3) => p.evaluate((n) => window.__ember.log.slice(-n).join(' || '), n);
const ev = (f, a) => p.evaluate(f, a);
const F = await ev(() => window.__ember.wide.folk.map((f) => ({ id: f.def.id, x: f.x, z: f.z, model: !!f.group })));
ok(F.length === 6 && F.every((f) => f.model), 'six folk stand on the island, each with a body', JSON.stringify(F.map((f) => f.id + (f.model ? '' : '!'))));
// the Message Round: the letter from the Mapmaker, handed to the Forager, who gives the jar
await go(10.9 + 1.6, -3.3 + 1.2);
ok((await run('Greet the Mapmaker')) === 'ok', 'the Mapmaker can be greeted', await run('zz')); await p.waitForTimeout(6000); await run('Greet the Mapmaker'); await p.waitForTimeout(6000);
ok(await ev(() => !!window.__ember.taken['lr-r1']), 'on the second greeting he gives the letter', await log(3));
const fo = F.find((f) => f.id === 'forager'); await go(fo.x + 1.4, fo.z + 1.0);
ok((await run('Greet the Forager')) === 'ok', 'the Forager can be greeted', await run('zz')); await p.waitForTimeout(13000);
ok(await ev(() => !!window.__ember.quests['lr-r1'] && !!window.__ember.taken['lr-r2']), 'the letter is delivered and she hands over the jar', await log(4));
ok((await run('Swap with')) !== 'ok' && (await run('Greet the Forager')) === 'ok', 'greeting again gets talk of the woods'); await p.waitForTimeout(2500); console.log('   ', await log(1));
// a hidden place
const T = await ev(() => { const w = window.__ember.wide; return { spots: w.SPOT_AT, works: Object.fromEntries(Object.entries(w.WORKS).map(([k, v]) => [k, { pile: v.pile, at: v.at }])), lambs: w.LAMBS, sh: { x: w.who.shepherd.x, z: w.who.shepherd.z }, bc: { x: w.who.beachcomber.x, z: w.who.beachcomber.z } }; });
await go(T.spots.trunk.x + 1, T.spots.trunk.z + 1, 2500);
ok(await ev(() => window.__ember.wide.S.spots.includes('trunk')), 'walking under the fallen trunk finds a hidden place', await log(2));
// a lamb, called and walked home
const lamb = T.lambs[0]; await go(lamb.x + 1.2, lamb.z + 0.8, 2000);
ok((await run('Call the lamb')) === 'ok', 'a lost lamb can be called', await run('zz')); await p.waitForTimeout(800);
await go(T.sh.x + 4, T.sh.z + 3, 6000);
ok(await ev(() => window.__ember.wide.lambsHome() === 1), 'it follows to the meadow and goes home', await log(2));
// the works: planks for the bridge
await go(T.works.plank.pile.x + 1.6, T.works.plank.pile.z - 1.6, 2000);
ok((await run('Take planks')) === 'ok', 'planks can be taken from the pile', await run('zz')); await p.waitForTimeout(600);
await go(T.works.plank.at.x + 1.5, T.works.plank.at.z + 1.5, 2000);
ok((await run('Lay down the planks')) === 'ok', 'and laid at the bridge', await run('zz')); await p.waitForTimeout(800);
ok(await ev(() => window.__ember.wide.works.plank === 3), 'three planks are in', await log(1));
const br = await ev(() => { const w = window.__ember.wide; w.works.plank = 24; w.setWorks(); const e = window.__ember; return { on: e.bridge.on, mid: e.walkable((e.bridge.ax + e.bridge.bx) / 2, (e.bridge.az + e.bridge.bz) / 2) }; });
ok(br.on && br.mid, 'with twenty-four planks the bridge can be walked', JSON.stringify(br));
// fishing, cooking, eating
const fish = await ev(() => window.__ember.wide.fishAt('pool')); await go(fish.x, fish.z - 1.2, 2000);
ok((await run('Watch the water')) === 'ok', 'fish can be watched for at the pool', await run('zz'));
let struck = false; for (let i = 0; i < 40 && !struck; i++) { await p.waitForTimeout(500); struck = (await run('Strike!')) === 'ok'; }
await p.waitForTimeout(600); ok(struck && await ev(() => window.__ember.inv.fish_trout === 1), 'and one is caught', await log(2));
await ev(() => { window.__ember.give('sprig', 1, true); }); await go(0.5, 3.2, 2000);
ok((await run('Cook something')) === 'ok', 'there is cooking at the fire', await run('zz')); await p.waitForTimeout(600);
await ev(() => [...document.querySelectorAll('#sheet-body .row')].find((r) => /Herbed fish/.test(r.textContent)).click()); await p.waitForTimeout(600); await p.keyboard.press('Escape');
ok(await ev(() => window.__ember.inv.herbfish === 1 && !window.__ember.inv.fish_trout), 'a fish and a sprig make herbed fish', await log(1));
await ev(() => window.__ember.wide.eat('herbfish')); ok(await ev(() => !window.__ember.inv.herbfish), 'and it can be eaten', await log(1));
// a puzzle: the sluices
const SL = await ev(() => window.__ember.wide.pz.SLUICES); for (const s of SL) { await go(s.x + 1.2, s.z, 1500); await run('Turn the sluice wheel'); await p.waitForTimeout(500); }
ok(await ev(() => window.__ember.wide.pz.done('sluice')), 'turning all four wheels solves the sluices', await log(2));
// swapping, digging, a bird
await ev(() => window.__ember.give('apple', 2, true)); { const bc = await ev(() => { const f = window.__ember.wide.who.beachcomber; return { x: f.x, z: f.z }; }); await go(bc.x + 1.5, bc.z + 1.2, 2000); }
ok((await run('Swap with the Beachcomber')) === 'ok' || (await run('Greet the Beachcomber')) === 'ok', 'the Beachcomber is there to swap with', await run('zz')); await p.waitForTimeout(500); await p.keyboard.press('Escape');
const M = await ev(() => window.__ember.wide.moundsNow()); await go(M[0].x + 0.8, M[0].z + 0.5, 2000);
ok((await run('Dig where')) === 'ok', 'disturbed ground can be dug', await run('zz')); await p.waitForTimeout(500); console.log('   ', await log(1));
await p.keyboard.press('m'); await p.waitForTimeout(1200); ok(await ev(() => /What you have seen of each part/.test(document.getElementById('sheet-body').textContent)), 'the map counts what has been seen of each part'); await p.keyboard.press('Escape');
await p.keyboard.press('q'); await p.waitForTimeout(800); console.log('   quests:', await ev(() => document.getElementById('sheet-note').textContent)); await p.keyboard.press('Escape');
// more of it: the altar, a rope, a beacon by night, the fold, the fireflies
const Z = await ev(() => { const w = window.__ember.wide; return { altar: w.pz.ALTAR, beacons: w.pz.BEACONS, ropes: w.ropes.map((r) => ({ top: r.top, foot: r.foot })), leap: w.leapAt, orchard: w.orchardAt }; });
await go(Z.altar.x + 1.6, Z.altar.z + 0.4, 2000);
ok((await run('Look at the altar')) === 'ok', 'the altar on Chapel Rock can be looked at', await run('zz')); await p.waitForTimeout(600);
for (const [i, n] of [[0, 2], [1, 1], [2, 3], [3, 2]]) for (let k = 0; k < n; k++) { await ev((i) => document.querySelectorAll('#sheet-body .row')[i].click(), i); await p.waitForTimeout(250); }
await p.waitForTimeout(500); ok(await ev(() => window.__ember.wide.pz.done('altar')), 'setting the four dials as the stones say solves it', await log(2)); await p.keyboard.press('Escape');
await ev(() => window.__ember.give('rope', 1, true)); await go(Z.ropes[0].top.x + 1, Z.ropes[0].top.z + 0.6, 2000);
ok((await run('Tie a rope')) === 'ok', 'a rope can be tied at the top of a drop', await run('zz')); await p.waitForTimeout(600);
ok((await run('Slide down the rope')) === 'ok', 'and slid down', await run('zz')); await p.waitForTimeout(9000);
ok(await ev((f) => Math.hypot(window.__ember.me.x - f.x, window.__ember.me.z - f.z) < 4, Z.ropes[0].foot), 'it ends at the foot, in Stillwater', await ev(() => [window.__ember.me.x, window.__ember.me.z].map(Math.round).join(',')));
await ev(() => window.__ember.setHour(23)); await p.waitForTimeout(2500);
for (const b of Z.beacons) { await go(b.x + 1.2, b.z + 0.8, 1500); await run('Light the beacon'); await p.waitForTimeout(400); }
ok(await ev(() => window.__ember.wide.pz.done('beacon')), 'four beacons lit east to west at night solve the beacons', await log(2));
await ev(() => window.__ember.setHour(11)); await p.waitForTimeout(1500);
await go(Z.orchard.x + 3, Z.orchard.z + 2, 1500); ok((await run('Shake an apple tree')) === 'ok' && await ev(() => window.__ember.inv.apple >= 1), 'apples come down in the orchard', await log(1));
await go(Z.leap.fx, Z.leap.fz, 1500); ok((await run('Leap across')) === 'ok', 'the leap is there for a deer', await run('zz')); await p.waitForTimeout(700); ok(/deer/.test(await log(3)), 'a fox thinks better of it', await log(1));
await p.keyboard.press('7'); await p.waitForTimeout(2600); ok(true, 'a dance is danced');
// the last pieces: a plank over the gap, the tunnel, ringing stones, skipping by timing, pointing, the high rock
const Q = await ev(() => { const w = window.__ember.wide; return { ...w.more, chimes: w.chimes, skip: w.skipAt[0] }; });
ok(!(await ev((g) => window.__ember.walkable(g.x, g.z), Q.STEP_GAP)), 'one column of the Steps is missing');
await go(Q.PLANKS_AT.x + 1, Q.PLANKS_AT.z + 1, 1500); ok((await run('Take up a plank')) === 'ok', 'a plank can be taken up on the cliff', await run('zz')); await p.waitForTimeout(400);
await go(Q.GAP_EDGE.x, Q.GAP_EDGE.z, 1500); ok((await run('Lay the plank')) === 'ok', 'and laid across the gap', await run('zz')); await p.waitForTimeout(500);
ok(await ev((g) => window.__ember.walkable(g.x, g.z), Q.STEP_GAP), 'the Steps can be walked all the way out');
await go(Q.TUNNEL.a.x + 1.2, Q.TUNNEL.a.z - 1.6, 1500); ok((await run('Go through the Gardener')) === 'ok', 'with the sluices running the tunnel is open', await run('zz')); await p.waitForTimeout(3500);
ok(await ev((b) => Math.hypot(window.__ember.me.x - b.x, window.__ember.me.z - b.z) < 5, Q.TUNNEL.b), 'it comes out on the south shore');
for (const c of Q.chimes) { await go(c.x - 0.9, c.z - 0.6, 1200); await run('Strike the ringing stone'); await p.waitForTimeout(300); }
ok(await ev(() => window.__ember.wide.S.chimed === 1), 'five ringing stones on Chapel Rock can be struck', await run('zz'));
await go(Q.skip.x, Q.skip.z - 1, 1500); ok((await run('Skip a stone')) === 'ok', 'a stone can be swung', await run('zz')); await p.waitForTimeout(1450);
ok((await run('Let it go')) === 'ok', 'and let go', await run('zz')); await p.waitForTimeout(4500); ok(/skips|Plop/.test(await log(3)), 'it skips by how well it was timed', await log(1));
await p.keyboard.press('9'); await p.waitForTimeout(600); ok(/You point/.test(await log(1)), 'a visitor can point', await log(1));
await go(Q.BOOST.fx, Q.BOOST.fz, 1500); ok((await run('Try to get up')) === 'ok', 'the high rock is there to try', await run('zz')); await p.waitForTimeout(500); ok(/too high/.test(await log(1)) && !(await ev((b) => Math.hypot(window.__ember.me.x - b.x, window.__ember.me.z - b.z) < 1.5, Q.BOOST)), 'alone it cannot be climbed', await log(1));
ok(errs.length === 0, 'no errors on the page', errs.join(' | '));
console.log(fails ? `FAILED ${fails}` : 'ALL PASS'); await browser.close();
