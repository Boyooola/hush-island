// Film the game one scene at a time. The page's clock is stepped by hand, one video frame per step,
// so the result is smooth however slow this machine draws.
//   node film.mjs <scene> [preview]
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
const which = process.argv[2], preview = process.argv[3] === 'preview';
const W = 1280, H = 720, FPS = 30;
const names = ['Fox', 'Shiba', 'Husky', 'Wolf', 'Deer', 'Stag', 'Alpaca', 'Donkey'];

// Each scene: who you are, the hour, a line of words, how to set up, and what happens on which frame.
const SCENES = {
  arrive: { sp: 0, name: 'Sleepy Fox', hour: 22, frames: 150, big: 'Hush Island', cap: 'A quiet island you visit as an animal',
    setup: (e) => { e.teleport(0.5, 23.4, Math.PI); e.cam(0.3, 0.16, 4.8); },
    at: { 8: (e) => e.walkTo(1.6, 6.2) }, orbit: -0.0012 },
  fire: { sp: 0, name: 'Sleepy Fox', hour: 22.4, frames: 135, cap: 'Sit by the fire with whoever else is here.',
    setup: (e) => { e.setFire(1.0); e.teleport(2.0, -1.6, 0); e.cam(0.25, 0.44, 5.2); },
    at: { 15: (e) => e.run(0), 80: (e) => e.run(0) }, orbit: 0.003 },
  boat: { sp: 1, name: 'Cosy Shiba', hour: 17.3, frames: 180, cap: 'Bring driftwood. Everyone builds the same boat.',
    setup: (e) => { const p = e.yard.pieces[0]; e.teleport(p.x + 0.5, p.z + 0.3, 0); },
    setup2: (e) => { e.run(e.actions.indexOf('Pick up the driftwood')); const s = e.yard.site, d = Math.hypot(s.x, s.z); e.teleport(s.x * (1 - 7.5 / d), s.z * (1 - 7.5 / d), 0); e.cam(2.62 + Math.PI / 2 + 0.75, 0.24, 6.2); },
    at: { 10: (e) => e.walkTo(e.yard.site.x + 0.6, e.yard.site.z + 0.6) },
    each: (e, i) => { const k = e.actions.indexOf('Add the driftwood to the boat'); if (i > 40 && k >= 0 && !e.walking) e.run(k); } },
  sail: { sp: 1, name: 'Cosy Shiba', hour: 17.6, frames: 250, skip: 40, built: true, cap: 'When she is finished, sail her west.',
    setup: (e) => { const b = e.berth; e.teleport(b.x, b.z, 0); e.cam(2.62 + Math.PI / 2 + 1.7, 0.2, 17); },
    at: { 3: (e) => e.boardBoat(1), 12: (e) => e.castOff() }, orbit: 0.0016 },
  rock: { path: 'far', sp: 1, name: 'Cosy Shiba', hour: 17.2, frames: 185, skip: 40, big: 'Lantern Rock', cap: 'A bigger island is waiting across the water',
    setup: (e) => { e.setFog(false); }, at: { 1: (e) => e.cutTo([92, 11, 46], [-40, 9, -14], 60) } },
  shepherd: { path: 'far', sp: 1, name: 'Cosy Shiba', hour: 10, frames: 185, skip: 40, cap: 'Meet the ones who stayed.',
    setup: (e) => { e.setFog(false); e.teleport(-254.6, -15.2, -2.2); },
    at: { 1: (e) => { const y = e.me.y; e.cutTo([-253.2, y + 1.7, -12.2], [-256.6, y + 1.15, -16.6], 60); }, 110: (e) => e.playEmote('wag') } },
  light: { path: 'far', sp: 3, name: 'Moonlit Wolf', hour: 18.7, frames: 185, skip: 40, cap: 'Find out why the lighthouse went dark.',
    setup: (e) => { e.setFog(false); e.teleport(-306, 16, 2.5); },
    at: { 1: (e) => { e.cutTo([-282, 31, 48], [-319, 33, 7], 60); } } },
  woods: { path: 'far', sp: 4, name: 'Gentle Deer', hour: 15.5, frames: 185, skip: 40, cap: 'Hidden places, puzzles, and a story told in pieces.',
    setup: (e) => { e.setFog(false); e.teleport(-72, -11, 0); },
    at: { 1: (e) => { e.cutTo([-120, 75, 150], [-190, 5, -10], 60); } } },
  flock: { path: 'far', sp: 0, name: 'Sleepy Fox', hour: 11, frames: 200, skip: 40, cap: '',
    setup: (e) => { e.setFog(false); e.teleport(-270, -15.5, 0); },
    at: { 1: (e) => { const y = e.me.y; e.cutTo([-271.5, y + 1.5, -16.5], [-278, y + 0.2, -24], 60); }, 60: (e) => e.walkTo(-281, -27) } },
  f_pedlar: { path: 'far', sp: 0, name: 'Sleepy Fox', hour: 11, frames: 220, skip: 40, cap: '',
    setup: (e) => { e.setFog(false); const q = e.wide.whoAt('pedlar'); e.teleport(q.x + 1.6, q.z + 1.2, 0); },
    at: { 1: (e) => { const q = e.wide.whoAt('pedlar'), y = e.me.y; e.cutTo([q.x + 2.6 * 1.7, y + 1.2 * 1.7, q.z + 2.2 * 1.7], [q.x, y + 0.7 * 1.7, q.z], 60); } } },
  f_gardener: { path: 'far', sp: 0, name: 'Sleepy Fox', hour: 11, frames: 220, skip: 40, cap: '',
    setup: (e) => { e.setFog(false); const q = e.wide.whoAt('gardener'); e.teleport(q.x + 1.6, q.z + 1.2, 0); },
    at: { 1: (e) => { const q = e.wide.whoAt('gardener'), y = e.me.y; e.cutTo([q.x + 2.6 * 1, y + 1.2 * 1, q.z + 2.2 * 1], [q.x, y + 0.7 * 1, q.z], 60); } } },
  f_forager: { path: 'far', sp: 0, name: 'Sleepy Fox', hour: 11, frames: 220, skip: 40, cap: '',
    setup: (e) => { e.setFog(false); const q = e.wide.whoAt('forager'); e.teleport(q.x + 1.6, q.z + 1.2, 0); },
    at: { 1: (e) => { const q = e.wide.whoAt('forager'), y = e.me.y; e.cutTo([q.x + 2.6 * 1, y + 1.2 * 1, q.z + 2.2 * 1], [q.x, y + 0.7 * 1, q.z], 60); } } },
  f_heron: { path: 'far', sp: 0, name: 'Sleepy Fox', hour: 11, frames: 220, skip: 40, cap: '',
    setup: (e) => { e.setFog(false); const q = e.wide.whoAt('heron'); e.teleport(q.x + 1.6, q.z + 1.2, 0); },
    at: { 1: (e) => { const q = e.wide.whoAt('heron'), y = e.me.y; e.cutTo([q.x + 2.6 * 1.7, y + 1.2 * 1.7, q.z + 2.2 * 1.7], [q.x, y + 0.7 * 1.7, q.z], 60); } } },
  f_beachcomber: { path: 'far', sp: 0, name: 'Sleepy Fox', hour: 11, frames: 220, skip: 40, cap: '',
    setup: (e) => { e.setFog(false); const q = e.wide.whoAt('beachcomber'); e.teleport(q.x + 1.6, q.z + 1.2, 0); },
    at: { 1: (e) => { const q = e.wide.whoAt('beachcomber'), y = e.me.y; e.cutTo([q.x + 2.6 * 1, y + 1.2 * 1, q.z + 2.2 * 1], [q.x, y + 0.7 * 1, q.z], 60); } } },
  f_castaway: { path: 'far', sp: 0, name: 'Sleepy Fox', hour: 11, frames: 220, skip: 40, cap: '',
    setup: (e) => { e.setFog(false); const q = e.wide.whoAt('castaway'); e.teleport(q.x + 1.6, q.z + 1.2, 0); },
    at: { 1: (e) => { const q = e.wide.whoAt('castaway'), y = e.me.y; e.cutTo([q.x + 2.6 * 1, y + 1.2 * 1, q.z + 2.2 * 1], [q.x, y + 0.7 * 1, q.z], 60); } } },
  end: { sp: 0, name: 'Sleepy Fox', hour: 0.6, frames: 120, big: 'Hush Island', cap: 'Play free at hush-island.dev', hold: true,
    setup: (e) => { e.setFire(1.2); e.setRain(0); e.teleport(2.0, -1.6, -2.25); e.setMode('lie'); e.cam(1.2, 0.42, 11); }, orbit: 0.004 },
};
const S = SCENES[which];
if (!S) { console.log('scenes:', Object.keys(SCENES).join(' ')); process.exit(1); }

const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
await ctx.addInitScript(() => { try { localStorage.setItem('ember.boat', '64'); localStorage.setItem('ember.quests', JSON.stringify({ cold: 1 })); localStorage.setItem('ember.tasksClosed', 'true'); } catch (e) { /* fine */ } });
// The fonts come from this machine, so every scene is lettered the same whatever the network does.
const FD = '/tmp/og/node_modules/@fontsource';
const faces = [['Baloo 2', 600, 'baloo-2/files/baloo-2-latin-600-normal.woff2'], ['Baloo 2', 800, 'baloo-2/files/baloo-2-latin-800-normal.woff2'], ['Nunito', 600, 'nunito/files/nunito-latin-600-normal.woff2'], ['Nunito', 700, 'nunito/files/nunito-latin-700-normal.woff2'], ['Nunito', 800, 'nunito/files/nunito-latin-800-normal.woff2']];
await ctx.route('**/fonts.googleapis.com/**', (r) => r.fulfill({ contentType: 'text/css', body: faces.map(([f, w, p], i) => `@font-face{font-family:"${f}";font-weight:${w};font-style:normal;src:url(http://localhost:8766/_font/${i}) format("woff2")}`).join('\n') }));
await ctx.route('**/_font/*', (r) => r.fulfill({ contentType: 'font/woff2', headers: { 'access-control-allow-origin': '*' }, body: fs.readFileSync(`${FD}/${faces[Number(r.request().url().split('/').pop())][2]}`) }));
const page = await ctx.newPage();
const errors = [];
// One drawn frame per video frame: the page's own redraw request waits a full frame's time.
await page.addInitScript(() => { window.requestAnimationFrame = (cb) => window.setTimeout(() => cb(performance.now()), 33); });
page.on('pageerror', (e) => errors.push(e.message));
await page.clock.install({ time: new Date('2026-11-25T03:00:00Z') });
await page.goto('http://localhost:8766/' + (S.path || ''));
await page.waitForTimeout(4500);
const ev = (fn, a) => page.evaluate(fn, a);
await ev(([sp, name]) => {
  const e = window.__ember;
  e.lockQuality(); e.setIdentity(sp, 0);
  const box = document.getElementById('origin'); box.checked = false; box.dispatchEvent(new Event('change'));
  e.me.setName(name, '');
  document.getElementById('who-name').textContent = name;
}, [S.sp, S.name]);
for (let k = 0; k < 40 && !(await ev(() => !!window.__ember.me.parts.quad && (window.__ember.isle === 'far' || !!window.__ember.critters.cow.parts.quad))); k++) await page.waitForTimeout(250);
await page.click('#enter');
await page.waitForTimeout(S.path ? 9000 : 3800);
if (S.built) await ev(() => { const e = window.__ember; e.setBoat(100000); });
await ev(([hour, name, big, cap]) => {
  const e = window.__ember;
  e.setHour(hour); e.setRain(0); e.me.setName(name, '');
  document.getElementById('log').style.display = 'none';
  const st = document.createElement('style');
  st.textContent = 'body > *:not(canvas):not(#cap){opacity:0!important;pointer-events:none!important}#cap{position:fixed;left:0;right:0;top:96px;text-align:center;z-index:9;pointer-events:none;color:#fff3d6;font-family:"Baloo 2","Nunito",system-ui,sans-serif;font-weight:800;text-shadow:0 2px 3px rgba(0,0,0,.9),0 0 22px rgba(0,0,0,.65)}#cap b{display:block;font-size:92px;line-height:1;color:#ffc978;text-shadow:0 2px 3px rgba(0,0,0,.9),0 0 40px rgba(255,140,60,.55)}#cap span{font-size:38px;line-height:1.2}';
  document.head.appendChild(st);
  const c = document.createElement('div'); c.id = 'cap';
  if (big) { const b = document.createElement('b'); b.textContent = big; c.appendChild(b); }
  const s = document.createElement('span'); s.textContent = cap; c.appendChild(s);
  c.style.opacity = '0';
  document.body.appendChild(c); try { document.fonts.load('800 38px "Baloo 2"'); document.fonts.load('800 92px "Baloo 2"'); } catch (err) { /* fine */ }
}, [S.hour, S.name, S.big || '', S.cap]);
if (S.waitStill) for (let k = 0; k < 60 && !(await ev(() => window.__ember.critters.cow.speed < 0.03)); k++) await page.waitForTimeout(500);
const call = (f) => ev((src) => { (0, eval)('(' + src + ')')(window.__ember); }, f.toString());
await call(S.setup);
await page.waitForTimeout(1200);
if (S.setup2) { await call(S.setup2); await page.waitForTimeout(1500); }
await page.waitForTimeout(1500);       // let the camera settle on its mark
await page.clock.pauseAt(S.waitStill ? new Date((await ev(() => Date.now())) + 4000) : new Date(Date.parse('2026-11-25T03:00:00Z') + 60000));

let ff = null;
const tmp = `video/${which}.part.mp4`, out = `video/${which}.mp4`;
if (!preview) ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-', '-c:v', 'libx264', '-crf', '18', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-r', String(FPS), tmp], { stdio: ['pipe', 'inherit', 'inherit'] });
const atSrc = Object.fromEntries(Object.entries(S.at || {}).map(([k, f]) => [k, f.toString()]));
const eachSrc = S.each ? S.each.toString() : null;
let total = S.frames, doneAt = -1;
const t0 = Date.now();
const SK = S.skip || 0;
for (let i = 0; i < total; i++) {
  const fadeIn = Math.min(1, Math.max(0, i - SK) / 14), fadeOut = S.hold ? 1 : Math.min(1, (total - 1 - i) / 12);
  const flag = await ev(([i, at, each, orbit, op, keepWet]) => {
    const e = window.__ember;
    if (at) (0, eval)('(' + at + ')')(e);
    let r = false;
    if (each) r = (0, eval)('(' + each + ')')(e, i);
    if (orbit) e.turn(orbit);
    if (keepWet && i < keepWet) e.wet = 1;
    document.getElementById('cap').style.opacity = String(op);
    return !!r;
  }, [i, atSrc[i] || null, eachSrc, S.orbit || 0, Math.min(fadeIn, fadeOut), S.keepWet || 0]);
  if (S.endAfter && flag && doneAt < 0) { doneAt = i; total = Math.min(total, i + S.endAfter); }
  await page.clock.runFor(1000 / FPS);
  const shoot = preview ? (i === Math.floor(SK + (S.frames - SK) * 0.5) || i === total - 1) : i >= SK;
  if (shoot) {
    const buf = await page.screenshot({ type: 'jpeg', quality: 92 });
    if (preview) fs.writeFileSync(`video/pre-${which}-${i === total - 1 ? 'b' : 'a'}.jpg`, buf);
    else if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
  }
}
if (ff) { ff.stdin.end(); const code = await new Promise((r) => ff.on('close', r)); if (code === 0) fs.renameSync(tmp, out); else console.log('ffmpeg failed', code); }
console.log(which, preview ? 'preview' : 'filmed', total, 'frames in', Math.round((Date.now() - t0) / 1000), 's', errors.length ? '| errors: ' + errors.slice(0, 3).join(' ; ') : '');
await browser.close();
