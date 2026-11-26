// The shy animals of Lantern Rock. Nothing here can be caught or chased down: a hare bolts from anything that
// comes at it and a seal slides into the sea. What works is the opposite of hurrying. Sit still on the meadow
// and a hare will come to look at you; call to the seals from a distance and one will answer.
import * as THREE from 'three';
import { HILL, ISLET, terrainHeight, tideAt } from './terrain.js';
import { loadProps } from './props.js';
import { timeNow } from './now.js';

export function buildShy(scene, pools = []) {
  const hares = [0, 1, 2, 3].map((i) => { const a = i * 1.7 + 0.6, r = 15 + i * 3.2; return { x: HILL.x + Math.cos(a) * r, z: HILL.z + Math.sin(a) * r, yaw: i * 2, g: null, state: 'graze', tx: 0, tz: 0, hop: 0, nextHop: 2 + i, still: 0 }; });
  const seals = [[4.6, 3.2, 0.5], [-1.2, 5.6, 2.2], [5.6, -2.4, -0.6]].map(([dx, dz, yaw]) => ({ hx: ISLET.x + dx, hz: ISLET.z + dz, x: ISLET.x + dx, z: ISLET.z + dz, yaw, g: null, away: 0, back: 0, bark: 0 }));
  // Crabs by the rock pools: out on the mud when the tide is off it, sideways and away from anything that comes close.
  const crabs = pools.flatMap((q, i) => [0, 1].map((k) => ({ x: q.x + Math.cos(i * 2.1 + k * 2.6) * 1.9, z: q.z + Math.sin(i * 2.1 + k * 2.6) * 1.9, hx: q.x, hz: q.z, yaw: i + k * 2, g: null, run: 0, dx: 0, dz: 0, wait: 1 + i + k, down: 0 })));
  const events = { onCrab: null, onHare: null, onSealBark: null, onBolt: null, onSlip: null };
  loadProps().then((make) => {
    if (!make || !make('hare')) return;
    for (const h of hares) { h.g = make('hare'); h.g.scale.setScalar(1.15); scene.add(h.g); }
    for (const s of seals) { s.g = make('seal'); s.g.scale.setScalar(1.1); scene.add(s.g); }
    if (make('crab')) for (const c of crabs) { c.g = make('crab'); c.g.scale.setScalar(1.5); c.g.traverse((o) => { if (o.isMesh) o.castShadow = false; }); scene.add(c.g); }
  });
  const turn = (g, yaw, k) => { let d = yaw - g.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d)); g.rotation.y += d * k; };
  return {
    hares, seals, crabs, events,
    // who: everyone on the island as { x, z, speed, resting } with the visitor first.
    update(dt, t, who, dark) {
      const meNow = who[0];
      for (const h of hares) {
        if (!h.g) continue;
        let near = null, nd = 1e9;
        for (const w of who) { const d = Math.hypot(w.x - h.x, w.z - h.z); if (d < nd) { nd = d; near = w; } }
        const moving = near && near.speed > 0.4;
        if (h.state !== 'bolt' && near && (nd < 4.2 && moving || nd < 9 && near.speed > 3.2 || nd < 2.2 && h.state !== 'come' && h.state !== 'sit')) {
          // Off like a shot, away from whoever it was, to somewhere else on the meadow.
          const a = Math.atan2(h.z - near.z, h.x - near.x) + (Math.random() - 0.5) * 1.2; let tx = h.x + Math.cos(a) * 19, tz = h.z + Math.sin(a) * 19;
          const fromHill = Math.hypot(tx - HILL.x, tz - HILL.z); if (fromHill > 27) { tx = HILL.x + (tx - HILL.x) / fromHill * 24; tz = HILL.z + (tz - HILL.z) / fromHill * 24; }
          h.state = 'bolt'; h.tx = tx; h.tz = tz; h.still = 0; if (near === meNow && events.onBolt) events.onBolt();
        }
        if (h.state === 'bolt' || h.state === 'come') {
          const dx = h.tx - h.x, dz = h.tz - h.z, d = Math.hypot(dx, dz), sp = h.state === 'bolt' ? 9 : 1.6;
          if (d < 0.4) h.state = h.state === 'bolt' ? 'graze' : 'sit';
          else { h.x += dx / d * sp * dt; h.z += dz / d * sp * dt; h.hop += dt * (h.state === 'bolt' ? 13 : 7); turn(h.g, Math.atan2(dx, dz), 1 - Math.exp(-dt * 12)); }
          if (h.state === 'sit' && events.onHare) events.onHare();
        } else if (h.state === 'sit') {
          turn(h.g, Math.atan2(meNow.x - h.x, meNow.z - h.z), 1 - Math.exp(-dt * 3));
          if (meNow.speed > 0.4 || Math.hypot(meNow.x - h.x, meNow.z - h.z) > 4) h.state = 'graze';
        } else {
          // Grazing: a hop now and then; an eye on whoever is nearest. Somebody who has been still long enough is worth a look.
          h.nextHop -= dt;
          if (h.nextHop < 0) { h.nextHop = 3 + Math.random() * 5; const a = Math.random() * 6.28; h.tx = h.x + Math.cos(a) * 1.4; h.tz = h.z + Math.sin(a) * 1.4; if (Math.hypot(h.tx - HILL.x, h.tz - HILL.z) < 27 && Math.hypot(h.tx - HILL.x, h.tz - HILL.z) > 9) { h.x = h.tx; h.z = h.tz; h.hop = 0.01; h.g.rotation.y = Math.atan2(Math.cos(a), Math.sin(a)); } }
          if (h.hop > 0) h.hop += dt * 9; if (h.hop > Math.PI) h.hop = 0;
          const d = Math.hypot(meNow.x - h.x, meNow.z - h.z);
          if (d < 14 && nd < 14) turn(h.g, Math.atan2(near.x - h.x, near.z - h.z), 1 - Math.exp(-dt * 2));
          if (d < 13 && d > 2.5 && meNow.speed < 0.1 && meNow.resting && who.every((w) => w === meNow || Math.hypot(w.x - h.x, w.z - h.z) > 6 || w.speed < 0.1)) h.still += dt; else h.still = 0;
          if (h.still > 22 && !hares.some((o) => o.state === 'come' || o.state === 'sit')) { const a = Math.atan2(h.z - meNow.z, h.x - meNow.x); h.state = 'come'; h.tx = meNow.x + Math.cos(a) * 1.5; h.tz = meNow.z + Math.sin(a) * 1.5; h.still = 0; }
        }
        const up = h.state === 'bolt' || h.state === 'come' ? Math.abs(Math.sin(h.hop)) * (h.state === 'bolt' ? 0.45 : 0.16) : Math.sin(Math.min(Math.PI, h.hop)) * 0.14;
        h.g.position.set(h.x, terrainHeight(h.x, h.z) + up, h.z);
      }
      const sea = tideAt(timeNow()).y;
      for (const c of crabs) {
        if (!c.g) continue;
        const gy = terrainHeight(c.x, c.z), wet = sea > gy + 0.02;
        c.down += ((wet ? 1 : 0) - c.down) * (1 - Math.exp(-dt * 1.5));
        let nd = 1e9, near = null; for (const w of who) { const d = Math.hypot(w.x - c.x, w.z - c.z); if (d < nd) { nd = d; near = w; } }
        if (!wet && c.run <= 0 && nd < 3.2) { const a = Math.atan2(c.z - near.z, c.x - near.x) + (Math.random() - 0.5); c.dx = Math.cos(a); c.dz = Math.sin(a); c.run = 0.9; if (near === meNow && events.onCrab) events.onCrab(); }
        else if (!wet && c.run <= 0) { c.wait -= dt; if (c.wait < 0) { c.wait = 2 + Math.random() * 5; const a = Math.random() * 6.28; c.dx = Math.cos(a) * 0.25; c.dz = Math.sin(a) * 0.25; c.run = 0.7; } }
        if (c.run > 0) {
          c.run -= dt; const sp = 3.2; let nx = c.x + c.dx * sp * dt, nz = c.z + c.dz * sp * dt;
          if (Math.hypot(nx - c.hx, nz - c.hz) > 7) { nx = c.x; nz = c.z; c.run = 0; }
          c.x = nx; c.z = nz; c.yaw = Math.atan2(c.dx, c.dz) + Math.PI / 2;      // crabs go sideways
        }
        c.g.visible = c.down < 0.96;
        c.g.position.set(c.x, terrainHeight(c.x, c.z) - c.down * 0.22 + (c.run > 0 ? Math.abs(Math.sin(t * 30)) * 0.015 : 0), c.z); c.g.rotation.y = c.yaw;
      }
      for (const s of seals) {
        if (!s.g) continue;
        let nd = 1e9; for (const w of who) nd = Math.min(nd, Math.hypot(w.x - s.hx, w.z - s.hz));
        if (!s.away && nd < 6.5) { s.away = 1; s.back = 40; if (events.onSlip && Math.hypot(meNow.x - s.hx, meNow.z - s.hz) < 7) events.onSlip(); }
        if (s.away) { if (nd > 13) s.back -= dt; if (s.back <= 0) s.away = 0; }
        const out = s.away ? 1 : 0, ox = s.hx - ISLET.x, oz = s.hz - ISLET.z, ol = Math.hypot(ox, oz) || 1, k = 1 - Math.exp(-dt * 1.6);
        const wx = s.hx + ox / ol * 8 * out, wz = s.hz + oz / ol * 8 * out;
        s.x += (wx - s.x) * k; s.z += (wz - s.z) * k;
        const gone = Math.hypot(s.x - s.hx, s.z - s.hz) / 8;
        s.bark = Math.max(0, s.bark - dt);
        s.g.position.set(s.x, Math.max(terrainHeight(s.x, s.z), sea - 0.22) - gone * 1.3 + Math.sin(t * 1.1 + s.hx) * 0.015, s.z);
        s.g.rotation.set(s.bark > 0 ? -0.22 * Math.sin(s.bark * 9) ** 2 : 0, s.yaw + gone * 2.6, 0);
        s.g.visible = gone < 0.97;
      }
    },
    // A call from somewhere not too close: the nearest seal still hauled out lifts its head and answers.
    heard(x, z) {
      const s = seals.filter((q) => !q.away).sort((p, q) => Math.hypot(p.hx - x, p.hz - z) - Math.hypot(q.hx - x, q.hz - z))[0];
      if (!s) return false;
      const d = Math.hypot(s.hx - x, s.hz - z);
      if (d > 34 || d < 6.5) return false;
      setTimeout(() => { s.bark = 1.4; if (events.onSealBark) events.onSealBark(s); }, 900);
      return true;
    },
  };
}
