// Things to do on Lantern Rock, and uses for what is picked up: fishing, cooking over a fire, trading, planting in
// the valley garden, digging where the ground is disturbed, watching birds, skipping stones, a race, hide and seek,
// a shelf and a guest book in the keeper's cottage, and giving things to other visitors.
import * as THREE from 'three';
import { terrainHeight, groundHeight, colliders, mulberry32, clamp, lerp, POOL, FARBEACH, HUT, COVE, CHAPEL, CAVE, ORCHARD, GARDEN, WELL, WINDMILL, WATCH, STACK, TRUNK, MAST, HILL, HOLLOW_TREE, FLATS, SHELTER, SIGN, FIRE, SUNKEN, GAP, tideAt, TIDE } from './terrain.js';
import { loadProps } from './props.js';
import { ITEMS } from './items.js';

const day = () => Math.floor((Date.now() - new Date().getTimezoneOffset() * 60000) / 86400000);      // the visitor's own day, not the clock at Greenwich
export const FISH = {
  pool: { x: POOL.x + 3, z: POOL.z - POOL.r + 1.2, name: 'the pool in Stillwater', day: ['fish_trout'], night: ['fish_eel', 'fish_eel', 'fish_moonfish'] },
  beach: { x: FARBEACH.x - Math.sin(FARBEACH.a) * 14 + Math.cos(FARBEACH.a) * 3.5, z: FARBEACH.z + Math.cos(FARBEACH.a) * 14 + Math.sin(FARBEACH.a) * 3.5, name: 'the surf on the Far Beach', day: ['fish_mackerel'], night: ['fish_mackerel', 'fish_moonfish'] },
  hut: { x: HUT.x - 2.5, z: HUT.z + 3.5, name: 'the water under the flats', tide: 'high', day: ['fish_mullet'], night: ['fish_mullet'] },
  cove: { x: COVE.x + COVE.ox * 3.4, z: COVE.z + COVE.oz * 3.4, name: 'the cove', tide: 'low', day: ['fish_blenny'], night: ['fish_blenny'] },
  chapel: { x: CHAPEL.x - 13, z: CHAPEL.z + 5, name: 'the deep water off Chapel Rock', day: ['fish_bass'], night: ['fish_bass', 'fish_moonfish'] },
  lake: { x: CAVE.lake.x + 7.5, z: CAVE.lake.z + 3, name: 'the lake under the hill', cave: true, day: ['fish_ghost'], night: ['fish_ghost'] },
};
const RECIPES = [
  { id: 'herbfish', needs: [['fish', 1], ['sprig', 1]], how: 'a fish and a sprig of heather' },
  { id: 'broth', needs: [['mushroom', 2], ['water', 1]], how: 'two brown caps and a flask of well water' },
  { id: 'bakedapple', needs: [['apple', 2], ['honey', 1]], how: 'two apples and a jar of honey' },
  { id: 'bannock', needs: [['flour', 1], ['water', 1]], how: 'a measure of flour and a flask of well water' },
  { id: 'soup', needs: [['onion', 2], ['water', 1]], how: 'two onions and a flask of well water' },
];
const TRADES = {
  beachcomber: [[[['mushroom', 3], ['sprig', 2]], ['shells', 1]], [[['apple', 2]], ['rope', 1]], [[['crystal', 2]], ['rope', 1]], [[['honey', 1]], ['seed_onion', 2]], [[['onion', 2]], ['seaglass', 2]]],
  pedlar: [[[['shell', 2], ['feather', 2]], ['ribbon', 1]], [[['glowcap', 2], ['fish', 1]], ['kite', 1]], [[['seaglass', 2]], ['seed_barley', 2]], [[['whelk', 2]], ['water', 1]], [[['pearl', 1]], ['lampoil', 2]], [[['fish', 2]], ['honey', 1]]],
};
const WANTS = [['mushroom', 2, 'a couple of brown caps'], ['sprig', 2, 'two sprigs of heather'], ['shell', 2, 'two cockle shells'], ['apple', 1, 'an apple'], ['fish', 1, 'a fish, any fish'], ['seaglass', 1, 'a piece of sea glass'], ['water', 1, 'a flask of water from the well'], ['honey', 1, 'a jar of honey'], ['feather', 1, 'a gull feather'], ['crystal', 1, 'a chip of crystal']];
export const BIRDS = [
  { id: 'lark', name: 'A skylark', x: HILL.x - 12, z: HILL.z + 11, when: 'day', tint: 0xa58f6c, says: 'Small and brown and louder than anything its size has a right to be.' },
  { id: 'owl', name: 'A tawny owl', x: HOLLOW_TREE.x + 5, z: HOLLOW_TREE.z - 4, up: 2.6, when: 'night', tint: 0x7a5c3e, s: 1.9, says: 'It turns its whole head to look at you, and is not impressed.' },
  { id: 'curlew', name: 'A curlew', x: FLATS.x + 14, z: FLATS.z - 6, when: 'low', tint: 0xb7a888, s: 1.6, says: 'Long legs, a longer bill, and a cry like something being let go.' },
  { id: 'kittiwake', name: 'A kittiwake', x: STACK.x + 1.3, z: STACK.z - 1.2, up: 0.5, y: STACK.y, tint: 0xe9ecee, s: 1.5, says: 'The ship on the flats was named for these. This one is sitting on three eggs and an oar.' },
  { id: 'puffin', name: 'A puffin', x: CHAPEL.x + 7, z: CHAPEL.z + 9, tint: 0x2c2f36, s: 1.3, says: 'It looks like it is dressed for something. It stands at the edge and considers the sea.' },
  { id: 'robin', name: 'A robin', x: ORCHARD.x + 4, z: ORCHARD.z + 3, tint: 0xc8623a, says: 'It follows whoever is digging. It has decided that is you.' },
  { id: 'cormorant', name: 'A cormorant', x: SHELTER.x - 9, z: SHELTER.z - 13, tint: 0x25282c, s: 2.0, says: 'Black, wet, and holding its wings out to dry like washing.' },
  { id: 'wren', name: 'A wren', x: TRUNK.x + 3.4, z: TRUNK.z + 1.6, up: 1.5, tint: 0x8a5f3c, s: 0.8, says: 'The smallest bird on the island, on the biggest log.' },
];
const MOUNDS = (() => { const r = mulberry32(977), out = []; let tries = 0; while (out.length < 18 && tries++ < 900) { const x = -330 + r() * 350, z = -140 + r() * 290; if (terrainHeight(x, z) < 1.2 || Math.hypot(x, z) < 26 || out.some((m) => Math.hypot(m.x - x, m.z - z) < 40)) continue; if (Math.abs(terrainHeight(x + 2, z) - terrainHeight(x - 2, z)) + Math.abs(terrainHeight(x, z + 2) - terrainHeight(x, z - 2)) > 1.6) continue; out.push({ id: out.length, x, z }); } return out; })();
const LOOT = [['shell', 2], ['seaglass', 1], ['crystal', 1], ['seed_onion', 1], ['seed_barley', 1], ['mushroom', 2], ['feather', 1], ['whelk', 1], ['sprig', 2], ['glowcap', 1]];
const RACE = [{ x: SIGN.x + 3, z: SIGN.z + 4 }, { x: -40, z: -1 }, { x: -76, z: -5 }, { x: -64, z: -44 }, { x: WATCH.x + 4, z: WATCH.z + 6 }, { x: -76, z: -5 }, { x: SIGN.x + 3, z: SIGN.z + 4 }];
const PLOTS = [0, 1, 2, 3].map((i) => ({ x: GARDEN.x + 11 + (i % 2) * 2.6, z: GARDEN.z + 0.5 + Math.floor(i / 2) * 2.6 }));
const GROW_MS = 8 * 3600000;

export function buildPlay(api, W) {
  const { scene, me, addLog, flash, audio, inv, give } = api, S = W.S, save = W.save, near = W.near;
  for (const k of ['fish', 'cool', 'boost']) if (!S[k] || typeof S[k] !== 'object') S[k] = {};
  for (const k of ['birds', 'shelf', 'plots']) if (!Array.isArray(S[k])) S[k] = [];
  if (!S.dug || S.dug.day !== day()) S.dug = { day: day(), ids: [] };
  if (!S.wants || S.wants.day !== day()) S.wants = { day: day(), done: [] };
  const dark = () => api.sky().dark, now = () => Date.now();
  const has = (id) => (id === 'fish' ? Object.keys(inv).filter((k) => ITEMS[k] && ITEMS[k].fish).reduce((n, k) => n + (inv[k] || 0), 0) : inv[id] || 0);
  const take = (id, n) => { if (id === 'fish') { for (const k of Object.keys(inv)) while (n > 0 && ITEMS[k] && ITEMS[k].fish && inv[k] > 0) { inv[k]--; n--; } } else inv[id] = Math.max(0, (inv[id] || 0) - n); api.store('ember.inv', inv); };
  const nameN = ([id, n]) => (id === 'fish' ? (n > 1 ? `${n} fish` : 'a fish') : `${n > 1 ? n + ' × ' : ''}${ITEMS[id].name}`);
  const cool = (key, mins) => { const ok = !S.cool[key] || now() - S.cool[key] > mins * 60000; if (ok) { S.cool[key] = now(); save(); } return ok; };
  const boosted = () => false;      // food is food: nothing eaten changes what a visitor can do
  W.boosted = boosted;
  const company = () => [...api.peers.values()].filter((p) => p.fade > 0.5);

  // ---------- eating ----------
  W.eat = (id) => {
    const it = ITEMS[id]; if (!it || !it.food || !inv[id]) return;
    take(id, 1); api.playEmote('sniff'); audio.pop(620); setTimeout(() => api.playEmote('wag'), 900);
    addLog('', `You eat ${it.name.charAt(0).toLowerCase() + it.name.slice(1)}. ${it.says}`, 'sys'); api.questEvent('ate'); api.tell('ate', Object.keys(ITEMS).indexOf(id));
  };

  // ---------- fishing ----------
  let fishing = null;
  const fishHere = () => { for (const id in FISH) { const f = FISH[id]; if (!near(f, 4.2)) continue; if (f.cave && api.cave() < 0.5) continue; const ty = tideAt(api.now()).y; if (f.tide === 'high' && ty < TIDE.flat + 0.15) continue; if (f.tide === 'low' && !W.lowTide()) continue; return id; } return null; };
  function cast(id) { fishing = { id, x: me.x, z: me.z, bite: now() + 2600 + Math.random() * 5200, state: 'wait' }; api.playEmote('paw'); addLog('', `You go still and watch ${FISH[id].name}.`, 'sys'); }
  function strike() {
    const f = FISH[fishing.id], list = dark() > 0.55 ? f.night : f.day, id = list[Math.floor(Math.random() * list.length)], it = ITEMS[id];
    fishing = null; api.playEmote('paw'); audio.splash && audio.splash(0.8);
    const first = !S.fish[id]; S.fish[id] = (S.fish[id] || 0) + 1; save(); give(id, 1, true);
    addLog('', `${it.name}! ${first ? it.says + ' That is a new one: ' + Object.keys(S.fish).length + ' of 8 kinds caught.' : 'Into the satchel.'}`, 'sys'); if (first) flash(it.name, 'A new kind of fish'); api.questEvent('fished');
  }

  // ---------- cooking, trading ----------
  const fireNear = () => near(FIRE, 4.6) || W.fires.some((f) => near(f, 3.4));
  function cookSheet() {
    const lines = RECIPES.map((r) => { const ok = r.needs.every(([id, n]) => has(id) >= n), it = ITEMS[r.id]; return { text: `${it.name}: ${r.how}`, meta: ok ? 'Press to cook. ' + it.says : 'You have not got it all. ' + it.says, kind: ok ? '' : 'dim', run: ok ? () => { const two = company().some((q) => Math.hypot(q.av.x - me.x, q.av.z - me.z) < 8); for (const [id, n] of r.needs) take(id, n); give(r.id, two ? 2 : 1, true); audio.pop(560); addLog('', `It goes on the fire, and comes off it as ${it.name.toLowerCase()}. ${two ? 'With somebody at the fire beside you there is enough for two: one to eat and one to give.' : 'It is in your satchel. Press it there to eat it.'}`, 'sys'); api.questEvent('cooked'); cookSheet(); } : undefined }; });
    api.openSheet({ title: 'Over the fire', lines, note: 'What you cook goes in the satchel. Cook with somebody beside you and there is enough for two.' });
  }
  function tradeSheet(key, who) {
    const lines = TRADES[key].map(([cost, [gid, gn]]) => { const got = ITEMS[gid].kind === 'wear' && inv[gid], ok = !got && cost.every(([id, n]) => has(id) >= n); return { text: `${cost.map(nameN).join(' and ')}  for  ${nameN([gid, gn])}`, meta: got ? 'You have this already.' : ok ? 'Press to swap.' : 'You have not got that to give.', kind: ok ? '' : 'dim', run: ok ? () => { for (const [id, n] of cost) take(id, n); give(gid, gn, true); audio.pop(680); addLog('', `Done. ${nameN([gid, gn])}, into the satchel.`, 'sys'); api.questEvent('traded'); tradeSheet(key, who); } : undefined }; });
    api.openSheet({ title: `Swapping with ${who}`, lines, note: 'A thing for a thing. What each of them wants grows in some other part of the island.' });
  }
  W.tradeSheet = tradeSheet;
  // What each of the folk would like today. It is a different thing each day, and a different thing for each.
  const FAR_WANT = { forager: [['shell', 2, 'two cockle shells from the flats'], ['apple', 1, 'an apple from the orchard']], gardener: [['feather', 1, 'a gull feather from the cliffs'], ['fish', 1, 'a fish, any fish']], shepherd: [['mushroom', 2, 'a couple of brown caps from the woods'], ['honey', 1, 'a jar of honey from the hives']], beachcomber: [['sprig', 2, 'two sprigs of heather from the high ground'], ['crystal', 1, 'a chip of crystal from under the hill']], castaway: [['apple', 1, 'an apple from the orchard'], ['water', 1, 'a flask of water from the well']], pedlar: [['seaglass', 1, 'a piece of sea glass from the flats'], ['glowcap', 1, 'a glowing cap from the woods at night']] };
  const PAYS = { forager: ['mushroom', 2], gardener: ['seed_onion', 1], shepherd: ['sprig', 2], beachcomber: ['seaglass', 1], castaway: ['feather', 2], pedlar: ['apple', 1] };
  const wantOf = (key) => { const order = Object.keys(FAR_WANT), i = order.indexOf(key); if (i < 0 || (i + day()) % 2) return null; const l = FAR_WANT[key]; return l[day() % l.length]; };
  function giveWant(key, f) {
    const [id, n, words] = wantOf(key);
    take(id, n); S.wants.done.push(key); S.trust[key] = 1; save(); give(PAYS[key][0], PAYS[key][1], true); audio.pop(700);
    addLog('', `You hand over ${words}.`, 'sys'); setTimeout(() => W.says(f, ['Just the thing. Here, for your trouble.', 'You remembered. Take this.', 'That will do nicely. Something of mine for it, and my thanks.'][day() % 3]), 600); api.questEvent('wanted');
  }

  // ---------- the garden ----------
  const plotMesh = [];
  const plotStage = (p) => (!p ? 0 : now() - p.at >= GROW_MS ? 2 : 1);
  function showPlots() { plotMesh.forEach((m, i) => { const st = plotStage(S.plots[i]); if (m.sprout) { m.sprout.visible = st === 1; if (st === 1) m.sprout.scale.setScalar(1 + 2.2 * clamp((now() - S.plots[i].at) / GROW_MS, 0, 1)); } if (m.grown) m.grown.visible = st === 2; }); }
  function plotSheet(i) {
    const seeds = Object.keys(ITEMS).filter((k) => ITEMS[k].seed && inv[k] > 0);
    api.openSheet({ title: 'An empty bed', lines: seeds.length ? seeds.map((k) => ({ text: `Plant ${ITEMS[k].name.toLowerCase()}`, meta: 'It will be ready in about eight hours, whether you are here or not.', run: () => { take(k, 1); S.plots[i] = { seed: ITEMS[k].seed, at: now() }; save(); showPlots(); api.closeSheet(); api.playEmote('paw'); addLog('', 'You scrape a hole, drop it in and cover it over. The Gardener will know. He always knows.', 'sys'); api.questEvent('planted'); } })) : [{ text: 'You have nothing to plant.', meta: 'The Beachcomber and the Pedlar both swap for seed, and it turns up where the ground is disturbed.' }], note: 'Four beds are kept for visitors. What grows in them is yours.' });
  }

  // ---------- birds, mounds, the shelf, the guest book ----------
  const birdMesh = new Map(), moundMesh = [];
  const birdThere = (b) => (b.when === 'day' ? dark() < 0.45 : b.when === 'night' ? dark() > 0.6 : b.when === 'low' ? W.lowTide() : true) && !(b.gone > api.t());
  const moundsToday = () => { const r = mulberry32(day() * 13 + 5), ids = MOUNDS.map((m) => m.id); for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; } return ids.slice(0, 8).filter((id) => !S.dug.ids.includes(id)); };
  let liveMounds = moundsToday();
  function dig(m) {
    const fox = api.species().id === 'fox', r = mulberry32(day() * 31 + m.id), loot = [LOOT[Math.floor(r() * LOOT.length)]]; if (fox) loot.push(LOOT[Math.floor(r() * LOOT.length)]);
    S.dug.ids.push(m.id); S.dugAll = (S.dugAll || 0) + 1; save(); liveMounds = moundsToday(); moundMesh.forEach((g, i) => { g.visible = liveMounds.includes(i); });
    me.targetYaw += 0.3; api.playEmote('paw'); audio.pop(480);
    for (const [id, n] of loot) give(id, n, true);
    addLog('', `You dig. ${loot.map(nameN).join(', and ')}${fox ? '. A fox digs deeper than most' : ''}.`, 'sys'); api.questEvent('dug');
  }
  const shelfAt = api.cottage.at(2.15, -1.25), bookAt = api.cottage.at(-2.1, 1.1);
  let shelfGroup = null;
  function showShelf() { if (!shelfGroup || !W.make) return; while (shelfGroup.children.length > 1) shelfGroup.remove(shelfGroup.children[1]); S.shelf.slice(0, 6).forEach((id, i) => { const it = ITEMS[id]; const m = it && W.make(it.model); if (!m) return; const box = new THREE.Box3().setFromObject(m), size = box.getSize(new THREE.Vector3()), k = 0.3 / Math.max(size.x, size.y, size.z, 0.01); m.scale.setScalar(k); m.position.set(-0.6 + (i % 3) * 0.6, 0.39 + Math.floor(i / 3) * 0.5 - box.min.y * k, 0); shelfGroup.add(m); }); }
  function shelfSheet() {
    const mine = Object.keys(ITEMS).filter((id) => inv[id] > 0 || S.shelf.includes(id));
    const lines = [{ text: S.shelf.length ? 'On your shelf: ' + S.shelf.map((id) => ITEMS[id].name).join(', ') + '.' : 'Your shelf is empty.', meta: 'Up to six things. Anybody who is in the cottage with you can look at them.' }];
    for (const p of company()) if (p.data.shelf && p.data.shelf.length) lines.push({ text: `${p.data.name} keeps: ` + p.data.shelf.map((n) => (ITEMS[Object.keys(ITEMS)[n]] || {}).name).filter(Boolean).join(', ') + '.' });
    for (const id of mine) { const on = S.shelf.includes(id); lines.push({ text: `${on ? 'Take down' : 'Put up'} ${ITEMS[id].name.toLowerCase()}`, kind: on || S.shelf.length < 6 ? '' : 'dim', run: () => { if (on) S.shelf = S.shelf.filter((q) => q !== id); else if (S.shelf.length < 6) S.shelf.push(id); save(); showShelf(); api.pushPresence(); api.questEvent('shelf'); shelfSheet(); } }); }
    api.openSheet({ title: 'The shelf by the hearth', lines, note: 'Nothing leaves your satchel. The shelf only shows what you choose to show.' });
  }
  W.shelfIdx = () => S.shelf.slice(0, 6).map((id) => Object.keys(ITEMS).indexOf(id)).filter((n) => n >= 0);
  function guestSheet() {
    api.guests((rows) => api.openSheet({ title: 'The guest book', lines: rows.length ? rows.slice(0, 40).map((r) => ({ text: r.text, meta: r.name })) : [{ text: 'The pages are blank. The last entry was torn out.' }], note: 'One line each. It stays in the book.',
      input: { max: 80, placeholder: 'Write a line', button: 'Sign', submit: (text) => { api.signGuest(text); S.signed = 1; save(); api.questEvent('signed'); addLog('', 'You write a line in the book and blow on the ink.', 'sys'); setTimeout(guestSheet, 900); } } }));
  }
  // ---------- giving ----------
  function giftSheet(p) {
    const mine = Object.keys(ITEMS).filter((id) => inv[id] > 0 && ITEMS[id].kind === 'thing' && !ITEMS[id].scrap);
    api.openSheet({ title: `Something for ${p.data.name}`, lines: mine.length ? mine.map((id) => ({ text: ITEMS[id].name, meta: `You have ${inv[id]}. Press to give one.`, run: () => { if (!p.data.code) { addLog('', 'They have no number to their name yet, so it cannot be sent. It stays with you.', 'sys'); return; } take(id, 1); api.tell('gift', Object.keys(ITEMS).indexOf(id) * 10000 + Number(p.data.code)); api.closeSheet(); api.playEmote('greet'); addLog('', `You give ${ITEMS[id].name.toLowerCase()} to ${p.data.name}.`, 'sys'); api.questEvent('gave1'); } })) : [{ text: 'You have nothing to give just now.' }], note: 'It leaves your satchel and goes into theirs.' });
  }

  // ---------- skipping stones, the race, hide and seek ----------
  const SKIP = [{ x: POOL.x - 6, z: POOL.z - POOL.r + 0.6, dx: 0.3, dz: 1, y: POOL.y }, { x: CAVE.lake.x + 8.2, z: CAVE.lake.z - 1, dx: -1, dz: 0, y: CAVE.lake.y, cave: true }];
  let pebble = null, skip = null, race = null, seek = null;
  const NOTES = [262, 294, 349, 392, 466], struck = new Set(), CHIMES = NOTES.map((_, i) => { const a = 0.5 + i * 0.34; return { x: CHAPEL.x + Math.cos(a) * 10.5, z: CHAPEL.z + Math.sin(a) * 10.5, s: 1.5 - i * 0.16 }; });
  // Skipping is a matter of timing: swing, and let go as the swing comes level. Two soft knocks count you in; the third beat is the moment.
  let wind = null;
  function windUp(sp) { wind = { sp, t0: performance.now() }; me.targetYaw = Math.atan2(sp.dx, sp.dz); api.playEmote('paw'); api.moment('Swing. One, two, and let go on three', 2.6); setTimeout(() => audio.pop(380), 500); setTimeout(() => audio.pop(380), 1000); }
  function letGo() { const off = Math.abs(performance.now() - wind.t0 - 1500), q = Math.max(0, 1 - off / 600), sp = wind.sp; wind = null; skipStone(sp, Math.max(1, Math.round(1 + 10 * q * q + (Math.random() - 0.5)))); }
  function skipStone(sp, n) {
    me.targetYaw = Math.atan2(sp.dx, sp.dz); api.playEmote('throw');
    skip = { sp, n, at: api.t() + 0.35, i: 0, x: me.x, z: me.z };
    setTimeout(() => { const best = n > (S.skip || 0); if (best) { S.skip = n; save(); } addLog('', `${n === 1 ? 'Plop. One' : n + ' skips'}${best && n > 1 ? '. That is your best' : ''}.`, 'sys'); if (n >= 5) api.questEvent('skip5'); if (n >= 4) api.tell('skip', n); }, 500 + n * 260);
  }
  const fmt = (ms) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;
  const flags = [];
  function showFlags() { flags.forEach((f, i) => { f.visible = !!race && i === race.i; }); }
  function startRace() { race = { i: 1, at: now() }; showFlags(); audio.pop(800); api.tell('racego', 1); addLog('', `The short round: out to the crossroads, up to the watchtower and back, from one red flag to the next. ${company().length ? 'The others have been told you are off.' : 'Run it with somebody and it is a race.'}`, 'sys'); }

  loadProps().then((make) => {
    if (!make) return; W.make = make;
    const quiet = (m) => { if (!m) return null; m.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.userData.noShadow = true; } }); return m; };
    { const lump = make.single('bird'); if (lump) for (const b of BIRDS) { const mat = lump.material.clone(); mat.color.set(b.tint).lerp(new THREE.Color(0xffffff), 0.35); mat.onBeforeCompile = lump.material.onBeforeCompile; const g = new THREE.Mesh(lump.geometry, mat); g.userData.noShadow = true; g.scale.setScalar((b.s || 1) * 1.5); b.y0 = (b.y !== undefined ? b.y : groundHeight(b.x, b.z)) + (b.up || 0); g.position.set(b.x, b.y0, b.z); g.rotation.y = b.x; scene.add(g); birdMesh.set(b.id, g); } }
    MOUNDS.forEach((m) => { const g = W.one('dig_mound'); g.position.set(m.x, terrainHeight(m.x, m.z), m.z); g.rotation.y = m.x; g.visible = liveMounds.includes(m.id); scene.add(g); moundMesh.push(g); });
    PLOTS.forEach((p, i) => { const bed = W.one('dig_mound'), y = terrainHeight(p.x, p.z); bed.position.set(p.x, y - 0.06, p.z); bed.scale.set(1.5, 0.6, 1.5); scene.add(bed); const sprout = W.one('sprout'), grown = W.one('plant_grown'); for (const m of [sprout, grown]) { m.position.set(p.x, y + 0.1, p.z); scene.add(m); } grown.scale.setScalar(1.6); plotMesh[i] = { sprout, grown }; });
    showPlots();
    { const g = quiet(make('shelf')); g.position.set(shelfAt.x, terrainHeight(shelfAt.x, shelfAt.z), shelfAt.z); g.rotation.y = api.cottage.ry + Math.PI; shelfGroup = new THREE.Group(); shelfGroup.position.copy(g.position); shelfGroup.rotation.y = g.rotation.y; shelfGroup.add(g.clone()); g.position.set(0, 0, 0); g.rotation.y = 0; scene.add(shelfGroup); shelfGroup.children[0].position.set(0, 0, 0); shelfGroup.children[0].rotation.y = 0; showShelf(); }
    { const g = W.one('guest_book'); g.position.set(bookAt.x, terrainHeight(bookAt.x, bookAt.z), bookAt.z); g.rotation.y = api.cottage.ry + 1.2; scene.add(g); }
    for (const f of W.fires.filter((q) => q.night)) { const g = W.one('cook_pot'); g.position.set(f.x, terrainHeight(f.x, f.z), f.z); scene.add(g); }
    for (const c of RACE.slice(0, -1)) { const g = W.one('marker_pole'); g.position.set(c.x, terrainHeight(c.x, c.z), c.z); scene.add(g); g.visible = false; flags.push(g); } flags.push(flags[0]);
    { const g = W.one('split_marker'); g.position.set(RACE[0].x, terrainHeight(RACE[0].x, RACE[0].z) + 0.02, RACE[0].z); scene.add(g); }
    CHIMES.forEach((c) => { const g = W.one('chime_stone'); if (!g) return; g.position.set(c.x, terrainHeight(c.x, c.z) - 0.05, c.z); g.rotation.y = Math.atan2(CHAPEL.x - c.x, CHAPEL.z - c.z); g.scale.setScalar(c.s); scene.add(g); colliders.push({ x: c.x, z: c.z, r: 0.4 }); });
    pebble = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 5), new THREE.MeshStandardMaterial({ color: 0x77736b, flatShading: true })); pebble.visible = false; scene.add(pebble);
  });

  // ---------- what is in reach ----------
  W.extra.push((key, f, opts) => {
    if (key) {      // beside one of the folk
      if (TRADES[key]) opts.push({ label: `Swap with ${W.nameOf(key)}`, run: () => tradeSheet(key, W.nameOf(key)) });
      const want = S.met[key] && !S.wants.done.includes(key) ? wantOf(key) : null; if (want) { const [id, n, words] = want; if (has(id) >= n) opts.unshift({ label: `Give ${W.nameOf(key)} what they asked for`, run: () => giveWant(key, f) }); else opts.push({ label: `Ask what ${W.nameOf(key)} wants today`, low: true, run: () => W.says(f, `If you are going that way: I could do with ${words}.`) }); }
      return;
    }
    if (fishing) { if (fishing.state === 'bite') opts.unshift({ label: 'Strike!', run: strike }); return; }
    const fid = fishHere(); if (fid) opts.unshift({ label: api.hoofed() ? 'Stand in the shallows and watch for a fish' : 'Watch the water for a fish', run: () => cast(fid) });
    if (fireNear() && RECIPES.some((r) => r.needs.some(([id]) => has(id) > 0))) opts.push({ label: 'Cook something over the fire', run: cookSheet });
    if (Math.hypot(me.x - ORCHARD.x, me.z - ORCHARD.z) < 15) opts.push({ label: 'Shake an apple tree', run: () => { api.playEmote('paw'); if (cool('apple', 6)) { const n = 1 + (Math.random() < 0.5 ? 1 : 0); give('apple', n, true); addLog('', `${n === 1 ? 'An apple comes' : 'Two apples come'} down, and one more that hits you on the head. You keep ${n === 1 ? 'the one' : 'the two'}.`, 'sys'); api.questEvent('apple'); } else addLog('', 'You shake it. Leaves come down. The tree wants a few minutes to think about it.', 'sys'); } });
    if (W.hives.some((h) => near(h, 3))) opts.push({ label: 'Take a little honey', run: () => { if (!cool('honey', 12)) { addLog('', 'They have not forgiven you for the last time yet.', 'sys'); return; } if (dark() < 0.5 && !api.wearing().head) { S.cool.honey = now() - 9 * 60000; save(); api.playEmote('hop'); audio.bark && audio.bark(); addLog('', 'The bees explain, all at once, that they would rather you did not. Come back after dark, or with something on your head.', 'sys'); return; } give('honey', 1, true); addLog('', 'You lift the lid, take a comb and put it back as you found it. A jar of honey, into the satchel.', 'sys'); api.questEvent('honey'); } });
    if (W.workDone('rope') && near(WELL, 3.2)) opts.push({ label: 'Draw water from the well', run: () => { if ((inv.water || 0) >= 3) { addLog('', 'Three flasks is all you can carry.', 'sys'); return; } api.playEmote('paw'); give('water', 1, true); addLog('', 'The bucket goes down a long way. A flask of well water, into the satchel.', 'sys'); api.questEvent('water'); } });
    if (W.workDone('sail') && near({ x: WINDMILL.x + Math.sin(WINDMILL.ry) * 3.6, z: WINDMILL.z + Math.cos(WINDMILL.ry) * 3.6 }, 3.4) && has('barley') > 0) opts.push({ label: 'Grind your barley', run: () => { const n = has('barley'); take('barley', n); give('flour', n, true); addLog('', `The stones take it and give it back as flour. ${n} measure${n > 1 ? 's' : ''}, into the satchel.`, 'sys'); api.questEvent('ground'); } });
    const pi = PLOTS.findIndex((p) => near(p, 1.7)); if (pi >= 0) { const st = plotStage(S.plots[pi]); if (st === 0) opts.push({ label: 'Plant something in this bed', run: () => plotSheet(pi) }); else if (st === 2) opts.unshift({ label: 'Pull up what has grown', run: () => { const kind = S.plots[pi].seed; S.plots[pi] = null; save(); showPlots(); api.playEmote('paw'); give(kind, 3, true); addLog('', `Three ${kind === 'onion' ? 'onions' : 'ears of barley'}, with the earth still on them.`, 'sys'); api.questEvent('harvest'); } }); else opts.push({ label: 'Look at what is coming up', low: true, run: () => { const left = GROW_MS - (now() - S.plots[pi].at), h = Math.max(1, Math.round(left / 3600000)); if ((inv.water || 0) > 0 && !S.plots[pi].wet) { take('water', 1); S.plots[pi].wet = 1; S.plots[pi].at -= left / 2; save(); showPlots(); addLog('', 'You tip a flask of well water over it. That will bring it on.', 'sys'); } else addLog('', `Green, and not ready. About ${h} hour${h > 1 ? 's' : ''} yet.${S.plots[pi].wet ? '' : ' Water from the well would bring it on.'}`, 'sys'); } }); }
    const b = BIRDS.find((q) => birdThere(q) && near(q, 9) && !S.birds.includes(q.id)); if (b && me.speed < 0.4) opts.push({ label: 'Keep still and watch the bird', run: () => { S.birds.push(b.id); save(); me.targetYaw = Math.atan2(b.x - me.x, b.z - me.z); flash(b.name, `${S.birds.length} of ${BIRDS.length} birds`); addLog('', `${b.name}. ${b.says}`, 'sys'); api.questEvent('bird'); } });
    const m = MOUNDS.find((q) => liveMounds.includes(q.id) && near(q, 2)); if (m) opts.unshift({ label: 'Dig where the ground is disturbed', run: () => dig(m) });
    if (near(shelfAt, 2.3) && api.cottage.inside(me.x, me.z)) opts.push({ label: 'Look at the shelf', run: shelfSheet });
    if (near(bookAt, 2.3) && api.cottage.inside(me.x, me.z)) opts.push({ label: 'Open the guest book', run: guestSheet });
    const sp = SKIP.find((q) => near(q, 3.2) && (!q.cave || api.cave() > 0.5)); if (wind) opts.unshift({ label: 'Let it go', run: letGo }); else if (sp && !skip) opts.push({ label: 'Skip a stone', run: () => windUp(sp) });
    const ci = CHIMES.findIndex((c) => near(c, 1.6)); if (ci >= 0) opts.unshift({ label: 'Strike the ringing stone', run: () => { api.playEmote('paw'); audio.chime(NOTES[ci], 0.9, 2.4); api.tell('note', ci); struck.add(ci); if (struck.size === 5 && !S.chimed) { S.chimed = 1; save(); api.questEvent('chimed'); addLog('', 'Five stones, five notes, low to high. Somebody tuned these by chipping at them, and took a long time over it.', 'sys'); } } });
    if (!race && near(RACE[0], 2.4)) opts.push({ label: 'Run the short round', run: startRace });
    const comp = company();
    if (comp.length && near(FIRE, 6) && !seek) opts.push({ label: 'Count to thirty for hide and seek', side: !api.campfire(), run: () => { seek = { at: now() + 30000, found: [], told: false }; api.tell('seek', 1); api.restAt(me.x, me.z, me.yaw, 'lie'); addLog('', 'You put your nose under your tail and start to count. Everybody else has thirty to get out of sight.', 'sys'); } });
    for (const p of comp) { const d = Math.hypot(p.av.x - me.x, p.av.z - me.z); if (d > 3) continue; if (seek && now() > seek.at && !seek.found.includes(p.data.code)) opts.unshift({ label: `Found you, ${p.data.name}`, run: () => { seek.found.push(p.data.code); api.tell('found', Number(p.data.code) || 0); api.playEmote('greet'); addLog('', `You found ${p.data.name}. ${seek.found.length} of ${comp.length}.`, 'sys'); api.questEvent('sought'); if (seek.found.length >= comp.length) { addLog('', 'That is everybody. Somebody else can count now.', 'sys'); seek = null; } } }); else opts.push({ label: `Give ${p.data.name} something`, side: true, run: () => giftSheet(p) }); break; }
    if (api.species().id === 'shiba') opts.push({ label: 'Sniff the air', low: true, run: () => { const cands = [...MOUNDS.filter((q) => liveMounds.includes(q.id)), ...W.spotsLeft()], best = cands.sort((p, q) => Math.hypot(p.x - me.x, p.z - me.z) - Math.hypot(q.x - me.x, q.z - me.z))[0]; api.playEmote('sniff'); if (!best) { addLog('', 'Salt, heather, sheep. Nothing new.', 'sys'); return; } const a = Math.atan2(best.x - me.x, -(best.z - me.z)), dirs = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'], d = Math.round(Math.hypot(best.x - me.x, best.z - me.z) / 0.75 / 10) * 10; addLog('', `Something worth finding, to the ${dirs[Math.round(((a + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 4)) % 8]}. About ${d} paces. A shiba's nose is never wrong.`, 'sys'); } });
  });

  // ---------- every frame ----------
  let slow = 0, campAsked = false;
  W.fast.push((dt, t) => {
    if (fishing) {
      if (Math.hypot(me.x - fishing.x, me.z - fishing.z) > 0.6) { fishing = null; addLog('', 'You moved, and whatever was down there is gone.', 'sys'); }
      else if (fishing.state === 'wait' && now() > fishing.bite) { fishing.state = 'bite'; fishing.until = now() + 1700; audio.splash && audio.splash(0.5); api.moment('A fish. Now!', 2); }
      else if (fishing.state === 'bite' && now() > fishing.until) { fishing = null; addLog('', 'Too slow. A ring on the water, getting wider.', 'sys'); }
    }
    if (wind && performance.now() - wind.t0 > 2600) { const sp = wind.sp; wind = null; skipStone(sp, 1); }
    if (skip && pebble) { const k = (t - skip.at) / 0.26; if (k >= 0) { const i = Math.floor(k), fr = k - i, d = 1.6 + i * 1.5 + fr * 1.5 * (1 - i * 0.05); pebble.visible = i <= skip.n; pebble.position.set(skip.x + skip.sp.dx * d, skip.sp.y + 0.08 + Math.sin(fr * Math.PI) * Math.max(0.1, 0.5 - i * 0.04), skip.z + skip.sp.dz * d); if (i > skip.i) { skip.i = i; if (i <= skip.n && audio.drip) audio.drip(0.5); } if (i > skip.n) { skip = null; pebble.visible = false; } } }
    if (race) { const c = RACE[race.i]; if (Math.hypot(me.x - c.x, me.z - c.z) < 4.5) { race.i++; audio.pop(760); if (race.i >= RACE.length) { const beaten = race.beaten; addLog('', beaten ? `Home, and out of breath. ${beaten} was back before you.` : 'Home, and out of breath. That is the short round run.', 'sys'); api.questEvent('raced'); api.tell('race', 1); race = null; } else api.moment(race.i === RACE.length - 1 ? 'Home is the last flag' : 'On to the next flag', 3); showFlags(); } else if (now() - race.at > 12 * 60000) { race = null; showFlags(); addLog('', 'The round is called off. Start again from the marker when you like.', 'sys'); } }
    if (api.campfire() && !campAsked && api.entered() && company().length && near(FIRE, 14)) { campAsked = true; flash('Campfire hour', 'Somebody count to thirty'); addLog('', 'It is campfire hour, and there is company. Hide and seek starts at the fire: one counts to thirty, the rest hide anywhere on the island.', 'sys'); } if (!api.campfire()) campAsked = false;
    if (seek && !seek.told && now() > seek.at) { seek.told = true; api.restAt(me.x, me.z, me.yaw, 'stand'); flash('Thirty', 'Coming, ready or not'); } if (seek && now() > seek.at + 6 * 60000) seek = null;
    if (performance.now() < slow) return; slow = performance.now() + 500;
    for (const b of BIRDS) { const g = birdMesh.get(b.id); if (!g) continue; const there = birdThere(b); if (there && near(b, 3.6) && me.speed > 2.6) { b.gone = t + 45; b.fly = t; } g.visible = (there || (b.fly && t - b.fly < 2.5)) && Math.hypot(me.x - b.x, me.z - b.z) < 90; if (b.fly && t - b.fly < 2.5) { const k = t - b.fly; g.position.set(b.x + k * 3, b.y0 + k * k * 2.2, b.z + k * 2); } else if (there) { g.position.set(b.x, b.y0 + Math.abs(Math.sin(t * 1.7 + b.x)) * 0.03, b.z); g.rotation.y = b.x + Math.sin(t * 0.6 + b.z) * 0.8; } }
    if (plotMesh.length && Math.hypot(me.x - GARDEN.x, me.z - GARDEN.z) < 40) showPlots();
  });
  W.heard.push((d) => {
    const k = d.ev.kind, n = d.ev.n;
    if (k === 'gift' && Math.floor(n % 10000) === Number(api.myCode())) { const id = Object.keys(ITEMS)[Math.floor(n / 10000)]; if (ITEMS[id]) { give(id, 1, true); audio.pop(720); flash(ITEMS[id].name, `From ${d.name}`); addLog('', `${d.name} gives you ${ITEMS[id].name.toLowerCase()}. It is in your satchel.`, 'sys'); } }
    else if (k === 'seek') { flash(`${d.name} is counting`, 'Thirty to get out of sight'); addLog('', `${d.name} is counting to thirty by the fire. Hide.`, 'sys'); }
    else if (k === 'found' && n === Number(api.myCode())) { flash('Found', `${d.name} found you`); api.playEmote('hop'); }
    else if (k === 'note' && NOTES[n] && Math.hypot(me.x - CHAPEL.x, me.z - CHAPEL.z) < 60) audio.chime(NOTES[n], 0.6, 2.4);
    else if (k === 'point') addLog('', `${d.name} is pointing at something.`, 'sys');
    else if (k === 'skip') addLog('', `${d.name} skipped a stone ${n} times.`, 'sys');
    else if (k === 'racego') { if (!race && near(RACE[0], 40)) { flash(`${d.name} is off`, 'Start from the marker to run against them'); } addLog('', `${d.name} has set off on the short round from the Landing.`, 'sys'); }
    else if (k === 'race') { if (race && !race.beaten) race.beaten = d.name; addLog('', `${d.name} is home from the short round${race ? ', ahead of you' : ''}.`, 'sys'); }
    else if (k === 'ate') { const it = ITEMS[Object.keys(ITEMS)[n]]; if (it) addLog('', `${d.name} eats ${it.name.charAt(0).toLowerCase() + it.name.slice(1)}.`, 'sys'); }
  });
  const nearest = (list) => list.slice().sort((p, q) => Math.hypot(p.x - me.x, p.z - me.z) - Math.hypot(q.x - me.x, q.z - me.z))[0] || null;
  Object.assign(W.where, { 'lr-fish': () => nearest(Object.values(FISH).filter((f) => !f.cave && !f.tide)), 'lr-cook': () => nearest([FIRE, ...W.fires]), 'lr-plant': () => PLOTS[0], 'lr-birds': () => nearest(BIRDS.filter((b) => !S.birds.includes(b.id) && birdThere(b))) || nearest(BIRDS.filter((b) => !S.birds.includes(b.id))), 'lr-dig': () => nearest(MOUNDS.filter((m) => liveMounds.includes(m.id))), 'lr-trade': () => W.who.beachcomber, 'lr-skip': () => SKIP[0], 'lr-race': () => RACE[0], 'lr-sign': () => bookAt, 'lr-treasure': () => ([1, 2, 3, 4].every((n) => inv['scrap' + n] > 0) ? { x: ORCHARD.x - 2.2, z: ORCHARD.z + 8 } : null) });
  Object.assign(W.count, { fishkinds: () => Object.keys(S.fish).length, birds: () => S.birds.length, dug: () => S.dugAll || 0 });
  W.speedMul = () => 1;
  W.pieces = () => 1;
  W.chimes = CHIMES; W.skipAt = SKIP;
  W.BIRDS = BIRDS; W.fishAt = (id) => FISH[id]; W.moundsNow = () => MOUNDS.filter((m) => liveMounds.includes(m.id));
  return { FISH, BIRDS, MOUNDS, fishSpots: () => Object.values(FISH) };
}
