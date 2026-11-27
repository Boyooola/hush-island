// The wider island: what stands on Lantern Rock between its big places, and who lives there. Landmarks that can be
// seen from a long way off, small things along the paths, a character in every part of the island, the errands that
// send a visitor from one to the next, the places that are hard to find, and the things everyone rebuilds together.
// main.js hands over what this needs (api) and asks back for the actions in reach and a turn every frame.
import * as THREE from 'three';
import {
  terrainHeight, groundHeight, colliders, mulberry32, PATHS, clamp, lerp, smoothstep, TIDE, tideAt,
  WINDMILL, WATCH, ORCHARD, WELL, HUT, GAP, TRUNK, LEDGE, DUSKRING, CHAPEL, BRIDGE, bridgeY, COVE, STACK, STEPS, SUNKEN, MAST,
  HILL, GARDEN, SHELTER, FARBEACH, MAPMAKER, AREAS, WRECK,
} from './terrain.js';
import { loadProps } from './props.js';
import { moveQuad, moveFolk } from './puppet.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeNameTag, makeBubble } from './labels.js';
import { FOLK, folkById, ROUND, ROUND_THANKS, STORM_TOLD, STORM_WHO, SPOTS } from './folk.js';

const C = (h) => new THREE.Color(h);
const turnTo = (dx, dz) => Math.atan2(dx, dz);
// What everyone builds together: how many pieces each wants, where the pieces lie, and where they are laid.
export const WORKS = {
  plank: { id: 'bridge', name: 'the bridge to Chapel Rock', piece: 'plank', many: 'planks', need: 12, pile: { x: BRIDGE.ax + 13, z: BRIDGE.az - 6 }, at: { x: BRIDGE.ax, z: BRIDGE.az }, model: 'plank_stack',
    done: 'The last plank goes down and the ropes take the weight. There is a way across to Chapel Rock again.' },
  sail: { id: 'windmill', name: 'the windmill', piece: 'spar', many: 'spars and cloth', need: 16, pile: { x: WINDMILL.x + 30, z: WINDMILL.z + 26 }, at: { x: WINDMILL.x + Math.sin(WINDMILL.ry) * 4.2, z: WINDMILL.z + Math.cos(WINDMILL.ry) * 4.2 }, model: 'timber_stack',
    done: 'Four sails, cloth on every one. They shiver, and take the wind, and the whole mill groans and begins to turn.' },
  rope: { id: 'well', name: 'the well at the crossroads', piece: 'slate', many: 'slates and rope', need: 10, pile: { x: WELL.x - 26, z: WELL.z + 22 }, at: { x: WELL.x + 2.2, z: WELL.z + 1.2 }, model: 'rubble_pile',
    done: 'The roof is on, the windlass turns, and the bucket goes down a long way before it finds water. It comes up sweet.' },
};
const CARRY_MAX = 3;

export function buildWide(api) {
  const { scene, me, addLog, flash, audio, store } = api;
  const S = (() => { const v = store('ember.wide'); return v && typeof v === 'object' ? v : {}; })();
  for (const k of ['met', 'lambs', 'trust', 'said']) if (!S[k] || typeof S[k] !== 'object') S[k] = {};
  for (const k of ['told', 'spots', 'hinted']) if (!Array.isArray(S[k])) S[k] = [];
  const save = () => store('ember.wide', S);
  const near = (p, r) => p && Math.hypot(p.x - me.x, p.z - me.z) < r;
  const dark = () => api.sky().dark;
  const lowTide = () => tideAt(api.now()).y < TIDE.flat - 0.14;
  const updaters = [], smalls = [], W = {}, extra = [];
  let make = null, carry = null;      // what is being carried to one of the works: { kind, n }
  const works = { plank: 0, sail: 0, rope: 0 };
  const workDone = (k) => works[k] >= WORKS[k].need;

  // ---------- who lives where ----------
  const folk = FOLK.map((def) => ({ def, x: def.x, z: def.z, y: 0, home: 0, group: null, tag: makeNameTag(def.short, def.sub, false), bubble: makeBubble(), life: 0, next: 30 + Math.random() * 40, at: 'day', col: { x: def.x, z: def.z, r: 0.75 }, holder: new THREE.Group() }));
  const who = Object.fromEntries(folk.map((f) => [f.def.id, f]));
  for (const f of folk) {
    f.tag.position.y = f.def.tall + 0.2; f.bubble.position.y = f.def.tall + 0.5; f.holder.add(f.tag, f.bubble); scene.add(f.holder);
    api.addMark(f.holder, f.def.name, f.def.tall + 0.95);
    api.GIVER[f.def.name] = f.def.id; api.GREETS[f.def.id] = f.def.id; api.places[f.def.id] = f;
    colliders.push(f.col);
  }
  const place = (f, x, z) => { f.x = x; f.z = z; f.y = groundHeight(x, z) - 0.04; f.col.x = x; f.col.z = z; f.holder.position.set(x, f.y, z); if (f.group) f.group.position.set(x, f.y, z); };
  for (const f of folk) if (f.def.id !== 'pedlar') { place(f, f.def.x, f.def.z); f.home = turnTo(-f.x * 0 + (f.def.area === 'farbeach' ? FARBEACH.x - f.x : 0), 1); }
  // Each faces the way a visitor is most likely to come from: the nearest path.
  for (const f of folk) { let best = null, bd = 1e9; for (const p of PATHS) for (const q of p) { const d = Math.hypot(q[0] - f.x, q[1] - f.z); if (d < bd && d > 3) { bd = d; best = q; } } if (best) f.home = turnTo(best[0] - f.x, best[1] - f.z); }
  function says(f, line) { if (!line) return; f.bubble.userData.setText(line); f.bubble.visible = true; f.life = clamp(3.5 + line.length * 0.06, 4, 11); addLog(f.def.short, line, 'sys'); f.next = api.t() + 40; }

  // The Pedlar's round: out along the long path from the Landing to Lantern Point and back, with a rest at each
  // stop. Where he is depends only on the hour, so every visitor meets him in the same place.
  const route = (() => { const pts = [...PATHS[1], ...PATHS[4].slice(1)].map(([x, z]) => ({ x, z })), acc = [0]; for (let i = 1; i < pts.length; i++) acc.push(acc[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z)); return { pts, acc, len: acc[acc.length - 1] }; })();
  const STOPS = [0, 2, 6, 8, route.pts.length - 1].map((i) => route.acc[i]), SPEED = 1.25, REST = 50;
  const legs = (() => { const out = []; for (let i = 0; i < STOPS.length - 1; i++) out.push({ rest: REST, a: STOPS[i] }, { walk: (STOPS[i + 1] - STOPS[i]) / SPEED, a: STOPS[i], b: STOPS[i + 1] }); out.push({ rest: REST, a: STOPS[STOPS.length - 1] }); for (let i = STOPS.length - 1; i > 0; i--) out.push({ walk: (STOPS[i] - STOPS[i - 1]) / SPEED, a: STOPS[i], b: STOPS[i - 1] }, ...(i > 1 ? [{ rest: REST, a: STOPS[i - 1] }] : [])); return out; })();
  const ROUND_SECS = legs.reduce((a, l) => a + (l.rest || l.walk), 0);
  const alongRoute = (s) => { let i = 1; while (i < route.acc.length - 1 && route.acc[i] < s) i++; const k = clamp((s - route.acc[i - 1]) / (route.acc[i] - route.acc[i - 1]), 0, 1), a = route.pts[i - 1], b = route.pts[i], L = Math.hypot(b.x - a.x, b.z - a.z); return { x: lerp(a.x, b.x, k), z: lerp(a.z, b.z, k), dx: (b.x - a.x) / L, dz: (b.z - a.z) / L }; };
  function pedlarNow() {
    let u = (api.now() / 1000) % ROUND_SECS;
    for (const l of legs) { const d = l.rest || l.walk; if (u < d) { if (l.rest) return { ...alongRoute(l.a), moving: false }; const p = alongRoute(lerp(l.a, l.b, u / d)), back = l.b < l.a; return { ...p, dx: back ? -p.dx : p.dx, dz: back ? -p.dz : p.dz, moving: true }; } u -= d; }
    return { ...alongRoute(0), moving: false };
  }

  // ---------- the flock, and the three that strayed ----------
  const LAMBS = [{ id: 'l1', x: TRUNK.x + 2.2, z: TRUNK.z - 2.6, seen: 'forager', where: 'Something has been sleeping under the big fallen trunk, south of the path and west of here. It bleats.' },
    { id: 'l2', x: DUSKRING.x + 6, z: DUSKRING.z + 5, seen: 'gardener', where: 'Something woolly has been at my lettuces. I can hear it now, over on the west side of the pool.' },
    { id: 'l3', x: GAP.x - 4.5, z: GAP.z + 3, seen: 'beachcomber', where: 'There is a lamb down by the split rock on the south-west cliffs. It will not come to me. I smell of fish.' }];
  const sheep = [], far = [], flockDummy = new THREE.Object3D(); let flock = null, plankMesh = null, plankTotal = 0;
  const lambState = (id) => S.lambs[id] || 'lost';
  const lambsHome = () => LAMBS.filter((l) => lambState(l.id) === 'home').length;
  const lambsWanted = () => api.taken['lr-lambs'] && !api.quests['lr-lambs'];

  // ---------- what is carried on the Message Round ----------
  const carrying = (n) => !!api.taken[ROUND[n].id] && !api.quests[ROUND[n].id];
  const carriedFor = (key) => ROUND.findIndex((r, n) => r.to === key && carrying(n));
  const nameOf = (key) => (key === 'keeper' ? 'the Mapmaker' : key === 'hermit' ? 'the Hermit' : key === 'heron' ? 'the Lamplighter' : 'the ' + folkById[key].short);
  function onTaken(id) {
    const n = ROUND.findIndex((r) => r.id === id);
    if (n >= 0) setTimeout(() => { addLog('', `${ROUND[n].gives} You are carrying ${ROUND[n].thing} for ${nameOf(ROUND[n].to)}.`, 'sys'); audio.pop(560); }, 2600);
  }
  // Somebody has been greeted. If the visitor is carrying something for them, it is handed over and they say so.
  // `say` is how that one speaks. Returns true when the greeting has been dealt with here.
  function handOver(key, say) {
    const n = carriedFor(key); if (n < 0) return false;
    const f = who[key], thanks = (f && f.def.thanks) || ROUND_THANKS[key] || 'Thank you.';
    addLog('', `You hand over ${ROUND[n].thing}.`, 'sys'); audio.pop(700);
    setTimeout(() => say(thanks), 700);
    S.trust[key] = 1; save();
    setTimeout(() => api.questEvent('round' + (n + 1)), 1500);
    if (n === ROUND.length - 1) { setTimeout(() => { S.fullmap = 1; save(); api.give('postcap'); flash('The whole map', 'Everybody on the island is on it now'); api.redrawMap(); }, 6500); return true; }
    setTimeout(() => { const ask = api.takeQuest(ROUND[n + 1].id); if (ask) say(ask); }, 7200);
    return true;
  }
  const HINT_OF = { keeper: ['cove', 'One more thing for the map. Under the watchtower on the north cliffs there is a notch in the rock. It has a floor at low water and at no other time. I have not been down. I am a tortoise.'], heron: ['cellar', 'He kept the oil in a cellar under the cottage floor. The trapdoor is by the hearth. I never could get down the ladder. You might.'] };
  // What somebody says when greeted and there is nothing to hand over: their first words, a lost lamb, a place only they know of, or the island as they see it.
  function chat(key, f) {
    const def = f ? f.def : null, n = (S.met[key] = (S.met[key] || 0) + 1); save();
    if (def && n === 1) return def.hello;
    const lamb = LAMBS.find((l) => l.seen === key && lambsWanted() && lambState(l.id) === 'lost'); if (lamb && !S.said['lamb-' + lamb.id]) { S.said['lamb-' + lamb.id] = 1; save(); return lamb.where; }
    const hint = def ? (def.spot && [def.spot, def.hint]) : HINT_OF[key];
    if (hint && S.trust[key] && !S.hinted.includes(hint[0]) && !S.spots.includes(hint[0])) { S.hinted.push(hint[0]); save(); api.redrawMap(); return hint[1]; }
    if (!def) return '';
    if (dark() > 0.6 && def.nightSay && Math.random() < 0.5) return def.nightSay[n % def.nightSay.length];
    if (S.trust[key] && n % 4 === 0) return ['Back again. Good. Not everybody comes back.', 'I told the others about you. They knew already.', 'You are getting to know this island better than some who live on it.'][Math.floor(n / 4) % 3];
    return def.about[(n - 2 + def.about.length * 9) % def.about.length];
  }
  function greet(f) {
    api.questEvent(f.def.id);
    me.targetYaw = turnTo(f.x - me.x, f.z - me.z); api.playEmote('greet'); addLog('', `You greet ${nameOf(f.def.id)}.`, 'sys');
    if (handOver(f.def.id, (l) => says(f, l))) return;
    const asked = api.askedBy(f.def.id); if (asked) { setTimeout(() => says(f, asked), 700); if (!S.met[f.def.id]) { S.met[f.def.id] = 1; save(); } return; }
    const line = chat(f.def.id, f); setTimeout(() => says(f, line), 700);
  }
  // The night of the storm: everyone remembers one piece of it.
  const stormOpen = () => api.taken['lr-accounts'] && !api.quests['lr-accounts'];
  function askStorm(key, say) {
    const line = (who[key] && who[key].def.storm) || STORM_TOLD[key]; if (!line) return;
    addLog('', `You ask ${nameOf(key)} about the night of the storm.`, 'sys');
    setTimeout(() => say(line), 700);
    if (key === 'castaway' && !api.inv.sailorcap) setTimeout(() => { api.give('sailorcap'); addLog('', 'She pushes a sailor\'s cap across the sand with her good wing. It came down with her in the storm. She says it never suited her.', 'sys'); }, 9000);
    if (!S.told.includes(key)) { S.told.push(key); save(); setTimeout(() => addLog('', `${S.told.length} of ${STORM_WHO.length} have told you what they remember.`, 'sys'), 5200); }
  }
  // The three who were on the island already (main.js speaks for them): anything to hand over, anything to ask.
  function greeted(key, say) {
    if (handOver(key, say)) return true;
    if (key === 'keeper') { S.met.keeper = (S.met.keeper || 0) + 1; save(); if (S.met.keeper >= 2 && !api.taken['lr-r1'] && !api.quests['lr-r1']) { const ask = api.takeQuest('lr-r1'); if (ask) { setTimeout(() => say(ask), 700); return true; } } }
    if (api.quests['lr-accounts'] && key === 'hermit' && !S.fourth) { S.fourth = 1; save(); setTimeout(() => say('West. Every one of them saw a piece of it and nobody put the pieces side by side. He went west on a spar and he was alive. Give me the lantern a moment. There is a fourth stone, and I know now what goes on it.'), 700); setTimeout(() => { api.revealFourth(); addLog('', 'The Hermit goes into the hill with his paint. When he comes out his paws are red and white to the elbow.', 'sys'); }, 6500); return true; }
    const hint = HINT_OF[key]; if (hint && S.trust[key] && !S.hinted.includes(hint[0]) && !S.spots.includes(hint[0])) { S.hinted.push(hint[0]); save(); setTimeout(() => say(hint[1]), 700); return true; }
    return false;
  }

  // ---------- places that are hard to find ----------
  const SPOT_AT = { trunk: TRUNK, ledge: LEDGE, cove: COVE, duskring: DUSKRING, sunken: SUNKEN, stack: STACK, gap: GAP, cellar: null };
  let ring = null, sails = null, wellRoof = null;
  function foundSpot(id) {
    if (S.spots.includes(id)) return;
    const sp = SPOTS.find((q) => q.id === id); S.spots.push(id); save();
    flash(sp.name, 'A hidden place'); audio.chime && audio.chime(); addLog('', `${sp.name}. ${sp.found}`, 'sys');
    setTimeout(() => addLog('', `${S.spots.length} of ${SPOTS.length} hidden places found.`, 'sys'), 4800);
    const held = { ledge: [['rope', 1]], duskring: [['flowercrown', 1], ['glowcap', 2]], gap: [['seed_barley', 2], ['whelk', 1]] }[id];
    if (held) setTimeout(() => { for (const [it, n] of held) api.give(it, n, true); addLog('', { ledge: 'Coiled on the ledge, dry as the day it was left: a rope. Into the satchel.', duskring: 'In the middle of the ring, where the grass is a different green, somebody has left a crown of flowers that has not faded. Into the satchel, with two of the glowing caps.', gap: 'Wedged in the crack at the height of your nose: a twist of oilcloth with seed in it, and a whelk shell.' }[id], 'sys'); }, 6200);
    api.redrawMap(); api.tally('spot:' + id);
  }
  function openCellar() {
    me.targetYaw += 0.4; api.playEmote('paw');
    addLog('', 'There is an iron ring in the floor by the hearth, under the ash. You get your teeth to it and the trapdoor comes up.', 'sys');
    setTimeout(() => { foundSpot('cellar'); if (!S.cellar) { S.cellar = 1; save(); api.give('oilskin'); api.give('lampoil', 2); api.give('rope', 1); } }, 1600);
  }

  // ---------- what everyone rebuilds ----------
  function takePieces(kind) {
    const Wk = WORKS[kind], both = [...api.peers.values()].some((p) => Math.hypot(p.av.x - me.x, p.av.z - me.z) < 7);
    const n = (CARRY_MAX + (/alpaca|donkey/.test(api.species().id) ? 2 : 0)) * (W.pieces ? W.pieces() : 1);
    carry = { kind, n, both }; audio.pop(500); api.playEmote('paw');
    addLog('', `You take up ${n} ${Wk.many} for ${Wk.name}${both ? '. With two of you at it, each will count twice' : ''}.`, 'sys'); api.changed();
  }
  function layPieces() {
    const W = WORKS[carry.kind], n = carry.n * (carry.both ? 2 : 1), kind = carry.kind, was = workDone(kind);
    carry = null; works[kind] += n; setWorks(); audio.pop(660); api.playEmote('paw');
    S.laid = (S.laid || 0) + n; save();
    for (let left = n; left > 0; left -= 6) api.addWork(kind, Math.min(6, left));
    addLog('', workDone(kind) ? W.done : `You set them down at ${W.name}. ${Math.min(works[kind], W.need)} of ${W.need} ${W.many} are in.`, 'sys');
    if (!was && workDone(kind)) { flash(W.name.charAt(0).toUpperCase() + W.name.slice(1), 'It is mended'); api.questEvent('mended'); api.tell('work', ['plank', 'sail', 'rope'].indexOf(kind)); }
    api.changed();
  }
  const planks = [];
  function setWorks() {
    BRIDGE.on = workDone('plank');
    const share = clamp(works.plank / WORKS.plank.need, 0, 1);
    if (plankMesh) plankMesh.count = BRIDGE.on ? plankTotal : Math.max(4, Math.floor(plankTotal * share));
    if (sails) sails.visible = workDone('sail');
    if (wellRoof) wellRoof.visible = workDone('rope');
  }
  api.watchWorks((totals) => { let ch = false; for (const k in works) { const v = Math.max(works[k], Number(totals[k]) || 0); if (v !== works[k]) { works[k] = v; ch = true; } } if (ch) setWorks(); });

  // ---------- the scenery ----------
  const milestones = [], benches = [], posts = [], fires = [];
  // Milestones: one every sixty paces or so along every path, set back from it, each with the way to the Landing cut on it.
  { let n = 0; for (const p of PATHS) { let left = 30; for (let i = 0; i < p.length - 1; i++) { const ax = p[i][0], az = p[i][1], L = Math.hypot(p[i + 1][0] - ax, p[i + 1][1] - az), dx = (p[i + 1][0] - ax) / L, dz = (p[i + 1][1] - az) / L; let s = left; while (s < L) { const side = n % 2 ? 1 : -1, x = ax + dx * s - dz * 2.3 * side, z = az + dz * s + dx * 2.3 * side; if (Math.hypot(x, z) > 18 && terrainHeight(x, z) > 0.6) milestones.push({ x, z, ry: turnTo(-dz * -side, dx * -side), n: n++ }); s += 52; } left = s - L; } } }
  const BENCHES = [[LEDGE.x + 0.6, LEDGE.z - 0.4, -Math.PI / 2, 'From here the island falls away west to the lighthouse and the open sea beyond it.'], [ORCHARD.x + 9, ORCHARD.z - 7, Math.PI / 2, 'Apple trees behind you, the sea in front, and on the edge of it the island you came from.'], [HILL.x + 13, HILL.z + 9, Math.PI / 2 + 0.5, 'The whole of Stillwater is laid out below, green and shut in, with the pool shining in the middle of it.'],
    [HUT.x + 7, HUT.z - 5, Math.PI - 0.6, 'The flats run out grey to the wreck and the bell. The tide is doing what it does.'], [WATCH.x + 7, WATCH.z + 2, Math.PI + 0.3, 'North there is nothing but water, all the way to wherever the dark lights are.'], [SHELTER.x + 9, SHELTER.z + 5, -Math.PI / 2 - 0.5, 'The beach faces the evening. Out past the surf a mast stands in the sea, leaning.'],
    [-196, 131, Math.PI - 0.3, 'The cliffs go on west to a rock with a ruin on it, standing off from the land.'], [-206, 14, 0.2, 'The falls come down the south wall, and the water goes on to nobody knows where.'], [CHAPEL.x - 8, CHAPEL.z + 4, -Math.PI / 2, 'Nothing between you and the edge of the world. If there is anything out west, this is where it would be seen from.']];
  for (const [x, z, ry, view] of BENCHES) benches.push({ x, z, ry, view });
  const POSTS = [[-40, -4, [['The Landing', 6, 0], ['Whisper Woods', -78, -8], ['The Tide Flats', -84, 98]]], [-78, -8, [['The North Cliffs', -54, -82], ['Hollow Hill', -134, -58], ['Stillwater', -150, 0]]], [-60, 46, [['The Orchard', -18, 61], ['The Tide Flats', -84, 98], ['The Landing', -40, -4]]],
    [-270, -20, [['The Far Beach', -286, -56], ['Lantern Point', -292, -8], ['Stillwater', -236, -10]]], [-100, 126, [['Chapel Rock', -140, 138], ['The Landing', -84, 98], ['The Wreck', WRECK.x, WRECK.z]]], [-200, 0, [['The High Meadow', -236, -10], ['Whisper Woods', -176, 2], ['The Garden', GARDEN.x, GARDEN.z]]]];
  for (const [px, pz, arms] of POSTS) { let x = px + 2.6, z = pz + 2.2; posts.push({ x, z, arms: arms.map(([name, tx, tz]) => ({ name, ry: Math.atan2(-(tz - z), tx - x), paces: Math.round(Math.hypot(tx - px, tz - pz) / 0.75 / 10) * 10 })) }); }
  const FIRES = [{ x: WINDMILL.x + 4.4, z: WINDMILL.z + 7.5, night: true }, { x: SHELTER.x + 5.6, z: SHELTER.z - 0.4, night: true }, { x: WATCH.x + 5, z: WATCH.z + 5.5, night: false }, { x: -210, z: 122, night: false }];
  for (const f of [...benches, ...posts]) colliders.push({ x: f.x, z: f.z, r: 0.5 });
  colliders.push({ x: WINDMILL.x, z: WINDMILL.z, r: 2.7 }, { x: WATCH.x, z: WATCH.z, r: 2.4 }, { x: WELL.x, z: WELL.z, r: 1.25 }, { x: MAST.x, z: MAST.z, r: 1 });
  { const c = Math.cos(HUT.ry), s = Math.sin(HUT.ry); for (const [lx, lz] of [[-1.3, -1.1], [1.3, -1.1], [-1.3, 1.1], [1.3, 1.1]]) colliders.push({ x: HUT.x + lx * c + lz * s, z: HUT.z - lx * s + lz * c, r: 0.3 }); }
  // The chapel's walls, all but the doorway.
  const chapelAt = (lx, lz) => ({ x: CHAPEL.x + lx * Math.cos(CHAPEL.ry) + lz * Math.sin(CHAPEL.ry), z: CHAPEL.z - lx * Math.sin(CHAPEL.ry) + lz * Math.cos(CHAPEL.ry) });
  { for (let k = -4; k <= 4; k++) { if (k < 2) colliders.push({ ...chapelAt(-2.6, -k * 1.0), r: 0.55 }); if (k < 3) colliders.push({ ...chapelAt(2.6, -k * 1.0), r: 0.55 }); } for (const lx of [-2, -1, 0, 1, 2]) colliders.push({ ...chapelAt(lx, -4.2), r: 0.6 }); for (const lx of [-2, -1.3, 1.3, 2]) colliders.push({ ...chapelAt(lx, 4.2), r: 0.6 }); }
  // The two halves of the Whistling Gap.
  const gapAt = (lx, lz) => ({ x: GAP.x + lx * Math.cos(GAP.ry) + lz * Math.sin(GAP.ry), z: GAP.z - lx * Math.sin(GAP.ry) + lz * Math.cos(GAP.ry) });
  for (const s of [-1, 1]) for (const lz of [-2, 0, 2]) colliders.push({ ...gapAt(s * 3.6, lz), r: 2.2 });
  colliders.push({ x: TRUNK.x - Math.sin(TRUNK.ry) * 1.2, z: TRUNK.z - Math.cos(TRUNK.ry) * 1.2, r: 1.3 });

  const flameMat = new THREE.MeshBasicMaterial({ color: 0xffb04a, transparent: true, opacity: 0.9, fog: false, toneMapped: false });
  loadProps().then((mk) => {
    make = mk; if (!make) return;
    const quiet = (m) => { if (!m) return null; m.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.userData.noShadow = true; } }); return m; };
    // One piece of the models as a single mesh with its colours painted on: one draw each, however many materials it was made of.
    const one = (name, skip) => { const o = make.single(name, skip); if (!o) return null; const m = new THREE.Mesh(o.geometry, o.material); m.userData.noShadow = true; return m; };
    W.one = one;
    const put = (name, x, z, ry = 0, s = 1, dy = 0, skip) => { const m = one(name, skip); if (!m) return null; m.position.set(x, terrainHeight(x, z) + dy, z); m.rotation.y = ry; m.scale.setScalar(s); scene.add(m); return m; };
    const many = (name, list, reach) => { const one = make.single(name); if (!one || !list.length) return null; const im = new THREE.InstancedMesh(one.geometry, one.material, list.length), d = new THREE.Object3D(); list.forEach((q, i) => { d.position.set(q.x, (q.y !== undefined ? q.y : terrainHeight(q.x, q.z)) + (q.dy || 0), q.z); d.rotation.set(0, q.ry || 0, 0); d.scale.setScalar(q.s || 1); d.updateMatrix(); im.setMatrixAt(i, d.matrix); }); im.frustumCulled = false; im.userData.noShadow = true; scene.add(im); return im; };
    // The folk themselves.
    for (const f of folk) {
      const pup = make.puppet(f.def.model);
      if (pup) { f.pup = pup; const g = pup.group; const crook = f.def.id === 'shepherd' ? one('shepherd_crook') : null; if (crook) { crook.position.set(0.72, 0, 0.25); g.add(crook); } g.scale.setScalar(f.def.size); g.rotation.y = f.home; g.position.set(f.x, f.y, f.z); scene.add(g); f.group = g; continue; }
      const g = one(f.def.model, /_(head|arm|leg\d)$/); if (!g) continue;
      // The parts that move: a head each, and the Gardener's digging arm. Each turns about its own joint.
      const joint = { forager: [0, 0.85, 0.25], gardener: [0, 0.9, 0.1], shepherd: [0, 1.0, 0.45], beachcomber: [0, 0.9, 0.05], castaway: [0, 0.8, 0.3], pedlar: [0, 1.2, 0.6] }[f.def.id], head = one(f.def.model + '_head'); if (head && joint) { head.position.set(...joint); g.add(head); f.head = head; }
      if (f.def.id === 'gardener') { const arm = one('gardener_arm'); if (arm) { arm.position.set(0.42, 0.78, 0.2); g.add(arm); f.arm = arm; } }
      g.scale.setScalar(f.def.size); g.rotation.y = f.home; g.position.set(f.x, f.y, f.z); scene.add(g); f.group = g;
      if (f.def.id === 'pedlar') { f.legs = [[-0.2, -0.55], [0.2, -0.55], [-0.2, 0.62], [0.2, 0.62]].map(([x, y], i) => { const l = one('pedlar_leg' + i); if (!l) return null; l.position.set(x, 0.82, -y); g.add(l); return l; }); }
    }
    // Landmarks.
    const mill = put('windmill', WINDMILL.x, WINDMILL.z, WINDMILL.ry, 1, -0.15, 'windmill_sails');
    sails = one('windmill_sails'); if (mill && sails) { sails.position.set(0, 7.2, 2.85); mill.add(sails); updaters.push((dt) => { if (sails.visible) sails.rotation.z += dt * (0.35 + 0.5 * api.wind()); }); }
    put('chapel_ruin', CHAPEL.x, CHAPEL.z, CHAPEL.ry, 1, -0.1);
    put('watchtower', WATCH.x, WATCH.z, WATCH.ry, 1, -0.2);
    const well = put('well', WELL.x, WELL.z, 0.4, 1, -0.05, 'well_roof'); wellRoof = one('well_roof'); if (well && wellRoof) well.add(wellRoof);
    put('fishing_hut', HUT.x, HUT.z, HUT.ry, 1, 0.5);
    { const m = put('wreck_mast', MAST.x, MAST.z, 0.7, 1.25, 0); if (m) { m.position.y = -0.6; m.rotation.z = 0.12; } }
    for (const s of [-1, 1]) { const p = gapAt(s * 3.9, 0), m = put(s < 0 ? 'sea_stack_1' : 'sea_stack_0', p.x, p.z, GAP.ry + (s < 0 ? 0.2 : Math.PI), 0.8, 2.2); if (m) m.rotation.z = s * 0.05; }
    put('fallen_trunk', TRUNK.x, TRUNK.z, TRUNK.ry, 1.9, 0.5);
    { const m = put('rowboat', SUNKEN.x, SUNKEN.z, 2.3, 1.15, -0.32); if (m) m.rotation.z = 0.3; }
    put('beehives', ORCHARD.x - 9, ORCHARD.z + 8, 0.8); put('beehives', GARDEN.x - 4, GARDEN.z + 9.5, 2.4);
    { const r = mulberry32(404), trees = []; for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2 + r() * 0.4, d = 5 + r() * 9; trees.push({ x: ORCHARD.x + Math.cos(a) * d, z: ORCHARD.z + Math.sin(a) * d, ry: r() * 6, s: 0.9 + r() * 0.4 }); colliders.push({ x: trees[i].x, z: trees[i].z, r: 0.35 }); } many('apple_tree', trees); }
    many('milestone', milestones); many('bench', benches); many('fire_ring', FIRES);
    many('gate', [[-146, 3.4, 0.2], [-232, -6.2, 1.9], [-40, 58.8, 1.95], [-303, -82.8, 0.5], [-63, -42.6, 0.25]].map(([x, z, ry]) => ({ x, z, ry: ry + Math.PI / 2 })));      // each stands open, swung back beside the path
    for (const p of posts) { const g = put('fingerpost', p.x, p.z, 0, 1, 0, 'fingerpost_arm'); if (!g) continue; p.arms.forEach((a, i) => { const arm = one('fingerpost_arm' + i); arm.position.y = 2.0 - i * 0.3; arm.rotation.y = a.ry; g.add(arm); }); }
    // The works: where the pieces lie, and the bridge itself, which is built here plank by plank.
    for (const k in WORKS) { const W = WORKS[k]; put(W.model, W.pile.x, W.pile.z, 0.7, k === 'plank' ? 1.6 : 1.1); put(W.model, W.pile.x + 1.8, W.pile.z + 1.1, 2.1, k === 'plank' ? 1.5 : 0.9); colliders.push({ x: W.pile.x + 0.8, z: W.pile.z + 0.5, r: 1.3 }); }
    { const dx = BRIDGE.bx - BRIDGE.ax, dz = BRIDGE.bz - BRIDGE.az, L = Math.hypot(dx, dz), ry = Math.atan2(dx, dz), N = Math.round(L / 0.62), wood = new THREE.MeshStandardMaterial({ color: 0x92724d, roughness: 0.95, flatShading: true }), grp = new THREE.Group(), d = new THREE.Object3D();
      // Planks are laid from both ends toward the middle, so the first so-many of them are the ones that are down.
      plankMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(2.3, 0.1, 0.5), wood, N); plankMesh.frustumCulled = false; plankTotal = N;
      for (let j = 0; j < N; j++) { const i = j % 2 ? N - 1 - (j >> 1) : j >> 1, k = (i + 0.5) / N; d.position.set(BRIDGE.ax + dx * k, bridgeY(k) - 0.06, BRIDGE.az + dz * k); d.rotation.set(0, ry + (((i * 7) % 5) - 2) * 0.012, 0); d.updateMatrix(); plankMesh.setMatrixAt(j, d.matrix); }
      grp.add(plankMesh);
      const rope = new THREE.MeshStandardMaterial({ color: 0xb09a6a, roughness: 1 }), post = new THREE.MeshStandardMaterial({ color: 0x4f3b28, roughness: 1, flatShading: true }), nx = dz / L, nz = -dx / L, ropes = [], postsG = [];
      for (const s of [-1, 1]) {
        for (const k of [-0.02, 1.02]) { const g = new THREE.CylinderGeometry(0.11, 0.14, 2.3, 6); g.translate(BRIDGE.ax + dx * k + nx * s * 1.25, (k < 0.5 ? BRIDGE.ya : BRIDGE.yb) + 0.75, BRIDGE.az + dz * k + nz * s * 1.25); postsG.push(g); }
        for (const [lift, sag, r] of [[1.15, 0.9, 0.035], [-0.02, 0.57, 0.05]]) { const pts = []; for (let i = 0; i <= 14; i++) { const k = i / 14; pts.push(new THREE.Vector3(BRIDGE.ax + dx * k + nx * s * 1.2, lerp(BRIDGE.ya, BRIDGE.yb, k) + lift - sag * Math.sin(k * Math.PI), BRIDGE.az + dz * k + nz * s * 1.2)); } ropes.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 28, r, 5)); }
      }
      grp.add(new THREE.Mesh(mergeGeometries(ropes, false), rope), new THREE.Mesh(mergeGeometries(postsG, false), post));
      grp.traverse((o) => { o.userData.noShadow = true; }); scene.add(grp); far.push({ g: grp, x: BRIDGE.ax, z: BRIDGE.az, reach: 260 });
      for (const k of [0, 1]) { const x = BRIDGE.ax + dx * (k ? 1.04 : -0.04), z = BRIDGE.az + dz * (k ? 1.04 : -0.04); for (const s of [-1, 1]) colliders.push({ x: x + nx * s * 1.45, z: z + nz * s * 1.45, r: 0.3 }); } }
    // The Giant's Steps: columns of black rock, the last and widest with a nest on it.
    { const rock = new THREE.MeshStandardMaterial({ color: 0x3f3d47, roughness: 0.9, flatShading: true }), top = new THREE.MeshStandardMaterial({ color: 0x565360, roughness: 0.95, flatShading: true }), grp = new THREE.Group(), cols = [], caps = [];
      for (const st of STEPS) { const h = st.y + 6, g = new THREE.CylinderGeometry(st.r * 1.02, st.r * 1.12, h, 6); g.rotateY(st.x); g.translate(st.x, st.y - h / 2 - 0.02, st.z); cols.push(g); const c = new THREE.CylinderGeometry(st.r * 0.98, st.r * 1.02, 0.08, 6); c.rotateY(st.x); c.translate(st.x, st.y - 0.03, st.z); caps.push(c); }
      grp.add(new THREE.Mesh(mergeGeometries(cols, false), rock), new THREE.Mesh(mergeGeometries(caps, false), top));
      const twig = new THREE.MeshStandardMaterial({ color: 0x6b5236, roughness: 1, flatShading: true }), nest = new THREE.Mesh(new THREE.TorusGeometry(1.25, 0.34, 5, 11), twig); nest.rotation.x = Math.PI / 2; nest.position.set(STACK.x + 1.3, STACK.y + 0.22, STACK.z - 1.2); grp.add(nest);
      { const eggs = []; for (let i = 0; i < 3; i++) { const g = new THREE.SphereGeometry(0.2, 7, 6); g.scale(1, 1.3, 1); g.translate(nest.position.x + Math.cos(i * 2.1) * 0.3, STACK.y + 0.3, nest.position.z + Math.sin(i * 2.1) * 0.3); eggs.push(g); } grp.add(new THREE.Mesh(mergeGeometries(eggs, false), new THREE.MeshStandardMaterial({ color: 0xcfd8c6, roughness: 0.6 }))); }
      grp.traverse((o) => { o.userData.noShadow = true; }); scene.add(grp); far.push({ g: grp, x: STACK.x, z: STACK.z, reach: 260 }); colliders.push({ x: nest.position.x, z: nest.position.z, r: 1.3 }); }
    // The ring that comes up at dusk.
    { ring = new THREE.Group(); for (let i = 0; i < 13; i++) { const a = i / 13 * Math.PI * 2, m = quiet(make('glow_mushrooms')); if (!m) break; m.traverse((o) => { if (o.isMesh && /cap/.test(o.material.name)) { o.material.emissive.set(0x9fe8d0); o.material.emissiveIntensity = 1.4; } }); const x = DUSKRING.x + Math.cos(a) * 3.4, z = DUSKRING.z + Math.sin(a) * 3.4; m.position.set(x, terrainHeight(x, z), z); m.rotation.y = a * 3; m.scale.setScalar(1.3); ring.add(m); } ring.visible = false; scene.add(ring); }
    // Fires that are lit after dark.
    for (const f of FIRES) { const fl = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.95, 6), flameMat); fl.position.set(f.x, terrainHeight(f.x, f.z) + 0.6, f.z); fl.visible = false; scene.add(fl); f.flame = fl; }
    // The flock.
    { const r = mulberry32(88), lump = make.puppet('sheep'); if (lump) { for (let i = 0; i < 5 + LAMBS.length; i++) { const lamb = i >= 5 ? LAMBS[i - 5] : null, a = r() * 6.28, d = 4 + r() * 10, s = { lamb, x: lamb ? lamb.x : HILL.x - 8 + Math.cos(a) * d, z: lamb ? lamb.z : HILL.z - 4 + Math.sin(a) * d, yaw: r() * 6, tx: 0, tz: 0, wait: r() * 8, v: 0, size: lamb ? 0.52 : 0.85 + r() * 0.2, hop: r() * 6, y: 0, seen: true }; s.tx = s.x; s.tz = s.z; sheep.push(s); } for (const s of sheep) { s.pup = make.puppet('sheep'); if (s.pup) { s.pup.group.scale.setScalar(s.size); s.pup.mesh.castShadow = false; s.grazeAt = r() * 10; scene.add(s.pup.group); } } flock = true; } }
    setWorks();
  });

  // ---------- what is in reach ----------
  function options(opts) {
    if (api.perch()) return;
    for (const f of folk) if (near(f, f.def.id === 'pedlar' ? 4 : 3.4)) {
      const key = f.def.id;
      if (stormOpen() && !S.told.includes(key)) opts.unshift({ label: 'Ask about the night of the storm', run: () => { me.targetYaw = turnTo(f.x - me.x, f.z - me.z); askStorm(key, (l) => says(f, l)); } });
      opts.unshift({ label: `Greet ${nameOf(key)}`, run: () => greet(f) });
      for (const fn of extra) fn(key, f, opts);
    }
    if (stormOpen()) for (const key of ['hermit', 'heron']) if (!S.told.includes(key) && near(api.places[key], 3.6)) opts.unshift({ label: 'Ask about the night of the storm', run: () => askStorm(key, api.sayAs[key]) });
    for (const s of sheep) if (s.lamb && lambState(s.lamb.id) === 'lost' && near(s, (W.boosted && W.boosted('charm')) || api.species().id === 'wolf' ? 16 : 2.8)) opts.unshift({ label: api.species().id === 'wolf' ? 'Howl for the lamb' : 'Call the lamb', run: () => { S.lambs[s.lamb.id] = 'follow'; save(); api.playEmote('greet'); audio.bark && audio.bark(); addLog('', lambsWanted() ? 'The lamb looks at you, decides you will do, and falls in behind. Walk it home to the High Meadow.' : 'The lamb falls in behind you. It must belong to somebody. There are sheep on the High Meadow.', 'sys'); } });
    if (carry) { const W = WORKS[carry.kind]; if (near(W.at, 5)) opts.unshift({ label: `Lay down the ${W.many}`, run: layPieces }); }
    else for (const k in WORKS) { const W = WORKS[k]; if (!workDone(k) && near(W.pile, 3.6)) opts.unshift({ label: `Take ${W.many} for ${W.name}`, run: () => takePieces(k) }); if (!workDone(k) && near(W.at, 4)) opts.push({ label: `Look over ${W.name}`, run: () => addLog('', `${Math.min(works[k], W.need)} of ${W.need} ${W.many} are in. The rest lie ${k === 'plank' ? 'a few steps back along the cliff' : k === 'sail' ? 'at the foot of the meadow, towards the valley' : 'in the woods south of the crossroads'}. Anybody can carry them.`, 'sys') }); }
    if (api.cottage.inside(me.x, me.z) && !S.spots.includes('cellar')) opts.push({ label: 'Nose about the hearth', run: openCellar });
    const b = benches.find((q) => near(q, 2.2)); if (b) opts.push({ label: 'Sit on the bench', run: () => { api.restAt(b.x + Math.sin(b.ry) * 0.2, b.z + Math.cos(b.ry) * 0.2, b.ry, 'sit'); addLog('', b.view, 'sys'); api.questEvent('bench'); } });
    const ms = null; if (ms) opts.push({ label: 'Read the milestone', low: true, run: () => { const d = Math.round(Math.hypot(ms.x - MAPMAKER.x, ms.z - MAPMAKER.z) / 0.75 / 10) * 10, a = AREAS.slice().sort((p, q) => Math.hypot(p.x - ms.x, p.z - ms.z) - Math.hypot(q.x - ms.x, q.z - ms.z))[0]; addLog('', `Cut into the stone: THE LANDING ${d} PACES. Under it, smaller and newer: ${a.name}.`, 'sys'); } });
    const fp = posts.find((q) => near(q, 2.6)); if (fp) opts.push({ label: 'Read the signpost', run: () => addLog('', 'Three arms. ' + fp.arms.map((a) => `${a.name}, ${a.paces} paces`).join('. ') + '.', 'sys') });
    for (const fn of extra) fn(null, null, opts);
  }

  // ---------- every frame ----------
  let slow = 0;
  function update(dt, t) {
    const dk = dark();
    for (const f of folk) {
      if (f.def.id === 'pedlar') {
        const p = pedlarNow(), sx = p.x - p.dz * 1.5, sz = p.z + p.dx * 1.5; place(f, sx, sz); f.moving = p.moving;
        if (f.group) { const d = Math.hypot(me.x - sx, me.z - sz), want = !p.moving && d < 7 ? turnTo(me.x - sx, me.z - sz) : turnTo(p.dx, p.dz); let dy = want - f.group.rotation.y; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); f.group.rotation.y += dy * (1 - Math.exp(-dt * 3)); f.walk = (f.walk || 0) + (p.moving ? dt * 5.2 : 0); if (f.legs) f.legs.forEach((l, i) => { l.rotation.x = p.moving ? Math.sin(f.walk + (i === 0 || i === 3 ? 0 : Math.PI)) * 0.42 : l.rotation.x * (1 - Math.min(1, dt * 6)); }); f.group.position.y = f.y + (p.moving ? Math.abs(Math.sin(f.walk)) * 0.035 : 0); }
      } else {
        // By night, or with the tide out, some of them are somewhere else. They move while nobody is looking.
        const want = f.def.night && dk > 0.62 ? 'night' : f.def.low && lowTide() && dk < 0.62 ? 'low' : 'day';
        if (want !== f.at && Math.hypot(me.x - f.x, me.z - f.z) > 38) { const to = want === 'day' ? f.def : f.def[want]; if (Math.hypot(me.x - to.x, me.z - to.z) > 38) { f.at = want; place(f, to.x, to.z); } }
        if (f.group) { const d = Math.hypot(me.x - f.x, me.z - f.z), want2 = d < 7 ? turnTo(me.x - f.x, me.z - f.z) : f.home; let dy = want2 - f.group.rotation.y; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); f.group.rotation.y += dy * (1 - Math.exp(-dt * 1.8)); const s = f.def.size; f.group.scale.set(s, s * (1 + Math.sin(t * 1.2 + f.x) * 0.012), s); }
      }
      const d = Math.hypot(me.x - f.x, me.z - f.z);
      if (f.pup && d < 70) {
        const s = f.def.size, id = f.def.id;
        if (id === 'shepherd') { f.group.scale.setScalar(s); let lk = 0; if (d < 7) { lk = turnTo(me.x - f.x, me.z - f.z) - f.group.rotation.y; lk = clamp(Math.atan2(Math.sin(lk), Math.cos(lk)), -0.8, 0.8); } moveQuad(f.pup, { speed: 0, graze: d < 7 ? 0 : Math.sin(t * 0.21) > 0.2 ? 1 : 0, lie: 0, look: lk, size: s }, dt, t); }
        else if (id === 'pedlar') { const v = f.px === undefined ? 0 : Math.hypot(f.x - f.px, f.z - f.pz) / Math.max(dt, 0.001); f.px = f.x; f.pz = f.z; f.v = (f.v || 0) + ((v < 6 ? v : 0) - (f.v || 0)) * Math.min(1, dt * 4); moveQuad(f.pup, { speed: f.moving ? Math.max(0.6, f.v) : 0, graze: !f.moving && d > 7 && Math.sin(t * 0.17) > 0.5 ? 0.7 : 0, lie: 0, size: 1.75 }, dt, t); }
        else moveFolk(f.pup, id, { near: d < 7, talk: f.bubble && f.bubble.visible }, dt, t);
      }
      if (f.head && d < 60) { const h = f.head, id = f.def.id, calm = d < 7 ? 0.35 : 1, ph = f.def.tall * 3;
        if (id === 'forager') { h.rotation.y = Math.sin(t * 0.37 + ph) * 0.3 * calm; h.rotation.x = Math.sin(t * 0.8) * 0.07 + (Math.sin(t * 0.5) > 0.6 ? Math.sin(t * 9) * 0.05 : 0); }
        else if (id === 'gardener') { h.rotation.y = Math.sin(t * 0.3) * 0.22 * calm; h.rotation.x = 0.08 + Math.sin(t * 0.45) * 0.05; if (f.arm) f.arm.rotation.x = Math.sin(t * 0.25) > 0 && d > 5 ? Math.max(0, Math.sin(t * 2.4)) * 0.8 : f.arm.rotation.x * 0.9; }
        else if (id === 'shepherd') { const graze = d < 7 ? 0 : Math.max(0, Math.sin(t * 0.21)); h.rotation.x = graze * 0.55 + Math.sin(t * 6) * 0.02 * graze; h.rotation.y = Math.sin(t * 0.33) * 0.2 * (1 - graze) * calm; }
        else if (id === 'beachcomber') { h.rotation.y = Math.sin(t * 0.5) * 0.35 * calm; h.rotation.z = Math.sin(t * 0.9) * 0.06; }
        else if (id === 'castaway') { h.rotation.y = Math.sin(t * 0.17) * 0.9 * calm; h.rotation.x = Math.sin(t * 0.4) * 0.05; }
        else if (id === 'pedlar') { h.rotation.x = f.walk && f.moving ? Math.sin(f.walk * 2) * 0.07 : 0.12 + Math.sin(t * 0.6) * 0.1; h.rotation.y = f.moving ? 0 : Math.sin(t * 0.3) * 0.25 * calm; } }
      f.tag.visible = d < 26; f.tag.material.opacity = 1 - smoothstep(18, 26, d);
      if (f.bubble.visible) { f.life -= dt; f.bubble.material.opacity = clamp(f.life / 0.6, 0, 1); if (f.life <= 0) f.bubble.visible = false; }
      if (api.entered() && d < 8 && t > f.next && S.met[f.def.id]) { f.next = t + 70 + Math.random() * 60; const l = dk > 0.6 && f.def.nightSay ? f.def.nightSay : f.def.about; says(f, l[Math.floor(Math.random() * l.length)]); }
    }
    // The flock grazes the meadow and bunches up by the fire after dark; a lamb that has been called follows.
    const sh = who.shepherd, fold = dk > 0.62 ? { x: WINDMILL.x + 9, z: WINDMILL.z + 9, r: 5 } : { x: HILL.x - 8, z: HILL.z - 4, r: 15 };
    for (const s of sheep) {
      const st = s.lamb ? lambState(s.lamb.id) : 'home';
      const dm = Math.hypot(me.x - s.x, me.z - s.z);
      if (dm > 130 && st !== 'follow') { s.seen = false; continue; } s.seen = true;
      let sp = 0;
      if (st === 'follow') {
        if (dm > 34) { s.x = me.x - Math.sin(me.yaw) * 2; s.z = me.z - Math.cos(me.yaw) * 2; }
        if (dm > 2.3) { s.tx = me.x; s.tz = me.z; sp = clamp((dm - 1.6) * 1.6, 0, 6.5); }
        if (Math.hypot(s.x - sh.x, s.z - sh.z) < 9 || Math.hypot(s.x - HILL.x, s.z - HILL.z) < 12) { S.lambs[s.lamb.id] = 'home'; save(); audio.pop(720); const n = lambsHome(); addLog('', n >= LAMBS.length ? 'The last lamb goes straight to the flock as if it had never been anywhere. That is all three home.' : `The lamb sees the flock and is gone from your side. ${n} of ${LAMBS.length} home.`, 'sys'); if (near(sh, 14)) says(sh, n >= LAMBS.length ? 'Three. That is my count right for the first time since the spring. I am obliged to you.' : 'That is one of mine. Where was it? No. Do not tell me.'); api.questEvent('lamb'); api.tell('lamb', LAMBS.indexOf(s.lamb)); s.wait = 2; if (n >= LAMBS.length && !api.inv.woolcloak) setTimeout(() => { api.give('woolcloak'); addLog('', 'The Shepherd takes the cloak off his own back and puts it over yours. He has another. He says he has another.', 'sys'); }, 5200); }
      } else if (st === 'home') {
        s.wait -= dt;
        if (dm < 4.5 && api.speed() > 3.2 && !(W.boosted && W.boosted('charm'))) { const a = Math.atan2(s.z - me.z, s.x - me.x); s.tx = s.x + Math.cos(a) * 9; s.tz = s.z + Math.sin(a) * 9; s.wait = 3; s.run = 1.2; if (!s.bleat || t > s.bleat) { s.bleat = t + 6; api.questEvent('scatter'); } }
        else if (s.wait < 0) { const a = Math.random() * 6.28, d = Math.random() * fold.r; s.tx = fold.x + Math.cos(a) * d; s.tz = fold.z + Math.sin(a) * d; s.wait = 5 + Math.random() * 14; }
        s.run = Math.max(0, (s.run || 0) - dt);
        const dt2 = Math.hypot(s.tx - s.x, s.tz - s.z); if (dt2 > 0.6) sp = s.run > 0 ? 5.5 : Math.hypot(s.x - fold.x, s.z - fold.z) > fold.r + 8 ? 2.6 : 0.7;
      }
      s.spNow = sp;
      if (sp > 0) { const a = Math.atan2(s.tx - s.x, s.tz - s.z); let dy = a - s.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); s.yaw += dy * Math.min(1, dt * 6); s.x += Math.sin(s.yaw) * sp * dt; s.z += Math.cos(s.yaw) * sp * dt; s.hop += dt * (4 + sp * 2.2); }
      s.y = groundHeight(s.x, s.z) + (sp > 0 ? Math.abs(Math.sin(s.hop)) * 0.07 * Math.min(2, sp) : 0);
    }
    for (const k of ['mapmaker', 'hermit', 'heron']) { const o = api.world[k]; if (!o || !o.pup) continue; const d = Math.hypot(me.x - o.x, me.z - o.z); if (d < 70) moveFolk(o.pup, k, { near: d < 7, talk: false }, dt, t); }
    // Each of the flock walks on its own legs, grazes when it has stopped, and lies down in the fold after dark.
    if (flock) for (const s of sheep) { const p = s.pup; if (!p) continue; p.group.visible = !!s.seen; if (!s.seen) continue; p.group.position.set(s.x, groundHeight(s.x, s.z), s.z); p.group.rotation.y = s.yaw; const v = s.spNow || 0; s.grazeAt -= dt; if (s.grazeAt < -9) s.grazeAt = 4 + Math.random() * 9; if (Math.hypot(me.x - s.x, me.z - s.z) < 80) moveQuad(p, { speed: v, graze: s.grazeAt < 0 && !(s.lamb && lambState(s.lamb.id) === 'follow') ? 1 : 0, lie: dk > 0.7 && v < 0.05 && !s.lamb ? 1 : 0, size: s.size }, dt, t); }
    if (performance.now() < slow) return; slow = performance.now() + 400;
    // Hidden places are found by walking into them.
    if (api.entered()) for (const id in SPOT_AT) { const p = SPOT_AT[id]; if (!p || S.spots.includes(id)) continue; if (Math.hypot(me.x - p.x, me.z - p.z) < (id === 'stack' ? 3.6 : id === 'gap' ? 2.2 : 3) && (id !== 'duskring' || (ring && ring.visible)) && (id !== 'cove' || lowTide())) foundSpot(id); }
    if (ring) ring.visible = dk > 0.28 && Math.hypot(me.x - DUSKRING.x, me.z - DUSKRING.z) < 120;
    for (const f of FIRES) if (f.flame) { f.flame.visible = f.night && dk > 0.5; if (f.flame.visible) { f.flame.scale.set(1 + Math.sin(t * 9 + f.x) * 0.12, 1 + Math.sin(t * 13 + f.z) * 0.18, 1); f.flame.rotation.y = t * 2; } }
    for (const u of updaters) u(0.4, t);
    for (const q of far) q.g.visible = Math.hypot(me.x - q.x, me.z - q.z) < q.reach;
  }
  const fast = [];      // things that want every frame
  const heard = [];     // things that want to know what other visitors have done
  Object.assign(W, {
    S, save, folk, who, works, WORKS, options, extra, updaters, fast, greeted, onTaken, foundSpot, says, nameOf, lowTide, near, benches,
    update(dt, t) { update(dt, t); for (const f of fast) f(dt, t); },
    carrying: () => carry, lambsHome, workDone, trade: (key, who) => W.tradeSheet && W.tradeSheet(key, who),
    count: { lambs: lambsHome, accounts: () => S.told.length, spots: () => S.spots.length, work: (q) => (workDone(q.arg) ? 1 : 0), laid: () => S.laid || 0, met: () => FOLK.filter((f) => S.met[f.id]).length },
    whoAt: (k) => { const q = k === 'mapmaker' ? api.world.mapmaker : api.places[k]; return q ? { x: q.x, z: q.z } : null; },
    where: {
      ...Object.fromEntries(ROUND.map((r, n) => [r.id, () => (api.taken[r.id] ? api.places[r.to] : api.places[r.from])])),
      'lr-lambs': () => { const f = sheep.find((s) => s.lamb && lambState(s.lamb.id) === 'follow'); if (f) return who.shepherd; const l = LAMBS.find((q) => lambState(q.id) === 'lost' && S.said['lamb-' + q.id]); return l || who[(LAMBS.find((q) => lambState(q.id) === 'lost') || {}).seen] || who.shepherd; },
      'lr-accounts': () => { const k = STORM_WHO.find((q) => !S.told.includes(q)); return k ? api.places[k] : api.places.hermit; }, 'lr-fourth': () => api.places.hermit,
      'lr-w-bridge': () => (carry && carry.kind === 'plank' ? WORKS.plank.at : WORKS.plank.pile), 'lr-w-mill': () => (carry && carry.kind === 'sail' ? WORKS.sail.at : WORKS.sail.pile), 'lr-w-well': () => (carry && carry.kind === 'rope' ? WORKS.rope.at : WORKS.rope.pile),
      'lr-folk': () => folk.find((f) => !S.met[f.def.id]) || who.forager, 'lr-chapel': () => CHAPEL,
    },
    mapPins: () => ({ peers: [...api.peers.values()].filter((p) => p.fade > 0.5).map((p) => ({ x: p.av.x, z: p.av.z, name: p.data.name })), me: { x: me.x, z: me.z }, folk: S.fullmap ? folk.map((f) => ({ x: f.x, z: f.z, name: f.def.short })) : [], spots: SPOTS.filter((s) => SPOT_AT[s.id] && (S.spots.includes(s.id) || S.hinted.includes(s.id))).map((s) => ({ x: SPOT_AT[s.id].x, z: SPOT_AT[s.id].z, name: s.name, found: S.spots.includes(s.id) })) }),
    fires: FIRES, hives: [{ x: ORCHARD.x - 9, z: ORCHARD.z + 8 }, { x: GARDEN.x - 4, z: GARDEN.z + 9.5 }], heard, SPOT_AT, LAMBS, sheep, posts, milestones, setWorks,
    seenLines(cards) { const out = [{ text: 'What you have seen of each part', kind: 'head' }]; for (const a of AREAS) { const inA = (p) => p && Math.hypot(p.x - a.x, p.z - a.z) < a.r; let got = 0, all = 0; const add = (ok) => { all++; if (ok) got++; }; for (const f of folk) if (f.def.area === a.id) add(!!S.met[f.def.id]); for (const sp of SPOTS) if (inA(SPOT_AT[sp.id])) add(S.spots.includes(sp.id)); for (const id in api.SIGHT_AT) if (inA({ x: api.SIGHT_AT[id][0], z: api.SIGHT_AT[id][1] })) add(!!cards[id]); for (const b of W.BIRDS || []) if (inA(b)) add((S.birds || []).includes(b.id)); if (all) out.push({ text: `${a.name}: ${got} of ${all}`, meta: got >= all ? 'Everything here has been seen.' : 'Sights, hidden places, who lives there, and birds.' }); } return out; },
    spotsLeft: () => SPOTS.filter((s) => SPOT_AT[s.id] && !S.spots.includes(s.id)).map((s) => SPOT_AT[s.id]),
    hear(d) { if (d.ev.kind === 'lamb' && LAMBS[d.ev.n] && lambState(LAMBS[d.ev.n].id) !== 'home' && near(who.shepherd, 30)) { S.lambs[LAMBS[d.ev.n].id] = 'home'; save(); addLog('', `${d.name} brings a lamb in, and you were there to turn it into the flock. It counts for you both. ${lambsHome()} of ${LAMBS.length} home.`, 'sys'); api.questEvent('lamb'); }
      if (d.ev.kind === 'call' && api.entered()) { const p = [...api.peers.values()].find((q) => q.data.name === d.name); if (p) { const dist = Math.hypot(p.av.x - me.x, p.av.z - me.z); if (dist > 40) { const a = Math.atan2(p.av.x - me.x, -(p.av.z - me.z)), dirs = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west']; addLog('', `A call, a long way off to the ${dirs[Math.round(((a + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 4)) % 8]}: ${d.name}, about ${Math.round(dist / 0.75 / 10) * 10} paces. They are on your map.`, 'sys'); } } }
      const wk = ['plank', 'sail', 'rope'][d.ev.n]; if (d.ev.kind === 'work' && wk) addLog('', `${d.name} has laid the last piece of ${WORKS[wk].name}.`, 'sys'); for (const h of heard) h(d); },
  });
  return W;
}
