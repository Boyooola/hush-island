// The puzzles of Lantern Rock: one for each part of the island, each belonging to whoever lives there. Also the
// plaques with a line cut into each (some of them are the answers), and the torn map that leads to what is buried.
import * as THREE from 'three';
import { terrainHeight, groundHeight, colliders, clamp, lerp, GARDEN, HUT, WRECK, CAVE, HILL, WINDMILL, SUMMIT, WATCH, CHAPEL, LEDGE, SHELTER, FARBEACH, WELL, ORCHARD, LIGHTHOUSE, HOLLOW_TREE, FLATS } from './terrain.js';
import { loadProps } from './props.js';

const night = () => Math.floor((Date.now() - 12 * 3600000) / 86400000);
const day = () => Math.floor((Date.now() - new Date().getTimezoneOffset() * 60000) / 86400000);      // the visitor's own day, not the clock at Greenwich
const DIRS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
const SYMBOLS = ['a tower', 'a boat', 'a bell', 'a fire'];
const SLUICES = [0, 1, 2, 3].map((i) => ({ x: GARDEN.x - 12.5, z: GARDEN.z - 2 + i * 3.1 }));
const MIRRORS = [[-3.0, 0.4, 2], [2.4, -2.0, 0], [0.4, 2.9, 3]].map(([dx, dz, right]) => ({ x: CAVE.gallery.x + dx, z: CAVE.gallery.z + dz, right }));
const PEN = { x: HILL.x - 17, z: HILL.z - 3, r: 4.6 };
const VANE = { x: SUMMIT.x + 2.4, z: SUMMIT.z - 2.2 };
const MILL_DOOR = { x: WINDMILL.x + Math.sin(WINDMILL.ry) * 3.6, z: WINDMILL.z + Math.cos(WINDMILL.ry) * 3.6 };
const BEACONS = [{ id: 'watch', x: WATCH.x - 4.5, z: WATCH.z + 3.5, where: 'by the watchtower' }, { id: 'ledge', x: LEDGE.x - 1.2, z: LEDGE.z - 1.8, where: 'on the ledge behind the summit' }, { id: 'beach', x: SHELTER.x - 12, z: SHELTER.z + 4, where: 'on the Far Beach' }, { id: 'chapel', x: CHAPEL.x - 9, z: CHAPEL.z - 4, where: 'on Chapel Rock' }];
const FLY = [[-82, -3], [-92, 10], [-108, 6], [-118, 20], [-112, 34], [-98, 38]].map(([x, z]) => ({ x, z }));
const STAR = { x: WATCH.x + 6.5, z: WATCH.z - 4 };
const ALTAR = { x: CHAPEL.x - Math.sin(CHAPEL.ry) * 2.6, z: CHAPEL.z - Math.cos(CHAPEL.ry) * 2.6 };
const RUN = { start: { x: HUT.x + 4, z: HUT.z + 5 }, flags: [{ x: WRECK.x - 3, z: WRECK.z + 2 }, { x: FLATS.x + 16, z: FLATS.z + 14 }, { x: FLATS.x - 14, z: FLATS.z + 4 }], secs: 85 };
const TREASURE = { x: ORCHARD.x - 2.2, z: ORCHARD.z + 8 };
export const PLAQUES = [
  { x: WATCH.x - 6, z: WATCH.z - 1, text: 'FIRST, WHAT THE KEEPER KEPT. And under it, scratched: light them as the lights were lit, the dawn end first.' },
  { x: SHELTER.x + 12, z: SHELTER.z - 6, text: 'SECOND, WHAT THE FERRYMAN SAILED.' },
  { x: HUT.x - 6, z: HUT.z - 5, text: 'THIRD, WHAT RINGS WHEN NO TIDE RINGS IT.' },
  { x: ORCHARD.x + 12, z: ORCHARD.z + 4, text: 'LAST, WHAT IS KEPT ON A BEACH SO THAT IT CAN BE SEEN.' },
  { x: LEDGE.x + 2.4, z: LEDGE.z + 2.2, text: 'HE STEERED BY THE STAR THAT STANDS OVER THE KEEPER\'S LIGHT. Stand on the stone by the watchtower, after dark, and look where he looked.' },
  { x: ALTAR.x + 2.6, z: ALTAR.z + 0.6, text: 'FOUR TURNS OF THE HAND, IN THE ORDER THE ISLAND GIVES THEM. The first is cut by the watchtower.' },
];

export function buildPuzzles(api, W) {
  const { scene, me, addLog, flash, audio, give, inv } = api, S = W.S, save = W.save, near = W.near;
  if (!S.pz || typeof S.pz !== 'object') S.pz = {};
  const P = S.pz, dark = () => api.sky().dark, now = () => Date.now();
  if (!Array.isArray(P.sluice)) P.sluice = [1, 0, 0, 1];
  if (!Array.isArray(P.mirror)) P.mirror = [0, 2, 1];
  if (!Array.isArray(P.altar)) P.altar = [2, 0, 3, 1];
  if (!P.beacon || P.beacon.night !== night()) P.beacon = { night: night(), lit: [] };
  if (!Array.isArray(P.weights)) P.weights = [];
  const done = (id) => !!P['done_' + id];
  const solve = (id, title, line, loot) => { if (done(id)) return; P['done_' + id] = Date.now(); save(); flash(title, 'A puzzle is solved'); audio.chime && audio.chime(); addLog('', line, 'sys'); for (const [it, n] of loot) give(it, n, true); addLog('', 'Into the satchel: ' + loot.map(([it, n]) => `${n > 1 ? n + ' × ' : ''}${api.ITEMS[it].name}`).join(', ') + '.', 'sys'); api.questEvent('puzzle'); api.tally('puzzle:' + id); };
  const KINDS = ['sluice', 'run', 'mirror', 'beacon', 'fly', 'altar', 'star'];
  const count = () => KINDS.filter(done).length;
  W.count.puzzles = count;
  const windToday = () => (day() * 5 + 3) % 8;

  const boards = [], heads = [], beams = [], flames = [], runFlags = [];
  let water = null, arrow = null, crystal = null, swarm = null, fly = null, run = null, capDir = P.cap || 0, starHold = 0, lidOpen = null;
  const showSluices = () => { boards.forEach((b, i) => { b.position.y = P.sluice[i] ? 0.8 : 0; }); if (water) water.visible = P.sluice.every((v) => v); };
  const mirrorOk = (i) => P.mirror[i] === MIRRORS[i].right;
  const showMirrors = () => { heads.forEach((h, i) => { h.rotation.y = P.mirror[i] * Math.PI / 2; }); const lit = api.lit(); beams.forEach((b, i) => { b.visible = lit && [0, 1, 2].slice(0, i + 1).every(mirrorOk); }); if (crystal) crystal.material.emissiveIntensity = lit && [0, 1, 2].every(mirrorOk) ? 2.4 : 0.1; };
  const showBeacons = () => flames.forEach((f, i) => { f.visible = P.beacon.night === night() && P.beacon.lit.includes(BEACONS[i].id) && dark() > 0.4; });

  loadProps().then((make) => {
    if (!make) return;
    const quiet = (m) => { if (!m) return null; m.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.userData.noShadow = true; } }); return m; };
    const put = (name, x, z, ry = 0, s = 1, dy = 0, skip) => { const m = W.one(name, skip); if (!m) return null; m.position.set(x, groundHeight(x, z) + dy, z); m.rotation.y = ry; m.scale.setScalar(s); scene.add(m); return m; };
    for (const s of SLUICES) { const g = put('sluice', s.x, s.z, Math.PI / 2, 1, -0.25, 'sluice_board'), b = W.one('sluice_board'); if (g && b) { g.add(b); boards.push(b); } colliders.push({ x: s.x, z: s.z - 0.75, r: 0.3 }, { x: s.x, z: s.z + 0.75, r: 0.3 }); }
    { water = new THREE.Mesh(new THREE.PlaneGeometry(11, 0.9), new THREE.MeshStandardMaterial({ color: 0x5fa9b5, roughness: 0.25, transparent: true, opacity: 0.8 })); water.rotation.x = -Math.PI / 2; water.position.set(GARDEN.x - 6.5, terrainHeight(GARDEN.x - 6.5, GARDEN.z + 2.6) + 0.06, GARDEN.z + 2.6); water.userData.noShadow = true; scene.add(water); }
    showSluices();
    MIRRORS.forEach((m, i) => { const g = put('mirror_stand', m.x, m.z, 0, 1, -0.05, 'mirror_head'), h = W.one('mirror_head'); if (g && h) { h.position.y = 1.45; g.add(h); heads.push(h); } colliders.push({ x: m.x, z: m.z, r: 0.45 }); });
    { const beamMat = new THREE.MeshBasicMaterial({ color: 0xffe9b0, transparent: true, opacity: 0.55, fog: false, toneMapped: false }), ends = [...MIRRORS, { x: CAVE.gallery.x - 4.4, z: CAVE.gallery.z + 2.7 }];
      for (let i = 0; i < 3; i++) { const a = ends[i], b = ends[i + 1], L = Math.hypot(b.x - a.x, b.z - a.z), m = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, L), beamMat); m.position.set((a.x + b.x) / 2, groundHeight(a.x, a.z) + 1.4, (a.z + b.z) / 2); m.rotation.y = Math.atan2(b.x - a.x, b.z - a.z); m.visible = false; scene.add(m); beams.push(m); }
      crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.45), new THREE.MeshStandardMaterial({ color: 0x9fd8e6, emissive: 0x8fe6f0, emissiveIntensity: 0.1, flatShading: true })); crystal.position.set(ends[3].x, groundHeight(ends[3].x, ends[3].z) + 1.4, ends[3].z); scene.add(crystal); }
    showMirrors();
    { const g = put('weather_vane', VANE.x, VANE.z, 0, 1.6, 0, 'vane_arrow'); arrow = W.one('vane_arrow'); if (g && arrow) { arrow.position.y = 1.5; g.add(arrow); arrow.rotation.y = Math.PI - windToday() * Math.PI / 4; } }
    for (const b of BEACONS) { put('brazier', b.x, b.z, 0, 1.15); colliders.push({ x: b.x, z: b.z, r: 0.5 }); const fl = new THREE.Mesh(new THREE.ConeGeometry(0.42, 1.2, 6), new THREE.MeshBasicMaterial({ color: 0xffb04a, transparent: true, opacity: 0.92, fog: false, toneMapped: false })); fl.position.set(b.x, groundHeight(b.x, b.z) + 2.3, b.z); fl.visible = false; scene.add(fl); flames.push(fl); }
    put('star_stone', STAR.x, STAR.z, 0.4, 1, -0.04);
    put('altar', ALTAR.x, ALTAR.z, CHAPEL.ry, 1, 0); colliders.push({ x: ALTAR.x, z: ALTAR.z, r: 0.8 });
    for (const p of PLAQUES) { put('plaque', p.x, p.z, Math.atan2(-p.x * 0 + 1, 0.4)); colliders.push({ x: p.x, z: p.z, r: 0.45 }); }
    for (const f of [RUN.start, ...RUN.flags]) { const g = put('marker_pole', f.x, f.z, f.x); if (g) runFlags.push(g); }
    { const g = put('crypt_slab', CHAPEL.x + 6.5, CHAPEL.z - 6, 0.5, 1, 0, 'crypt_lid'); lidOpen = W.one('crypt_lid'); if (g && lidOpen) { lidOpen.position.y = 0.16; g.add(lidOpen); if (P.crypt) lidOpen.position.x = 1.5; } }
    // The fireflies that lead somewhere.
    { const g = new THREE.BufferGeometry(), n = 26, pos = new Float32Array(n * 3); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); swarm = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xd9ff8a, size: 0.16, transparent: true, opacity: 0.95, fog: false, toneMapped: false, depthWrite: false })); swarm.frustumCulled = false; swarm.visible = false; swarm.userData = { n, ph: [...Array(n)].map((_, i) => i * 1.7) }; scene.add(swarm); }
  });

  function turnSluice(i) { for (const k of [i - 1, i, i + 1]) if (k >= 0 && k < 4) P.sluice[k] = P.sluice[k] ? 0 : 1; save(); showSluices(); audio.pop(420); api.playEmote('paw'); const open = P.sluice.filter((v) => v).length; addLog('', `The wheel turns, and more than one board moves. ${open} of 4 are up.`, 'sys'); if (open === 4) solve('sluice', 'The sluices', 'Water runs down all four channels and into the beds. Somewhere behind you a mole says "At last" to nobody.', [['seed_onion', 2], ['seed_barley', 2], ['strawhat', 1]]); }
  function altarSheet() {
    const lines = P.altar.map((v, i) => ({ text: `The ${['first', 'second', 'third', 'last'][i]} dial shows ${SYMBOLS[v]}`, meta: done('altar') ? '' : 'Press to turn it.', run: done('altar') ? undefined : () => { P.altar[i] = (P.altar[i] + 1) % 4; save(); audio.pop(500); if (P.altar.every((q, k) => q === k)) { api.closeSheet(); solve('altar', 'The altar', 'The last dial clicks. Under the floor something heavy moves, and from the empty bell-cote, with no bell in it, comes one clear note.', [['pearl', 1], ['lampoil', 1]]); if (audio.bell) audio.bell(0.9); api.tell('altar', 1); } else altarSheet(); } }));
    api.openSheet({ title: 'The altar on Chapel Rock', lines, note: done('altar') ? 'The four are set as the island gives them.' : 'Four brass dials, each with the same four pictures cut round its edge. There are stones along the island with a line cut into each.' });
  }
  function wellSheet() {
    const sum = P.weights.reduce((a, b) => a + b, 0), lines = [2, 3, 5, 7].map((w) => { const on = P.weights.includes(w); return { text: `${on ? 'Take out' : 'Put in'} the stone marked ${w}`, run: () => { P.weights = on ? P.weights.filter((q) => q !== w) : [...P.weights, w]; save(); audio.pop(440); const s2 = P.weights.reduce((a, b) => a + b, 0); if (s2 === 10) { api.closeSheet(); solve('well', 'The well', 'The bucket sinks just far enough, tips, and comes up heavy. Under the water in it, something that was dropped a long time ago.', [['crystal', 2], ['coin', 4]]); } else wellSheet(); } }; });
    lines.unshift({ text: sum === 0 ? 'The bucket floats. It will not go under by itself.' : sum < 10 ? `With ${sum} in it the bucket rides low but does not sink.` : `With ${sum} in it the rope creaks and you dare not let go.`, meta: 'Something glints on the bottom. Cut into the rim of the well: TEN, NO MORE, NO LESS.' });
    api.openSheet({ title: 'Down the well', lines, note: 'Four stones lie on the rim, each with a number scratched on it.' });
  }
  function lightBeacon(b) {
    const i = BEACONS.indexOf(b); api.playEmote('paw');
    if (P.beacon.lit.length !== i) { P.beacon.lit = []; save(); showBeacons(); audio.pop(300); addLog('', 'It catches, and across the island the others gutter and go out. Something about the order.', 'sys'); return; }
    P.beacon.lit.push(b.id); save(); showBeacons(); audio.pop(700); addLog('', `The beacon ${b.where} takes. ${P.beacon.lit.length} of 4 burning.`, 'sys');
    if (P.beacon.lit.length === 4) { solve('beacon', 'The beacons', 'Four fires, east to west, the way the lights were lit when there were lights. From the point the Lamplighter calls out, once, like somebody who had stopped expecting to.', [['lampoil', 2], ['kerchief', 1]]); api.tell('beacon', 4); }
  }

  W.extra.push((key, f, opts) => {
    if (key) return;
    const si = SLUICES.findIndex((s) => near(s, 2)); if (si >= 0 && !done('sluice')) opts.unshift({ label: 'Turn the sluice wheel', run: () => turnSluice(si) });
    if (api.cave() > 0.5) { const mi = MIRRORS.findIndex((m) => near(m, 1.9)); if (mi >= 0 && !done('mirror')) opts.unshift({ label: 'Turn the mirror', run: () => { if (!api.lit()) { addLog('', 'A disc of polished brass on a stand. In the dark it is no use to anybody. Bring a light.', 'sys'); return; } P.mirror[mi] = (P.mirror[mi] + 1) % 4; save(); showMirrors(); audio.pop(520); if ([0, 1, 2].every(mirrorOk)) solve('mirror', 'The mirrors', 'The light goes from brass to brass to brass and lands on the crystal in the wall, which takes it and keeps it. The whole gallery is lit.', [['crystal', 3], ['pearl', 1]]); else addLog('', [0, 1, 2].slice(0, mi + 1).every(mirrorOk) ? 'The light jumps to the next mirror.' : 'The light slides off across the wall.', 'sys'); } }); }
    if (near(VANE, 2.6)) opts.push({ label: 'Look at the weather vane', run: () => addLog('', `It swings, and settles. The wind is out of the ${DIRS[windToday()]} today.`, 'sys') });
    const b = BEACONS.find((q) => near(q, 2.4)); if (b && !P.beacon.lit.includes(b.id)) opts.push({ label: 'Light the beacon', run: () => { if (dark() < 0.5) { addLog('', 'An iron basket of dry wood on three legs. It is meant to be seen, and by day nothing would see it.', 'sys'); return; } lightBeacon(b); } });
    if (near(STAR, 1.5) && !done('star')) opts.push({ label: 'Look at the stone underfoot', run: () => addLog('', dark() > 0.6 ? 'Six points of pale stone set into the slab, in the shape of a constellation. Stand here and face the star he steered by, and keep still.' : 'Six points of pale stone set into a round slab. It is a piece of the sky. It wants the dark.', 'sys') });
    if (near(ALTAR, 2.6)) opts.unshift({ label: 'Look at the altar', run: altarSheet });
    const pl = PLAQUES.find((q) => near(q, 2.1)); if (pl) opts.push({ label: 'Read what is cut in the stone', run: () => { addLog('', `Cut in the stone: ${pl.text}`, 'sys'); api.questEvent('plaque'); } });
    if (!run && !done('run') && near(RUN.start, 2.6)) opts.push({ label: 'Take the Beachcomber\'s dare', run: () => { if (!W.lowTide()) { addLog('', 'Three red flags stand out on the mud, and the sea is over them. Come back when the tide is out.', 'sys'); return; } run = { at: now(), got: [] }; api.tell('dare', 1); addLog('', 'Touch all three red flags out on the flats and be back at this post before the tide comes over them. He says nobody on four legs can do it. Anybody with you can run it too.', 'sys'); } });
    if (near({ x: CHAPEL.x + 6.5, z: CHAPEL.z - 6 }, 2.8) && !P.crypt) opts.push({ label: 'Lift the stone lid', run: () => { const strong = api.species().id === 'stag', two = [...api.peers.values()].some((p) => Math.hypot(p.av.x - me.x, p.av.z - me.z) < 4); api.playEmote('paw'); if (!strong && !two) { addLog('', 'Two iron rings, a long way apart. It shifts a hair and settles back. It wants two, or one stag.', 'sys'); return; } P.crypt = 1; save(); if (lidOpen) lidOpen.position.x = 1.5; audio.pop(360); give('pearl', 1, true); give('lampoil', 2, true); addLog('', `${strong && !two ? 'You get your antlers under one ring and your shoulder to it' : 'One ring each, and heave'}. The lid grinds aside. In the hollow under it: a moon pearl and two flasks of lamp oil, and room for a good deal more that somebody took.`, 'sys'); api.questEvent('crypt'); } });
    if (near(TREASURE, 1.8) && !P.treasure && [1, 2, 3, 4].every((n) => inv['scrap' + n] > 0)) opts.unshift({ label: 'Dig where the map says', run: () => { P.treasure = 1; save(); api.playEmote('paw'); setTimeout(() => { give('crown', 1, true); flash('What was buried', 'Nine paces from the hives'); addLog('', 'A tin box, soldered shut and wrapped in oilcloth. In it, in a nest of wool: a crown that would fit a very small king. It is in your satchel. Whoever buried it meant to come back.', 'sys'); api.questEvent('treasure'); }, 1200); } });
    if (fly && fly.end && near(FLY[FLY.length - 1], 2.4) && !done('fly')) opts.unshift({ label: 'Dig where the fireflies settle', run: () => { api.playEmote('paw'); solve('fly', 'The fireflies', 'Under the leaves, a clay pot with a wooden lid. The fireflies lift off it all together and go up into the birches.', [['mushroomhat', 1], ['glowcap', 2]]); } });
  });

  let slow = 0;
  W.fast.push((dt, t) => {
    // The fireflies wait by the Forager's tree at dusk, and go on ahead of anybody who keeps up with them.
    if (swarm) {
      const on = dark() > 0.3 && !done('fly') && Math.hypot(me.x - FLY[0].x, me.z - FLY[0].z) < 150;
      swarm.visible = on;
      if (on) {
        if (!fly) fly = { s: 0, x: FLY[0].x, z: FLY[0].z, end: false };
        const d = Math.hypot(me.x - fly.x, me.z - fly.z), seg = Math.min(FLY.length - 2, Math.floor(fly.s)), a = FLY[seg], b = FLY[seg + 1], L = Math.hypot(b.x - a.x, b.z - a.z);
        if (!fly.end && d < 6.5) { fly.s = Math.min(FLY.length - 1, fly.s + dt * 2.3 / L); if (!fly.said) { fly.said = true; addLog('', 'The fireflies lift, all together, and move off between the trees. They wait for you.', 'sys'); } }
        else if (!fly.end && d > 30 && fly.s > 0) { fly.s = 0; fly.said = false; }
        if (fly.s >= FLY.length - 1 && !fly.end) { fly.end = true; addLog('', 'They stop, and sink down onto one patch of leaves, and stay there.', 'sys'); }
        const k = clamp(fly.s - seg, 0, 1); fly.x = lerp(a.x, b.x, k); fly.z = lerp(a.z, b.z, k);
        const p = swarm.geometry.attributes.position, gy = groundHeight(fly.x, fly.z), spread = fly.end ? 0.5 : 1.3;
        for (let i = 0; i < swarm.userData.n; i++) { const ph = swarm.userData.ph[i]; p.setXYZ(i, fly.x + Math.sin(t * 0.9 + ph) * spread, gy + (fly.end ? 0.25 : 1.1) + Math.sin(t * 1.3 + ph * 2) * (fly.end ? 0.15 : 0.5), fly.z + Math.cos(t * 0.7 + ph * 1.3) * spread); } p.needsUpdate = true;
      }
    }
    if (run) { const left = W.lowTide() ? 1 : -1; RUN.flags.forEach((f, i) => { if (!run.got.includes(i) && Math.hypot(me.x - f.x, me.z - f.z) < 3) { run.got.push(i); audio.pop(700); api.moment(`${run.got.length} of 3`, 2.5); } }); if (run.got.length === 3 && near(RUN.start, 3)) { run = null; solve('run', 'The dare', 'You skid in past the post with mud to your ears. The Beachcomber looks at the flags, and at you, and takes the scarf off his own neck.', [['scarf', 1], ['seaglass', 2]]); } else if (left < 0) { run = null; addLog('', 'The tide is over the flags. The Beachcomber does not say anything, which is worse.', 'sys'); } }
    if (!done('star') && dark() > 0.6 && near(STAR, 1.4) && me.speed < 0.2) { const want = Math.atan2(LIGHTHOUSE.x - me.x, LIGHTHOUSE.z - me.z); let d = want - me.yaw; d = Math.abs(Math.atan2(Math.sin(d), Math.cos(d))); starHold = d < 0.22 ? starHold + dt : 0; if (starHold > 2.5) solve('star', 'The Ferryman\'s star', 'There. Low over the dark tower, one star that does not flicker. It is not over the tower at all. It is a long way past it, in the west, and it is the colour of a lamp.', [['moonshell', 1], ['feather', 2]]); } else starHold = 0;
    if (performance.now() < slow) return; slow = performance.now() + 600;
    if (api.cave() > 0.5 && Math.hypot(me.x - CAVE.gallery.x, me.z - CAVE.gallery.z) < 20) showMirrors();
    showBeacons(); for (const f of flames) if (f.visible) { f.scale.set(1 + Math.sin(t * 9 + f.position.x) * 0.12, 1 + Math.sin(t * 13) * 0.18, 1); f.rotation.y = t * 2; }
    if (arrow) arrow.rotation.y = Math.PI - windToday() * Math.PI / 4 + Math.sin(t * 0.8) * 0.12;
  });
  // When anybody lights all four, everybody ashore sees them burn for the rest of that night.
  W.heard.push((d) => { if (d.ev.kind === 'beacon') { P.beacon = { night: night(), lit: BEACONS.map((b) => b.id) }; save(); showBeacons(); flash('The beacons are lit', `${d.name} lit all four`); addLog('', `Four fires along the island, east to west. ${d.name} has lit the beacons, and they will burn till morning.`, 'sys'); } else if (d.ev.kind === 'altar') { if (audio.bell) audio.bell(0.5); addLog('', `A bell sounds from Chapel Rock, where there is no bell. ${d.name} has set the altar.`, 'sys'); } else if (d.ev.kind === 'dare' && !run && !done('run') && near(RUN.start, 30) && W.lowTide()) { run = { at: now(), got: [] }; flash(`${d.name} has taken the dare`, 'Three flags and back, with them'); } });
  Object.assign(W.where, { 'lr-puzzles': () => [SLUICES[0], RUN.start, BEACONS[0], FLY[0], STAR, ALTAR, CAVE.gallery].find((p, i) => !done(['sluice', 'run', 'beacon', 'fly', 'star', 'altar', 'mirror'][i])) || null });
  W.pz = { PEN, SLUICES, BEACONS, ALTAR, done, count, P };
  return W.pz;
}
