// What makes Lantern Rock feel lived on: small birds that scatter, a trader's boat that calls in on some days, a
// rainbow after rain and puddles on the paths, what the tide leaves on the flats each day, things that are only
// there at night, ropes that make a long way short, a see-saw, a way of saying "follow me", and the seasons.
import * as THREE from 'three';
import { terrainHeight, groundHeight, colliders, mulberry32, clamp, lerp, smoothstep, PATHS, HILL, FLATS, ORCHARD, SHELTER, DOCK, LEDGE, POOL, COTTAGE, WATCH, COVE, HOLLOW_TREE, WOODS, tideAt, TIDE, pathAmount, SPAWN, LEAP, STEPS, STEP_GAP, BOOST, TUNNEL } from './terrain.js';
import { loadProps } from './props.js';
import { ITEMS } from './items.js';

const day = () => Math.floor((Date.now() - new Date().getTimezoneOffset() * 60000) / 86400000);      // the visitor's own day, not the clock at Greenwich
const FLOCKS = [[HILL.x - 6, HILL.z + 14], [-150, 136], [ORCHARD.x - 3, ORCHARD.z - 9], [-56, -70], [SHELTER.x + 14, SHELTER.z + 10], [-120, -2], [-228, 122], [-30, 20]];
export const ROPES = [
  { id: 'r-summit', top: { x: LEDGE.x + 1.6, z: LEDGE.z + 2.6 }, foot: { x: POOL.x - 14, z: POOL.z - 15 }, name: 'from the ledge down into Stillwater' },
  { id: 'r-point', top: { x: COTTAGE.x + 9, z: COTTAGE.z - 12 }, foot: { x: SHELTER.x + 14, z: SHELTER.z + 16 }, name: 'from the point down to the Far Beach' },
  { id: 'r-watch', top: { x: WATCH.x - 5.5, z: WATCH.z - 6 }, foot: { x: COVE.x - COVE.ox * 5.5, z: COVE.z - COVE.oz * 5.5 }, name: 'from the watchtower down to the cove' },
];
const GLOW = [[HOLLOW_TREE.x - 4, HOLLOW_TREE.z + 5], [WOODS.x - 22, WOODS.z + 16], [WOODS.x + 8, WOODS.z + 24]].map(([x, z]) => ({ x, z }));
const SEESAW = { x: ORCHARD.x + 13, z: ORCHARD.z - 12, ry: 0.5 };
const TRADER = { x: DOCK.x0 - 2.4, z: -6.4, bx: DOCK.x0 + 7.5, bz: -8.5 };

export function buildAlive(api, W) {
  const { scene, me, addLog, flash, audio, give, inv } = api, S = W.S, save = W.save, near = W.near;
  const dark = () => api.sky().dark, now = () => Date.now();
  if (!Array.isArray(S.ropes)) S.ropes = [];
  if (!S.tide || S.tide.day !== day()) S.tide = { day: day(), got: [] };
  if (!S.glow || S.glow.night !== Math.floor((now() - 43200000) / 86400000)) S.glow = { night: Math.floor((now() - 43200000) / 86400000), got: [] };
  const traderIn = () => day() % 3 === 0 || /[?&]trader/.test(location.search);
  const starNight = () => new Date().getDay() === 6 || /[?&]stars/.test(location.search);
  W.traderIn = traderIn; W.starNight = starNight;

  // ---------- small birds on the ground ----------
  const birds = [], flocks = FLOCKS.map(([x, z], i) => ({ x, z, i, up: 0, hx: x, hz: z }));
  let birdMesh = null; const dummy = new THREE.Object3D();
  // ---------- what the tide leaves ----------
  const tideFinds = (() => { const r = mulberry32(day() * 97 + 11), kinds = ['shell', 'whelk', 'seaglass', 'shell', 'whelk', 'moonshell', 'seaglass', 'conch'], out = []; let tries = 0; while (out.length < 7 && tries++ < 300) { const a = r() * 6.28, d = 6 + r() * 26, x = FLATS.x + Math.cos(a) * d, z = FLATS.z + Math.sin(a) * d, h = terrainHeight(x, z); if (h < 0.2 || h > TIDE.flat + 0.2) continue; out.push({ i: out.length, x, z, kind: kinds[Math.floor(r() * (out.length < 5 ? 5 : kinds.length))], g: null }); } return out; })();
  // ---------- ropes ----------
  const ropeMesh = new Map(); let ride = null;
  const tied = (r) => S.ropes.includes(r.id);
  // ---------- follow me ----------
  const trails = new Map(); let trailPts = null;
  // ---------- rain ----------
  let wetness = 0, bow = null, bowUntil = 0, wasRain = false, puddles = null; const puddleAt = [];
  { const r = mulberry32(51); for (const p of PATHS) for (let i = 0; i < p.length - 1; i++) { const n = Math.floor(Math.hypot(p[i + 1][0] - p[i][0], p[i + 1][1] - p[i][1]) / 26); for (let k = 0; k < n; k++) { const u = (k + r()) / n, x = lerp(p[i][0], p[i + 1][0], u) + (r() - 0.5) * 2, z = lerp(p[i][1], p[i + 1][1], u) + (r() - 0.5) * 2; if (terrainHeight(x, z) > 0.9 && puddleAt.length < 40) puddleAt.push({ x, z, s: 0.7 + r() * 0.9 }); } } }
  let trader = null, seesaw = null, plank = null, onSaw = 0, gapPlank = null, holdingPlank = false;
  const PLANKS_AT = { x: STEPS[0].x - (STEP_GAP.x - STEPS[0].x) * 0.42, z: STEPS[0].z - (STEP_GAP.z - STEPS[0].z) * 0.42 }, GAP_EDGE = STEPS[7];
  if (S.gapPlank) STEPS.push({ ...STEP_GAP });
  const tunnelOpen = () => !!(W.pz && W.pz.done('sluice'));

  loadProps().then((make) => {
    if (!make) return;
    const quiet = (m) => { if (!m) return null; m.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.userData.noShadow = true; } }); return m; };
    { // Small birds are a few flat-shaded triangles each: there are dozens, and nobody gets close.
      const g = new THREE.BufferGeometry(), v = [0, 0.1, 0.16, -0.07, 0.06, -0.06, 0.07, 0.06, -0.06, 0, 0.1, 0.16, 0.07, 0.06, -0.06, 0, 0.16, -0.04, 0, 0.1, 0.16, 0, 0.16, -0.04, -0.07, 0.06, -0.06, -0.07, 0.06, -0.06, 0, 0.16, -0.04, 0.07, 0.06, -0.06, -0.05, 0.11, 0, -0.26, 0.13, -0.05, -0.05, 0.11, -0.1, 0.05, 0.11, 0, 0.05, 0.11, -0.1, 0.26, 0.13, -0.05, 0, 0.1, -0.05, -0.04, 0.09, -0.2, 0.04, 0.09, -0.2];
      g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); g.computeVertexNormals();
      const r = mulberry32(7); for (const f of flocks) for (let k = 0; k < 6; k++) birds.push({ f, ox: (r() - 0.5) * 5, oz: (r() - 0.5) * 5, ph: r() * 6, s: 1.3 + r() * 0.5 });
      birdMesh = new THREE.InstancedMesh(g, new THREE.MeshStandardMaterial({ color: 0x6f6254, roughness: 1, flatShading: true, side: THREE.DoubleSide }), birds.length); birdMesh.frustumCulled = false; birdMesh.userData.noShadow = true; scene.add(birdMesh); }
    for (const t of tideFinds) { const g = quiet(make(ITEMS[t.kind].model)); if (!g) continue; g.position.set(t.x, terrainHeight(t.x, t.z) + 0.02, t.z); g.rotation.y = t.x; g.scale.setScalar(1.5); g.visible = false; scene.add(g); t.g = g; }
    for (const g of GLOW) { g.m = []; for (let i = 0; i < 4; i++) { const m = quiet(make('glow_mushrooms')); if (!m) break; m.traverse((o) => { if (o.isMesh && /cap/.test(o.material.name)) { o.material.emissive.set(0x9fe8d0); o.material.emissiveIntensity = 1.4; } }); const x = g.x + Math.cos(i * 1.7) * 1.1, z = g.z + Math.sin(i * 1.7) * 1.1; m.position.set(x, terrainHeight(x, z), z); m.scale.setScalar(1.5); m.visible = false; scene.add(m); g.m.push(m); } }
    const ropeMat = new THREE.MeshStandardMaterial({ color: 0xb09a6a, roughness: 1 });
    for (const r of ROPES) { for (const e of [r.top, r.foot]) { const p = W.one('rope_post'); p.position.set(e.x, groundHeight(e.x, e.z), e.z); scene.add(p); colliders.push({ x: e.x, z: e.z, r: 0.3 }); } const a = new THREE.Vector3(r.top.x, groundHeight(r.top.x, r.top.z) + 1.5, r.top.z), b = new THREE.Vector3(r.foot.x, groundHeight(r.foot.x, r.foot.z) + 1.5, r.foot.z), mid = a.clone().lerp(b, 0.5); mid.y -= a.distanceTo(b) * 0.05; const m = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([a, mid, b]), 24, 0.045, 5), ropeMat); m.userData.noShadow = true; m.visible = tied(r); scene.add(m); ropeMesh.set(r.id, m); r.a = a; r.b = b; r.len = a.distanceTo(b); }
    { seesaw = W.one('seesaw', 'seesaw_plank'); plank = W.one('seesaw_plank'); if (seesaw && plank) { seesaw.position.set(SEESAW.x, terrainHeight(SEESAW.x, SEESAW.z), SEESAW.z); seesaw.rotation.y = SEESAW.ry; plank.position.y = 0.6; plank.rotation.z = 0.2; seesaw.add(plank); scene.add(seesaw); colliders.push({ x: SEESAW.x, z: SEESAW.z, r: 0.5 }); } }
    { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(240 * 3), 3)); g.setDrawRange(0, 0); trailPts = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffe08a, size: 0.22, transparent: true, opacity: 0.9, fog: false, toneMapped: false, depthWrite: false })); trailPts.frustumCulled = false; scene.add(trailPts); }
    { const rock = new THREE.MeshStandardMaterial({ color: 0x4a4752, roughness: 0.9, flatShading: true }), h = LEAP.y + 6, m = new THREE.Mesh(new THREE.CylinderGeometry(LEAP.r, LEAP.r * 1.25, h, 7), rock); m.position.set(LEAP.x, LEAP.y - h / 2, LEAP.z); m.userData.noShadow = true; scene.add(m); const nestM = W.one('sea_chest'); if (nestM) { nestM.position.set(LEAP.x + 0.5, LEAP.y, LEAP.z + 0.3); nestM.rotation.y = 1; scene.add(nestM); } }
    { gapPlank = W.one('plank'); if (gapPlank) { gapPlank.position.set(STEP_GAP.x, STEP_GAP.y - 0.04, STEP_GAP.z); gapPlank.rotation.y = Math.atan2(STEP_GAP.x - GAP_EDGE.x, STEP_GAP.z - GAP_EDGE.z); gapPlank.scale.set(1.5, 1, 1.05); gapPlank.visible = !!S.gapPlank; scene.add(gapPlank); } for (let i = 0; i < 2; i++) { const g = W.one('plank'); if (g) { g.position.set(PLANKS_AT.x + i * 0.5, terrainHeight(PLANKS_AT.x, PLANKS_AT.z) + 0.05 + i * 0.1, PLANKS_AT.z + i * 0.3); g.rotation.y = 0.8 + i * 0.2; scene.add(g); } } }
    for (const k of ['a', 'b']) { const e = TUNNEL[k], o = TUNNEL[k === 'a' ? 'b' : 'a'], g = W.one('cave_mouth'); if (!g) continue; g.scale.setScalar(0.3); g.position.set(e.x, terrainHeight(e.x, e.z) - 0.1, e.z); g.rotation.y = Math.atan2(e.x - o.x, e.z - o.z); scene.add(g); for (const sd of [-1, 1]) colliders.push({ x: e.x + Math.cos(g.rotation.y) * sd * 1.7, z: e.z - Math.sin(g.rotation.y) * sd * 1.7, r: 0.8 }); }
    { const g = W.one('boost_rock'); if (g) { g.position.set(BOOST.x, BOOST.y - 3.02, BOOST.z); scene.add(g); for (let i = 0; i < 8; i++) colliders.push({ x: BOOST.x + Math.cos(i * 0.785) * 2.35, z: BOOST.z + Math.sin(i * 0.785) * 2.35, r: 0.85 }); const c = W.one('sea_chest'); if (c) { c.position.set(BOOST.x - 0.5, BOOST.y, BOOST.z - 0.4); c.rotation.y = 0.6; scene.add(c); } } }
    { puddles = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 9), new THREE.MeshStandardMaterial({ color: 0x6f95a3, roughness: 0.12, metalness: 0.2, transparent: true, opacity: 0.75 }), puddleAt.length); puddles.frustumCulled = false; puddles.userData.noShadow = true; puddles.visible = false; scene.add(puddles); }
    { bow = new THREE.Group(); const cols = [0xd94a4a, 0xe89a3c, 0xe8d94a, 0x5fb85f, 0x4a8fd9, 0x7a5fc8]; cols.forEach((c, i) => { const m = new THREE.Mesh(new THREE.TorusGeometry(150 - i * 2.4, 1.2, 4, 48, Math.PI), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0, fog: false, depthWrite: false, toneMapped: false })); bow.add(m); }); bow.visible = false; scene.add(bow); }
  });

  W.extra.push((key, f, opts) => {
    if (key) return;
    if (ride) return;
    const tf = tideFinds.find((t) => !S.tide.got.includes(t.i) && t.g && t.g.visible && near(t, 2)); if (tf) opts.unshift({ label: 'Pick up what the tide left', run: () => { S.tide.got.push(tf.i); save(); tf.g.visible = false; give(tf.kind, 1); api.playEmote('sniff'); api.questEvent('tidefind'); } });
    const gl = GLOW.find((g, i) => dark() > 0.55 && !S.glow.got.includes(i) && near(g, 2.4)); if (gl) opts.unshift({ label: 'Pick the glowing caps', run: () => { S.glow.got.push(GLOW.indexOf(gl)); save(); for (const m of gl.m) m.visible = false; give('glowcap', 2); api.questEvent('glowcap'); } });
    for (const r of ROPES) {
      if (tied(r)) { if (near(r.top, 2.4)) opts.unshift({ label: 'Slide down the rope', run: () => startRide(r, true) }); else if (near(r.foot, 2.4)) opts.unshift({ label: 'Go up by the rope', run: () => startRide(r, false) }); }
      else if (near(r.top, 2.6)) opts.push({ label: 'Tie a rope to the post', run: () => { if (!(inv.rope > 0)) { addLog('', `A post with an iron ring, and another like it a long way below. A rope would go ${r.name}. The Beachcomber swaps for rope, and there is some in the keeper's cellar and on the ledge behind the summit.`, 'sys'); return; } inv.rope--; api.store('ember.inv', inv); S.ropes.push(r.id); save(); ropeMesh.get(r.id).visible = true; audio.pop(640); flash('A rope is tied', 'A long way made short'); addLog('', `You make it fast and throw the coil over. It runs out ${r.name}. Anybody you bring can use it. So can you, both ways.`, 'sys'); api.questEvent('rope'); } });
      else if (near(r.foot, 2.6)) opts.push({ label: 'Look at the post', low: true, run: () => addLog('', 'A post with an iron ring. There is another like it high above. Nothing joins them yet. A rope would have to be tied at the top.', 'sys') });
    }
    { const onTop = Math.hypot(me.x - LEAP.x, me.z - LEAP.z) < LEAP.r, atEdge = near({ x: LEAP.fx, z: LEAP.fz }, 2.6), hoof = /deer|stag/.test(api.species().id);
      if (onTop) { opts.unshift({ label: 'Leap back to the cliff', run: () => { me.x = LEAP.fx; me.z = LEAP.fz; api.moveStop(); api.playEmote('hop'); } }); if (!S.leap) opts.unshift({ label: 'Open the sea chest', run: () => { S.leap = 1; save(); give('moonshell', 1, true); give('feather', 3, true); audio.pop(700); addLog('', 'Nobody has opened this in a long time. Nobody could get to it. A moon shell and three feathers, into the satchel.', 'sys'); api.questEvent('leapt'); } }); }
      else if (atEdge) opts.push({ label: 'Leap across to the pinnacle', run: () => { if (!hoof) { api.playEmote('hop'); addLog('', 'You gather yourself, look at the drop, and think better of it. It is a deer\'s jump, or a stag\'s. There is a chest over there.', 'sys'); return; } me.targetYaw = Math.atan2(LEAP.x - me.x, LEAP.z - me.z); api.playEmote('hop'); setTimeout(() => { me.x = LEAP.x; me.z = LEAP.z; api.moveStop(); }, 350); addLog('', 'Four hooves off the edge, a long moment with nothing under you, and rock again.', 'sys'); } }); }
    // A plank across the missing column of the Giant's Steps.
    if (!S.gapPlank) { if (holdingPlank && near(GAP_EDGE, 1.8)) opts.unshift({ label: 'Lay the plank across the gap', run: () => { holdingPlank = false; S.gapPlank = 1; save(); STEPS.push({ ...STEP_GAP }); if (gapPlank) gapPlank.visible = true; audio.pop(600); api.playEmote('paw'); flash('A plank is laid', 'The Steps go all the way out'); addLog('', 'It drops across the gap and sits there as if it had been cut for it. The Steps go all the way out to the nest now, for you and whoever comes with you.', 'sys'); api.questEvent('plank'); } }); else if (!holdingPlank && near(PLANKS_AT, 2.6)) opts.unshift({ label: 'Take up a plank', run: () => { holdingPlank = true; api.playEmote('paw'); addLog('', 'You get it by the middle. It is long and it wants to go its own way. One of the columns out on the Steps is missing.', 'sys'); } }); else if (!holdingPlank && near(GAP_EDGE, 1.8)) opts.push({ label: 'Look at the gap', run: () => addLog('', 'One column is gone, and the sea is a long way down between the two that are left. Too far to step. Something laid across would do it. There are planks on the cliff where the Steps begin.', 'sys') }); }
    // The Gardener's tunnel, from the foot of the falls out to the south shore.
    for (const k of ['a', 'b']) if (near(TUNNEL[k], 3)) { const o = TUNNEL[k === 'a' ? 'b' : 'a']; if (!tunnelOpen()) opts.push({ label: 'Look into the hole', run: () => addLog('', 'A hole as wide as a mole with his elbows out, going into the hill, stopped up a little way in with packed earth. Somebody shut it from inside. The Gardener would know who.', 'sys') }); else opts.unshift({ label: 'Go through the Gardener\'s tunnel', run: () => { api.moveStop(); api.playEmote('sniff'); addLog('', 'In on your belly. Dark, roots in your face, and the sound of your own breathing. Then a round of daylight, getting bigger.', 'sys'); goDark(2300); setTimeout(() => { const d = Math.hypot(o.x - TUNNEL[k].x, o.z - TUNNEL[k].z), ux = (TUNNEL[k].x - o.x) / d, uz = (TUNNEL[k].z - o.z) / d; api.restAt(o.x - ux * 2.6, o.z - uz * 2.6, Math.atan2(-ux, -uz), 'stand'); api.questEvent('tunnel'); if (!S.tunnelled) { S.tunnelled = 1; save(); flash('The Gardener\'s tunnel', k === 'a' ? 'Stillwater to the south shore' : 'The south shore to Stillwater'); } }, 1700); } }); }
    // The block on the south cliffs: up off somebody's back, or not at all.
    { const onTop = Math.hypot(me.x - BOOST.x, me.z - BOOST.z) < BOOST.r + 0.4; if (onTop) { opts.unshift({ label: 'Jump down', run: () => { api.restAt(BOOST.fx, BOOST.fz + 0.6, 0, 'stand'); api.playEmote('hop'); } }); if (!S.boost) opts.unshift({ label: 'Open the sea chest', run: () => { S.boost = 1; save(); give('pearl', 1, true); give('conch', 1, true); audio.pop(700); addLog('', 'It has been up here since before the storm. A moon pearl and a conch, into the satchel.', 'sys'); } }); } else if (near({ x: BOOST.fx, z: BOOST.fz }, 2.4)) { const helper = [...api.peers.values()].find((p) => p.fade > 0.5 && Math.hypot(p.av.x - BOOST.fx, p.av.z - BOOST.fz) < 3); opts.push({ label: helper ? `Climb up off ${helper.data.name}'s back` : 'Try to get up on the rock', run: () => { api.playEmote('hop'); if (!helper) { addLog('', 'You jump, scrabble, and slide back down. It is half again too high. With somebody standing here to climb on, you would be up. There is a chest on top.', 'sys'); return; } setTimeout(() => { me.x = BOOST.x; me.z = BOOST.z; api.moveStop(); api.pushPresence(); }, 350); api.tell('boost', 1); addLog('', `Front paws on ${helper.data.name}'s shoulders, a shove from below, and you are up.`, 'sys'); api.questEvent('boosted'); } }); } }
    if (seesaw && near(SEESAW, 3.4)) opts.push({ label: 'Get on the see-saw', run: () => { const c = Math.cos(SEESAW.ry), s = Math.sin(SEESAW.ry), side = (me.x - SEESAW.x) * c - (me.z - SEESAW.z) * s > 0 ? 1 : -1; api.restAt(SEESAW.x + c * 2.1 * side, SEESAW.z - s * 2.1 * side, SEESAW.ry + (side > 0 ? -Math.PI / 2 : Math.PI / 2), 'sit'); onSaw = side; addLog('', 'Your end goes down, and stays down. It wants somebody on the other end.', 'sys'); } });
    if ([...api.peers.values()].some((p) => p.fade > 0.5)) opts.push({ label: 'Call "follow me"', side: true, low: true, run: () => { api.tell('follow', 1); api.playEmote('call'); addLog('', 'For a minute you leave a trail of sparks that the others can see.', 'sys'); } });
    if (W.sheep && api.species().id === 'wolf' && Math.hypot(me.x - HILL.x, me.z - HILL.z) < 40) opts.push({ label: 'Howl the flock together', low: true, run: () => { api.playEmote('call'); for (const s of W.sheep) if (!s.lamb) { s.tx = me.x + (Math.random() - 0.5) * 6; s.tz = me.z + (Math.random() - 0.5) * 6; s.wait = 9; s.run = 2.5; } addLog('', 'Every head on the meadow comes up at once. Then they come to you, fast, because the alternative is worse.', 'sys'); } });
  });
  function startRide(r, down) { ride = { r, down, t0: performance.now(), secs: down ? clamp(r.len / 16, 2.5, 7) : clamp(r.len / 7, 5, 14) }; api.moveStop(); audio.whoosh && audio.whoosh(); api.questEvent(down ? 'slid' : 'climbed'); }
  W.riding = () => !!ride;
  W.rideY = () => (ride && ride.y !== undefined ? ride.y : null);
  // Going through the tunnel: the screen goes dark, there is the sound of scrabbling, and it comes up again at the far end.
  const dark0 = document.createElement('div'); dark0.style.cssText = 'position:fixed;inset:0;background:#0b0907;opacity:0;transition:opacity .55s;pointer-events:none;z-index:40'; document.body.appendChild(dark0);
  const goDark = (ms) => { dark0.style.opacity = '1'; for (let i = 0; i < 5; i++) setTimeout(() => audio.pop(150 + (i % 2) * 30), 300 + i * 330); setTimeout(() => { dark0.style.opacity = '0'; }, ms); };

  let slow = 0, slid = 0;
  W.fast.push((dt, t) => {
    if (ride) { const k = clamp((performance.now() - ride.t0) / (ride.secs * 1000), 0, 1), e = k * k * (3 - 2 * k), a = ride.down ? ride.r.top : ride.r.foot, b = ride.down ? ride.r.foot : ride.r.top; me.x = lerp(a.x, b.x, e); me.z = lerp(a.z, b.z, e);
      // Hanging from the line, not running under it: the height is the rope's own, less the length of a foreleg.
      const u = ride.down ? e : 1 - e, ends = Math.sin(Math.min(1, Math.min(k, 1 - k) * 8) * Math.PI / 2); ride.y = ride.r.a && ride.r.b ? lerp(groundHeight(me.x, me.z), lerp(ride.r.a.y, ride.r.b.y, u) - ride.r.len * 0.05 * Math.sin(u * Math.PI) - 0.95, ends) : null; me.targetYaw = Math.atan2(b.x - a.x, b.z - a.z); api.moveStop(); if (k >= 1) { ride = null; api.playEmote('hop'); } }
    // Small birds: on the ground until somebody runs at them, then up and round and down somewhere near.
    if (birdMesh) {
      let any = false;
      for (const f of flocks) { const d = Math.hypot(me.x - f.x, me.z - f.z); f.near = d < 70; if (!f.near) continue; any = true; if (f.up <= 0 && d < 6 && me.speed > 2.4) { f.up = 5.5; const a = Math.atan2(f.z - me.z, f.x - me.x) + (Math.random() - 0.5), nx = f.hx + Math.cos(a) * 14, nz = f.hz + Math.sin(a) * 14; f.fx = f.x; f.fz = f.z; f.tx = terrainHeight(nx, nz) > 1 ? nx : f.hx; f.tz = terrainHeight(nx, nz) > 1 ? nz : f.hz; api.questEvent('scattered'); } if (f.up > 0) { f.up -= dt; if (f.up <= 0) { f.x = f.tx; f.z = f.tz; } } }
      if (any) { birds.forEach((b, i) => { const f = b.f; if (!f.near) { dummy.scale.setScalar(0); dummy.updateMatrix(); birdMesh.setMatrixAt(i, dummy.matrix); return; } let x = f.x + b.ox, z = f.z + b.oz, y = terrainHeight(x, z), ry = b.ph + Math.sin(t * 0.5 + b.ph) * 1.2; if (f.up > 0) { const k = 1 - f.up / 5.5, e = k * k * (3 - 2 * k); x = lerp(f.fx, f.tx, e) + b.ox + Math.sin(t * 3 + b.ph) * 1.2; z = lerp(f.fz, f.tz, e) + b.oz + Math.cos(t * 2.6 + b.ph) * 1.2; y = lerp(terrainHeight(f.fx, f.fz), terrainHeight(f.tx, f.tz), e) + Math.sin(k * Math.PI) * (5 + (b.ph % 2)); ry = Math.atan2(f.tx - f.fx, f.tz - f.fz) + Math.PI; } else y += Math.max(0, Math.sin(t * 5 + b.ph * 3)) * 0.04; dummy.position.set(x, y, z); dummy.rotation.set(0, ry, f.up > 0 ? Math.sin(t * 18 + b.ph) * 0.5 : 0); dummy.scale.setScalar(b.s); dummy.updateMatrix(); birdMesh.setMatrixAt(i, dummy.matrix); }); birdMesh.instanceMatrix.needsUpdate = true; }
      birdMesh.visible = any;
    }
    if (plank && onSaw) { const c = Math.cos(SEESAW.ry), s = Math.sin(SEESAW.ry), other = [...api.peers.values()].find((p) => Math.hypot(p.av.x - (SEESAW.x - c * 2.1 * onSaw), p.av.z - (SEESAW.z + s * 2.1 * onSaw)) < 1.5); if (me.mode === 'stand' || !near(SEESAW, 3.4)) { onSaw = 0; } else if (other) { plank.rotation.z = Math.sin(t * 1.8) * 0.22; if (!S.saw) { S.saw = 1; save(); api.questEvent('seesaw'); addLog('', 'Up, and down, and up. It was built for exactly this and has waited a long time for it.', 'sys'); } } else plank.rotation.z = lerp(plank.rotation.z, 0.2 * onSaw, 0.1); }
    if (performance.now() < slow) return; slow = performance.now() + 500;
    const low = W.lowTide();
    for (const tf of tideFinds) if (tf.g) tf.g.visible = low && !S.tide.got.includes(tf.i) && Math.hypot(me.x - tf.x, me.z - tf.z) < 90;
    GLOW.forEach((g, i) => { if (g.m) for (const m of g.m) m.visible = dark() > 0.5 && !S.glow.got.includes(i); });
    // Rain: puddles gather on the paths, and when it stops by day there is a rainbow for a few minutes.
    const rain = api.rain(); wetness = clamp(wetness + (rain > 0.3 ? 0.012 : -0.004), 0, 1);
    if (puddles) { puddles.visible = wetness > 0.03; if (puddles.visible) { puddleAt.forEach((p, i) => { dummy.position.set(p.x, terrainHeight(p.x, p.z) + 0.03, p.z); dummy.rotation.set(-Math.PI / 2, 0, 0); dummy.scale.setScalar(p.s * wetness); dummy.updateMatrix(); puddles.setMatrixAt(i, dummy.matrix); }); puddles.instanceMatrix.needsUpdate = true; } }
    if (wasRain && rain < 0.15 && dark() < 0.35 && bow) { bowUntil = now() + 240000; if (api.entered()) { addLog('', 'The rain goes off east, and behind it there is a rainbow, both feet in the sea.', 'sys'); api.questEvent('rainbow'); } } wasRain = rain > 0.3;
    if (bow) { const left = bowUntil - now(); bow.visible = left > 0 && dark() < 0.45; if (bow.visible) { bow.position.set(me.x + 260, -6, me.z - 60); bow.rotation.y = -1.2; const o = 0.42 * smoothstep(0, 20000, left) * smoothstep(240000, 225000, left); for (const m of bow.children) m.material.opacity = o; } }
    // Trails of sparks behind anybody who called "follow me".
    if (trailPts) { let n = 0; const p = trailPts.geometry.attributes.position; for (const [name, tr] of trails) { if (now() > tr.until + 20000) { trails.delete(name); continue; } const peer = [...api.peers.values()].find((q) => q.data.name === name); if (peer && now() < tr.until) { tr.pts.push([peer.av.x, peer.av.y + 0.5, peer.av.z]); if (tr.pts.length > 110) tr.pts.shift(); } for (const q of tr.pts) if (n < 240) p.setXYZ(n++, q[0], q[1] + Math.sin(t * 2 + q[0]) * 0.1, q[2]); } trailPts.geometry.setDrawRange(0, n); p.needsUpdate = true; }
    if (starNight() !== S.starSaid && api.entered() && dark() > 0.6 && starNight()) { S.starSaid = true; addLog('', 'It is the night of falling stars. They come once a week. Lie down somewhere high and look up.', 'sys'); flash('The night of falling stars', 'Once a week'); }
    api.setStarRush(starNight() && dark() > 0.55);
    if (tunnelOpen() && !S.tunnelTold && api.entered()) { S.tunnelTold = 1; save(); setTimeout(() => addLog('Gardener', 'Since the water is running again, I will tell you. There is a tunnel of mine at the foot of the falls. It comes out on the south shore. I stopped it up after the storm. It is open now.', 'sys'), 9000); }
  });
  W.heard.push((d) => { if (d.ev.kind === 'boost') addLog('', `${d.name} has climbed up off somebody's back onto the rock.`, 'sys'); if (d.ev.kind === 'follow') { trails.set(d.name, { until: now() + 60000, pts: [] }); addLog('', `${d.name} is calling: follow me. There are sparks where they walk.`, 'sys'); } });

  // How fast the visitor goes: quicker on a path, quicker still downhill on open ground, and whatever supper did.
  let paceNow = 1, slideSaid = false, lx = me.x, lz = me.z, ly = 0;
  W.pace = (dt) => {
    let want = W.speedMul ? W.speedMul() : 1;
    if (api.species().id === 'husky') want *= 1.1;
    if (pathAmount(me.x, me.z) > 0.5) want *= 1.18;
    const y = groundHeight(me.x, me.z), moved = Math.hypot(me.x - lx, me.z - lz);
    if (moved > 0.02) { const slope = (ly - y) / moved; if (slope > 0.3 && me.speed > 2 && api.cave() < 0.5) { want *= 1 + Math.min(0.55, (slope - 0.3) * 1.1); slid += dt; if (slid > 1.2 && !slideSaid && api.entered()) { slideSaid = true; addLog('', 'You let the slope take you. Downhill on open ground you go a good deal faster.', 'sys'); api.questEvent('slide'); } } else slid = 0; lx = me.x; lz = me.z; ly = y; }
    paceNow = lerp(paceNow, want, 1 - Math.exp(-dt * 3));
    return paceNow;
  };
  Object.assign(W.where, { 'lr-plank': () => (S.gapPlank ? null : holdingPlank ? GAP_EDGE : PLANKS_AT), 'lr-tunnel': () => TUNNEL.a, 'lr-t-boost': () => ({ x: BOOST.fx, z: BOOST.fz }), 'lr-rope': () => (inv.rope > 0 ? ROPES.find((r) => !tied(r)).top : W.who.beachcomber) });
  // Where the visitor is, counted once for each part of the island on each visit, and once a minute while they stay.
  { let lastArea = '', mins = 0; setInterval(() => { if (!api.entered() || document.hidden) return; const a = api.areaAt(me.x, me.z), id = a ? a.id : 'between'; if (id !== lastArea) { lastArea = id; api.tally('area:' + id); } if (++mins % 5 === 0 && mins <= 60) api.tally('stay:' + mins + 'min'); }, 60000); }
  W.more = { PLANKS_AT, GAP_EDGE, TUNNEL, BOOST, STEP_GAP };
  W.ropes = ROPES; W.leapAt = LEAP; W.orchardAt = ORCHARD;
  return { ROPES, flocks, TRADER };
}
