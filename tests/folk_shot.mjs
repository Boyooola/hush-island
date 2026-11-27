import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
await ctx.route((u) => u.hostname !== 'localhost', (r) => r.abort());
const p = await ctx.newPage(); p.setDefaultTimeout(150000); p.on('pageerror', (e) => console.log('ERR', e.message));
await p.goto('http://localhost:8787/far', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(3500);
await p.evaluate(() => { const e = window.__ember; e.lockQuality(); e.idleAfter = 3600000; e.setHour(11); e.setRain(0); e.setFog(false); document.querySelector('#pick-animal button:nth-child(1)').click(); document.querySelector('#enter').click(); });
await p.waitForTimeout(7000);
await p.addStyleTag({ content: 'body > *:not(canvas){opacity:0!important}' });
const who = (process.argv[2] || 'forager,gardener,beachcomber,castaway,pedlar,mapmaker,hermit,heron').split(',');
for (const k of who) {
  const at = await p.evaluate((k) => window.__ember.wide.whoAt(k), k); if (!at) { console.log('no', k); continue; }
  for (const [i, ang] of [[0, 0.9], [1, 2.6]]) {
    await p.evaluate(([at, ang, tall]) => { const e = window.__ember; e.teleport(at.x + Math.cos(ang + 2.2) * 9, at.z + Math.sin(ang + 2.2) * 9, 0); setTimeout(() => { const y = e.me.y; const q = window.__ember.wide.whoAt(window.__k) || at; e.cutTo([q.x + Math.cos(ang) * 3.4 * tall, y + 1.3 * tall, q.z + Math.sin(ang) * 3.4 * tall], [q.x, y + 0.75 * tall, q.z], 30); }, 600); }, [at, ang, k === 'heron' || k === 'pedlar' ? 1.7 : 1]);
    await p.evaluate((k) => { window.__k = k; }, k);
    await p.waitForTimeout(4500); await p.screenshot({ path: `/home/claude/ember-isle/shots/fk_${k}_${i}a.png` });
    await p.waitForTimeout(2500); await p.screenshot({ path: `/home/claude/ember-isle/shots/fk_${k}_${i}b.png` });
  }
}
await browser.close();
