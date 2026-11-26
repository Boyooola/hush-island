// look.mjs <far|home> name:x,y,z:lx,ly,lz[:px,pz] ...  — camera shots at given positions (y relative to ground at look point when prefixed with +)
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
await ctx.route((u) => u.hostname !== 'localhost', (r) => r.abort());
const p = await ctx.newPage(); p.setDefaultTimeout(150000); p.on('pageerror', (e) => console.log('ERR', e.message));
await p.goto('http://localhost:8787/' + (process.argv[2] === 'far' ? 'far' : ''), { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(3500);
await p.evaluate(() => { const e = window.__ember; e.lockQuality(); e.idleAfter = 3600000; e.setHour(11); e.setRain(0); if (e.setFog) e.setFog(false); document.querySelector('#pick-animal button:nth-child(1)').click(); document.querySelector('#enter').click(); });
await p.waitForTimeout(6000);
if (process.env.PRE) console.log(JSON.stringify(await p.evaluate(process.env.PRE)));
const REF = process.env.REF ? await p.evaluate(process.env.REF) : [0, 0];
for (const spec of process.argv.slice(3)) {
  const [name, pos, look, at] = spec.split(':'); const P = pos.split(',').map(Number), L = look.split(',').map(Number), A = (at || look).split(',').map(Number); P[0] += REF[0]; P[2] += REF[1]; L[0] += REF[0]; L[2] += REF[1]; A[0] += REF[0]; A[A.length > 2 ? 2 : 1] += REF[1];
  await p.evaluate(([P, L, A]) => { const e = window.__ember; e.teleport(A[0], A.length > 2 ? A[2] : A[1], 0); setTimeout(() => { const gy = e.me.y; e.cutTo([P[0], gy + P[1], P[2]], [L[0], gy + L[1], L[2]], 9); }, 700); }, [P, L, A]);
  await p.waitForTimeout(5200); await p.screenshot({ path: `/home/claude/ember-isle/shots/${name}.png` }); await p.waitForTimeout(5000);
}
await browser.close();
