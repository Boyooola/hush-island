// Animals that live on the island whether or not anyone is visiting: crabs on the sand, an owl on an old
// dead tree, and Clover the cow, who grazes her way round the meadows by day and beds down at night.
import * as THREE from 'three';
import { shoreRadius, terrainHeight, groundHeight, colliders, clamp, lerp } from './terrain.js';
import { blockedAt } from './path.js';
import { DAY_MS } from './clock.js';
import { Avatar, SPECIES } from './avatar.js';

const roll = (n) => { let x = (Math.floor(n) ^ 0x9e3779b9) >>> 0; x = Math.imul(x ^ (x >>> 16), 0x85ebca6b) >>> 0; x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35) >>> 0; return ((x ^ (x >>> 16)) >>> 0) / 4294967296; };

export function buildCritters(scene, world) {
  const mat = (c, extra = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, flatShading: true, emissive: c, emissiveIntensity: 0.12, ...extra });

  // ---------- crabs ----------
  const crabs = [];
  {
    const shell = mat(0xd9603a), dark = mat(0x1a1410);
    for (let i = 0; i < 8; i++) {
      const a = 0.4 + i * 0.79 + roll(i * 3) * 0.3, r = shoreRadius(a) * (0.93 + roll(i * 5) * 0.035);
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.11, 7, 5), shell); body.scale.set(1.35, 0.5, 1); body.position.y = 0.08; g.add(body);
      const legs = [];
      for (const s of [-1, 1]) {
        for (let k = 0; k < 3; k++) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.02, 0.02), shell); leg.position.set(s * 0.17, 0.05, (k - 1) * 0.06); leg.rotation.z = -s * 0.5; g.add(leg); legs.push(leg); }
        const claw = new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 4), shell); claw.position.set(s * 0.13, 0.1, 0.13); claw.scale.set(1, 0.7, 1.4); g.add(claw);
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.016, 5, 4), dark); eye.position.set(s * 0.04, 0.16, 0.08); g.add(eye);
      }
      g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      scene.add(g);
      crabs.push({ g, legs, hx: Math.cos(a) * r, hz: Math.sin(a) * r, x: Math.cos(a) * r, z: Math.sin(a) * r, yaw: a, dir: 1, turnIn: roll(i) * 4, flee: 0, hide: 0, sink: 0, ph: roll(i * 7) * 6 });
    }
  }

  // ---------- the owl and its dead tree ----------
  const OWL = { x: 0, z: 0, y: 0 };
  let owlHead, owlEyes = [], owlGroup, owlYaw = 0, hootIn = 12, hootT = 9;
  {
    let spot = null;
    for (let i = 0; i < 80 && !spot; i++) {
      const a = -1.5 + roll(i * 3 + 9) * 1.2, r = 15 + roll(i * 5 + 9) * 6, x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (terrainHeight(x, z) > 0.9 && !blockedAt(x, z) && !blockedAt(x + 1, z) && !blockedAt(x - 1, z)) spot = { x, z };
    }
    spot = spot || { x: 12, z: -14 };
    const y = terrainHeight(spot.x, spot.z), bark = mat(0x5a4a40, { emissiveIntensity: 0.05 });
    const snag = new THREE.Group();
    snag.position.set(spot.x, y, spot.z);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.3, 3.4, 6), bark); trunk.position.y = 1.7; trunk.rotation.z = 0.05; snag.add(trunk);
    const branch = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.1, 1.5, 5), bark); branch.position.set(0.6, 2.55, 0); branch.rotation.z = -1.25; snag.add(branch);
    const stub = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.08, 0.8, 5), bark); stub.position.set(-0.3, 3.1, 0.1); stub.rotation.z = 0.7; snag.add(stub);
    snag.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    scene.add(snag);
    colliders.push({ x: spot.x, z: spot.z, r: 0.4 });
    // The owl sits out on the branch.
    const brown = mat(0x8a6a4a), pale = mat(0xd9c7a4), yellow = new THREE.MeshBasicMaterial({ color: 0xffd24a }), black = new THREE.MeshBasicMaterial({ color: 0x15120f });
    owlGroup = new THREE.Group();
    owlGroup.position.set(1.0, 2.8, 0);
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), brown); body.scale.set(1, 1.3, 0.95); body.position.y = 0.25; owlGroup.add(body);
    const chest = new THREE.Mesh(new THREE.SphereGeometry(0.15, 7, 5), pale); chest.scale.set(1, 1.2, 0.5); chest.position.set(0, 0.22, 0.13); owlGroup.add(chest);
    owlHead = new THREE.Group(); owlHead.position.y = 0.55; owlGroup.add(owlHead);
    owlHead.add(new THREE.Mesh(new THREE.SphereGeometry(0.17, 8, 6), brown));
    for (const s of [-1, 1]) {
      const disc = new THREE.Mesh(new THREE.CircleGeometry(0.07, 10), pale); disc.position.set(s * 0.07, 0.02, 0.15); owlHead.add(disc);
      const eye = new THREE.Mesh(new THREE.CircleGeometry(0.045, 10), yellow); eye.position.set(s * 0.07, 0.02, 0.156); owlHead.add(eye);
      const pupil = new THREE.Mesh(new THREE.CircleGeometry(0.022, 8), black); pupil.position.set(s * 0.07, 0.02, 0.16); owlHead.add(pupil);
      owlEyes.push(eye, pupil);
      const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.12, 4), brown); tuft.position.set(s * 0.1, 0.17, 0); tuft.rotation.z = -s * 0.4; owlHead.add(tuft);
    }
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.06, 4), mat(0xd9a03a)); beak.rotation.x = Math.PI / 2 + 0.6; beak.position.set(0, -0.04, 0.17); owlHead.add(beak);
    snag.add(owlGroup);
    Object.assign(OWL, { x: spot.x + 1.0, z: spot.z, y: y + 2.8 });
  }

  // ---------- Clover the cow ----------
  // She walks a ring of open grass, one stop every 45 seconds while it is light, and lies down where dusk finds her.
  // Her place is worked out from the clock, so every visitor finds her in the same spot.
  const cowIndex = SPECIES.findIndex((s) => s.id === 'cow');
  const cow = new Avatar({ species: cowIndex, palette: 0, name: 'Clover', sub: 'lives here' });
  scene.add(cow.group);
  const stops = [];
  for (let k = 0; k < 14; k++) {
    const a = (k / 14) * Math.PI * 2 + 0.2;
    for (const r of [14, 12, 16, 10.5]) {
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      let clear = terrainHeight(x, z) > 0.9;
      for (const [dx, dz] of [[0, 0], [1.1, 0], [-1.1, 0], [0, 1.1], [0, -1.1]]) if (blockedAt(x + dx, z + dz)) clear = false;
      if (clear) { stops.push({ x, z }); break; }
    }
  }
  const SEG = 45000, DAY_SEGS = Math.floor((13.5 / 24) * DAY_MS / SEG), DAWN = (6 / 24) * DAY_MS;
  function cowPlan(now) {
    const day = Math.floor((now - DAWN) / DAY_MS), into = (now - DAWN) - day * DAY_MS;
    const seg = Math.floor(into / SEG), awake = seg < DAY_SEGS;
    const n = day * DAY_SEGS + Math.min(seg, DAY_SEGS - 1), N = stops.length;
    const to = stops[((n % N) + N) % N], from = stops[(((n - 1) % N) + N) % N];
    const walk = Math.hypot(to.x - from.x, to.z - from.z) / 0.85 * 1000;       // milliseconds to stroll between stops
    const k = awake ? clamp((into - seg * SEG) / walk, 0, 1) : 1;
    return { x: lerp(from.x, to.x, k), z: lerp(from.z, to.z, k), yaw: Math.atan2(to.x - from.x, to.z - from.z), moving: k < 1, awake };
  }
  let grazeIn = 3, mooBack = 0;

  const events = { onHoot: null, onMoo: null };
  return {
    events, owl: OWL, cow,
    // dark: 1 at night. rain: 0 to 1. players: everyone on the island, as {x, z}.
    update(dt, t, env) {
      // Crabs sidle about their patch of sand, bolt from anyone who comes close, and dig in if that does not work.
      for (const c of crabs) {
        let near = 9, nx = 0, nz = 0;
        for (const p of env.players) { const d = Math.hypot(p.x - c.x, p.z - c.z); if (d < near) { near = d; nx = p.x; nz = p.z; } }
        if (c.hide > 0) { c.hide -= dt; if (near < 3) c.hide = Math.max(c.hide, 2); }
        else if (near < 2.4) { c.flee += dt; if (c.flee > 1.6) { c.hide = 7; c.flee = 0; } }
        else c.flee = Math.max(0, c.flee - dt);
        const hidden = c.hide > 0 || env.rain > 0.5;
        c.sink = lerp(c.sink, hidden ? 1 : 0, 1 - Math.exp(-dt * 6));
        let speed = 0;
        if (!hidden) {
          if (near < 2.4) {
            const l = Math.max(0.01, near); speed = 2.3;
            c.x += ((c.x - nx) / l) * speed * dt; c.z += ((c.z - nz) / l) * speed * dt;
            c.yaw = Math.atan2(c.x - nx, c.z - nz) + Math.PI / 2;        // crabs run sideways
          } else {
            c.turnIn -= dt;
            if (c.turnIn < 0) { c.turnIn = 1.5 + Math.random() * 4; c.dir = Math.random() < 0.3 ? 0 : (Math.random() < 0.5 ? 1 : -1); if (Math.hypot(c.x - c.hx, c.z - c.hz) > 2.5) c.yaw = Math.atan2(c.hx - c.x, c.hz - c.z) + Math.PI / 2 * c.dir; }
            speed = 0.35 * Math.abs(c.dir);
            c.x += Math.cos(c.yaw) * c.dir * speed * dt; c.z -= Math.sin(c.yaw) * c.dir * speed * dt;
          }
          // Keep to dry sand.
          const h = terrainHeight(c.x, c.z);
          if (h < 0.12 || h > 0.7) { c.x = lerp(c.x, c.hx, 0.08); c.z = lerp(c.z, c.hz, 0.08); }
        }
        c.g.position.set(c.x, terrainHeight(c.x, c.z) - 0.17 * c.sink, c.z);
        c.g.rotation.y = c.yaw;
        c.g.visible = c.sink < 0.97;
        const w = speed > 0 ? Math.sin(t * (speed > 1 ? 40 : 14) + c.ph) * 0.35 : 0;
        c.legs.forEach((leg, i) => { leg.rotation.y = (i % 2 ? w : -w); });
      }

      // The owl: awake at night, watching whoever is nearest; asleep with its eyes shut by day.
      const awake = env.dark > 0.6;
      for (const e of owlEyes) e.scale.y = lerp(e.scale.y, awake ? 1 : 0.08, 1 - Math.exp(-dt * 4));
      let want = 0;
      if (awake && env.players.length) {
        const p = env.players.reduce((a, b) => (Math.hypot(a.x - OWL.x, a.z - OWL.z) < Math.hypot(b.x - OWL.x, b.z - OWL.z) ? a : b));
        if (Math.hypot(p.x - OWL.x, p.z - OWL.z) < 16) want = clamp(Math.atan2(p.x - OWL.x, p.z - OWL.z), -2.4, 2.4);
      }
      owlYaw = lerp(owlYaw, want, 1 - Math.exp(-dt * 3));
      owlHead.rotation.y = owlYaw;
      owlGroup.scale.y = 1 + Math.sin(t * 1.3) * 0.015 + Math.max(0, 0.4 - hootT) * 0.2;
      hootT += dt;
      if (awake && env.rain < 0.4) { hootIn -= dt; if (hootIn < 0) { hootIn = 28 + Math.random() * 30; hootT = 0; if (events.onHoot) events.onHoot(); } }

      // Clover.
      if (cow.parts && cow.parts.quad) {
        const plan = cowPlan(Date.now());
        const px = cow.x, pz = cow.z;
        cow.x = lerp(cow.x, plan.x, 1 - Math.exp(-dt * 4)); cow.z = lerp(cow.z, plan.z, 1 - Math.exp(-dt * 4));
        cow.y = groundHeight(cow.x, cow.z);
        cow.speed = lerp(cow.speed, Math.hypot(cow.x - px, cow.z - pz) / Math.max(dt, 0.001), 0.2);
        if (plan.moving) cow.targetYaw = plan.yaw;
        cow.mode = !plan.awake || env.dark > 0.75 ? 'lie' : 'stand';
        if (cow.mode === 'stand' && !plan.moving && !cow.emote) { grazeIn -= dt; if (grazeIn < 0) { grazeIn = 4 + Math.random() * 7; cow.play('sniff'); } }
        if (mooBack > 0) { mooBack -= dt; if (mooBack <= 0) { cow.play('call'); if (events.onMoo) events.onMoo(); } }
      }
      const md = env.me ? Math.hypot(cow.x - env.me.x, cow.z - env.me.z) : 99;
      cow.bubbleFade = 1 - clamp((md - 9) / 4, 0, 1);
      cow.tag.visible = md < 14;
      cow.update(dt, t);
    },
    // The owl answers a call from close by; so does the cow.
    heard(x, z, dark) {
      if (dark > 0.6 && Math.hypot(x - OWL.x, z - OWL.z) < 14) { hootIn = 1.6; }
      if (Math.hypot(x - cow.x, z - cow.z) < 10 && mooBack <= 0) mooBack = 1.4;
    },
    moo() { if (mooBack <= 0) mooBack = 0.7; },
    get crabs() { return crabs.map((c) => ({ x: c.x, z: c.z, hidden: c.sink > 0.5 })); },
    stops,
  };
}
