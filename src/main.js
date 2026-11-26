import * as THREE from 'three';
import {
  clamp, lerp, smoothstep, groundHeight, moveWithCollision, shoreProximity,
  FIRE, HILL, SPAWN, DOCK, WOODPILE, SEATS, spotAt, WALL, CRATE, BOTTLE_SPOTS, onSlip, FAR, ISLE, areaAt, MAPMAKER, POST, LENS, CHEST, POOL, CRAG, HOLLOW_TREE, CAVE, inCave, caveAt, SUMMIT, LIGHTHOUSE, COTTAGE, TIDE, tideAt, FLATS, ISLET, FLAT_SHORE, SPRING, SHELTER, FARBEACH, MOONPOOL, BONES, SEAT, WAYCAIRN, AREAS, MAP_BOARD, WOODS as WOODS_AT, PATHS, SIGHT_AT } from './terrain.js';
import { buildWorld } from './world.js';
import { Avatar, SPECIES, PLAYABLE, NAME_WORDS, POSE } from './avatar.js';
import { buildCritters } from './critters.js';
import { createAudio } from './audio.js';
import { createNet } from './net.js';
import { findPath } from './path.js';
import { createStore, todayKey } from './store.js';
import { buildLife, showerState } from './life.js';
import { islandHour, dayInfo, skyAt, rainAt } from './clock.js';
import { buildSite, BOAT_GOAL } from './build.js';
import { voyageAt, BOARD_MS } from './voyage.js';
import { timeNow, clockSkew, setIslandTime } from './now.js';
import { campfireAt, clockTime, inWords, bothTimes } from './campfire.js';
import { FINDS, FIND, fishKind, createFinds } from './finds.js';
import { buildTraces } from './traces.js';
import { CHAPTERS, STORY, storyById, PAGES, LOGBOOK } from './quests.js';
import { SIGHTS, ISLE_NAME, stampDate, postmark } from './stamps.js';
import { cutaway } from './props.js';
import { makeGlowTexture } from './labels.js';
import { buildShy } from './shy.js';
import { ITEMS, WEAR_IDS, SLOTS, ITEM_OF_FIND, CHESTS, LETTERS } from './items.js';
import { loadProps } from './props.js';
import { DAY_MS } from './clock.js';
import { judge } from './words.js';

const $ = (id) => document.getElementById(id);
const reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------- who you are tonight ----------
const TZ_COUNTRY = {
  'Asia/Manila': 'PH', 'Asia/Tokyo': 'JP', 'Asia/Seoul': 'KR', 'Asia/Shanghai': 'CN', 'Asia/Hong_Kong': 'HK', 'Asia/Taipei': 'TW',
  'Asia/Singapore': 'SG', 'Asia/Kuala_Lumpur': 'MY', 'Asia/Jakarta': 'ID', 'Asia/Makassar': 'ID', 'Asia/Bangkok': 'TH',
  'Asia/Ho_Chi_Minh': 'VN', 'Asia/Saigon': 'VN', 'Asia/Kolkata': 'IN', 'Asia/Calcutta': 'IN', 'Asia/Karachi': 'PK', 'Asia/Dhaka': 'BD',
  'Asia/Colombo': 'LK', 'Asia/Kathmandu': 'NP', 'Asia/Dubai': 'AE', 'Asia/Riyadh': 'SA', 'Asia/Qatar': 'QA', 'Asia/Tehran': 'IR',
  'Asia/Jerusalem': 'IL', 'Asia/Baghdad': 'IQ', 'Asia/Tashkent': 'UZ', 'Asia/Almaty': 'KZ', 'Asia/Yangon': 'MM', 'Asia/Phnom_Penh': 'KH',
  'Europe/London': 'GB', 'Europe/Dublin': 'IE', 'Europe/Lisbon': 'PT', 'Europe/Madrid': 'ES', 'Europe/Paris': 'FR', 'Europe/Brussels': 'BE',
  'Europe/Amsterdam': 'NL', 'Europe/Berlin': 'DE', 'Europe/Zurich': 'CH', 'Europe/Vienna': 'AT', 'Europe/Rome': 'IT', 'Europe/Prague': 'CZ',
  'Europe/Warsaw': 'PL', 'Europe/Budapest': 'HU', 'Europe/Stockholm': 'SE', 'Europe/Oslo': 'NO', 'Europe/Copenhagen': 'DK',
  'Europe/Helsinki': 'FI', 'Europe/Athens': 'GR', 'Europe/Bucharest': 'RO', 'Europe/Sofia': 'BG', 'Europe/Kyiv': 'UA', 'Europe/Kiev': 'UA',
  'Europe/Istanbul': 'TR', 'Europe/Moscow': 'RU', 'Europe/Belgrade': 'RS', 'Europe/Zagreb': 'HR',
  'Africa/Cairo': 'EG', 'Africa/Lagos': 'NG', 'Africa/Nairobi': 'KE', 'Africa/Johannesburg': 'ZA', 'Africa/Casablanca': 'MA',
  'Africa/Accra': 'GH', 'Africa/Addis_Ababa': 'ET', 'Africa/Algiers': 'DZ', 'Africa/Tunis': 'TN', 'Africa/Dar_es_Salaam': 'TZ',
  'America/New_York': 'US', 'America/Chicago': 'US', 'America/Denver': 'US', 'America/Phoenix': 'US', 'America/Los_Angeles': 'US',
  'America/Anchorage': 'US', 'Pacific/Honolulu': 'US', 'America/Toronto': 'CA', 'America/Vancouver': 'CA', 'America/Edmonton': 'CA',
  'America/Winnipeg': 'CA', 'America/Halifax': 'CA', 'America/Mexico_City': 'MX', 'America/Bogota': 'CO', 'America/Lima': 'PE',
  'America/Santiago': 'CL', 'America/Argentina/Buenos_Aires': 'AR', 'America/Buenos_Aires': 'AR', 'America/Sao_Paulo': 'BR',
  'America/Caracas': 'VE', 'America/Guayaquil': 'EC', 'America/Montevideo': 'UY', 'America/Panama': 'PA', 'America/Costa_Rica': 'CR',
  'America/Havana': 'CU', 'America/Santo_Domingo': 'DO', 'America/Jamaica': 'JM', 'America/Puerto_Rico': 'PR',
  'Australia/Sydney': 'AU', 'Australia/Melbourne': 'AU', 'Australia/Brisbane': 'AU', 'Australia/Perth': 'AU', 'Australia/Adelaide': 'AU',
  'Pacific/Auckland': 'NZ', 'Pacific/Fiji': 'FJ', 'Pacific/Guam': 'GU',
};
function countryName() {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const code = TZ_COUNTRY[tz];
    if (!code) return '';
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(code) || code;
  } catch (e) { return ''; }
}
function localTime() {
  try { return new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); } catch (e) { return ''; }
}
function store(key, value) {
  try {
    if (value === undefined) return JSON.parse(localStorage.getItem(key));
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) { /* storage may be missing: carry on without it */ }
  return null;
}
function rollIdentity() {
  const species = Math.floor(Math.random() * PLAYABLE);
  const palette = Math.floor(Math.random() * SPECIES[species].palettes.length);
  const word = NAME_WORDS[Math.floor(Math.random() * NAME_WORDS.length)];
  return { species, palette, name: `${word} ${SPECIES[species].label}` };
}
let identity = store('ember.identity');
if (!identity || !SPECIES[identity.species] || SPECIES[identity.species].npc || typeof identity.name !== 'string') identity = rollIdentity();
let showOrigin = store('ember.origin') !== false;
let COUNTRY = countryName();       // a first guess from the clock's time zone; the island corrects it when you step ashore
let asleepSince = 0, lastInputAt = timeNow(), laidByNap = false, idleAfter = 120000;
let mutedUntil = 0;                // until when the island will not pass on what you say
const ignored = new Set();         // visitors you have chosen not to hear, until you leave
let itWho = null;                  // who is "it" in a game of tag: 'me', another visitor's id, or nobody
// The line under a name stays what it was (country and local time). Being muted, away or "it" adds a small sign
// in front of it: §m, §z and §i are drawn as pictures by the name tag.
const originText = () => (showOrigin ? [COUNTRY, localTime()].filter(Boolean).join(' · ') : '');
// Every visitor has a four-figure number, made once and kept by their browser, so two with the same name can be told apart.
let myKey = store('ember.key');
if (typeof myKey !== 'string' || !/^[a-z0-9]{24,40}$/.test(myKey)) { const b = new Uint8Array(20); crypto.getRandomValues(b); myKey = [...b].map((x) => (x % 36).toString(36)).join('') + timeNow().toString(36).slice(-6); store('ember.key', myKey); }
let myCode = store('ember.code');
if (!/^\d{4}$/.test(String(myCode))) { myCode = String(1000 + Math.floor(Math.random() * 9000)); store('ember.code', myCode); }
const fullName = (name, code) => (code ? `${name} #${code}` : name);
// The journal: every kind of thing found so far, with how many times and when first. Kept on the device.
let journal = (() => { const j = store('ember.finds'); return j && typeof j === 'object' && !Array.isArray(j) ? j : {}; })();
const beenFar = () => FAR || !!store('ember.walked') || !!store('ember.seen');
const myFinds = () => FINDS.filter((f) => !f.far || beenFar());
const journalCount = () => FINDS.filter((f) => journal[f.id]).length;
let fires = (() => { const r = store('ember.fires'); return r && Number.isFinite(r.count) ? r : { count: 0, last: 0 }; })();      // campfire hours been at, and the last one
let sailed = Number(store('ember.sailed')) || 0;      // times round the island in the boat
const withMarks = (muted, away, it, text, code, sailor, flame) => `${code ? `§#${code}` : ''}${muted ? '§m' : ''}${away ? '§z' : ''}${it ? '§i' : ''}${sailor ? '§s' : ''}${flame ? '§f' : ''}${String(text || '').replace(/§/g, '')}`;
const mySub = () => withMarks(mutedUntil > timeNow(), !!asleepSince, itWho === 'me', originText(), myCode, sailed > 0, fires.count > 0);
const peerSub = (id, data) => withMarks(data.muted > timeNow(), data.asleep, itWho === id, data.sub, data.code, data.sailed > 0, data.fires > 0);

// ---------- scene ----------
const canvas = $('scene');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
} catch (e) {
  // No 3D drawing on this device or browser: say so on the title screen instead of leaving it dead.
  $('enter').hidden = true; $('reroll').hidden = true;
  $('hint').textContent = 'This browser cannot draw 3D graphics (WebGL is switched off or not supported), so the island cannot be shown here. Try another browser or device.';
  throw e;
}
const PR = Math.min(window.devicePixelRatio || 1, 2);
renderer.setPixelRatio(PR);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(58, 1, 0.1, 1200);
const world = buildWorld(scene, { pixelRatio: PR, low: !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches), camera });
const life = buildLife(scene, world);
const seaReady = life.loadSea();            // modelled fish arrive a moment after the island does
const yard = buildSite(scene);
const critters = buildCritters(scene, world);
const traces = buildTraces(scene, groundHeight, (x, z) => world.surface(x, z));
// A soft light that travels with the camera, so whoever you look at is readable.
const viewLight = new THREE.DirectionalLight(0xd6dcf2, 0.28);
camera.add(viewLight);
camera.add(viewLight.target);
viewLight.target.position.set(0, 0, -1);
scene.add(camera);
const audio = createAudio();

function resize() {
  const w = canvas.clientWidth || window.innerWidth, h = canvas.clientHeight || window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

// ---------- you ----------
const me = new Avatar({ species: identity.species, palette: identity.palette, name: identity.name, sub: mySub(), isYou: true });
me.x = SPAWN.x; me.z = SPAWN.z; me.y = groundHeight(me.x, me.z);
me.yaw = me.targetYaw = 0.35;         // facing the visitor on the title screen
scene.add(me.group);
me.onStep = (left) => {
  const surf = world.surface(me.x, me.z);
  audio.step(surf, 1);
  if (surf === 'water') world.ripple(me.x, me.z);
};

// The Keeper: part of the island, clearly not a player.
const KEEPER_SEAT = 3;
// On the far shore his place is taken by the Mapmaker, an old tortoise who stands by the map board. The Mapmaker is
// a model of his own (see world.js): the Keeper's body is hidden there, and only his name and his words are used.
const KNAME = FAR ? 'Mapmaker' : 'Keeper', KSUB = FAR ? 'keeps the map' : 'keeps the fire', KWHO = FAR ? 'the Mapmaker' : 'the Keeper';
const keeper = new Avatar({ species: 5, palette: 0, name: KNAME, sub: KSUB });
if (FAR) { keeper.parts.rig.visible = false; keeper.shadow.visible = false; }
const bodyLen = (av) => (av.parts && av.parts.bodyLength) || SPECIES[av.species].height * 1.2;
function placeKeeper() {
  if (FAR) { keeper.x = MAPMAKER.x; keeper.z = MAPMAKER.z; keeper.y = groundHeight(MAPMAKER.x, MAPMAKER.z) + 0.05; keeper.mode = 'stand'; return; }
  const s = spotAt(KEEPER_SEAT, bodyLen(keeper));
  keeper.x = s.x; keeper.z = s.z; keeper.y = groundHeight(s.x, s.z); keeper.targetYaw = s.yaw;
}
placeKeeper();
keeper.yaw = keeper.targetYaw; keeper.mode = FAR ? 'stand' : 'lie';
scene.add(keeper.group);
const KEEPER_LINES = FAR ? [
  'Nobody has drawn the west of this island yet.', 'I walk slowly. The map waits for faster feet.', 'Mind the ink.',
  'The woods begin where the lanterns stop.', 'I heard something singing on the high ground. Stones, I think.',
  'There is a hill to the north with a hole in it.', 'The far point had a light once.', 'Take your time. The island is not going anywhere.',
  'The tents are for anyone who is tired.', 'When the tide is out, the flats to the south are worth a look.',
] : [
  'It is not much of a light. But it is a light.', 'I used to keep a bigger one.', 'On a clear night you could see the next island from here. Not any more.',
  'No hurry here.', 'Lie as long as you like.', 'The sand stays warm near the fire.', 'Mind the dock. It creaks.',
  'Sticks are on the pile. I would be glad of one on the fire.', 'The boat needs driftwood. The beaches are full of it.',
  'The current runs west from here. Everything does, in the end.', 'I count the days by the fire. I have lost count twice.',
  'You came from the sea, like everyone. I came from further.', 'The stars are clearer from the hill. Look west, if you go.',
];
const KEEPER_HELLO = FAR ? ['Ah. Fresh legs.', 'Welcome to the Landing.', 'Have a look at the map. Every name on it got there first.', 'You came a long way. Sit by the fire if you like.'] :
  ['Evening.', 'Good to see you.', 'Find a warm spot.', 'Welcome back to the fire.', 'Still here. So am I.', 'Sit. Get warm. Then, if you like, there is a boat that needs hands.'];
let keeperNext = 14, keeperLowAt = -999;

// ---------- state ----------
let entered = false;
let enterBlend = 0;
let camYaw = 0, camPitch = 0.32, camDist = 7.5, skyEl = 1.0;
const camPos = new THREE.Vector3(), camLook = new THREE.Vector3(), cutLook = new THREE.Vector3();
const keys = new Set();
const vel = { x: 0, z: 0 };
let moveTarget = null, stuckFor = 0;   // moveTarget is a list of points still to walk through
let mySeat = -1;
let sayMsg = null, emoteMsg = null;
let lastSayAt = 0;
let held = 0;
let warmth = 0, warmSaid = false, companySaid = false;   // how warmed through you are, 0 to 1
let stargazing = false;
let wet = 0, wetSaid = false;        // how soaked your coat is, 0 to 1
let fishTonight = 0;
let boatTotal = 0, boatCrew = [];
let skyNow = { dark: 1 }, rainNow = 0, rainForce = null, raining = false;
let hasButterfly = false, stillFor = 0, stoneFor = 0, stoneSaid = false;
let treeList = null;
let hourShift = 0;                     // test hook: push island time forward by this many hours
let lastCallAt = -99;
let speaker = null;
let nights = 0;
let bottle = null, bottleSpot = null;   // what the tide has left for you, and where
const peers = new Map();
let actions = [];

// ---------- the fire everyone shares ----------
// A record says "the fire had this much fuel at this moment"; it burns down from there.
// The newest record wins, and each visitor passes on the newest one they know.
const FIRE_MAX = 1.4, FIRE_FLOOR = 0.08, BURN_PER_MS = 1 / 540000, FEED = 0.45;
let fireRec = { fuel: 0.5, at: timeNow(), stamp: 0 };
const fuelNow = () => Math.max(FIRE_FLOOR, fireRec.fuel - (timeNow() - fireRec.at) * BURN_PER_MS);
function adoptFire(rec) {
  if (!rec || rec.at > timeNow() + 15000 || rec.at <= fireRec.stamp) return;
  const before = fuelNow();
  fireRec = { fuel: rec.fuel, at: rec.at, stamp: rec.at };
  if (entered && fuelNow() > before + 0.2) { world.flareUp(); audio.whoosh(); }
}
function feedFire() {
  guideFlags.fire = true;
  const wasLow = fuelNow() < 0.3;
  const now = timeNow();
  fireRec = { fuel: Math.min(FIRE_MAX, fuelNow() + FEED), at: now, stamp: now };
  audio.whoosh();
  pushPresence(true);
  did('fire');
  if (wasLow && keeper.bubbleFade > 0.3) setTimeout(() => keeperSays('That\'s better.'), 1800);
}

function setHeld(kind) {
  held = kind;
  me.setHeld(kind);
}
const hoofed = () => !!SPECIES[me.species].hoof;
// Resting: 'sit' or 'lie', at one of the spots by the fire (seat) or wherever you are. gaze turns you to the sky.
function setMode(mode, seat = -1, gaze = false) {
  if (mode === 'sit' && hoofed()) mode = 'lie';      // hoofed animals fold their legs and lie; they do not sit
  if (mode !== 'stand' && held === 1) setHeld(0);
  me.mode = mode;
  mySeat = mode === 'stand' ? -1 : seat;
  if (mySeat >= 0) {
    const s = spotAt(mySeat, bodyLen(me));
    me.x = s.x; me.z = s.z; me.targetYaw = s.yaw;
  }
  stargazing = mode === 'lie' && gaze;
  me.stargaze = stargazing;
  vel.x = vel.z = 0;
  world.setStargaze(stargazing);
  moveTarget = null;
  world.hideMarker();
}
function standUp() {
  if (me.mode === 'stand') return;
  setMode('stand');
}
function seatTaken(i) {
  if (i === KEEPER_SEAT) return true;
  for (const p of peers.values()) if (p.data.mode !== 'stand' && p.data.seat === i) return true;
  return false;
}
function nearestFreeSeat(maxDist) {
  let best = -1, bd = maxDist;
  SEATS.forEach((s, i) => {
    const d = Math.hypot(s.x - me.x, s.z - me.z);
    if (d < bd && !seatTaken(i)) { bd = d; best = i; }
  });
  return best;
}
const fireDist = () => Math.hypot(me.x - FIRE.x, me.z - FIRE.z);
const faceFire = () => { me.targetYaw = Math.atan2(FIRE.x - me.x, FIRE.z - me.z); };

// Sticks: take one from the pile in your mouth, carry it over, toss it on with a flick of the head.
const mouthY = () => me.y + SPECIES[me.species].height * 0.72;
function pickUpLog() { me.targetYaw = Math.atan2(WOODPILE.x - me.x, WOODPILE.z - me.z); setHeld(1); audio.step('wood', 0.8); pushPresence(true); }
function dropLog() { setHeld(0); audio.step('grass', 1); pushPresence(true); }
function tossLog() {
  if (held !== 1) return;
  faceFire();
  playEmote('throw');
  setTimeout(() => {
    setHeld(0);
    world.tossLog(me.x, mouthY(), me.z, feedFire);
    pushPresence(true);
  }, 260);
}

// The island's own animals make themselves heard.
const hearFrom = (x, z, reach) => clamp(1 - Math.hypot(x - me.x, z - me.z) / reach, 0, 1);
critters.events.onHoot = () => { if (entered) audio.hoot(hearFrom(critters.owl.x, critters.owl.z, 38)); };
critters.events.onMoo = () => { if (entered) audio.call('moo', hearFrom(critters.cow.x, critters.cow.z, 40)); };

// The Keeper knows when the stars will fall.
function keeperHello() {
  if (FAR) return mapmakerHello();
  if (bottle && bottle.kind === 'reply') return 'A bottle came back for you. It is on the beach.';
  const st = showerState();
  const todo = listToday().find((id) => !listState().done.includes(id));
  if (st.on) return 'Look up. They are falling now.';
  const mins = Math.round(st.startsIn / 60000);
  if (mins <= 12) return mins <= 1 ? 'Any moment now, the stars fall. Get to the hill.' : `The stars fall in about ${mins} minutes. The hill is the place for it.`;
  return KEEPER_HELLO[Math.floor(Math.random() * KEEPER_HELLO.length)];
}
life.events.onShower = (on) => {
  if (!entered) return;
  if (skyNow.dark < 0.5) return;
  if (on) { addLog('', 'Stars have started to fall. Look up.', 'sys'); if (keeper.bubbleFade > 0.3) keeperSays('There they go. Look up.'); }
  else addLog('', 'The sky is quiet again.', 'sys');
};

// The Keeper's list: three small jobs a day. Each one done adds planks to the boat in your name.
const TASKS = {
  wood: 'Bring driftwood to the boat', dock: 'Go after the fish at the dock', fire: 'Feed the fire a stick',
  warm: 'Get warm right through by the fire', hill: 'Call out from the hilltop, lying under the sky',
  butterfly: 'Hold still in a meadow until a butterfly lands on you', stone: 'Nap on the sun-warmed stone',
  mark: 'Leave a mark on the driftwood wall', bottle: 'Send a bottle out to sea', shake: 'Shake off a soaked coat',
};
function listToday() {
  const day = todayKey(), seed = [...day].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  const rest = Object.keys(TASKS).filter((k) => k !== 'wood').map((k, i) => [((seed ^ (i * 2654435761)) >>> 0) % 1000, k]).sort((a, b) => a[0] - b[0]);
  return ['wood', rest[0][1], rest[1][1]];
}
function listState() {
  let rec = null;
  try { rec = JSON.parse(localStorage.getItem('ember.list')); } catch (e) { rec = null; }
  return rec && rec.day === todayKey() && Array.isArray(rec.done) ? rec : { day: todayKey(), done: [] };
}
// ---------- the guide: always one clear next thing, and a way to find it ----------
// A first visit is shown one thing: the way to the fire. After that the guide points at the next job on the
// keeper's list. Either way there is a line of words, an arrow, a distance, and a column of light at the spot.
const guideFlags = {};
const touch = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
const STARTER = [
  { text: touch ? 'Walk up to the fire. Tap the ground to move' : 'Walk up to the fire. W A S D, or click the ground', where: () => FIRE, done: () => fireDist() < 5.5 },
];
// The rest is left to be found. The island still counts, once per visitor, who went on to rest by the fire (g2),
// feed it (g3) and greet the Keeper (g4), so that the Keeper can see what newcomers discover by themselves.
const firsts = (() => { const f = store('ember.firsts'), old = store('ember.starter') || 0; return f && typeof f === 'object' ? f : { g2: old >= 2, g3: old >= 3, g4: old >= 4 }; })();
function first(k) { if (firsts[k]) return; firsts[k] = true; store('ember.firsts', firsts); net.note(k); }
let starterAt = store('ember.starter');
if (!Number.isInteger(starterAt)) starterAt = 0;
if (FAR) starterAt = Math.max(starterAt, STARTER.length);      // nobody reaches the far shore without having found the fire at home
// ---------- quests ----------
// Story quests (quests.js) are done once each and kept with the visitor. They come in chapters; the one at the top
// of the screen is the first open quest of the story. When there is none, the Keeper's requests for the day take
// its place.
const quests = (() => { const q = store('ember.quests'); return q && typeof q === 'object' ? q : {}; })();
if (!FAR && starterAt >= STARTER.length && !quests.cold) { quests.cold = Date.now(); store('ember.quests', quests); }      // visitors from before there were quests have already found the fire
let myPlanks = store('ember.myPlanks'); if (!Number.isFinite(myPlanks)) myPlanks = 0;
const SAND = ['cockle', 'whelk', 'seaglass', 'moonshell', 'conch', 'feather'];
const MY_CHAPTERS = CHAPTERS.filter((c) => (c.isle || 'home') === ISLE), MY_STORY = STORY.filter((q) => MY_CHAPTERS.includes(q.chapter));
// On Lantern Rock whatever has happened stays happened: a quest that waits on a moment is done if the moment ever came.
const seenKeys = (() => { const k = store('ember.seen'); return k && typeof k === 'object' ? k : {}; })();
const logs = (() => { const l = store('ember.logs'); return Array.isArray(l) ? l.filter((i) => Number.isInteger(i) && i >= 0 && i < LOGBOOK.length) : []; })();      // pages of the keeper's logbook in the satchel
const FAR_FINDS = FINDS.filter((f) => f.far);
const QUEST_CHECK = {
  area: (q) => (walked.has(q.arg) ? 1 : 0), card: (q) => (cards[q.arg] ? 1 : 0), logs: () => logs.length, painted: () => stonesSeen(), door: () => (echoOpen ? 1 : 0), tune: () => (tuneKnown ? 1 : 0),
  stage: (q) => (lightStage() >= q.arg ? 1 : 0), mylight: () => myLight, chests: () => chestsOpen(),
  walked: () => walked.size, farfinds: () => FAR_FINDS.filter((f) => journal[f.id]).length,
  stamps: () => MY_SIGHTS.filter((sg) => cards[sg.id]).length,
  shore: () => SAND.filter((id) => journal[id]).length, planks: () => myPlanks, nights: () => nights, finds: () => journalCount(),
  gaze: () => (stargazing && skyNow.dark > 0.6 ? 1 : 0), sail: () => (voyageSeated && voyageNow && voyageNow.phase === 'sail' ? 1 : 0),
};
const chapterLeft = (c) => c.quests.filter((q) => !quests[q.id]).length;
// A chapter of the story is open once the one before it is finished but for one quest; the side chapters always are.
const checkNow = (q) => { try { return Number(QUEST_CHECK[q.check](q)) || 0; } catch (e) { return 0; } };      // some of what is counted is not set up until later in the page
const chapterOpen = (c) => { if (c.isle === 'far') return true; if (c.side) return !!quests.cold; const main = MY_CHAPTERS.filter((k) => !k.side), i = main.indexOf(c); return i === 0 || (chapterOpen(main[i - 1]) && chapterLeft(main[i - 1]) <= 1); };
const questOpen = (q) => !quests[q.id] && chapterOpen(q.chapter) && (!q.needsBoat || boatBuilt());
// Some quests can only be done at night, by day or at low water: while one is waiting, the next that can be done is the one followed.
const questReady = (q) => !q.when || (q.when === 'night' ? skyNow.dark > 0.55 : q.when === 'day' ? skyNow.dark < 0.4 : q.when === 'lowtide' ? tideAt(timeNow()).y < TIDE.flat - 0.14 : true);
const questNow = () => { const open = MY_STORY.filter((q) => !q.chapter.side && questOpen(q)); return open.find(questReady) || open[0] || null; };
// A quest that somebody asks for has to be asked for: until the visitor has been to see them it shows only as
// "has something to ask", with a gold mark over their head. Once asked the mark is grey until the quest is done.
const GIVER = { 'The Keeper': 'keeper', 'The Mapmaker': 'keeper', 'The Hermit': 'hermit', 'The Lamplighter': 'heron' };
const GREETS = { keeper: 'keeper', hermit: 'hermit', heron: 'heron' };
const taken = (() => { const k = store('ember.taken'); return k && typeof k === 'object' ? k : {}; })();
const needsAsking = (q) => !!GIVER[q.from] && !taken[q.id] && !(q.on && q.on.includes(GREETS[GIVER[q.from]])) && (FAR ? q.from !== 'The Keeper' : q.from === 'The Keeper');
const giverPlace = (q) => (GIVER[q.from] === 'keeper' ? keeper : GIVER[q.from] === 'hermit' ? world.hermit : world.heron);
// Greeting somebody who has a quest waiting: they ask it. Returns what they say, or '' when they have nothing new.
function askedBy(who) {
  const q = MY_STORY.find((k) => !k.chapter.side && questOpen(k) && GIVER[k.from] === who && needsAsking(k));
  if (!q) return '';
  taken[q.id] = Date.now(); store('ember.taken', taken); showList(); audio.pop(600);
  setTimeout(() => addLog('', `A quest from ${lower(q.from)}: ${q.title}. ${questAsk(q)}.`, 'sys'), 1800);
  return q.say || `There is something you could do for me. ${questAsk(q)}.`;
}
const chapterNow = () => { const q = questNow(); return q ? q.chapter : null; };
const questsDone = () => MY_STORY.filter((q) => quests[q.id]).length;
const askOf = (q) => (q.askBuilt && boatBuilt() ? q.askBuilt : q.ask);
const questAsk = (q) => (q.need > 1 ? `${askOf(q)} (${Math.min(q.need, checkNow(q))} of ${q.need})` : askOf(q));
const lower = (s) => s.charAt(0).toLowerCase() + s.slice(1);
function questDone(id) {
  if (quests[id] || !entered) return;
  const q = storyById[id], wasOpen = MY_CHAPTERS.filter(chapterOpen);
  quests[id] = Date.now(); store('ember.quests', quests); if (!taken[id]) { taken[id] = Date.now(); store('ember.taken', taken); }
  questAt = Date.now();
  flash(q.title, 'A quest is done');
  audio.pop(700);
  addLog('', `${q.title}. ${q.tells}`, 'sys');
  if (q.says) setTimeout(() => { if (keeper.bubbleFade > 0.3) keeperSays(q.says); else addLog(KNAME, q.says, 'sys'); keeperNext = Math.max(keeperNext, t + 30); }, 2200);
  showList();
  if (id === 'lr-mapmaker') setTimeout(() => addLog('', 'He unhooks a canvas satchel from the map board and holds it out in his beak. It is for what you find. Your journal has it, under Satchel.', 'sys'), 4200);
  const opened = MY_CHAPTERS.find((c) => !c.side && chapterOpen(c) && !wasOpen.includes(c)), next = questNow();
  if (opened) setTimeout(() => { flash(opened.title, 'A new chapter'); addLog('', `A new chapter: ${opened.title}. Your journal has what it asks.`, 'sys'); }, 5200);
  else if (questsDone() === MY_STORY.length) setTimeout(() => addLog('', FAR ? 'That is every quest on this island, for now. The tower on the point is still dark.' : 'That is every quest on this island. The west is still dark.', 'sys'), 5200);
  else if (next && !q.chapter.side && !FAR) setTimeout(() => addLog('', `${next.from} has something else for you: ${lower(next.ask)}.`, 'sys'), 5200);
}
// Something happened that a quest may have been waiting for.
function questEvent(key) {
  if (!entered) return;
  if (FAR && !seenKeys[key]) { seenKeys[key] = 1; store('ember.seen', seenKeys); }
  if (FAR && Date.now() - questAt < 4000) return;      // one has only just been told: the frame's own check will come back to this
  for (const q of MY_STORY) if (q.on && q.on.includes(key) && questOpen(q)) { questDone(q.id); return; }      // one at a time: the next is told a moment later
}
let questAt = 0;
function questChecks() {
  if (Date.now() - questAt < 9000) return;      // never two at once: each gets its moment
  for (const q of MY_STORY) if (questOpen(q) && ((q.check && checkNow(q) >= (q.need || 1)) || (FAR && q.on && q.on.some((k) => seenKeys[k])))) { questDone(q.id); return; }
}
const QUEST_WHERE = {
  fire: () => FIRE, feed: () => (held === 1 ? FIRE : WOODPILE), keeper: () => keeper, stone: () => life.stone, meadow: () => life.meadowNear(me.x, me.z).meadow || FIRE,
  dock: () => ({ x: DOCK.x1 - 0.6, z: 0 }), beach: () => ({ x: SPAWN.x, z: SPAWN.z + 3 }), wall: () => WALL, crate: () => CRATE,
  wood: () => (held === 3 ? yard.site : yard.pieces[0] || yard.site), yard: () => yard.site, hill: () => HILL,
  post: () => POST, lens: () => LENS, chest: () => CHEST, hchest: () => world.chests.find((c) => c.id === 'h-rocks') || FIRE,
};
const TASK_WHERE = {
  wood: () => (held === 3 ? yard.site : yard.pieces[0] || yard.site), dock: () => ({ x: DOCK.x1 - 0.6, z: 0 }), fire: () => (held === 1 ? FIRE : WOODPILE),
  warm: () => FIRE, hill: () => HILL, mark: () => WALL, bottle: () => CRATE, shake: () => ({ x: SPAWN.x, z: SPAWN.z + 4.6 }),
  butterfly: () => life.meadowNear(me.x, me.z).meadow || FIRE, stone: () => life.stone,
};
// Where each quest on Lantern Rock is to be done, for the arrow.
const nearestOf = (list) => list.slice().sort((a, b) => Math.hypot(a.x - me.x, a.z - me.z) - Math.hypot(b.x - me.x, b.z - me.z))[0] || null;
const pageAt = () => nearestOf(world.logPages.filter((pg) => pg.there)), forTower = () => { const L = LIGHT[lightStage()]; return !L ? world.lighthouse.door : (bag[L.kind] || 0) >= (bagCount() >= BAG_MAX ? 1 : BAG_MAX) || ((bag[L.kind] || 0) > 0 && Math.hypot(me.x - world.lighthouse.door.x, me.z - world.lighthouse.door.z) < 40) ? world.lighthouse.door : nearestOf(world.sources.filter((sc) => sc.kind === L.kind && !sc.tide)); };
const xz = (a) => ({ x: a[0], z: a[1] });
const FAR_WHERE = {
  'lr-mapmaker': () => keeper, 'lr-map': () => MAP_BOARD, 'lr-woods': () => WOODS_AT, 'lr-tree': () => HOLLOW_TREE, 'lr-page': () => world.logPages[1].there ? world.logPages[1] : pageAt(), 'lr-valley': () => POOL,
  'lr-hermit': () => world.hermit, 'lr-lantern': () => world.hermit, 'lr-painted': () => (lamp ? xz(CAVE.pts[1]) : world.hermit), 'lr-door': () => xz(CAVE.pts[2]), 'lr-mark': () => world.echo.mark,
  'lr-wind': () => HILL, 'lr-tune': () => HILL, 'lr-summit': () => SUMMIT, 'lr-heron': () => world.heron, 'lr-carving': () => world.cottage.door,
  'lr-flats': () => FLATS, 'lr-stern': () => world.flats.wreck.stern || FLATS, 'lr-bell': () => world.flats.bell, 'lr-islet': () => ISLET, 'lr-logbook': pageAt,
  'lr-farbeach': () => SHELTER, 'lr-spring': () => SPRING, 'lr-grotto': () => CRAG, 'lr-moon': () => MOONPOOL, 'lr-whale': () => BONES, 'lr-seat': () => SEAT, 'lr-cairn': () => WAYCAIRN,
  'lr-chest': () => world.chests.find((c) => c.id === 'c-landing'), 'lr-lake': () => (echoOpen ? CAVE.lake : xz(CAVE.pts[2])),
  'lr-took': forTower, 'lr-gave': forTower, 'lr-s1': forTower, 'lr-s2': forTower, 'lr-s3': forTower, 'lr-s4': forTower, 'lr-twenty': forTower, 'lr-climb': () => world.lighthouse.door,
};
// A question mark over anybody who has something to ask: whoever an open quest of the story comes from.
function makeMark() {
  const c = document.createElement('canvas'); c.width = c.height = 96; const g = c.getContext('2d');
  g.font = '900 84px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round'; g.lineWidth = 12; g.strokeStyle = 'rgba(40,24,10,0.9)'; g.strokeText('?', 48, 52); g.fillStyle = '#ffffff'; g.fillText('?', 48, 52);
  const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tx, transparent: true, depthWrite: false, fog: false })); sp.scale.setScalar(0.8); sp.visible = false; sp.renderOrder = 5; return sp;
}
const marks = [];
function addMark(group, from, y) { const sp = makeMark(); sp.position.y = y; group.add(sp); marks.push({ sp, from, y }); }
function showMarks() {
  for (const m of marks) {
    const theirs = entered ? MY_STORY.filter((q) => !q.chapter.side && q.from === m.from && questOpen(q)) : [], gold = theirs.some((q) => needsAsking(q) || (q.on && q.on.includes(GREETS[GIVER[q.from]])));
    m.sp.visible = theirs.length > 0; m.sp.material.color.set(gold ? 0xffc45a : 0x9aa3b2); m.sp.material.opacity = gold ? 1 : 0.8;
    m.sp.position.y = m.y + (gold ? Math.sin(performance.now() / 420) * 0.07 : 0);
  }
}
addMark(keeper.group, FAR ? 'The Mapmaker' : 'The Keeper', FAR ? 3.15 : 2.05);
let goal = null;
function findGoal() {
  if (itWho === 'me') { const q = taggable(999, true); return { text: q ? `You are it. Catch ${q.p.data.name}` : 'You are it. The others are resting, so wait for one to get up', at: q ? q.p.av : me, step: '' }; }
  if (game && itWho && folkHas(itWho)) return { text: `${itWho === 'keeper' ? 'The Keeper' : folkGet(itWho).data.name} is it. Keep away`, at: folkGet(itWho).av, step: '' };
  if (FAR) { const fq = questNow(); if (!fq) return null; if (needsAsking(fq)) return { text: `${fq.from} has something to ask`, at: giverPlace(fq), step: '' }; let at = null; try { at = (FAR_WHERE[fq.id] || (() => null))(); } catch (e) { at = null; } return { text: questAsk(fq), at: at && Number.isFinite(at.x) ? at : null, step: '' }; }
  if (starterAt < STARTER.length) return { text: typeof STARTER[starterAt].text === 'function' ? STARTER[starterAt].text() : STARTER[starterAt].text, at: STARTER[starterAt].where(), step: '' };
  const q = questNow();
  if (q && needsAsking(q)) return { text: `${q.from} has something to ask`, at: keeper, step: '' };
  if (q) return { text: !questReady(q) ? `${questAsk(q)}. ${q.when === 'night' ? 'Wait for night' : q.when === 'day' ? 'Wait for daylight' : 'Wait for the tide to go out'}` : questAsk(q), at: (QUEST_WHERE[q.where] || (() => me))(), step: '' };
  const st = listState(), id = listToday().find((k) => !st.done.includes(k));
  return null;      // no quest open: nothing is asked, and nothing points anywhere
}
const beacon = new THREE.Group();
{
  const c = document.createElement('canvas'); c.width = 4; c.height = 128;
  const g = c.getContext('2d'), grad = g.createLinearGradient(0, 128, 0, 0);
  grad.addColorStop(0, 'rgba(255,255,255,0.95)'); grad.addColorStop(0.5, 'rgba(255,255,255,0.3)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 4, 128);
  const col = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 16, 14, 1, true), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), color: 0xffc978, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false, toneMapped: false }));
  col.position.y = 8;
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.05, 28), new THREE.MeshBasicMaterial({ color: 0xffc978, transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide, fog: false, toneMapped: false }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.08;
  beacon.add(col, ring);
  beacon.userData = { col, ring };
  beacon.visible = false;
  scene.add(beacon);
}
let goalCheckAt = 0;
function updateGuide(now) {
  if (!entered) { beacon.visible = false; return; }
  if (now - goalCheckAt > 300) {
    goalCheckAt = now;
    if (starterAt < STARTER.length && STARTER[starterAt].done()) {
      starterAt++;
      store('ember.starter', starterAt);
      net.note('g' + starterAt);
      audio.pop(560);
      if (starterAt >= STARTER.length) { questDone('cold'); addLog('', touch ? 'The words at the bottom of the screen are what you can do where you stand.' : 'E and R do whatever is in reach where you stand.', 'sys'); }
    }
    if (starterAt >= STARTER.length) {
      if (me.mode !== 'stand' && fireDist() < 5.5) first('g2');
      if (guideFlags.fire) first('g3');
      if (guideFlags.greet) first('g4');
      if (guideFlags.greet) questEvent('keeper');
      questChecks(); updateSights();
    }
    goal = asleepSince ? null : findGoal(); showMarks();
    // The Keeper's list stays out of the way until the fire is reached: one thing at a time.
    $('tasks').dataset.fresh = starterAt < STARTER.length ? 'true' : 'false';
    const el = $('goal');
    el.hidden = !goal;
    if (goal) {
      const label = goal.step ? `${goal.step}. ${goal.text}` : goal.text;
      if (label !== el.dataset.shown) { el.dataset.shown = label; $('goal-text').textContent = label; }
    }
  }
  $('goal-arrow').style.display = $('goal-dist').style.display = goal && !goal.at ? 'none' : '';
  if (!goal || !goal.at) { beacon.visible = false; return; }
  const dx = goal.at.x - me.x, dz = goal.at.z - me.z, d = Math.hypot(dx, dz);
  // The arrow points to where the goal lies as seen on screen: straight up means dead ahead.
  const rel = Math.atan2(dx, dz) - (camYaw + Math.PI);
  $('goal-arrow').style.transform = `rotate(${(-90 - rel * 180 / Math.PI).toFixed(0)}deg)`;
  $('goal-dist').textContent = d < 3.2 ? 'here' : `${Math.round(d)} m`;
  beacon.visible = d > 3.2;
  if (beacon.visible) {
    beacon.position.set(goal.at.x, Math.max(groundHeight(goal.at.x, goal.at.z), 0), goal.at.z);
    const pulse = 0.5 + 0.5 * Math.sin(now / 320);
    beacon.userData.ring.scale.setScalar(1 + pulse * 0.5);
    beacon.userData.ring.material.opacity = 0.75 - pulse * 0.45;
    beacon.userData.col.material.opacity = (0.4 + 0.2 * pulse) * (skyNow.dark > 0.5 ? 1 : 1.5);
  }
}

function showList() {
  const st = listState(), today = listToday(), q = questNow();
  for (const el of [$('list'), $('tasks-list')]) {
    el.textContent = '';
    if (el.id === 'tasks-list') {
      // The chapter being followed: its quest at the top of the screen in full, the others still open by name.
      const ch = chapterNow();
      const head = document.createElement('li'); head.className = 'asks'; head.textContent = ch ? ch.title : 'The story so far'; el.appendChild(head);
      if (ch && q) { const li = document.createElement('li'); li.className = 'now quest'; const b = document.createElement('b'); b.textContent = q.title; li.append(b, document.createElement('br'), needsAsking(q) ? `${q.from} has something to ask. Go and see ${q.from === 'The Lamplighter' ? 'her' : 'him'}.` : questAsk(q)); el.appendChild(li); }      // one quest at a time: the rest are in the journal
      else { const li = document.createElement('li'); li.className = 'done quest'; li.textContent = 'Every quest of the story is done'; el.appendChild(li); }
    }
    for (const id of []) {      // the Keeper's list of the day is gone: quests are what the island asks now
      const li = document.createElement('li');
      li.textContent = TASKS[id];
      if (st.done.includes(id)) li.className = 'done';
      else if (!q && id === today.find((k) => !st.done.includes(k))) li.className = 'now';
      el.appendChild(li);
    }
  }
  $('tasks-count').textContent = `${questsDone()} of ${MY_STORY.length}`;
}
// The list on the left folds away under its heading; small screens start with it folded.
{
  const box = $('tasks'), head = $('tasks-head');
  let closed = store('ember.tasksClosed');
  if (typeof closed !== 'boolean') closed = window.innerWidth < 720 || window.innerHeight < 520;
  const apply = () => { box.dataset.closed = closed ? 'true' : 'false'; head.setAttribute('aria-expanded', closed ? 'false' : 'true'); };
  apply();
  head.addEventListener('click', () => { closed = !closed; store('ember.tasksClosed', closed); apply(); canvas.focus(); });
}
function did(id) {
  if (FAR) return;
  questEvent(id);
}
// The nearest visitor who is awake and within reach, if there is one.
function companion(reach) {
  let best = null, bd = reach;
  for (const p of peers.values()) { if (p.data.asleep) continue; const d = Math.hypot(p.av.x - me.x, p.av.z - me.z); if (d < bd) { bd = d; best = p; } }
  return best;
}
function addPlanks(n) {
  myPlanks += n; store('ember.myPlanks', myPlanks);
  saved.addPlanks(n, me.name, myCode).then((r) => { if (r === 'local') { boatTotal += n; yard.setProgress(boatTotal); } });
}
function pickUpDriftwood(i) {
  if (!yard.take(i)) return;
  setHeld(3); audio.step('wood', 0.8); pushPresence(true);
}
function addToBoat() {
  if (held !== 3) return;
  me.targetYaw = Math.atan2(yard.site.x - me.x, yard.site.z - me.z);
  playEmote('throw');
  setTimeout(() => {
    setHeld(0); audio.step('wood', 1.4); pushPresence(true);
    // Many paws: with another animal beside you, the driftwood counts twice.
    const mate = companion(8);
    addPlanks(mate ? 2 : 1);
    if (mate) net.note('duo');
    addLog('', mate
      ? `With ${mate.data.name} beside you, the driftwood counts twice. ${Math.min(BOAT_GOAL, boatTotal + 2)} of ${BOAT_GOAL} planks.`
      : boatTotal >= BOAT_GOAL ? 'The boat is built, so your driftwood goes into the stores for the first voyage. Your name is on her all the same.'
      : `Your driftwood is part of the boat now. ${Math.min(BOAT_GOAL, boatTotal + 1)} of ${BOAT_GOAL} planks.${peers.size ? ' It counts twice when another animal is beside you.' : ''}`, 'sys');
    did('wood');
  }, 300);
}
// Tracks left by an earlier visitor: nose over them to learn who it was.
function sniffTracks(tr) {
  me.targetYaw = Math.atan2(tr.x - me.x, tr.z - me.z);
  playEmote('sniff');
  const kind = SPECIES[tr.s] ? SPECIES[tr.s].label.toLowerCase() : 'animal';
  setTimeout(() => addLog('', tr.n ? `${tr.n} was here ${ago(tr.at)}.` : `A ${kind} was here ${ago(tr.at)}.`, 'sys'), 600);
  if (!sniffTracks.seen) sniffTracks.seen = new Set();
  if (!sniffTracks.seen.has(tr.at)) { sniffTracks.seen.add(tr.at); net.note('sniff'); }
}
// The boat and the names of everyone who put a plank on it.
function lookAtBoat() {
  questEvent('look');
  const built = boatTotal >= BOAT_GOAL;
  const crew = boatCrew.slice(0, 40).map((c) => ({ text: c.name, meta: c.n === 1 ? '1 plank' : `${c.n} planks` }));
  const more = boatCrew.length > 40 ? [{ text: `and ${boatCrew.length - 40} more` }] : [];
  openSheet({
    title: built ? 'The Keeper\'s boat is built' : 'The Keeper\'s boat',
    lines: [
      { text: built
        ? `All ${BOAT_GOAL} planks are on. She lies afloat at the end of the gangplank. For now she only goes round the island: go down to the water and climb in, alone or with others. The Keeper built her to go back west. He has not said when.`
        : `${boatTotal} of ${BOAT_GOAL} planks so far. The Keeper is building her to go back west, and he will not say what is there. Driftwood washes up on the beaches, and it counts twice with another animal beside you.` },
      ...(crew.length ? [{ text: built ? 'Built by' : 'Built so far by', kind: 'head' }, ...crew, ...more] : [{ text: 'Nobody has added a plank yet. Yours could be the first.' }]),
    ],
    note: built ? 'More driftwood still helps: it goes into the stores for the crossing.' : '',
  });
}

// Fish: watch the shadows from the end of the dock and bring a paw down when one passes underneath.
const atDockEnd = () => me.x > DOCK.x1 - 1.6 && me.x <= DOCK.x1 + 0.3 && Math.abs(me.z) < 1.3;
function pawAtWater() {
  if (me.emote) return;
  me.targetYaw = Math.PI / 2;
  playEmote('paw');
  did('dock');
  const fs = life.fishingSpot, canCatch = !held;      // every animal can fish: paws scoop, hooves stamp the fish up and teeth take it
  setTimeout(() => {
    audio.step('water', 1.6);
    if (life.splash(fs.x, fs.z + (me.z * 0.5), canCatch)) {
      fishTonight++;
      setHeld(2);
      const kind = fishKind({ dark: skyNow.dark, rain: rainNow, campfire: campNow().on });
      addLog('', `${hoofed() ? 'You stamp, a fish jumps clear of the water, and you have it in your teeth. ' : ''}You caught ${kind === 'oldone' ? 'the old one' : (/^[aeiou]/i.test(FIND[kind].name) ? 'an ' : 'a ') + FIND[kind].name.toLowerCase()}.${fishTonight > 1 ? ` That makes ${fishTonight} fish this visit.` : ''}`, 'sys');
      found(kind, true);
      setTimeout(() => playEmote('wag'), 900);
      pushPresence(true);
    }
  }, 420);
}
function eatFish() {
  if (held !== 2) return;
  playEmote('sniff');
  setTimeout(() => { setHeld(0); audio.pop(440); addLog('', 'You ate the fish.', 'sys'); pushPresence(true); }, 700);
}
function giveFish() {
  setTimeout(() => questEvent('fishgift'), 2500);
  if (held !== 2) return;
  me.targetYaw = Math.atan2(keeper.x - me.x, keeper.z - me.z);
  playEmote('throw');
  setTimeout(() => {
    setHeld(0); pushPresence(true);
    addLog('', 'You left the fish for the Keeper.', 'sys');
    setTimeout(() => { keeper.play('greet'); keeperSays(['For me? Thank you.', 'A fine one. Thank you.', 'You are quick with a paw.'][fishTonight % 3]); keeperNext = Math.max(keeperNext, t + 30); }, 700);
  }, 300);
}

// Calls: each animal has its own voice, and it carries.
// ---------- the Keeper plays tag ----------
// Ask the Keeper and he gets up and plays like anyone else: he runs from whoever is it, and chases when it is him.
// One player's game moves him (the "host": the player whose id sorts first) and tells the others where he is, so
// everyone sees the same chase. If that player goes, the next one carries on.
const K = { av: keeper, data: { name: 'the Keeper', species: keeper.species, game: 0, it: 0, tagAt: 0, tagTo: '', mode: 'stand', asleep: false, code: '', muted: 0 } };
let keeperLoose = false, keeperHoming = false, keeperItAt = -99, keeperRestUntil = 0, keeperTagSeen = 0, keeperHead = 0, wasHost = false, keeperSaid = 0;
const myWireId = () => net.id || 'solo';
function* folk() { yield* peers; if (K.data.game) yield ['keeper', K]; }
const folkGet = (id) => (id === 'keeper' ? (K.data.game ? K : undefined) : peers.get(id));
const folkHas = (id) => !!folkGet(id);
// Who moves the Keeper: of the visitors in his game, the one whose id sorts first.
function keeperHost() {
  const g = K.data.game;
  if (!g) return null;
  let best = game === g ? myWireId() : null;
  for (const [id, p] of peers) if (p.data.game === g && (best === null || id < best)) best = id;
  return best;
}
function askKeeper() {
  if (game || seenGame || !entered) return;
  me.targetYaw = Math.atan2(keeper.x - me.x, keeper.z - me.z);
  playEmote('wag');
  if (rainNow > 0.5) { setTimeout(() => keeperSays('Tag, in this rain? Ask me when it clears.'), 500); return; }
  if (nowSec() < keeperRestUntil) { setTimeout(() => keeperSays('Let me get my breath back first.'), 500); return; }
  const at = tagStamp();
  game = at; myIt = at; myItAt = nowSec(); myTag = null; tagSeen = at; alone = 0;
  Object.assign(K.data, { game: at, it: 0, tagAt: 0, tagTo: '' });
  keeperLoose = true; keeperHoming = false; keeperHead = Math.atan2(keeper.x - me.x, keeper.z - me.z);
  keeper.mode = 'stand'; keeper.play('hop');
  setTimeout(() => keeperSays('Tag? Ha. You will have to catch me first.'), 400);
  flash('You are it!', 'Catch the Keeper');
  addLog('', 'The Keeper gets to his feet. You are it! Catch him.', 'sys');
  audio.pop(700);
  net.note('game');
  me.setName(me.name, mySub());
  pushPresence(true);
}
function keeperMadeIt(at) {
  if (!(at > K.data.it)) return;
  K.data.it = at; keeperItAt = nowSec();
  keeper.play('hop');
}
// Something the Keeper did reaches everyone here: he has tagged someone.
function keeperTagged() {
  const d = K.data;
  if (!(d.tagAt > keeperTagSeen)) return;
  keeperTagSeen = d.tagAt; tagSeen = Math.max(tagSeen, d.tagAt);
  if (!entered || !d.tagTo) return;
  keeper.play('paw');
  if (d.tagTo === myWireId()) {
    if (!game || game !== d.game) return;
    myIt = d.tagAt; myItAt = nowSec();
    flash('You are it!', 'The Keeper tagged you');
    addLog('', 'The Keeper tagged you. You are it!', 'sys');
    ripple(me.x, me.z, 4, 0xffb04a); audio.pop(480);
    if (!me.emote) playEmote('hop');
    me.setName(me.name, mySub()); pushPresence(true);
  } else {
    const q = peers.get(d.tagTo);
    if (!q) return;
    ripple(q.av.x, q.av.z, 4, 0xffb04a);
    addLog('', `The Keeper tagged ${q.data.name}. ${q.data.name} is it.`, 'sys');
    if (game && game === d.game) flash(`${q.data.name} is it`, 'The Keeper tagged them');
  }
}
function keeperStep(dt, tx, tz, speed, away) {
  // Head for (or away from) a point, picking the open direction: not into the sea, not off the island.
  let want = Math.atan2(tx - keeper.x, tz - keeper.z) + (away ? Math.PI : 0), best = want, score = -1e9;
  for (let k = 0; k < 12; k++) {
    const a = want + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.5;
    const px = keeper.x + Math.sin(a) * 3.5, pz = keeper.z + Math.cos(a) * 3.5;
    let s = -Math.abs(a - want) * 2.2 - Math.abs(Math.atan2(Math.sin(a - keeperHead), Math.cos(a - keeperHead))) * 0.8;
    if (groundHeight(px, pz) < 0.45) s -= 100;
    if (away) s += Math.hypot(px - tx, pz - tz) * 0.6 - Math.max(0, Math.hypot(px, pz) - 19) * 1.5 - (Math.hypot(px - FIRE.x, pz - FIRE.z) < 3 ? 6 : 0);
    if (s > score) { score = s; best = a; }
  }
  keeperHead += Math.atan2(Math.sin(best - keeperHead), Math.cos(best - keeperHead)) * Math.min(1, dt * 5);
  const n = moveWithCollision(keeper.x, keeper.z, Math.sin(keeperHead) * speed * dt, Math.cos(keeperHead) * speed * dt, 0.5);
  keeper.speed = lerp(keeper.speed, Math.hypot(n.x - keeper.x, n.z - keeper.z) / Math.max(dt, 1e-3), 0.3);
  keeper.x = n.x; keeper.z = n.z; keeper.targetYaw = keeperHead;
}
// Called every frame before the Keeper is drawn. Returns true while he is up and about, false when he is by the fire.
function updateKeeperGame(dt) {
  if (FAR) return false;      // the Mapmaker is too old for tag
  const d = K.data, now = nowSec();
  const host = keeperHost(), mine = host !== null ? host === myWireId() : wasHost && (d.game || keeperHoming);
  if (!mine) {
    // Someone else moves him: follow what they say.
    wasHost = false;
    let src = null;
    for (const [id, p] of peers) if (p.data.keeper && (!src || id < src.id)) src = { id, k: p.data.keeper };
    if (!src) {
      if (keeperLoose && (d.game || keeperHoming)) { d.game = 0; keeperHoming = false; }
      if (!d.game) keeperLoose = false;
    } else {
      keeperLoose = true; keeperHoming = src.k.g < 0;
      d.game = src.k.g > 0 ? src.k.g : 0; d.it = src.k.it; d.tagTo = src.k.to; d.tagAt = src.k.at;
      const px = keeper.x, pz = keeper.z, k = 1 - Math.exp(-dt * 8);
      keeper.x = lerp(keeper.x, src.k.x, k); keeper.z = lerp(keeper.z, src.k.z, k);
      keeper.speed = lerp(keeper.speed, Math.hypot(keeper.x - px, keeper.z - pz) / Math.max(dt, 1e-3), 0.25);
      if (keeper.speed > 0.4) keeper.targetYaw = Math.atan2(keeper.x - px, keeper.z - pz);
    }
  } else {
    wasHost = true; keeperLoose = true;
    const runners = [];
    if (game && game === d.game && me.mode === 'stand' && !asleepSince) runners.push({ id: myWireId(), av: me });
    for (const [id, p] of peers) if (p.data.game === d.game && d.game && p.data.mode === 'stand' && !p.data.asleep) runners.push({ id, av: p.av });
    const humans = (game && game === d.game ? 1 : 0) + [...peers.values()].filter((p) => d.game && p.data.game === d.game).length;
    if (d.game && (timeNow() - d.game > tagTime * 1000 || !humans)) {
      // The round is over, or everyone has gone: back to the fire for a rest.
      d.game = 0; d.it = 0; keeperHoming = true; keeperRestUntil = now + 45;
      if (entered && now - keeperSaid > 20) { keeperSaid = now; setTimeout(() => keeperSays('Enough for these old legs. Good game.'), 600); }
    }
    if (d.game) {
      const keeperIt = d.it > d.tagAt;
      if (keeperIt) {
        let prey = null, pd = 1e9;
        for (const r of runners) { const dd = Math.hypot(r.av.x - keeper.x, r.av.z - keeper.z); if (dd < pd) { pd = dd; prey = r; } }
        if (now - keeperItAt < TAG_GRACE || !prey) keeper.speed = lerp(keeper.speed, 0, 0.3);       // counting to three
        else if (pd < 2.0) { d.tagTo = prey.id; d.tagAt = tagStamp(); }
        else keeperStep(dt, prey.av.x, prey.av.z, 4.6, false);
      } else {
        const chaser = itWho === 'me' ? me : itWho && peers.has(itWho) ? peers.get(itWho).av : null;
        const cd = chaser ? Math.hypot(chaser.x - keeper.x, chaser.z - keeper.z) : 1e9;
        if (chaser && cd < 13) keeperStep(dt, chaser.x, chaser.z, cd < 5 ? 4.1 : 3.3, true);
        else { keeper.speed = lerp(keeper.speed, 0, 0.2); if (chaser) keeper.targetYaw = Math.atan2(chaser.x - keeper.x, chaser.z - keeper.z); }
      }
    } else if (keeperHoming) {
      const s = spotAt(KEEPER_SEAT, bodyLen(keeper));
      if (Math.hypot(s.x - keeper.x, s.z - keeper.z) < 0.8) { keeperHoming = false; keeperLoose = false; wasHost = false; }
      else if (Math.hypot(s.x - keeper.x, s.z - keeper.z) < 5) {
        // The last few steps go straight to his place, between the logs.
        const dx = s.x - keeper.x, dz = s.z - keeper.z, dd = Math.hypot(dx, dz), step = Math.min(dd, 2.4 * dt);
        keeper.x += (dx / dd) * step; keeper.z += (dz / dd) * step; keeper.targetYaw = Math.atan2(dx, dz); keeper.speed = lerp(keeper.speed, 2.4, 0.3);
      }
      else keeperStep(dt, s.x, s.z, 2.6, false);
    } else { keeperLoose = false; wasHost = false; }
  }
  keeperTagged();
  if (keeperLoose) { keeper.mode = 'stand'; keeper.y = groundHeight(keeper.x, keeper.z); }
  else if (partyStand) { if (keeper.mode !== 'stand') keeper.mode = 'stand'; }          // on his feet for the dance
  else if (keeper.mode !== 'lie') { keeper.mode = 'lie'; keeper.speed = 0; }
  const sub = `${itWho === 'keeper' ? '§i' : ''}${KSUB}`;
  if (keeper.sub !== sub) keeper.setName('Keeper', sub);
  return keeperLoose;
}
// What the host tells everyone about the Keeper, riding along with their own position.
const keeperWire = () => (wasHost && (K.data.game || keeperHoming) ? [K.data.game || -1, Math.round(keeper.x * 100) / 100, Math.round(keeper.z * 100) / 100, K.data.it, K.data.tagTo, K.data.tagAt] : null);

// ---------- tag ----------
// A game of tag is asked for and agreed to: one animal asks another, and when the other says yes the asker is "it".
// Whoever is it chases the players and passes it on with a touch. A round lasts two minutes, and anyone can join or
// stop while it runs. Nobody keeps score.
// There is no referee. Each animal says which game it is in (the game's number is the moment it began), when it was
// last made it, and whom it last tagged and when. The player whose "made it" is newest, and newer than its own last
// tag, is it. Only players on their feet and awake can be tagged.
const TAG_REACH = 2.6, TAG_GRACE = 3;
let tagTime = 120;                   // seconds a round lasts
let game = 0;                        // the game you are playing in, or 0
let myIt = 0, myItAt = -99, myTag = null, tagSeen = 0;
let myInvite = null, myInviteAt = -99;       // whom you asked to play, and when
let invitedBy = null;                // who asked you: { id, name, until }
let seenGame = 0, noItSince = 0, alone = 0;
const nowSec = () => performance.now() / 1000;
const inMyGame = (p) => !!game && p.data.game === game;
// The nearest animal you could touch: for whoever is it, a player; otherwise anyone awake and on their feet.
function taggable(reach, playersOnly) {
  let best = null, bd = reach;
  for (const [id, p] of folk()) {
    if (p.data.mode !== 'stand' || p.data.asleep || (playersOnly && !inMyGame(p))) continue;
    const d = Math.hypot(p.av.x - me.x, p.av.z - me.z);
    if (d < bd) { bd = d; best = { id, p }; }
  }
  return best;
}
// A stamp later than any seen so far, so the order of tags is the same for everyone whatever their clocks say.
function tagStamp() {
  let at = Math.max(timeNow(), myIt + 1, tagSeen + 1, myTag ? myTag[1] + 1 : 0);
  for (const [, q] of folk()) at = Math.max(at, q.data.it + 1, q.data.tagAt + 1);
  return at;
}
// Big words in the middle of the screen for a moment: the things in a game nobody should miss.
let flashTimer = 0;
function flash(title, sub = '') {
  const el = $('flash');
  $('flash-title').textContent = title; $('flash-sub').textContent = sub;
  el.hidden = false; el.classList.remove('go'); void el.offsetWidth; el.classList.add('go');
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => { el.hidden = true; }, 2600);
}
function inviteTag(id) {
  const p = peers.get(id);
  if (!p || !entered || game) return;
  myInvite = [id, timeNow()]; myInviteAt = nowSec();
  me.targetYaw = Math.atan2(p.av.x - me.x, p.av.z - me.z);
  playEmote('wag');
  addLog('', `You asked ${p.data.name} to play tag. If they say yes, you are it.`, 'sys');
  pushPresence(true);
}
// Saying yes: the game begins, and the one who asked is it.
function acceptTag() {
  const inv = invitedBy, p = inv && peers.get(inv.id);
  invitedBy = null;
  if (!p || !entered) return;
  const at = tagStamp();
  game = at; myTag = [inv.id, at, 1]; myIt = 0; tagSeen = at;
  playEmote('hop'); audio.pop(700);
  flash('Run!', `${p.data.name} is it`);
  addLog('', `You are playing tag with ${p.data.name}. They are it. Run!`, 'sys');
  net.note('game');
  pushPresence(true);
}
function joinTag() {
  questEvent('tag');
  if (!seenGame || game || !entered) return;
  game = seenGame; myIt = 0; alone = 0;
  playEmote('hop'); audio.pop(700);
  flash('You are in', 'Stay away from whoever is it');
  pushPresence(true);
}
function leaveTag(say = true) {
  if (!game) return;
  game = 0; myIt = 0; myTag = null;
  if (say) addLog('', 'You have stopped playing tag.', 'sys');
  me.setName(me.name, mySub());
  pushPresence(true);
}
function tagPeer(id) {
  const p = folkGet(id);
  if (!p || !entered || itWho !== 'me' || !inMyGame(p)) return;
  const at = tagStamp();
  me.targetYaw = Math.atan2(p.av.x - me.x, p.av.z - me.z);
  playEmote('paw'); audio.pop(760);
  ripple(p.av.x, p.av.z, 4, 0xffb04a);
  myTag = [id, at]; myIt = 0; tagSeen = at;
  if (id === 'keeper') keeperMadeIt(at);          // if someone else moves him, they hear of it from your tag
  flash(`You tagged ${p.data.name}!`, 'Now run');
  addLog('', `You tagged ${p.data.name}. Run!`, 'sys');
  net.note('tag');
  pushPresence(true);
}
// Called with every update from another visitor: have they asked you to play, or just tagged somebody?
function heardTag(id, p, data) {
  if (data.invAt > (p.invAt || 0)) {
    p.invAt = data.invAt;
    if (data.invTo === net.id && entered && !asleepSince && !game && !party && !voyage && !ignored.has(id)) {
      invitedBy = { id, name: data.name, until: nowSec() + 14 };
      flash(`${data.name} wants to play tag`, touch ? 'Tap the words below to play' : 'Press E to play');
      addLog('', `${data.name} asks you to play tag.`, 'sys');
      audio.pop(620);
    }
  }
  if (!(data.tagAt > (p.tagAt || 0))) return;
  p.tagAt = data.tagAt;
  if (data.tagAt > timeNow() + 60000 || data.tagAt <= tagSeen) return;      // a stamp from the future, or old news
  tagSeen = data.tagAt;
  if (!entered) return;
  if (data.tagTo === 'keeper' && K.data.game && data.game === K.data.game) keeperMadeIt(data.tagAt);
  if (data.tagTo === net.id) {
    if (data.tagStart) {
      // They said yes to your asking: the game is on and you are it.
      if (!myInvite || myInvite[0] !== id || nowSec() - myInviteAt > 30 || game) return;
      myInvite = null;
      game = data.tagAt; myIt = data.tagAt; myItAt = nowSec(); alone = 0;
      flash('You are it!', `${data.name} is in. Catch them`);
      addLog('', `${data.name} said yes. You are it! Give them a moment, then catch them.`, 'sys');
      net.note('game');
    } else {
      if (!game || data.game !== game || asleepSince || me.mode !== 'stand') return;       // not playing, or safe
      myIt = data.tagAt; myItAt = nowSec();
      flash('You are it!', `${data.name} tagged you`);
      addLog('', `${data.name} tagged you. You are it!`, 'sys');
      ripple(me.x, me.z, 4, 0xffb04a);
      if (!me.emote) playEmote('hop');
    }
    audio.pop(480);
    me.setName(me.name, mySub());
    pushPresence(true);
  } else if (!data.tagStart) {
    const q = folkGet(data.tagTo);
    if (!q) return;
    ripple(q.av.x, q.av.z, 4, 0xffb04a);
    const whom = data.tagTo === 'keeper' ? 'The Keeper' : q.data.name;
    addLog('', `${data.name} tagged ${q.data.name}. ${whom} is it.`, 'sys');
    if (game && data.game === game) flash(`${whom} is it`, `${data.name} tagged ${data.tagTo === 'keeper' ? 'him' : 'them'}`);
  }
}
const itMarker = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.42, 4), new THREE.MeshBasicMaterial({ color: 0xffb04a, fog: false, toneMapped: false }));
itMarker.rotation.x = Math.PI; itMarker.visible = false; scene.add(itMarker);
// A ring on the ground under everyone who is playing: thick and pulsing under whoever is it, thin under the rest.
const tagRings = [];
function tagRing(i) {
  while (tagRings.length <= i) {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.82, 1, 40), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false, toneMapped: false }));
    m.rotation.x = -Math.PI / 2; m.renderOrder = 2; m.visible = false; scene.add(m); tagRings.push(m);
  }
  return tagRings[i];
}
const clockText = (s) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, '0')}`;
let gameLine = '';
function updateTag() {
  const now = nowSec();
  if (invitedBy && (now > invitedBy.until || game || !peers.has(invitedBy.id))) invitedBy = null;
  if (myInvite && now - myInviteAt > 15) { myInvite = null; pushPresence(true); if (!game && entered) addLog('', 'No answer about tag this time.', 'sys'); }
  if (game && (asleepSince || !entered)) leaveTag(false);
  // The game in view: yours if you are playing, otherwise the newest one still running on the island.
  let g = game;
  if (!g) for (const [, p] of folk()) if (p.data.game > g && timeNow() - p.data.game < tagTime * 1000 + 5000) g = p.data.game;
  seenGame = g;
  const players = [];
  if (g) for (const [id, p] of folk()) if (p.data.game === g) players.push(id);
  // Who is it: among the players, the newest "made it" that has not been passed on.
  let who = null, at = 0;
  if (game && myIt && (!myTag || myIt > myTag[1])) { who = 'me'; at = myIt; }
  for (const id of players) { const d = folkGet(id).data; if (d.it > d.tagAt && d.it > at && !d.asleep) { who = id; at = d.it; } }
  if (who !== 'me' && myIt && game) { let later = false; for (const id of players) { const d = folkGet(id).data; if (d.it > myIt && d.it > d.tagAt) later = true; } if (later) { myIt = 0; pushPresence(true); } }
  if (who !== itWho) { itWho = who; me.setName(me.name, mySub()); for (const [id, p] of peers) p.av.setName(p.data.name, peerSub(id, p.data)); pushPresence(true); }
  const left = g ? tagTime - (timeNow() - g) / 1000 : 0;
  const itName = who === 'me' ? 'You' : who === 'keeper' ? 'The Keeper' : who ? folkGet(who).data.name : '';
  if (game) {
    // Your game ends when time is up, when everyone else has gone, or when whoever was it has left.
    alone = players.length ? 0 : alone || now;
    noItSince = who ? 0 : noItSince || now;
    let over = '';
    if (left <= 0) over = who === 'me' ? 'Time! You were it at the end.' : who ? `Time! ${itName} was it at the end.` : 'Time! The game of tag is over.';
    else if (alone && now - alone > 6) over = 'Everyone else has left the game of tag.';
    else if (noItSince && now - noItSince > 6) over = 'Whoever was it has gone, so the game of tag is over.';
    if (over) {
      if (left <= 0) { flash('Time!', who === 'me' ? 'You were it at the end' : who ? `${itName} was it at the end` : ''); if (who !== 'me' && !me.emote) playEmote('hop'); audio.pop(880); }
      addLog('', over, 'sys');
      game = 0; myIt = 0; myTag = null; alone = 0; noItSince = 0;
      me.setName(me.name, mySub()); pushPresence(true);
    }
  } else { alone = 0; noItSince = 0; }
  // The line under the guide: what game is on, who is it, how long is left, and a way in or out.
  const el = $('game');
  const line = !g || !entered || left <= 0 ? '' : game
    ? `${who === 'me' ? 'You are it!' : who ? `${itName} is it. Run!` : 'Tag'}|${players.length + 1} playing|Stop playing`
    : `Tag: ${who ? `${itName} is it` : 'a game is on'}|${players.length} playing|Join in`;
  if (line || (!partyLine && !voyageLine)) el.hidden = !line;       // a dance at the fire or the boat may be using the line
  if (line) {
    $('game-time').textContent = clockText(left);
    if (line !== gameLine) { partyLine = ''; voyageLine = ''; const [a, b, c] = line.split('|'); $('game-text').textContent = a; $('game-count').textContent = b; $('game-btn').textContent = c; el.classList.toggle('it', who === 'me'); }
  }
  gameLine = line;
  // Rings under the players, and a marker over whoever is it.
  let k = 0;
  const ring = (av, isIt) => {
    const m = tagRing(k++);
    const pulse = 0.5 + 0.5 * Math.sin(t * 6);
    m.visible = true; m.position.set(av.x, Math.max(groundHeight(av.x, av.z), 0) + 0.07, av.z);
    m.scale.setScalar(isIt ? 1.0 + pulse * 0.18 : 0.72);
    m.material.color.set(isIt ? 0xffb04a : 0xf6ead2); m.material.opacity = isIt ? 0.9 : 0.4;
  };
  if (g && entered && left > 0) {
    if (game) ring(me, who === 'me');
    for (const id of players) { const p = folkGet(id); if (p.av.group.visible !== false && p.data.mode === 'stand' && k < 14) ring(p.av, who === id); }
  }
  for (; k < tagRings.length; k++) tagRings[k].visible = false;
  const av = who === 'me' ? me : who ? folkGet(who).av : null;
  itMarker.visible = !!av && entered && av.group.visible !== false;
  if (itMarker.visible) {
    const sp = SPECIES[who === 'me' ? me.species : folkGet(who).data.species] || SPECIES[5];
    itMarker.position.set(av.x, av.y + (av.tag ? av.tag.position.y : sp.height * 1.3) + 0.55 + Math.sin(t * 5) * 0.08, av.z);
    itMarker.rotation.y = t * 2.4;
  }
}
$('game-btn').addEventListener('click', () => { if (voyage) { if (voyageNow && voyageNow.phase === 'board') leaveBoat(); } else if (voyageLine && !gameLine && !partyLine) boardBoat(); else if (game) leaveTag(); else if (seenGame) joinTag(); else if (party) leaveParty(); else joinParty(); canvas.focus(); });

// ---------- a dance at the fire ----------
// When a few animals are resting at the fire, one of them can start a dance. Everyone who joins circles the fire
// together for a minute, hopping on the beat and calling out on every fourth bar; the fire burns higher the more
// there are, and the Keeper gets up and joins in. Like tag, there is no referee: each dancer says which dance they
// are in (its number is the moment it began) and works out their own place in the ring from the list of dancers.
const PARTY_MS = 60000, PARTY_R = 5.0, BEAT_MS = 800;
let party = 0, seenParty = 0, partyBeat = -1, partyAlone = 0, partyJoinedAt = 0, partyLine = '', partyCalled = 0, partyPhase = 'ring', partyAng = 0, partyTick = 0;
// Getting to the ring: a walked path from where you are, out between the logs, to the nearest point on it.
function walkToRing() {
  const dx = me.x - FIRE.x, dz = me.z - FIRE.z, d = Math.hypot(dx, dz) || 1;
  moveTarget = findPath(me.x, me.z, FIRE.x + (dx / d) * PARTY_R, FIRE.z + (dz / d) * PARTY_R);
  stuckFor = 0; partyPhase = 'walk'; partyTick = performance.now();
}
const restingAtFire = () => [...peers.values()].filter((p) => p.data.mode !== 'stand' && !p.data.asleep && Math.hypot(p.av.x - FIRE.x, p.av.z - FIRE.z) < 5.5);
function startParty() {
  if (party || seenParty || game || voyage || !entered) return;
  party = Math.max(timeNow(), tagSeen + 1); partyJoinedAt = timeNow(); partyAlone = 0; partyBeat = -1;
  standUp(); setHeld(0); walkToRing();
  flash('Dance!', 'Round the fire');
  addLog('', 'You started a dance at the fire. Anyone near can join in.', 'sys');
  audio.pop(760); world.flareUp();
  net.note('dance');
  pushPresence(true);
}
function joinParty() {
  if (party || !seenParty || game || voyage || !entered) return;
  questEvent('dance');
  party = seenParty; partyJoinedAt = timeNow(); partyAlone = 0; partyBeat = -1;
  if (me.mode !== 'stand') standUp();
  setHeld(0); walkToRing();
  flash('You are in', 'Round the fire');
  audio.pop(700);
  net.note('dance');
  pushPresence(true);
}
function leaveParty(why = '') {
  if (!party) return;
  const danced = timeNow() - partyJoinedAt;
  party = 0;
  if (why === 'done') {
    // Danced it through: warm to the bone, and (not more than once in ten minutes) a plank on the boat.
    warmth = 1; warmSaid = true;
    const last = store('ember.danced') || 0, plank = danced > 25000 && timeNow() - last > 600000;
    if (plank) { store('ember.danced', timeNow()); addPlanks(1); }
    flash('What a dance', plank ? 'Warm right through, and a plank on the boat' : 'Warm right through');
    addLog('', plank ? 'The dance is over. You are warm right through, and a plank goes on the boat in your name.' : 'The dance is over. You are warm right through.', 'sys');
    did('warm');
  } else addLog('', why === 'alone' ? 'The dance has wound down.' : 'You stepped out of the dance.', 'sys');
  pushPresence(true);
}
function updateParty(dt) {
  let g = party;
  if (!g) for (const p of peers.values()) if (p.data.dance > g && timeNow() - p.data.dance < PARTY_MS) g = p.data.dance;
  seenParty = g;
  const left = g ? (PARTY_MS - (timeNow() - g)) / 1000 : 0;
  const ids = [];
  if (g) for (const [id, p] of peers) if (p.data.dance === g) ids.push(id);
  if (!seenParty && partyCalled) partyCalled = 0;
  if (seenParty && !party && !partyCalled && entered && fireDist() < 12 && ids.length) {
    // A dance has begun nearby: say so once.
    partyCalled = seenParty;
    flash(`${peers.get(ids[0]).data.name} started a dance`, touch ? 'Tap the words below to join in' : 'Press E to join in');
    audio.pop(620);
  }
  if (party) {
    partyAlone = ids.length ? 0 : partyAlone || timeNow();
    if (left <= 0) leaveParty('done');
    else if (asleepSince || !entered) leaveParty();
    else if (partyAlone && timeNow() - partyAlone > 25000) leaveParty("alone");      // time for others to notice and join
  }
  const on = !!g && left > 0 && entered;
  const n = ids.length + (party ? 1 : 0);
  const beat = on ? Math.floor((timeNow() - g) / BEAT_MS) : -1;
  const newBeat = on && beat !== partyBeat;
  if (party) {
    // Your place in the ring: the dancers in a fixed order, evenly spaced, all turning together.
    const order = [myWireId(), ...ids].sort(), i = order.indexOf(myWireId());
    const slot = (i / order.length) * Math.PI * 2 + ((timeNow() - party) / 1000) * 0.5;
    const rdt = Math.min(0.25, Math.max(0, (performance.now() - partyTick) / 1000)); partyTick = performance.now();
    const r = Math.hypot(me.x - FIRE.x, me.z - FIRE.z);
    lastInputAt = timeNow();
    if (partyPhase === 'walk') {
      // First walk out between the logs to the ring, on your own feet.
      if (!moveTarget || Math.abs(r - PARTY_R) < 0.45 || timeNow() - partyJoinedAt > 8000) { partyPhase = 'ring'; partyAng = Math.atan2(me.x - FIRE.x, me.z - FIRE.z); moveTarget = null; world.hideMarker(); }
    } else {
      // Then go round with the ring, catching up along it to your own place rather than jumping there.
      const gap = Math.atan2(Math.sin(slot - partyAng), Math.cos(slot - partyAng));
      partyAng += 0.5 * rdt + clamp(gap, -0.3 * rdt, 0.4 * rdt);        // never quite standing still, never sprinting
      const rr = lerp(r, PARTY_R, 1 - Math.exp(-rdt * 3));
      me.x = FIRE.x + Math.sin(partyAng) * rr; me.z = FIRE.z + Math.cos(partyAng) * rr;
      me.targetYaw = Math.atan2(Math.cos(partyAng), -Math.sin(partyAng));
      me.speed = lerp(me.speed, PARTY_R * (0.5 + clamp(gap, -0.3, 0.4)), 0.2);
      vel.x = vel.z = 0; moveTarget = null;
    }
    if (newBeat && beat % 2 === 0 && partyPhase === 'ring') playEmote('hop');
  }
  if (newBeat) {
    partyBeat = beat;
    if (beat % 8 === 7) {
      // Every fourth bar the whole ring calls out, and the fire jumps.
      world.flareUp();
      const voices = ids.map((id) => peers.get(id)).filter((p) => p.fade !== undefined);
      if (party) audio.call(SPECIES[me.species].call, 0.5);
      voices.slice(0, 4).forEach((p, j) => setTimeout(() => audio.call(SPECIES[p.data.species].call, 0.3 * hearFrom(p.av.x, p.av.z, 30)), 60 + j * 70));
    }
    // The Keeper keeps time, on his feet by his place.
    if (!keeperLoose && beat % 2 === 0) keeper.play('hop');
  }
  world.setParty(on ? Math.min(1, n / 5) * 0.6 + 0.4 : 0);
  partyStand = on && !keeperLoose;
  // The line at the top, when no game of tag has it.
  const el = $('game');
  const line = on && !gameLine && !voyage ? `${party ? 'Dancing at the fire' : 'A dance at the fire'}|${n} dancing|${party ? 'Step out' : game ? '' : 'Join in'}` : '';
  if (!gameLine && !voyageLine) {
    el.hidden = !line;
    if (line) {
      $('game-time').textContent = clockText(left);
      if (line !== partyLine) { voyageLine = ''; const [a, b, c] = line.split('|'); $('game-text').textContent = a; $('game-count').textContent = b; $('game-btn').textContent = c; $('game-btn').hidden = !c; el.classList.remove('it'); }
    }
  } else if (gameLine) $('game-btn').hidden = false;
  partyLine = line;
}
let partyStand = false;

// ---------- the boat's voyage ----------
// Once the boat is built, anyone can climb in. She casts off when the time to board runs out, or sooner if someone
// aboard says so, sails once round the island and comes home. Like the dance there is no referee: each animal aboard
// says which voyage it is on (the moment it was called) and when it casts off, and the earliest word wins.
let voyage = 0, voyageCast = 0, seenVoyage = 0, seenCast = 0, voyageLine = '', voyageSaid = 0, voyageCalled = 0, voyageWas = '';
let voyageNow = null, voyageCrew = [], voyageSeated = false, voyageWalkAt = 0, voyageDolphins = false;
// A short hop from one place to another (the last step into the boat, and back out onto the gangplank).
let hop = null;
function hopTo(to, done) { playEmote('hop'); hop = { x0: me.x, y0: me.y, z0: me.z, to, t0: t, dur: 0.5, done }; }
function updateHop() {
  const u = Math.min(1, (t - hop.t0) / hop.dur), e = u * u * (3 - 2 * u), p = hop.to();
  me.targetYaw = Math.atan2(p.x - hop.x0, p.z - hop.z0);
  me.x = lerp(hop.x0, p.x, e); me.z = lerp(hop.z0, p.z, e);
  me.y = lerp(hop.y0, p.y ?? groundHeight(p.x, p.z), e) + Math.sin(u * Math.PI) * 0.35;
  vel.x = vel.z = 0;
  if (u >= 1) { const d = hop.done; hop = null; if (d) d(); }
}
const boatDist = () => Math.hypot(yard.berth.x - me.x, yard.berth.z - me.z);
const boatBuilt = () => boatTotal >= BOAT_GOAL;
function boardBoat() {
  if (voyage || game || party || !entered || !boatBuilt() || boatDist() > 4.2) return;
  if (seenVoyage) {
    if (!voyageNow || voyageNow.phase !== 'board' || voyageCrew.length >= yard.crewMax) return;
    voyage = seenVoyage; voyageCast = seenCast;
  } else {
    voyage = timeNow(); voyageCast = voyage + BOARD_MS;
    addLog('', 'She casts off in a moment: anyone near can come aboard too.', 'sys');
  }
  // Up the gangplank on your own feet, and a hop over her side at the top.
  setHeld(0); audio.pop(700);
  voyageSeated = false; voyageWalkAt = timeNow(); voyageDolphins = false; hop = null;
  moveTarget = onSlip(me.x, me.z) ? [yard.plankHead] : [yard.plankFoot, yard.plankHead]; moveTarget.short = true;
  flash('All aboard', 'Once round the island');
  voyageSaid = 0;
  pushPresence(true);
}
function castOff() {
  if (!voyage || timeNow() >= voyageCast - 3000) return;
  voyageCast = timeNow() + 3000;
  pushPresence(true);
}
function leaveBoat(why = '') {
  if (!voyage) return;
  const i = Math.max(0, voyageCrew.indexOf(myWireId()));
  const wasSeated = voyageSeated;
  voyage = 0; voyageCast = 0; voyageSeated = false; hop = null;
  vel.x = vel.z = 0; moveTarget = null;
  setMode('stand');
  // Back over her side onto the gangplank, and down it to the sand.
  const walkOff = () => { moveTarget = [yard.plankFoot, yard.ashore(i)]; moveTarget.short = true; };
  if (entered) { if (wasSeated) hopTo(() => yard.plankHead, walkOff); else walkOff(); }
  if (why === 'missed') addLog('', 'She has gone without you.', 'sys');
  else if (why === 'home') {
    sailed += 1; store('ember.sailed', sailed);
    flash('Home again', sailed === 1 ? 'You have sailed round the island' : `${sailed} times round the island`);
    addLog('', sailed === 1 ? 'Home again. You have sailed right round the island, and a small sail by your name says so.' : `Home again. That is ${sailed} times round the island.`, 'sys');
    audio.pop(880); me.setName(me.name, mySub());
    net.note('sail');
  } else addLog('', 'You stepped back onto the sand.', 'sys');
  pushPresence(true);
}
function updateVoyage(dt) {
  // Which voyage is on: mine, or the earliest one anybody near is on.
  const now = timeNow();
  let g = voyage, cast = voyageCast;
  const ids = [];
  for (const [id, p] of peers) {
    const v = p.data.voyage;
    if (!v || now - v.cast > 200000) continue;
    if (!g || v.id < g) { g = v.id; cast = v.cast; ids.length = 0; }
    if (v.id === g) { ids.push(id); cast = Math.min(cast, v.cast); }
  }
  if (voyage && g !== voyage) { voyage = g; pushPresence(true); }           // two were called at once: the earlier one stands
  if (voyage && cast < voyageCast) { voyageCast = cast; pushPresence(true); }
  seenVoyage = g; seenCast = cast;
  voyageCrew = g ? [...(voyage ? [myWireId()] : []), ...ids].sort() : [];
  voyageNow = g && voyageCrew.length ? voyageAt(g, cast, now) : null;
  if (voyageNow && voyageNow.phase === 'done' && !voyage) voyageNow = null;
  const v = voyageNow;
  yard.setHull(v && v.pose, (x, z) => world.seaY(x, z), t);
  // Once on the way round, forty seconds out, dolphins come alongside: a few leaps and they are gone.
  const since = v && v.phase === 'sail' ? (now - seenCast) / 1000 - 40 : -1;
  const dolphins = since >= 0 && since < 10.5;
  life.escort(dolphins ? v.pose : null, seenCast / 1000 + 40);
  if (dolphins && voyage && voyageSeated && !voyageDolphins) { voyageDolphins = true; addLog('', 'Dolphins! Two of them, leaping alongside.', 'sys'); audio.pop(760); found('dolphin', true); }
  if (v && v.phase !== voyageWas) {
    if (v.phase === 'sail' && (voyage || boatDist() < 30)) { audio.pop(520); if (voyage) { flash('Cast off', 'Once round the island'); addLog('', 'She swings away from the shore.', 'sys'); } }
  }
  voyageWas = v ? v.phase : '';
  if (!seenVoyage && voyageCalled) voyageCalled = 0;
  if (v && v.phase === 'board' && !voyage && !voyageCalled && entered && boatDist() < 16 && ids.length) {
    voyageCalled = g;
    flash(`${peers.get(ids[0]).data.name} is taking the boat out`, 'Climb in at the boat before she goes');
    audio.pop(620);
  }
  if (voyage && v) {
    if (v.phase === 'done') leaveBoat('home');
    else if (!entered) leaveBoat();
    else if (!voyageSeated) {
      // Still on the way up the gangplank.
      lastInputAt = now;
      const head = yard.plankHead, dh = Math.hypot(me.x - head.x, me.z - head.z);
      if (hop) { /* in the air */ }
      else if (v.phase === 'sail' && dh > 3) leaveBoat('missed');
      else if (dh < 0.55 || (!moveTarget && dh < 2) || now - voyageWalkAt > 9000 || v.phase === 'sail') {
        moveTarget = null; world.hideMarker();
        hopTo(() => yard.seat(Math.max(0, voyageCrew.indexOf(myWireId()))), () => { voyageSeated = true; setMode('sit'); addLog('', 'You are aboard.', 'sys'); pushPresence(true); });
      } else if (!moveTarget) { if (me.mode !== 'stand') setMode('stand'); moveTarget = onSlip(me.x, me.z) ? [yard.plankHead] : [yard.plankFoot, yard.plankHead]; moveTarget.short = true; }
    } else {
      // Sit in your place: the crew in a fixed order, bow to stern.
      const seat = yard.seat(voyageCrew.indexOf(myWireId()));
      const k = v.phase === 'sail' ? 1 : 1 - Math.exp(-dt * 7);
      me.x = lerp(me.x, seat.x, k); me.z = lerp(me.z, seat.z, k); me.y = lerp(me.y, seat.y, k);
      const hx = v.pose ? v.pose.hx : Math.sin(yard.heading), hz = v.pose ? v.pose.hz : Math.cos(yard.heading);
      me.targetYaw = Math.atan2(hx, hz);
      if (me.mode === 'stand') setMode('sit');
      vel.x = vel.z = 0; moveTarget = null; me.speed = 0; lastInputAt = now;
      if (v.phase === 'sail') {
        // Things worth saying on the way round, once each.
        const say = (n, text) => { if (voyageSaid < n) { voyageSaid = n; addLog('', text, 'sys'); } };
        if (v.u > 0.2) say(1, 'From out here the whole island fits in one look.');
        if (v.u > 0.47) say(2, skyNow.dark > 0.55 ? 'The fire is a small warm light across the water.' : 'There is the dock, and the hill behind it.');
        if (v.u > 0.75) say(3, 'She is turning for home.');
        if (Math.floor(t * 1.4) !== Math.floor((t - dt) * 1.4)) world.ripple(v.pose.x - v.pose.hx * 2.6, v.pose.z - v.pose.hz * 2.6);
      }
    }
  } else if (v && v.phase === 'sail' && Math.floor(t * 1.4) !== Math.floor((t - dt) * 1.4)) world.ripple(v.pose.x - v.pose.hx * 2.6, v.pose.z - v.pose.hz * 2.6);
  // The line at the top: for the crew always, for others when they are near and nothing else has it.
  const el = $('game');
  const show = v && entered && v.phase !== 'done' && (voyage || (!gameLine && !partyLine && (v.phase === 'board' ? boatDist() < 16 : true)));
  const n = voyageCrew.length, full = n >= yard.crewMax;
  const line = !show ? '' : v.phase === 'board'
    ? `${voyage ? 'In the boat' : 'The boat is going out'}|${n} aboard|${voyage ? 'Step ashore' : full || game || party || boatDist() > 4.2 ? '' : 'Climb in'}`
    : `${voyage ? 'Sailing round the island' : 'The boat is out'}|${n} aboard|`;
  if (line) {
    el.hidden = false;
    $('game-time').textContent = clockText(v.left);
    if (line !== voyageLine) { const [a, b, c] = line.split('|'); $('game-text').textContent = a; $('game-count').textContent = b; $('game-btn').textContent = c; $('game-btn').hidden = !c; el.classList.remove('it'); }
  } else if (voyageLine) { el.hidden = true; $('game-btn').hidden = false; }
  voyageLine = line;
}

// ---------- gestures, friends and whispers ----------
// Gestures are small things done to the animal beside you, which they can return with one tap.
const GESTURES = {
  nuzzle: { label: 'Nuzzle', did: (n) => `You nuzzle ${n}.`, got: (n) => `${n} nuzzles you.`, back: 'Nuzzle back', emote: 'sniff', color: 0xff9db0 },
  bow: { label: 'Play-bow', did: (n) => `You bow to ${n}, tail up.`, got: (n) => `${n} bows to you, wanting to play.`, back: 'Bow back', emote: 'greet', color: 0xffc978 },
  share: { label: 'Share', did: (n) => `You hold it out to ${n}.`, got: (n) => `${n} offers you what they are carrying.`, back: '', emote: 'greet', color: 0xa9e6c8 },
  curl: { label: 'Curl up beside', did: (n) => `You curl up beside ${n}.`, got: (n) => `${n} curls up beside you.`, back: '', emote: '', color: 0xffc978 },
};
let myGesture = null, gestureBack = null, lastGestureAt = -99;
function gestureTo(id, kind) {
  const p = peers.get(id), g = GESTURES[kind];
  if (!p || !g || !entered || nowSec() - lastGestureAt < 1.5 || ignored.has(id)) return;
  lastGestureAt = nowSec();
  me.targetYaw = Math.atan2(p.av.x - me.x, p.av.z - me.z);
  if (kind === 'curl') {
    // Lie down close against them, on the side you came from.
    const dx = me.x - p.av.x, dz = me.z - p.av.z, d = Math.hypot(dx, dz) || 1, gap = 0.55 + (SPECIES[me.species].height + SPECIES[p.data.species].height) * 0.28;
    me.x = p.av.x + (dx / d) * gap; me.z = p.av.z + (dz / d) * gap;
    setMode('lie');
  } else if (g.emote) playEmote(g.emote);
  if (kind === 'share') { myGesture = ['share', id, timeNow(), held]; setTimeout(() => { setHeld(0); pushPresence(true); }, 500); }
  else myGesture = [kind, id, timeNow()];
  ripple((me.x + p.av.x) / 2, (me.z + p.av.z) / 2, 1.6, g.color);
  addLog('', g.did(p.data.name), 'sys');
  audio.pop(kind === 'nuzzle' ? 820 : 680);
  gestureBack = null;
  net.note('gesture');
  pushPresence(true);
}
function heardGesture(id, p, data) {
  const g = data.gesture;
  if (!g || !(g.at > (p.gestAt || 0))) return;
  p.gestAt = g.at;
  const def = GESTURES[g.kind];
  if (!def || !entered) return;
  if (g.to !== net.id) { if (peers.has(g.to)) ripple((p.av.x + peers.get(g.to).av.x) / 2, (p.av.z + peers.get(g.to).av.z) / 2, 1.6, def.color); return; }
  if (ignored.has(id) || asleepSince || Math.hypot(p.av.x - me.x, p.av.z - me.z) > 4) return;
  addLog('', def.got(data.name), 'sys');
  audio.pop(760);
  ripple((me.x + p.av.x) / 2, (me.z + p.av.z) / 2, 1.6, def.color);
  if (g.kind === 'share' && g.held && !held) { setTimeout(() => { setHeld(g.held); pushPresence(true); addLog('', g.held === 2 ? 'You take the fish. Kind of them.' : 'You take it. Kind of them.', 'sys'); }, 600); }
  if (g.kind === 'curl') warmth = Math.min(1, warmth + 0.15);
  if (def.back) gestureBack = { id, kind: g.kind, name: data.name, until: nowSec() + 8 };
  else if (!me.emote) setTimeout(() => { if (!me.emote) playEmote('wag'); }, 500);
}
// The row of things to do with the animal beside you. Plain words, like everything else down there.
let withShown = '', withTick = 0;
function updateWith() {
  if (withTick++ % 40 === 0) showFriendsCount();
  const row = $('with');
  let who = null, wd = 2.5;
  if (entered && !party && !asleepSince) for (const [id, p] of peers) { const d = Math.hypot(p.av.x - me.x, p.av.z - me.z); if (d < wd && !p.data.asleep && !ignored.has(id) && p.fade > 0.5) { wd = d; who = { id, p }; } }
  const opts = [];
  if (who && me.mode === 'stand') {
    const resting = who.p.data.mode !== 'stand';
    if (!resting) { opts.push(['nuzzle', 'Nuzzle'], ['bow', 'Play-bow']); if (held === 1 || held === 2) opts.push(['share', held === 2 ? 'Share your fish' : 'Share your stick']); }
    else opts.push(['curl', 'Curl up beside']);
    if (who.p.data.pid && myPid && !friendOf(who.p.data.pid)) opts.push(['friend', askedMe(who.p.data.pid) ? 'Be friends' : 'Ask to be friends']);
  }
  const key = who && opts.length ? who.id + '|' + opts.map((o) => o[1]).join('|') : '';
  if (key !== withShown) {
    withShown = key;
    row.textContent = '';
    row.hidden = !key;
    if (key) {
      const lead = document.createElement('span'); lead.textContent = `With ${who.p.data.name}:`; row.appendChild(lead);
      for (const [kind, label] of opts) {
        const b = document.createElement('button'); b.type = 'button'; b.className = 'word'; b.textContent = label;
        b.addEventListener('click', () => { if (kind === 'friend') askFriend(who.p.data.pid, who.p.data.name); else gestureTo(who.id, kind); withShown = ''; canvas.focus(); });
        row.appendChild(b);
      }
    }
  }
  if (gestureBack && (nowSec() > gestureBack.until || !peers.has(gestureBack.id))) gestureBack = null;
}

// Friends are kept by the island, under a scrambled form of the secret each browser holds.
let myPid = '', friends = [], friendAsks = [], friendInvite = null, keptBy = '';
const friendOf = (pid) => friends.find((f) => f.pid === pid);
const askedMe = (pid) => friendAsks.some((f) => f.pid === pid);
const peerOf = (pid) => { for (const [id, p] of peers) if (p.data.pid === pid) return { id, p }; return null; };
function askFriend(pid, name) {
  if (!pid) return;
  const answering = askedMe(pid);
  net.social({ t: 'friend', pid });
  if (!answering) addLog('', `You asked ${name} to be friends. If they say yes, you will find each other here again.`, 'sys');
  friendInvite = null;
}
function onSocial(m) {
  if (m.t === 'friends') { friends = Array.isArray(m.friends) ? m.friends : []; friendAsks = Array.isArray(m.asks) ? m.asks : []; withShown = ''; showFriendsCount(); if (!$('sheet').hidden && $('sheet-title').textContent === 'Friends') openFriends(); }
  if (m.t === 'friends' && m.first) {
    const hereNow = friends.filter((f) => f.here).map((f) => f.name.replace(/ #\d{4}$/, ''));
    if (hereNow.length) addLog('', hereNow.length === 1 ? `Your friend ${hereNow[0]} is on the island.` : `Friends on the island: ${hereNow.slice(0, 5).join(', ')}.`, 'sys');
  }
  if (m.t === 'mail' && Array.isArray(m.mail) && m.mail.length) setTimeout(() => {
    flash(m.mail.length === 1 ? 'A note for you' : `${m.mail.length} notes for you`, `from ${[...new Set(m.mail.map((n) => String(n.name).replace(/ #\d{4}$/, '')))].slice(0, 3).join(', ')}`);
    for (const n of m.mail) if (!judge(n.text)) addLog(String(n.name), `${n.text} (left ${ago(n.at)})`, 'whisper', null, 'left you a note:');
    audio.pop(820);
  }, 3000);
  else if (m.t === 'fask') {
    const p = peers.get(m.id);
    if (p && ignored.has(m.id)) return;
    friendInvite = { pid: m.pid, name: m.name, until: nowSec() + 15 };
    flash(`${m.name} asks to be friends`, touch ? 'Tap the words below to say yes' : 'Press E to say yes');
    addLog('', `${m.name} asks to be friends. You can also answer later from Friends at the top.`, 'sys');
    audio.pop(700);
  } else if (m.t === 'fyes') {
    flash('Friends!', `You and ${m.name}`);
    questEvent('friend');
    addLog('', `You and ${m.name} are friends now. You can whisper to each other, and leave notes when one of you is away.`, 'sys');
    audio.pop(880); if (!me.emote) playEmote('hop');
  } else if (m.t === 'fno') addLog('', 'Your friends list is full.', 'sys');
  else if (m.t === 'w') {
    if (m.id && ignored.has(m.id)) return;
    if (judge(m.text)) return;
    addLog(m.name, m.text, 'whisper', m.id && peers.has(m.id) ? m.id : null, 'whispers');
    const p = m.id && peers.get(m.id);
    if (p) p.lines = (p.lines || []).concat('(whisper) ' + m.text).slice(-5);
    audio.blip(880);
  } else if (m.t === 'wok') { const f = friendOf(m.to); addLog('', m.kept ? `${f ? f.name : 'Your friend'} is away. Your note will be waiting when they come ashore.` : '', 'sys'); }
  else if (m.t === 'wno') addLog('', m.why === 'enough' ? 'They already have five notes from you waiting. Let them read those first.' : m.why === 'friends' ? 'You can only whisper to friends.' : m.why === 'muted' ? 'You are muted, so that went nowhere.' : 'That did not go through.', 'sys');
}
function whisperTo(pid, text) {
  const f = friendOf(pid);
  if (!f || !text) return;
  if (mutedUntil > timeNow()) { addLog('', 'You are muted, so that went nowhere.', 'sys'); return; }
  const verdict = judge(text);
  if (verdict === 'mute') { net.selfMute(); setMuted(timeNow() + 600000, 'words'); return; }
  if (verdict === 'soft') { addLog('', 'Gently, please. That one was not sent.', 'sys'); return; }
  net.social({ t: 'w', to: pid, text });
  addLog(`To ${f.name}`, text, 'whisper you');
}
function openWhisper(pid) {
  const f = friendOf(pid);
  if (!f) return;
  const here = !!peerOf(pid);
  openSheet({
    title: here ? `Whisper to ${f.name}` : `A note for ${f.name}`,
    lines: [{ text: here ? 'Only they will see it, wherever they are on the island.' : 'They are away. Your note will be handed to them when they next step ashore.' }],
    input: { max: 200, placeholder: here ? 'Your whisper' : 'Your note', button: here ? 'Whisper' : 'Leave it', submit: async (text) => { if (!text) return; closeSheet(); whisperTo(pid, text); } },
    extras: [{ label: 'Back to friends', run: openFriends }],
  });
}
function showFriendsCount() {
  const here = friends.filter((f) => peerOf(f.pid)).length;
  const label = friendAsks.length ? `Friends (${friendAsks.length} asking)` : here ? `Friends (${here} here)` : 'Friends';
  if ($('btn-friends').textContent !== label) $('btn-friends').textContent = label;
}
function openFriends() {
  const lines = [];
  for (const a of friendAsks) lines.push({ text: `${fullName(a.name.replace(/ #\d{4}$/, ''), a.code)} asks to be friends`, meta: 'Press to say yes', kind: 'pick', run: () => { askFriend(a.pid, a.name); } });
  const sorted = friends.slice().sort((p, q) => (Number(!!peerOf(q.pid)) - Number(!!peerOf(p.pid))) || (q.seen - p.seen));
  for (const f of sorted) {
    const here = !!peerOf(f.pid), kind = SPECIES[f.s] ? SPECIES[f.s].label : 'Animal';
    lines.push({ text: fullName(f.name.replace(/ #\d{4}$/, ''), f.code), meta: here ? `${kind} · on the island now · press to whisper` : `${kind} · last here ${ago(f.seen)} · press to leave a note`, kind: here ? 'pick here' : 'pick', run: () => openWhisper(f.pid) });
  }
  if (!lines.length) lines.push({ text: myPid ? 'No friends yet. Stand beside another animal and choose "Ask to be friends", or press their name in the chat.' : 'Friends need the island\'s own room, which could not be reached just now.' });
  const kept = keptBy === 'guest' ? 'Your number and friends are kept with your guest account.' : keptBy ? 'Your number and friends are kept by this browser.' : '';
  openSheet({ title: 'Friends', lines, note: [friends.length ? 'Friends can whisper to each other and leave notes. Press a name in the chat to remove a friend.' : '', kept].filter(Boolean).join(' ') });
}
$('btn-friends').addEventListener('click', openFriends);

// Calling and answering. A call you hear can be answered for a few seconds; a call nobody answers is picked up
// by the owl or Clover if they are near, and otherwise by the Keeper, so no call falls flat.
let answerTo = null;                 // the call you could answer now: { name, until }
let myCallOpen = -99, answeredBy = new Set();
let lonely = null;                   // the latest call no other animal has answered yet: { at, mine, by }
let keeperCallLogAt = -99;
const ripples = [];
function ripple(x, z, reach, color) {
  let r = ripples.find((k) => !k.mesh.visible);
  if (!r) {
    if (ripples.length >= 8) return;
    const mesh = new THREE.Mesh(new THREE.RingGeometry(0.94, 1, 48), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, fog: false, toneMapped: false }));
    mesh.rotation.x = -Math.PI / 2; mesh.renderOrder = 2; scene.add(mesh);
    r = { mesh }; ripples.push(r);
  }
  r.at = t; r.reach = reach; r.mesh.material.color.set(color);
  r.mesh.position.set(x, Math.max(groundHeight(x, z), 0) + 0.12, z); r.mesh.visible = true;
}
function updateCalls() {
  for (const r of ripples) {
    if (!r.mesh.visible) continue;
    const k = (t - r.at) / 1.6;
    if (k >= 1) { r.mesh.visible = false; continue; }
    r.mesh.scale.setScalar(0.4 + r.reach * (1 - (1 - k) * (1 - k)));
    r.mesh.material.opacity = 0.5 * (1 - k);
  }
  if (answerTo && t > answerTo.until) answerTo = null;
  if (lonely && t - lonely.at > 2.6) {
    const mine = lonely.mine; lonely = null;
    if (!entered || FAR) return;
    keeper.play('call');
    audio.call('bellow', Math.max(0.1, hearFrom(keeper.x, keeper.z, 55)) * 0.75);
    ripple(keeper.x, keeper.z, 5, 0xffc978);
    if (mine && t - keeperCallLogAt > 40) { keeperCallLogAt = t; addLog('', 'By the fire, the Keeper lifts his head and answers you.', 'sys'); }
  }
}
// Every call on the island passes through here: yours (by = null) and everyone else's.
function noteCall(by, x, z) {
  echoCall(x, z);
  if (shy && by === null) shy.heard(x, z);
  if (FAR && by === null && caveNow > 0.5 && !journal.echo) setTimeout(() => { addLog('', 'Your voice goes off down the dark, and a moment later something very like it comes back.', 'sys'); found('echo', true); }, 900);
  const mine = by === null;
  ripple(x, z, mine ? 6 : 5, 0xfff1d6);
  const taken = critters.heard(x, z, skyNow.dark);
  if (lonely && lonely.by !== by) lonely = null;                 // another animal spoke up: that call was answered
  else lonely = taken ? null : { at: t, mine, by };
}
function callOut() {
  if (t - lastCallAt < 2.8) return;
  lastCallAt = t;
  audio.call(SPECIES[me.species].call, 1);
  playEmote('call');
  const answering = answerTo && t < answerTo.until ? answerTo : null;
  noteCall(null, me.x, me.z);
  if (answering) {
    answerTo = null; lonely = null;
    addLog('', `You answer ${answering.name}.`, 'sys');
    ripple(me.x, me.z, 9, 0xffc978);
    net.note('answer');
  } else { myCallOpen = t; answeredBy = new Set(); }
  if (stargazing) { life.meteor(emoteMsg[1] % 100000); did('hill'); if (skyNow.dark > 0.6) found('star', true); }      // call at the sky from the hill and a star answers
}
// Greeting: a dip of the head and a wagging tail.
function greet(av, name) {
  if (av === keeper) guideFlags.greet = true; else if (av !== critters.cow) questEvent('hello');
  me.targetYaw = Math.atan2(av.x - me.x, av.z - me.z);
  playEmote('greet');
  addLog('', `You greet ${name}.`, 'sys');
  if (av === critters.cow) critters.moo();
  if (av === keeper) setTimeout(() => { keeper.play('greet'); keeperSays(askedBy('keeper') || keeperHello()); keeperNext = Math.max(keeperNext, t + 30); }, 700);
}

// ---------- chat ----------
const logEl = $('log');
function addLog(name, text, kind, peerId, verb) {
  if (!text) return;
  const row = document.createElement('div');
  row.className = 'line' + (kind ? ' ' + kind : '');
  if (name) {
    const b = document.createElement('b');
    b.textContent = name;
    // Another visitor's name can be pressed, to stop hearing them or report them.
    if (peerId) { b.className = 'whom'; b.tabIndex = 0; b.setAttribute('role', 'button'); b.title = 'Stop hearing or report'; b.onclick = () => openVisitor(peerId); b.onkeydown = (e) => { if (e.key === 'Enter') openVisitor(peerId); }; }
    row.appendChild(b);
    row.appendChild(document.createTextNode(verb ? ` ${verb} ${text}` : ' ' + text));
  } else {
    row.textContent = text;
  }
  logEl.appendChild(row);
  while (logEl.children.length > 7) logEl.removeChild(logEl.firstChild);
  setTimeout(() => row.classList.add('old'), 14000);
}
// Muted: what you type is not passed on for a while. The island decides for how long; without it, ten minutes.
function setMuted(until, why) {
  const was = mutedUntil > timeNow();
  mutedUntil = Math.max(mutedUntil, until);
  store('ember.mute', mutedUntil);
  if (!was) addLog('', why === 'reports'
    ? `Several animals reported you, so you are muted for ${Math.ceil((mutedUntil - timeNow()) / 60000)} minutes. You can still walk, call and play.`
    : `That is not said on this island. You are muted for ${Math.ceil((mutedUntil - timeNow()) / 60000)} minutes. You can still walk, call and play.`, 'sys');
  me.setName(me.name, mySub());
  pushPresence(true);
}
{ const m = store('ember.mute'); if (Number.isFinite(m) && m > timeNow()) mutedUntil = Math.min(m, timeNow() + 3600000); }
// A note for whoever looks after the island.
function openFeedback() {
  openSheet({
    title: 'Tell the Keeper',
    lines: [{ text: 'What did you like? What was confusing, broken or missing? Whoever looks after the island reads every note.' }],
    input: { free: true, max: 500, placeholder: 'Your note', button: 'Send it', submit: async (text) => {
      if (text.length < 3) { $('sheet-note').textContent = 'Write a few words first.'; return; }
      let status = 0;
      try { status = (await fetch('/room/feedback', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text, name: fullName(me.name, myCode) }) })).status; } catch (e) { status = 0; }
      if (status === 200) { closeSheet(); flash('Thank you', 'Your note is with the Keeper'); audio.pop(660); addLog('', 'Your note is with the Keeper. Thank you.', 'sys'); }
      else $('sheet-note').textContent = status === 429 ? 'That is plenty for one day, thank you. Come back tomorrow with more.' : 'That did not go through. Try again in a moment.';
    } },
    note: 'No name or address is attached, only the animal you are today.',
  });
}
$('btn-feedback').addEventListener('click', () => { openFeedback(); });
// Credit for the music, when the site has recorded tracks.
audio.listReady.then((list) => {
  const named = list.filter((x) => x.title);
  if (!named.length && !audio.credit) return;
  const el = $('music-credit');
  el.textContent = named.length ? 'Music: ' + named.map((x) => (x.artist ? `"${x.title}" by ${x.artist}` : `"${x.title}"`)).join(', ') + '.' : audio.credit;
  el.hidden = false;
});
// Another visitor: stop hearing them, or tell the Keeper what they said.
function openVisitor(id) {
  const p = peers.get(id);
  if (!p) return;
  const name = p.data.name, deaf = ignored.has(id);
  openSheet({
    title: fullName(name, p.data.code),
    lines: (p.lines && p.lines.length ? p.lines.map((x) => ({ text: `"${x}"` })) : [{ text: 'Nothing said since you have been near.' }]),
    input: p.reported ? null : { free: true, max: 200, placeholder: 'What happened? (optional)', button: `Report ${name}`, submit: async (note) => {
      const sent = net.report(id, p.lines || [], note);
      p.reported = true; ignored.add(id);
      closeSheet();
      addLog('', sent ? `Thank you. The Keeper will read your report about ${name}, and you will not hear them again this visit.` : `You will not hear ${name} again this visit.`, 'sys');
    } },
    extras: !p.data.pid || !myPid ? [] : friendOf(p.data.pid)
      ? [{ label: `Whisper to ${name}`, run: () => openWhisper(p.data.pid) }, { label: 'Stop being friends', run: () => { net.social({ t: 'unfriend', pid: p.data.pid }); closeSheet(); addLog('', `You and ${name} are no longer friends. They are not told.`, 'sys'); } }]
      : [{ label: askedMe(p.data.pid) ? `Be friends with ${name}` : `Ask ${name} to be friends`, run: () => { closeSheet(); askFriend(p.data.pid, name); } }],
    extra: { label: deaf ? `Hear ${name} again` : `Stop hearing ${name}`, run: () => { if (deaf) ignored.delete(id); else ignored.add(id); closeSheet(); addLog('', deaf ? `You can hear ${name} again.` : `You will not hear ${name} until you leave. They are not told.`, 'sys'); } },
    note: p.reported ? 'You have reported this animal.' : 'A report sends the Keeper the last things this animal said. Animals reported by several others are muted.',
  });
}
function tidyMessage(text, max = 200) {
  return text.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/(https?:\/\/|www\.)\S+/gi, '[link removed]').replace(/\s+/g, ' ').trim().slice(0, max);
}
function sendChat(raw) {
  const text = tidyMessage(raw);
  if (!text) return;
  const now = performance.now();
  if (now - lastSayAt < 900) return;
  lastSayAt = now;
  if (mutedUntil > timeNow()) { addLog('', `You are muted, so nobody would hear that. ${Math.ceil((mutedUntil - timeNow()) / 60000)} more minutes. Everything else on the island still works.`, 'sys'); return; }
  const verdict = judge(text);
  if (verdict === 'mute') { net.selfMute(); setMuted(timeNow() + 600000, 'words'); return; }
  if (verdict === 'soft') { addLog('', 'Gently, please. That one was not sent.', 'sys'); return; }
  me.say(text);
  speaker = { av: me, until: t + 5 };
  addLog(me.name, text, 'you');
  sayMsg = [text, timeNow()];
  pushPresence(true);
}
$('chat').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = $('say');
  sendChat(input.value);
  input.value = '';
});

const EMOTES = ['call', 'hop', 'shake', 'wag', 'greet', 'sniff', 'paw', 'throw'];
function playEmote(name) {
  if (name === 'shake' && wet > 0.15) {
    life.shakeOff(me.x, me.y + SPECIES[me.species].height * 0.6, me.z, SPECIES[me.species].height);
    audio.step('water', 0.9);
    wet = Math.min(wet, 0.12); wetSaid = false;
    if (name === 'shake') setTimeout(() => did('shake'), 0);
  }
  me.play(name);
  emoteMsg = [name, timeNow()];
  pushPresence(true);
}
// ---------- other people ----------
function presenceState() {
  return {
    v: 1, n: me.name, k: myCode, s: me.species, c: me.palette, t: originText(),
    x: Math.round(me.x * 100) / 100, z: Math.round(me.z * 100) / 100, r: Math.round(me.targetYaw * 100) / 100,
    st: me.mode === 'sit' ? 1 : me.mode === 'lie' ? (stargazing ? 3 : 2) : 0, se: mySeat,
    m: sayMsg, e: emoteMsg, h: held, tl: Math.round(warmth * 10) / 10, w: Math.round(wet * 10) / 10, b: hasButterfly ? 1 : 0, zz: asleepSince, nv: nights,
    fr: fireRec.stamp ? [Math.round(fireRec.fuel * 1000) / 1000, fireRec.at] : null,
    lp: lamp ? 1 : 0, wr: wearList(), ev: myEvent, it: myIt, tg: myTag, gm: game, ti: myInvite, kp: keeperWire(), dn: party, vy: voyage ? [voyage, voyageCast, voyageSeated ? 1 : 0] : null, sv: sailed, cf: fires.count, jn: journalCount(), gs: myGesture, mu: mutedUntil > timeNow() ? mutedUntil : 0,
  };
}
const net = createNet({
  onStatus() { updateCount(); },
  onSocial(m) { onSocial(m); },
  onMod(m) { if (m.muted) setMuted(m.muted, m.why); else if (m.soft) addLog('', 'Gently, please. That one was not passed on.', 'sys'); },
  onPeers(list) {
    const seen = new Set();
    for (const { id, data } of list) {
      seen.add(id);
      let p = peers.get(id);
      if (!p) {
        const av = new Avatar({ species: data.species, palette: data.palette, name: data.name, sub: data.sub });
        av.x = data.x; av.z = data.z; av.y = groundHeight(data.x, data.z); av.yaw = av.targetYaw = data.yaw;
        scene.add(av.group);
        av.onStep = (left) => {
          const surf = world.surface(av.x, av.z);
          audio.step(surf, 0.6 * clamp(1 - Math.hypot(av.x - me.x, av.z - me.z) / 11, 0, 1));
          if (surf === 'water') world.ripple(av.x, av.z);
        };
        p = { av, data, sayId: data.say ? data.say.id : 0, emoteId: data.emote ? data.emote.id : 0, fade: 1, tagAt: data.tagAt, invAt: data.invAt, gestAt: data.gesture ? data.gesture.at : 0 };
        peers.set(id, p);
        if (entered) addLog('', friendOf(data.pid) ? `Your friend ${data.name} came ashore.` : `${data.name} came ashore.`, 'sys');
        if (entered && friendOf(data.pid)) { flash(`${data.name} is here`, 'Your friend'); showFriendsCount(); }
      }
      if (data.ev && data.ev.at > (p.evAt || 0)) { const fresh = p.evAt !== undefined; p.evAt = data.ev.at; if (fresh && entered) heardEvent(data); } else if (p.evAt === undefined) p.evAt = data.ev ? data.ev.at : 0;
      p.data = data;
      heardTag(id, p, data);
      heardGesture(id, p, data);
      p.av.setLook(data.species, data.palette);
      p.av.setWear(data.wear);
      p.av.setName(data.name, peerSub(id, data));
      p.av.mode = data.mode;
      p.av.stargaze = data.gaze;
      if (data.say && data.say.id !== p.sayId) {
        p.sayId = data.say.id;
        // Not shown: anything from the muted or from someone you chose not to hear, and words that slipped past.
        if (p.fade > 0.05 && !ignored.has(id) && !(data.muted > timeNow()) && !judge(data.say.text)) {
          p.av.say(data.say.text); speaker = { av: p.av, until: t + 5 }; addLog(data.name, data.say.text, '', id); audio.blip(700);
          p.lines = (p.lines || []).concat(data.say.text).slice(-5);
        }
      }
      if (data.emote && data.emote.id !== p.emoteId) {
        p.emoteId = data.emote.id;
        const name = data.emote.name, dist = Math.hypot(p.av.x - me.x, p.av.z - me.z);
        if (EMOTES.includes(name)) p.av.play(name);
        if (name === 'throw') setTimeout(() => world.tossLog(p.av.x, p.av.y + SPECIES[data.species].height * 0.72, p.av.z, null), 260);
        if (name === 'shake' && data.wet > 0.15) life.shakeOff(p.av.x, p.av.y + SPECIES[data.species].height * 0.6, p.av.z, SPECIES[data.species].height);
        if (name === 'paw' && p.av.x > DOCK.x1 - 1.8) setTimeout(() => life.splash(life.fishingSpot.x, p.av.z * 0.5, false), 420);
        if (name === 'call' && data.gaze) life.meteor(data.emote.id % 100000);
        if (name === 'call') noteCall(id, p.av.x, p.av.z);
        if (name === 'call' && entered) {
          const sp = SPECIES[data.species], reach = sp.call === 'howl' || sp.call === 'bellow' || sp.call === 'bray' ? 45 : 24;
          audio.call(sp.call, clamp(1 - dist / reach, 0, 1) * 0.9);
          if (dist < reach && t - myCallOpen < 7) {
            // You called a moment ago, and this is your answer.
            if (!answeredBy.has(id)) { answeredBy.add(id); addLog('', `${data.name} answers your call.`, 'sys'); ripple(p.av.x, p.av.z, 9, 0xffc978); }
          } else if (dist < reach && !asleepSince) {
            answerTo = { name: data.name, until: t + 7 };
            if (dist > 12) addLog('', `Somewhere on the island, ${data.name} ${sp.calls}. You could answer.`, 'sys');
          }
        }
        if (name === 'throw' && entered && !asleepSince && dist < 8 && Math.hypot(p.av.x - yard.site.x, p.av.z - yard.site.z) < 4.2 && data.held === 3) {
          addLog('', `You kept ${data.name} company at the boat, so their driftwood counted twice.`, 'sys');
        }
        if (name === 'greet' && entered && dist < 2.4 && me.mode === 'stand') {
          addLog('', `${data.name} greets you.`, 'sys');
          if (!me.emote) setTimeout(() => { if (!me.emote) playEmote('wag'); }, 500);
        }
      }
      p.av.setHeld(data.held);
      p.av.setRewards(data.nights);
      p.av.setCoat(data.warmth, data.wet);
      p.av.setButterfly(data.butterfly);
      p.av.asleep = data.asleep;
      adoptFire(data.fire);
    }
    for (const [id, p] of peers) {
      if (!seen.has(id)) {
        scene.remove(p.av.group);
        p.av.dispose();
        peers.delete(id);
        if (entered) addLog('', `${p.data.name} left the island.`, 'sys');
      }
    }
    updateCount();
  },
});
function pushPresence(force) { if (entered) net.send(presenceState(), force); }
function updateCount() {
  const n = peers.size + 1;
  $('count').textContent = n === 1 ? `Just you and ${KWHO}` : `${n} visitors on the island`;
}
updateCount();

// ---------- what the island remembers ----------
const saved = createStore();
saved.watchBoat((total, state, crew) => { if (FAR) total = Math.max(total, BOAT_GOAL); boatTotal = total; if (crew) boatCrew = crew; else if (total && !boatCrew.length) boatCrew = [{ name: fullName(me.name, myCode), n: total }]; yard.setProgress(total); });
const sheet = $('sheet');
let sheetSubmit = null, stopCarvings = null, sheetFree = false;
function closeSheet() {
  sheet.hidden = true;
  if (sheet.dataset.kind === 'journal') delete sheet.dataset.kind;
  sheetSubmit = null;
  if (stopCarvings) { stopCarvings(); stopCarvings = null; }
  canvas.focus();
}
// One panel for everything you read or write: a title, some lines, an optional box to write in.
function openSheet({ title, lines = [], input = null, extra = null, extras = null, note = '' }) {
  if (sheet.dataset.kind === 'journal') delete sheet.dataset.kind;
  if (stopCarvings) { stopCarvings(); stopCarvings = null; }
  $('sheet-title').textContent = title;
  setSheetLines(lines);
  const form = $('sheet-form'), box = $('sheet-input');
  form.hidden = !input;
  if (input) {
    box.value = '';
    box.maxLength = input.max;
    box.placeholder = input.placeholder;
    $('sheet-send').textContent = input.button;
    sheetSubmit = input.submit; sheetFree = !!input.free;
  } else sheetSubmit = null;
  const ex = $('sheet-extra');
  ex.hidden = !extra;
  if (extra) { ex.textContent = extra.label; ex.onclick = extra.run; }
  // Further choices, when a sheet has more than one.
  for (const old of [...document.querySelectorAll('.sheet-buttons .more')]) old.remove();
  for (const x of extras || []) { const b = document.createElement('button'); b.type = 'button'; b.className = 'ghost more'; b.textContent = x.label; b.onclick = x.run; ex.parentNode.insertBefore(b, ex); }
  $('sheet-note').textContent = note;
  sheet.hidden = false;
  moveTarget = null; world.hideMarker();
  if (input) setTimeout(() => box.focus(), 30);
}
function setSheetLines(lines) {
  const body = $('sheet-body');
  body.textContent = '';
  for (const l of lines) {
    const row = document.createElement('div');
    row.className = 'row' + (l.kind ? ' ' + l.kind : '');
    if (l.run) { row.tabIndex = 0; row.setAttribute('role', 'button'); row.onclick = l.run; row.onkeydown = (e) => { if (e.key === 'Enter') l.run(); }; }
    const text = document.createElement('span');
    text.className = 'text';
    text.textContent = l.text;
    row.appendChild(text);
    if (l.meta) { const m = document.createElement('span'); m.className = 'meta'; m.textContent = l.meta; row.appendChild(m); }
    body.appendChild(row);
  }
}
const SAY = {
  empty: 'Write something first.',
  readonly: 'You can read here, but this page has not given you permission to write.',
  failed: 'That did not go through. Try again in a moment.',
};
$('sheet-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!sheetSubmit) return;
  const box = $('sheet-input'), btn = $('sheet-send');
  btn.disabled = true;
  // Marks on the wall and notes in bottles are held to the same words as talk.
  if (judge(box.value) && !sheetFree) { $('sheet-note').textContent = 'Those words are not left on this island. Try it another way.'; btn.disabled = false; return; }
  try { await sheetSubmit(tidyMessage(box.value, Math.max(200, box.maxLength || 0))); } finally { btn.disabled = false; }
});
$('sheet-close').addEventListener('click', closeSheet);

function ago(ms) {
  const m = Math.max(0, timeNow() - ms) / 60000;
  if (m < 2) return 'just now';
  if (m < 60) return `${Math.floor(m)} minutes ago`;
  if (m < 1440) return m < 120 ? 'an hour ago' : `${Math.floor(m / 60)} hours ago`;
  return m < 2880 ? 'yesterday' : `${Math.floor(m / 1440)} days ago`;
}

// Carvings: always watched, so the wall itself shows the latest ones.
let carvings = [], carvingState = 'loading';
saved.watchCarvings((list, state) => {
  carvings = list; carvingState = state;
  world.setCarvings(list);
  if (!sheet.hidden && sheet.dataset.kind === 'carvings') showCarvingLines();
});
function showCarvingLines() {
  const empty = { loading: 'Nosing over the wood…', slow: 'The marks cannot be reached yet. They will appear when they can.', off: 'The marks cannot be loaded in this view.', ok: 'No marks here yet. Yours could be the first.' }[carvingState];
  setSheetLines(carvings.length ? carvings.map((c) => ({ text: c.text, meta: `${c.name} · ${ago(c.at)}` })) : [{ text: empty, kind: 'quiet' }]);
}
function openCarvings() {
  sheet.dataset.kind = 'carvings';
  me.targetYaw = Math.atan2(WALL.x - me.x, WALL.z - me.z);
  playEmote('sniff');
  openSheet({
    title: 'Scratched into the driftwood',
    input: saved.canWrite || !saved.available ? {
      max: 60, placeholder: 'Leave a mark for the next visitor', button: 'Scratch it in',
      submit: async (text) => {
        const r = await saved.carve(text, me.name);
        if (r === 'ok') { $('sheet-input').value = ''; $('sheet-note').textContent = 'Scratched in. It will fade in seven days.'; audio.step('wood', 1); playEmote('paw'); did('mark'); }
        else $('sheet-note').textContent = r === 'limit' ? 'You have left five marks tonight. Leave some wood for the others.' : SAY[r];
      },
    } : null,
    note: saved.available && !saved.canWrite ? SAY.readonly : 'Up to 60 characters. Marks fade after seven days.',
  });
  showCarvingLines();
}

// Bottle notes.
function throwBottleOut() {
  me.targetYaw = Math.atan2(me.x, me.z);     // face out to sea
  playEmote('throw');
  setTimeout(() => world.throwBottle(me.x, mouthY(), me.z, Math.atan2(me.x, me.z), () => audio.step('water', 1.4)), 280);
}
function openWriteNote() {
  sheet.dataset.kind = 'note';
  openSheet({
    title: 'A note in a bottle',
    lines: [{ text: 'Someone else will find it on this beach. They can write back once, and their answer will wash up for you.', kind: 'quiet' }],
    input: {
      max: 140, placeholder: 'Write your note', button: 'Seal it and throw',
      submit: async (text) => {
        const r = await saved.throwBottle(text, me.name);
        if (r === 'ok') { closeSheet(); throwBottleOut(); addLog('', 'Your bottle is out to sea.', 'sys'); did('bottle'); }
        else $('sheet-note').textContent = r === 'limit' ? 'Five bottles is enough for one night.' : SAY[r];
      },
    },
    note: 'Up to 140 characters.',
  });
}
function clearBottle() { bottle = null; bottleSpot = null; world.setWashedBottle(null); }
function openBottle() {
  if (!bottle) return;
  const b = bottle;
  me.targetYaw = Math.atan2(bottleSpot.x - me.x, bottleSpot.z - me.z);
  playEmote('paw');
  sheet.dataset.kind = 'bottle';
  if (b.kind === 'reply') {
    openSheet({
      title: 'Your bottle came back',
      lines: [{ text: b.text, meta: 'You wrote' }, { text: b.reply, meta: `${b.replyName} wrote back` }],
      extra: { label: 'Keep the note', run: () => { saved.finishBottle(b.id); clearBottle(); closeSheet(); setTimeout(lookForBottle, 60000); } },
    });
    return;
  }
  openSheet({
    title: `A note from ${b.name}`,
    lines: [{ text: b.text, meta: ago(b.at) }],
    input: {
      max: 140, placeholder: 'Write back (one reply)', button: 'Send it back',
      submit: async (text) => {
        const r = await saved.replyBottle(b.id, text, me.name);
        if (r === 'ok') { clearBottle(); closeSheet(); throwBottleOut(); addLog('', `Your reply to ${b.name} is on its way.`, 'sys'); setTimeout(lookForBottle, 120000); }
        else $('sheet-note').textContent = SAY[r];
      },
    },
    extra: { label: 'Put it back for someone else', run: () => { saved.passBottle(b.id); clearBottle(); closeSheet(); throwBottleOut(); setTimeout(lookForBottle, 120000); } },
  });
}
async function lookForBottle() {
  if (bottle) return;
  const found = await saved.findBottle();
  if (!found || bottle) return;
  bottle = found;
  const h = [...found.id].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 5);
  bottleSpot = BOTTLE_SPOTS[h % BOTTLE_SPOTS.length];
  world.setWashedBottle(bottleSpot, found.kind);
  addLog('', found.kind === 'reply' ? 'A bottle has come back for you. It is on the beach.' : 'Something is glinting on the beach.', 'sys');
  if (found.kind === 'reply' && entered && keeper.bubbleFade > 0.3) setTimeout(() => keeperSays('A bottle came back for you. Try the beach.'), 1500);
}

// Nights visited, and what they earn.
const REWARDS = [[3, 'a scarf'], [7, 'a lantern'], [14, 'a firefly that follows you']];
const lampLight = new THREE.PointLight(0xffc27a, 0, 9, 1.8);
lampLight.position.set(-0.3, 0.6, 0.3);
me.group.add(lampLight);
function setNights(n) {
  nights = n;
  me.setRewards(n);
  lampLight.intensity = n >= 7 ? 4 : 0;
  const next = REWARDS.find(([need]) => need > n);
  $('nights').textContent = `Nights on the island: ${n}. ` + (next ? `${next[1].charAt(0).toUpperCase() + next[1].slice(1)} comes on night ${next[0]}.` : 'You have every keepsake so far.');
  pushPresence(true);
}
function welcomeBack() {
  saved.countNight().then((n) => {
    setNights(n);
    if (n > 1) addLog('', `This is night ${n} for you on the island.`, 'sys');
    const earned = REWARDS.find(([need]) => need === n);
    if (earned) { addLog('', `For coming back, you now have ${earned[1]}.`, 'sys'); setTimeout(() => playEmote('hop'), 600); }
  });
  setTimeout(lookForBottle, 4000);
  setInterval(lookForBottle, 180000);
}

// ---------- input ----------
const typing = () => document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA');
window.addEventListener('keydown', (e) => {
  if (!entered) return;
  if (e.key === 'Escape' && !$('sheet').hidden) { closeSheet(); return; }
  if (typing()) { if (e.key === 'Escape') document.activeElement.blur(); return; }
  const k = e.key.toLowerCase();
  if (k === 'enter') { $('say').focus(); e.preventDefault(); return; }
  if (k === 'e' && actions[0]) { actions[0].run(); return; }
  if (!e.ctrlKey && !e.metaKey && !e.altKey && ['j', 'q', 'b', 'm'].includes(k)) { if ($('sheet').hidden) (k === 'j' ? openJournal(journalTab === 'finds' ? 'finds' : 'stamps') : k === 'q' ? openJournal('quests') : k === 'b' ? openJournal('satchel') : openMap()); else closeSheet(); return; }
  if (k === 'r' && actions[1]) { actions[1].run(); return; }
  if (k === 'f' && actions[2]) { actions[2].run(); return; }
  if (k === '1') { callOut(); return; }
  if (k === '2') { playEmote('hop'); return; }
  if (k === '3') { playEmote('shake'); return; }
  if (k === '4') { playEmote('wag'); return; }
  if (k === '5') { toggleRest('sit'); return; }
  if (k === '6') { toggleRest('lie'); return; }
  if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift'].includes(k)) { keys.add(k); e.preventDefault(); }
});
window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
window.addEventListener('blur', () => keys.clear());

const pointers = new Map();
let drag = null, pinch = 0;
canvas.addEventListener('pointerdown', (e) => {
  if (!entered) return;
  if (typing()) document.activeElement.blur();
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 1) drag = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now(), moved: false };
  if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch = Math.hypot(a.x - b.x, a.y - b.y); if (drag) drag.moved = true; }
});
canvas.addEventListener('pointermove', (e) => {
  const p = pointers.get(e.pointerId);
  if (!p) return;
  p.x = e.clientX; p.y = e.clientY;
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    if (pinch > 0) camDist = clamp(camDist * (pinch / d), 3.2, 16);
    pinch = d;
    return;
  }
  if (!drag) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 7) drag.moved = true;
  if (drag.moved) {
    camYaw -= dx * 0.0055;
    if (stargazing) skyEl = clamp(skyEl + dy * 0.004, 0.35, 1.45);
    else camPitch = clamp(camPitch + dy * 0.0045, 0.06, 1.25);
  }
  drag.x = e.clientX; drag.y = e.clientY;
});
const ray = new THREE.Raycaster();
function tapToMove(clientX, clientY) {
  const r = canvas.getBoundingClientRect();
  ray.setFromCamera(new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1), camera);
  const o = ray.ray.origin, d = ray.ray.direction;
  let prev = 0;
  for (let t = 0.5; t < 160; t += 0.3) {
    const x = o.x + d.x * t, y = o.y + d.y * t, z = o.z + d.z * t;
    if (y <= Math.max(groundHeight(x, z), 0)) {
      let a = prev, b = t;
      for (let i = 0; i < 6; i++) {
        const m = (a + b) / 2;
        if (o.y + d.y * m <= Math.max(groundHeight(o.x + d.x * m, o.z + d.z * m), 0)) b = m; else a = m;
      }
      const hx = o.x + d.x * b, hz = o.z + d.z * b;
      if (me.mode !== 'stand') standUp();
      const route = findPath(me.x, me.z, hx, hz);
      if (!route || !route.length) return;
      moveTarget = route;
      moveTarget.short = Math.hypot(hx - me.x, hz - me.z) < 6;
      stuckFor = 0;
      const end = route[route.length - 1];
      world.showMarker(end.x, end.z);
      return;
    }
    prev = t;
  }
}
function endPointer(e) {
  const had = pointers.delete(e.pointerId);
  if (pointers.size < 2) pinch = 0;
  if (had && drag && pointers.size === 0) {
    if (!drag.moved && performance.now() - drag.t < 450) tapToMove(e.clientX, e.clientY);
    drag = null;
  }
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', (e) => { pointers.delete(e.pointerId); drag = null; pinch = 0; });
canvas.addEventListener('wheel', (e) => { if (entered) { camDist = clamp(camDist * (1 + Math.sign(e.deltaY) * 0.1), 3.2, 16); e.preventDefault(); } }, { passive: false });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

// ---------- buttons ----------
// Sit or lie where you are, or at a spot by the fire if one is close. The same button gets you up again.
function toggleRest(kind) {
  if (kind === 'sit' && hoofed()) kind = 'lie';
  if (me.mode === kind) standUp();
  else setMode(kind, me.mode !== 'stand' ? mySeat : nearestFreeSeat(2.0));
  pushPresence(true);
}
$('emote-call').addEventListener('click', callOut);
$('emote-hop').addEventListener('click', () => playEmote('hop'));
$('emote-shake').addEventListener('click', () => playEmote('shake'));
$('emote-wag').addEventListener('click', () => playEmote('wag'));
$('emote-sit').addEventListener('click', () => toggleRest('sit'));
$('emote-lie').addEventListener('click', () => toggleRest('lie'));
$('action').addEventListener('click', () => { if (actions[0]) actions[0].run(); });
$('action2').addEventListener('click', () => { if (actions[1]) actions[1].run(); });
$('action3').addEventListener('click', () => { if (actions[2]) actions[2].run(); });
const toggle = (btn, on) => { btn.setAttribute('aria-pressed', on ? 'true' : 'false'); };
$('btn-sound').addEventListener('click', () => { audio.start(); audio.setSound(!audio.soundOn); toggle($('btn-sound'), audio.soundOn); $('btn-sound').textContent = audio.soundOn ? 'Sound on' : 'Sound off'; });
$('btn-music').addEventListener('click', () => { audio.start(); audio.setMusic(!audio.musicOn); toggle($('btn-music'), audio.musicOn); $('btn-music').textContent = audio.musicOn ? 'Music on' : 'Music off'; });
$('btn-help').addEventListener('click', () => { const h = $('help'); h.hidden = !h.hidden; toggle($('btn-help'), !h.hidden); });
$('help-close').addEventListener('click', () => { $('help').hidden = true; toggle($('btn-help'), false); });
$('origin').checked = showOrigin;
$('origin').addEventListener('change', (e) => { showOrigin = e.target.checked; store('ember.origin', showOrigin); me.setName(me.name, mySub()); pushPresence(true); });

function showIdentity() {
  $('who-name').textContent = identity.name;
  $('who-code').textContent = '#' + myCode;
  me.setLook(identity.species, identity.palette);
  me.setName(identity.name, mySub());
  const sp = SPECIES[identity.species];
  $('emote-call').textContent = sp.callLabel;
  $('emote-sit').hidden = !!sp.hoof;
  $('help-keys').textContent = sp.hoof ? `${sp.callLabel}, hop, shake, wag. 6 to lie down.` : `${sp.callLabel}, hop, shake, wag, sit, lie down.`;
  if ($('pick-animal').childElementCount) drawPicker();
}
showIdentity();
if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) { $('hint').textContent = 'Tap the ground to walk. Drag to look around.'; $('say').placeholder = 'Tap here to speak'; }
// Choosing who to arrive as: any of the animals, any of its coats. The name stays a matter of luck.
function drawPicker() {
  const animals = $('pick-animal'), coats = $('pick-coat');
  animals.textContent = ''; coats.textContent = '';
  SPECIES.forEach((sp, i) => {
    if (sp.npc) return;
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = sp.label;
    b.setAttribute('aria-pressed', i === identity.species ? 'true' : 'false');
    b.addEventListener('click', () => { if (i !== identity.species) pickLook(i, 0); });
    animals.appendChild(b);
  });
  const sp = SPECIES[identity.species];
  sp.tints.forEach((tint, k) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.style.background = tint || sp.toy[1];
    b.setAttribute('aria-label', `${sp.label} coat ${k + 1}`);
    b.setAttribute('aria-pressed', k === identity.palette ? 'true' : 'false');
    b.addEventListener('click', () => { if (k !== identity.palette) pickLook(identity.species, k); });
    coats.appendChild(b);
  });
}
function pickLook(species, palette) {
  const word = identity.name.split(' ')[0];
  identity = identity.own ? { ...identity, species, palette } : { species, palette, name: `${word} ${SPECIES[species].label}` };
  showIdentity();
  me.play('hop');
}
drawPicker();
$('reroll').addEventListener('click', () => {
  let word = identity.name.split(' ')[0];
  for (let k = 0; k < 8 && word === identity.name.split(' ')[0]; k++) word = NAME_WORDS[Math.floor(Math.random() * NAME_WORDS.length)];
  identity = { species: identity.species, palette: identity.palette, name: `${word} ${SPECIES[identity.species].label}` };
  showIdentity();
  $('name-form').hidden = true;
});
// A name of your own: letters, numbers and spaces, held to the same words as talk.
const TAKEN = /^(the )?(keeper|clover|island keeper|admin|moderator|mod|guest|a visitor)$/i;
function setOwnName(raw) {
  const name = String(raw || '').normalize('NFKC').replace(/[^\p{L}\p{N} '\-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 20);
  if (name.length < 2) return 'A name needs at least two letters.';
  if (judge(name)) return 'Not that one. Try another name.';
  if (TAKEN.test(name)) return 'That name belongs to someone on the island already.';
  identity = { ...identity, name, own: true };
  showIdentity();
  if (entered) { store('ember.identity', identity); pushPresence(true); }
  return '';
}
$('rename').addEventListener('click', () => { const f = $('name-form'); f.hidden = !f.hidden; $('name-note').textContent = ''; if (!f.hidden) { $('name-input').value = identity.own ? identity.name : ''; $('name-input').focus(); } });
$('name-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const problem = setOwnName($('name-input').value);
  $('name-note').textContent = problem;
  if (!problem) { $('name-form').hidden = true; me.play('wag'); }
});
// Stepping ashore asks the island for a place. If it is full you wait in line, on the title screen,
// and step ashore by yourself when your turn comes.
let asking = false;
const nth = (n) => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th');
$('enter').addEventListener('click', () => {
  if (entered || asking) return;
  asking = true;
  audio.start();
  $('enter').hidden = true; $('picker').hidden = true;
  $('queue').hidden = false;
  $('queue-text').textContent = 'Finding you a place by the fire…';
  // What kind of visit this is, for the island's daily totals: first today, first ever, and how far along the guide.
  const utcDay = new Date().toISOString().slice(0, 10);
  const info = { first: store('ember.day') !== utcDay ? 1 : 0, fresh: store('ember.been') ? 0 : 1, step: starterAt, key: myKey, isle: ISLE };
  // The guest account, if there is one, is how the island knows you from visit to visit. A moment is allowed for it.
  net.guest().then((g) => g, () => null).then((g) => { if (g && g.token) info.tok = g.token; startJoin(); });
  const startJoin = () => net.join((q) => {
    if (q.state === 'in') { store('ember.day', utcDay); store('ember.been', true); comeAshore(q); return; }
    if (q.state === 'out') { leaveIsland('tide'); return; }
    if (entered) return;
    $('queue-text').textContent = q.pos === 1 ? 'The island is full. You are next in line.' : `The island is full. You are ${nth(q.pos)} in line.`;
    $('queue-note').textContent = 'Leave this open. You will step ashore as soon as someone leaves.';
  }, info);
});
// Back to the title screen. Your place is given up, and you can choose again and step ashore when you like.
function leaveIsland(why) {
  const was = entered;
  entered = false; asking = false;
  if (was && why === 'left') net.note('left');
  myIt = 0; myTag = null; itWho = null; game = 0; myInvite = null; invitedBy = null; party = 0; voyage = 0; voyageCast = 0; voyageSeated = false; hop = null; myGesture = null; gestureBack = null; friendInvite = null; ignored.clear();
  if (was || why !== 'tide') net.leave();
  wake(false);
  setMode('stand'); setHeld(0);
  hasButterfly = false; me.setButterfly(false);
  closeSheet(); $('help').hidden = true;
  me.x = SPAWN.x; me.z = SPAWN.z; me.yaw = me.targetYaw = 0.35; vel.x = vel.z = 0; moveTarget = null; world.hideMarker();
  document.body.classList.remove('playing');
  $('queue').hidden = true; $('enter').hidden = false; $('picker').hidden = false;
  $('enter').textContent = 'Step ashore again';
  $('hint').textContent = why === 'tide'
    ? 'You fell asleep while others were waiting for a place, so the tide carried you out. Step ashore again whenever you like.'
    : 'You have left the island. Choose again if you like, and step ashore whenever you are ready.';
  audio.setRain(0);
}
$('btn-leave').addEventListener('click', () => leaveIsland('left'));

// Sleep: an animal nobody has touched for a while lies down and dozes, and its name tag says so.
function wake(stand = true) {
  lastInputAt = timeNow();
  if (!asleepSince) return;
  asleepSince = 0; me.asleep = false;
  if (laidByNap && stand && me.mode === 'lie') standUp();
  laidByNap = false;
  me.setName(me.name, mySub());
  pushPresence(true);
}
for (const type of ['keydown', 'pointerdown', 'wheel', 'touchstart']) window.addEventListener(type, () => wake(), { capture: true, passive: true });
setInterval(() => {
  if (!entered) return;
  if (!asleepSince && timeNow() - lastInputAt > idleAfter) {
    asleepSince = timeNow(); me.asleep = true;
    if (me.mode === 'stand') { laidByNap = true; setMode('lie', nearestFreeSeat(2.0)); }
    else if (me.mode === 'sit') { laidByNap = false; setMode('lie', mySeat); }
    addLog('', 'You have dozed off. Touch anything to wake up.', 'sys');
  }
  if (asleepSince) { me.setName(me.name, mySub()); pushPresence(true); }
}, 4000);

function comeAshore(q = {}) {
  if (entered) return;
  entered = true;
  lastInputAt = timeNow();
  $('hint').textContent = '';
  $('queue').hidden = true;
  store('ember.identity', identity);
  document.body.classList.add('playing');
  me.targetYaw = Math.atan2(FIRE.x - SPAWN.x, FIRE.z - SPAWN.z);      // turn to face the fire
  addLog('', FAR ? 'You step onto a shore nobody has mapped. A camp fire is burning up the path.' : (quests.cold ? 'You come ashore again. The fire is still burning.' : 'You wash ashore on a small island. Someone has kept a fire burning here for a long time.'), 'sys');
  // When to find company: said to everyone on arrival, since the beach is often empty.
  setTimeout(() => { if (entered) addLog('', campLine(), 'sys'); }, 3500);
  // Signs of the others: how many have been here today, and whose tracks are still on the ground.
  // The island knows which country the connection comes from, which beats guessing from the time zone.
  if (/^[A-Z]{2}$/.test(String(q.cc || ''))) { try { COUNTRY = new Intl.DisplayNames(['en'], { type: 'region' }).of(q.cc) || COUNTRY; } catch (e) { /* keep the guess */ } me.setName(me.name, mySub()); }
  // The island says who you are to everyone else: your number, your friends, and any notes left for you.
  if (/^\d{4}$/.test(String(q.code || ''))) { myCode = q.code; store('ember.code', myCode); $('who-code').textContent = '#' + myCode; me.setName(me.name, mySub()); }
  if (typeof q.pid === 'string') myPid = q.pid;
  keptBy = q.who === 'guest' ? 'guest' : 'browser';
  if (q.mu > timeNow()) { mutedUntil = Math.max(mutedUntil, q.mu); me.setName(me.name, mySub()); }
  const laid = traces.setLeft(q.tracks, (sp) => !!(SPECIES[sp] && SPECIES[sp].hoof), (sp) => (SPECIES[sp] ? SPECIES[sp].height : 1));
  if (Number.isFinite(q.today)) {
    const others = Math.max(0, q.today - 1);
    const line = others === 0 ? 'Nobody else has come ashore yet today.' : others === 1 ? 'One other animal has washed up here today.' : `${others} other animals have washed up here today.`;
    setTimeout(() => addLog('', !laid ? line : others ? `${line} Some of their tracks are still on the ground.` : `${line} Tracks from earlier visitors are still on the ground.`, 'sys'), 2500);
  }
  pushPresence(true);
  canvas.focus();
  // If nobody here already knows how the fire is doing, your view of it becomes the shared one.
  setTimeout(() => { if (!fireRec.stamp) { fireRec.stamp = fireRec.at; pushPresence(true); } }, 3000);
  if (!comeAshore.before) { comeAshore.before = true; welcomeBack(); } else setTimeout(lookForBottle, 4000);
  showList();
  if (quests.cold) setTimeout(() => { const q = questNow(); if (!FAR && starterAt >= STARTER.length && q) addLog('', `${q.from} asks: ${lower(q.ask)}. It is at the top of the screen.`, 'sys'); }, 9000);
}
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { me.tag.userData.draw(me.name, me.sub); keeper.tag.userData.draw(keeper.name, keeper.sub); });
setInterval(() => { me.setName(me.name, mySub()); pushPresence(false); }, 20000);

// ---------- frame ----------
function updateActions() {
  // Two fixed slots: E does the main thing here, R is the second choice or the way out of what you are doing.
  let main = null, alt = null, third = null;
  const dFire = fireDist();
  if (held === 1) {
    if (dFire < 5.2) main = { label: 'Drop the stick on the fire', run: tossLog };
    alt = { label: 'Put the stick down', run: dropLog };
  } else if (held === 3) {
    if (Math.hypot(yard.site.x - me.x, yard.site.z - me.z) < 3.4) main = { label: 'Add the driftwood to the boat', run: addToBoat };
    alt = { label: 'Leave the driftwood here', run: () => { setHeld(0); pushPresence(true); } };
  } else if (held === 2) {
    main = !FAR && Math.hypot(keeper.x - me.x, keeper.z - me.z) < 3.2 ? { label: 'Leave the fish for the Keeper', run: giveFish } : { label: 'Eat the fish', run: eatFish };
    alt = main.run === giveFish ? { label: 'Eat the fish', run: eatFish } : null;
  } else if (me.mode !== 'stand') {
    if (me.mode === 'sit') main = { label: 'Lie down', run: () => { setMode('lie', mySeat); pushPresence(true); } };
    alt = { label: 'Get up', run: () => { standUp(); pushPresence(true); } };
  } else {
    const opts = [];
    if (Math.hypot(me.x - WOODPILE.x, me.z - WOODPILE.z) < 1.7) opts.push({ label: 'Pick up a stick', run: pickUpLog });
    const seat = nearestFreeSeat(1.9);
    if (seat >= 0) opts.push({ label: hoofed() ? 'Lie down by the fire' : 'Sit by the fire', run: () => { setMode('sit', seat); pushPresence(true); }, side: true });
    // Someone close enough to greet: the nearest visitor, or the Keeper.
    let who = null, wd = 2.0;
    for (const p of peers.values()) { const d = Math.hypot(p.av.x - me.x, p.av.z - me.z); if (d < wd && p.fade > 0.5) { wd = d; who = { av: p.av, name: p.data.name }; } }
    if (!who && Math.hypot(keeper.x - me.x, keeper.z - me.z) < (FAR ? 3.2 : 2.6)) who = { av: keeper, name: KWHO };
    if (!who && Math.hypot(critters.cow.x - me.x, critters.cow.z - me.z) < 2.8) who = { av: critters.cow, name: 'Clover' };
    if (who) opts.push({ label: `Greet ${who.name}`, run: () => greet(who.av, who.name), side: true });
    const drift = yard.near(me.x, me.z);
    if (drift >= 0) opts.push({ label: 'Pick up the driftwood', run: () => pickUpDriftwood(drift) });
    // Something small on the ground: it goes straight into the journal, not the mouth.
    if (lying.near(me.x, me.z) >= 0) opts.push({ label: 'See what that is', run: pickUpFind });
    if (!FAR && Math.hypot(yard.site.x - me.x, yard.site.z - me.z) < 3.4) opts.push({ label: 'Look over the boat', run: lookAtBoat });
    if (FAR) { const pi = world.logPages.findIndex((pg) => pg.there && Math.hypot(pg.x - me.x, pg.z - me.z) < 2.3 && (!pg.cave || caveNow > 0.5)); if (pi >= 0) opts.unshift({ label: 'Pick up the page', run: () => pickPage(pi) }); }
    { const ch = world.chests.find((c) => !opened.has(c.id) && Math.hypot(c.x - me.x, c.z - me.z) < 2.1 && (!c.cave || caveNow > 0.5)); if (ch) opts.unshift({ label: 'Open the chest', run: () => openChest(ch) }); }
    if (FAR && perch) opts.unshift({ label: 'Climb down', run: climbDown });
    if (FAR && !perch) {
      const dd = Math.hypot(world.lighthouse.door.x - me.x, world.lighthouse.door.z - me.z), L = LIGHT[lightStage()];
      if (dd < 4.2 && L && bag[L.kind] > 0) opts.unshift({ label: `Set down your ${L.many} for the tower`, run: giveToTower });
      if (dd < 3.2) opts.push({ label: 'Climb the tower', run: climbTower, side: opts.length > 0 });
    }
    if (FAR && Math.hypot(MAP_BOARD.x - me.x, MAP_BOARD.z - me.z) < 3.4) opts.unshift({ label: 'Look at the map', run: lookAtMap });
    if (FAR && Math.hypot(world.hermit.x - me.x, world.hermit.z - me.z) < 3.3) { opts.unshift({ label: lamp ? 'Give back the lantern' : 'Ask for the lantern', run: askLantern }, { label: 'Greet the Hermit', run: greetHermit, side: true }); }
    if (FAR && Math.hypot(world.heron.x - me.x, world.heron.z - me.z) < 3.6) opts.push({ label: 'Greet the Lamplighter', run: greetHeron, side: opts.length > 0 });
    if (FAR && Math.hypot(world.cottage.door.x - me.x, world.cottage.door.z - me.z) < 2.6) opts.push({ label: 'Look at the carving over the door', run: lookAtCarving });
    if (FAR && Math.hypot(world.flats.wreck.stern.x - me.x, world.flats.wreck.stern.z - me.z) < 3.4) opts.push({ label: 'Look at the name on her stern', run: lookAtStern });
    if (FAR && Math.hypot(world.flats.bell.x - me.x, world.flats.bell.z - me.z) < 2.4) opts.push({ label: 'Ring the bell', run: ringBell });
    if (FAR && world.flats.pools.some((q) => Math.hypot(q.x - me.x, q.z - me.z) < 2.4)) opts.push({ label: 'Look into the rock pool', run: lookInPool });
    if (FAR && Math.hypot(WAYCAIRN.x - me.x, WAYCAIRN.z - me.z) < 2.8) opts.push({ label: 'Lay a stone on the cairn', run: layStone });
    if (FAR && Math.hypot(SEAT.x + 1 - me.x, SEAT.z - me.z) < 2.6) opts.push({ label: 'Sit in the stone seat', run: sitInSeat });
    if (FAR && caveNow < 0.5) { const si = world.stones.findIndex((st) => Math.hypot(st.x - me.x, st.z - me.z) < 2.3); if (si >= 0) opts.push({ label: 'Touch the standing stone', run: () => touchStone(si) }); }
    if (FAR && caveNow > 0.5 && Math.hypot(world.echo.mark.x - me.x, world.echo.mark.z - me.z) < 3.4) opts.push({ label: 'Look at the mark on the rock', run: lookAtMark });
    if (FAR && caveNow > 0.5) { const pn = world.paintings.find((q) => Math.hypot(q.x - me.x, q.z - me.z) < 3.6); if (pn && litNow()) opts.push({ label: 'Look at the painted stone', run: () => lookAtStone(pn) }); else if (pn && !stoneHint) { stoneHint = true; addLog('', 'There is something on this stone. It is too dark to make out.', 'sys'); } }
    if (!FAR && Math.hypot(POST.x - me.x, POST.z - me.z) < 2.3) opts.push({ label: 'Read the carved post', run: readPost });
    if (!FAR && !journal.lens && Math.hypot(LENS.x - me.x, LENS.z - me.z) < 2.1) opts.push({ label: 'See what is in the sand', run: findLens });
    if (!FAR && Math.hypot(CHEST.x - me.x, CHEST.z - me.z) < 1.9) opts.push({ label: 'Try the chest', run: tryChest });
    const tr = traces.near(me.x, me.z);
    if (tr) opts.push({ label: 'Sniff at the tracks', run: () => sniffTracks(tr), low: true });
    const mn = life.meadowNear(me.x, me.z);
    if (mn.flying && mn.dist < 3.6 && !hasButterfly) opts.push({ label: 'Pounce at the butterflies', run: () => { me.targetYaw = Math.atan2(mn.meadow.x - me.x, mn.meadow.z - me.z); playEmote('hop'); setTimeout(() => life.startle(mn.meadow), 350); } });
    if (Math.hypot(life.stone.x - me.x, life.stone.z - me.z) < 2.2) opts.push({ label: skyNow.dark < 0.4 && rainNow < 0.2 ? 'Lie on the warm stone' : 'Lie on the stone', run: () => { me.x = life.stone.x; me.z = life.stone.z; setMode('lie'); pushPresence(true); } });
    if (atDockEnd()) opts.push({ label: hoofed() ? 'Stamp at the fish' : 'Paw at the fish', run: pawAtWater });
    if (Math.hypot(me.x - WALL.x, me.z - WALL.z) < 2.7) opts.push({ label: 'Nose over the marks on the driftwood', run: openCarvings });
    if (bottleSpot && Math.hypot(me.x - bottleSpot.x, me.z - bottleSpot.z) < 2.0) opts.push({ label: bottle.kind === 'reply' ? 'Dig up the bottle that came back' : 'Dig up the bottle', run: openBottle });
    if (Math.hypot(me.x - CRATE.x, me.z - CRATE.z) < 2.0) opts.push({ label: 'Send a bottle out to sea', run: openWriteNote });
    if (Math.hypot(me.x - HILL.x, me.z - HILL.z) < 2.8) opts.push({ label: skyNow.dark > 0.6 ? 'Lie down and watch the stars' : rainNow > 0.3 ? 'Lie down and watch the rain' : 'Lie back and watch the sky', run: () => { me.x = HILL.x - 0.2; me.z = HILL.z + 0.1; me.targetYaw = 0.4; setMode('lie', -1, true); camYaw = 0.5; pushPresence(true); } });
    if (FAR && !perch) {      // gathering for the tower comes after whatever else is in reach, so that it never hides it
      const sc = world.sources.find((q) => Math.hypot(q.x - me.x, q.z - me.z) < (q.tide ? 6 : 2.6) && (!q.cave || caveNow > 0.5) && (!q.tide || tideAt(timeNow()).y < TIDE.flat - 0.14));
      if (sc) opts.push({ label: LIGHT.find((l) => l.kind === sc.kind).take, run: () => takeFrom(sc) });
    }
    {
      const pi = world.pickups.findIndex((pk) => pk.there && Math.hypot(pk.x - me.x, pk.z - me.z) < 1.9 && (!pk.cave || caveNow > 0.5));
      if (pi >= 0) opts.push({ label: `Pick up the ${ITEMS[world.pickups[pi].kind].name.toLowerCase()}`, run: () => takePickup(pi), low: true });
      else { const ch = world.chests.find((c) => opened.has(c.id) && Math.hypot(c.x - me.x, c.z - me.z) < 2.1 && (!c.cave || caveNow > 0.5)); if (ch) opts.push({ label: 'Look in the chest', run: () => openChest(ch), low: true }); }
    }
    // What is offered, and in what order: first whatever this particular spot is for (the dock, the boat, a board to
    // read, a chest), then whoever is near enough to greet or wherever there is to sit, and last the small things
    // that are everywhere (tracks, pebbles). Up to three are shown, so that company never hides the place and the
    // place never hides the company.
    const things = opts.filter((o) => !o.side && !o.low), social = opts.filter((o) => o.side), small = opts.filter((o) => o.low);
    const picks = [...things.slice(0, social.length ? 2 : 3), ...social.slice(0, 1)];
    for (const o of [...things, ...social, ...small]) if (picks.length < 3 && !picks.includes(o)) picks.push(o);
    [main = null, alt = null, third = null] = picks;
  }
  if (gestureBack && me.mode === 'stand' && !held) { if (main) { third = alt || third; alt = main; } const gb = gestureBack; main = { label: `${GESTURES[gb.kind].back} (${gb.name})`, run: () => gestureTo(gb.id, gb.kind) }; }
  if (friendInvite && nowSec() < friendInvite.until) { if (!alt && main) alt = main; const fi = friendInvite; main = { label: `Be friends with ${fi.name}`, run: () => askFriend(fi.pid, fi.name) }; } else friendInvite = null;
  // The boat: climb in when she is built and at home, cast off early, step back out before she goes.
  if (voyage) {
    const boarding = voyageNow && voyageNow.phase === 'board';
    main = boarding && voyageNow.left > 4 ? { label: 'Cast off now', run: castOff } : null;
    alt = boarding ? { label: 'Step back ashore', run: () => leaveBoat() } : null;
  } else if (boatBuilt() && !FAR && !game && !party && !held && me.mode === 'stand' && boatDist() < 4.2 && (!seenVoyage || (voyageNow && voyageNow.phase === 'board' && voyageCrew.length < yard.crewMax))) {
    if (!alt) alt = main; main = { label: seenVoyage ? 'Climb into the boat' : 'Take the boat out', run: boardBoat };
  }
  // A dance at the fire: start one when resting there in company, join one that is going, step out of yours.
  if (voyage) { /* nothing else from a seat in the boat */ }
  else if (party) { main = null; alt = { label: 'Step out of the dance', run: () => leaveParty() }; }
  else if (seenParty && !game && fireDist() < 12) { if (main) { third = alt || third; alt = main; } main = { label: 'Join the dance', run: joinParty }; }
  else if (!seenParty && !game && !seenGame && me.mode !== 'stand' && fireDist() < 5.5 && restingAtFire().length >= 1) { if (main) { third = alt || third; alt = main; } main = { label: 'Start a dance', run: startParty }; }
  // Tag: whoever is it tags the nearest animal on its feet. With no game on, anyone close can be asked to play.
  if (me.mode === 'stand' && !party && !voyage) {
    const near = taggable(TAG_REACH, false), prey = taggable(TAG_REACH, true);
    if (itWho === 'me') { if (prey && nowSec() - myItAt > TAG_GRACE) { if (main) { third = alt || third; alt = main; } main = { label: `Tag ${prey.p.data.name}`, run: () => tagPeer(prey.id) }; } }
    else if (invitedBy) { if (main) { third = alt || third; alt = main; } main = { label: `Play tag with ${invitedBy.name}`, run: acceptTag }; }
    else if (!game && !held && !myInvite && near) {
      const play = seenGame ? (near.p.data.game === seenGame ? { label: 'Join the game of tag', run: joinTag } : null) : { label: `Ask ${near.p.data.name} to play tag`, run: () => inviteTag(near.id) };
      if (play) { if (!main) main = play; else if (!alt) alt = play; else if (!third) third = play; }
    }
    else if (!FAR && !game && !seenGame && !held && !myInvite && !near && Math.hypot(keeper.x - me.x, keeper.z - me.z) < 2.8) {
      const play = { label: 'Ask the Keeper to play tag', run: askKeeper };
      if (!main) main = play; else if (!alt) alt = play; else if (!third) third = play;
    }
  }
  // A call you just heard comes first: answering it is the main thing to do for a few seconds.
  if (answerTo && t < answerTo.until && !held) { if (main) { third = alt || third; alt = main; } main = { label: `Answer ${answerTo.name}`, run: callOut }; }
  const next = [main, alt, third];
  ['action', 'action2', 'action3'].forEach((id, i) => {
    const btn = $(id), a = next[i], old = actions[i];
    if ((a && a.label) !== (old && old.label)) {
      if (a) { btn.querySelector('.label').textContent = a.label; btn.hidden = false; } else { btn.hidden = true; }
    }
  });
  actions = next;
}

// ---------- finds and the journal ----------
const lying = createFinds(scene);
function found(id, quiet = false) {
  const f = FIND[id];
  if (!f || !entered) return;
  setTimeout(() => questEvent('found:' + id), 1500);
  const first = !journal[id];
  if (ITEM_OF_FIND[id]) give(ITEM_OF_FIND[id], 1, true);
  if (first && !pics.has('find:' + id)) snapWanted = 'find:' + id;
  journal[id] = { n: (journal[id] ? journal[id].n : 0) + 1, at: journal[id] ? journal[id].at : Date.now() };
  store('ember.finds', journal);
  if (first) {
    flash('New in your journal', f.name); audio.pop(820);
    addLog('', `${f.name}: new in your journal. That is ${journalCount()} of ${myFinds().length}.`, 'sys');
    net.note('find'); pushPresence(true);
  } else if (!quiet) addLog('', `${f.name}. You have found ${journal[id].n} of these.`, 'sys');
  showJournalCount();
}
function showJournalCount() { const n = Object.keys(cards).filter((k) => MY_SIGHTS.some((sg) => sg.id === k)).length; $('journal-count').textContent = `${n === 1 ? '1 stamp' : `${n} stamps`}, ${journalCount()} finds`; }
// ---------- sights and stamps ----------
// Reaching a sight takes a picture of it as it is just then, from a good spot, and keeps it as a postcard.
const MY_SIGHTS = SIGHTS[ISLE] || [];
const cards = (() => { const c = store('ember.cards'); return c && typeof c === 'object' ? c : {}; })();
// Pictures (postcards, and the picture taken when something is first found) live in the browser's database, which
// has room for them; the small store keeps only the dates and names.
const pics = new Map(); let picDb = null;
const picsReady = new Promise((res) => {
  try {
    const rq = indexedDB.open('ember-pictures', 1);
    rq.onupgradeneeded = () => rq.result.createObjectStore('pics');
    rq.onsuccess = () => { picDb = rq.result; const cur = picDb.transaction('pics').objectStore('pics').openCursor(); cur.onsuccess = (e) => { const c = e.target.result; if (c) { pics.set(c.key, c.value); c.continue(); } else res(); }; cur.onerror = () => res(); };
    rq.onerror = () => res();
  } catch (e) { res(); }
});
function savePic(key, url) { if (!url) return; pics.set(key, url); if (picDb) { try { picDb.transaction('pics', 'readwrite').objectStore('pics').put(url, key); } catch (e) { /* the picture still shows until the page is closed */ } } }
const saveCards = () => { const bare = {}; for (const k in cards) bare[k] = { ...cards[k], img: picDb ? '' : cards[k].img }; store('ember.cards', bare); };
picsReady.then(() => { let moved = false; for (const k in cards) { if (cards[k].img) { savePic('card:' + k, cards[k].img); moved = true; } else if (pics.has('card:' + k)) cards[k].img = pics.get('card:' + k); } if (moved && picDb) saveCards(); });
const cardCam = new THREE.PerspectiveCamera(48, 1.5, 0.1, 1200);
let cardWanted = null, cardAt = 0, hollowSaid = false, treeSaid = false, caveSaid = false, roundSaid = false, caveNow = 0;
const caveGlow = new THREE.PointLight(0xbfe8ff, 0, 9, 1.6); caveGlow.position.set(0, 1.2, 0); me.group.add(caveGlow);
// ---------- the Hermit of Hollow Hill, and his lantern ----------
// An old badger who sits at the mouth of the cave. Like the Mapmaker he is a model of his own; an unseen animal
// stands in his place to carry his name and his words. He lends his lantern to anyone who asks, and by its light
// the painted stones in the dark gallery can be read.
const hermit = FAR ? new Avatar({ species: 5, palette: 0, name: 'Hermit', sub: 'lives in the hill' }) : null;
if (hermit) addMark(hermit.group, 'The Hermit', 2.6);
let lamp = false, hermitNext = 20, stoneHint = false;
const stonesSeen = () => world.paintings.filter((pn) => pn.seen).length;
if (hermit) { hermit.parts.rig.visible = false; hermit.shadow.visible = false; hermit.mode = 'stand'; scene.add(hermit.group); for (const id of store('ember.stones') || []) { const pn = world.paintings.find((q) => q.id === id); if (pn) pn.seen = true; } }
function hermitSays(line) { hermit.say(line); addLog('Hermit', line, 'sys'); hermitNext = Math.max(hermitNext, t + 30); }
const HERMIT_LINES = ['Mind your head in there.', 'I do not get many callers. I did not think I minded.', 'The small lights on the roof are alive. Do not ask me how.', 'It goes right through, if you keep on. Comes out above the far beach.', 'There is a round room further in. It likes voices. More than one, if you have them.', 'I had a garden once, over in the valley. I still go, when nobody is looking.'];
function greetHermit() {
  questEvent('hermit');
  me.targetYaw = Math.atan2(world.hermit.x - me.x, world.hermit.z - me.z); playEmote('greet'); addLog('', 'You greet the Hermit.', 'sys');
  const n = stonesSeen(), asked = askedBy('hermit');
  if (asked) { setTimeout(() => hermitSays(asked), 700); return; }
  setTimeout(() => hermitSays(n >= 3 ? ['So you have seen them. I painted them so that I would not be the only one who knew.', 'He was my friend, the keeper. So was the otter. One went into the sea and one went east, and I went into the hill.', 'If you ever see him, tell him the tower is still standing. Most of it.'][hermitTold++ % 3]
    : lamp ? 'Hold it up to the stones in the first room. Then come and tell me what you make of them.' : n > 0 ? 'There are three stones. You have not seen them all.' : 'You will want a light in there. Ask, and I will lend you mine.'), 700);
}
let hermitTold = 0;
function askLantern() {
  me.targetYaw = Math.atan2(world.hermit.x - me.x, world.hermit.z - me.z);
  if (lamp) { lamp = false; audio.pop(520); addLog('', 'You give the lantern back.', 'sys'); setTimeout(() => hermitSays('Thank you. It is the only one I have.'), 600); return; }
  lamp = true; questEvent('lantern'); audio.pop(760); flash('The Hermit\'s lantern', 'It lights the dark for you and for anyone close by');
  addLog('', 'The Hermit unhooks his lantern and holds it out. It is warm, and heavier than it looks.', 'sys');
  setTimeout(() => hermitSays('Bring it back. And look at the walls of the first room while you have it.'), 700);
}
function lookAtStone(pn) {
  me.targetYaw = Math.atan2(pn.x - me.x, pn.z - me.z);
  const first = !pn.seen; pn.seen = true; store('ember.stones', world.paintings.filter((q) => q.seen).map((q) => q.id));
  openSheet({ title: pn.title, lines: [{ text: pn.text }], note: stonesSeen() >= 3 ? 'That is all three. The Hermit might have something to say about them.' : `${stonesSeen()} of 3 stones seen.` });
  if (first && stonesSeen() >= 3) { const A = CAVE.pts[1]; setTimeout(() => wantStamp('paintings', [A[0] + 4.6, me.y + 2.2, A[1] + 4.2], [A[0] - 2.4, me.y + 1.5, A[1] - 3.4]), 400); }
}
// ---------- the tide ----------
// The sea covers the flats and uncovers them every sixteen minutes, the same for everyone. Whoever is caught out on
// the mud when it comes in is carried back to dry ground, wet through and none the worse.
let springSaid = false, shelterSaid = false;
// ---------- hidden places ----------
let moonSaid = false, bonesSaid = false, seatSaid = false, cairnLaid = store('ember.cairn');
if (!cairnLaid || typeof cairnLaid !== 'object') cairnLaid = { n: 0, day: '' };
if (FAR) world.setCairn(cairnLaid.n);
let cairnAll = 0;
if (FAR) saved.watchCairn((n) => { cairnAll = Math.max(n, cairnLaid.n); world.setCairn(cairnAll); });
function layStone() {
  questEvent('cairn');
  me.targetYaw = Math.atan2(WAYCAIRN.x - me.x, WAYCAIRN.z - me.z); playEmote('paw');
  if (cairnLaid.day === todayKey()) { addLog('', 'You have laid your stone for today. The cairn will still be here tomorrow.', 'sys'); return; }
  cairnLaid = { n: cairnLaid.n + 1, day: todayKey() }; store('ember.cairn', cairnLaid); cairnAll = Math.max(cairnAll + 1, cairnLaid.n); world.setCairn(cairnAll); saved.addCairn(me.name); audio.step('wood', 0.7);
  addLog('', cairnLaid.n === 1 ? 'You find a flat stone and set it at the foot of the cairn. Everyone who comes this far leaves one. Now you have.' : `You set another stone by the cairn. That is ${cairnLaid.n} of yours, and ${cairnAll} from everybody who has come this way.`, 'sys');
  if (!cards.waycairn) setTimeout(() => wantStamp('waycairn', [WAYCAIRN.x - 6, me.y + 2.6, WAYCAIRN.z - 5], [WAYCAIRN.x + 4, me.y + 0.6, WAYCAIRN.z + 8]), 400);
}
function sitInSeat() {
  questEvent('seat');
  me.x = SEAT.x + 0.35; me.z = SEAT.z; me.targetYaw = me.yaw = Math.PI / 2 + 0.12; moveTarget = null; world.hideMarker(); playEmote('wag');
  const night = skyNow.dark > 0.5;
  addLog('', night ? 'The stone is cold and fits you well. Far out on the eastern sea there is a spark of orange, very small and very steady. Somebody over there is keeping a fire.' : 'The stone is worn to the shape of whoever sat here. It looks east over open sea, to a smudge of an island on the horizon. Come back after dark.', 'sys');
  if (!cards.seat) setTimeout(() => wantStamp('seat', [SEAT.x - 6.5, me.y + 2.6, SEAT.z + 3], [SEAT.x + 30, me.y + 0.5, SEAT.z - 1]), 500);
}
let tideWarned = -1, sternSeen = false, bellSaid = false, flatsSaid = '', isletSaid = false, poolLine = 0;
const DRY = TIDE.flat - 0.14;      // below this the mud and the stones are clear of water
// In plain words: is the tide out, and for how much longer.
function tideWords() {
  const now = timeNow(), out = tideAt(now).y < DRY;
  let ms = 0; while (ms < TIDE.period && (tideAt(now + ms).y < DRY) === out) ms += 10000;
  const m = Math.max(1, Math.round(ms / 60000));
  return out ? `The tide is out. It turns in about ${m} min.` : `The tide is in. The flats will be clear in about ${m} min.`;
}
function updateTide() {
  const onMud = Math.hypot(me.x - FLATS.x, me.z - FLATS.z) < FLATS.r + 14 || Math.hypot(me.x - ISLET.x, me.z - ISLET.z) < 62;
  $('tide-note').textContent = Math.hypot(me.x - FLATS.x, me.z - FLATS.z) < 120 ? tideWords() : '';
  if (!onMud) return;
  const y = tideAt(timeNow()).y, depth = y - groundHeight(me.x, me.z), turn = Math.floor(timeNow() / TIDE.period);
  if (depth > 0.12 && depth < 0.4 && tideWarned !== turn) { tideWarned = turn; addLog('', 'The water is over your paws and coming on. Make for dry ground, or for the islet.', 'sys'); }
  if (depth > 0.44) {
    me.x = FLAT_SHORE.x; me.z = FLAT_SHORE.z; moveTarget = null; world.hideMarker(); audio.whoosh();
    flash('The tide', 'It carried you back to the shore'); addLog('', 'The sea lifts you off your feet and sets you down on the shore, wet through. Nothing is lost but your dignity.', 'sys'); playEmote('shake');
  }
}
function lookAtStern() {
  questEvent('stern');
  sternSeen = true;
  openSheet({ title: 'On her stern', lines: [
    { text: 'Under the weed, in letters that were once white: KITTIWAKE.' },
    { text: 'Smaller, cut beneath with a knife: "her master, the Ferryman of the Lantern Isles".' },
    { text: 'She is stove in along one side. Whatever she was carrying is gone, except for a square of clean wood in the bottom boards where something heavy and round was lashed down.' },
  ], note: 'About the size of a lamp lens.' });
  setTimeout(() => wantStamp('wreck', [world.flats.wreck.x + 9, me.y + 3.4, world.flats.wreck.z + 8], [world.flats.wreck.x, me.y + 1, world.flats.wreck.z]), 300);
}
function ringBell() {
  questEvent('bell');
  me.targetYaw = Math.atan2(world.flats.bell.x - me.x, world.flats.bell.z - me.z); playEmote('paw'); world.ringBell(); tellEvent('bell', 0); audio.bell(1); setTimeout(() => audio.bell(0.8), 620); ripple(me.x, me.z, 12, 0xfff1d6);
  if (!bellSaid) { bellSaid = true; addLog('', 'The bell goes out flat and clear over the water. Anyone on the shore would hear it, and know that somebody was out here.', 'sys'); }
}
const POOL_LINES = ['A red anemone, shut tight as a fist. It opens while you watch.', 'Something very small with too many legs goes sideways under a stone.', 'The water in the pool is warmer than the sea. A shrimp you can see straight through hangs in the middle of it.', 'Your own face looks up at you, and behind it the sky.'];
// ---------- the Lamplighter of Lantern Point ----------
// A heron who stayed when the keeper left, and has been mending the tower one stone at a time ever since.
const heron = FAR ? new Avatar({ species: 5, palette: 0, name: 'Lamplighter', sub: 'mends the tower' }) : null;
if (heron) addMark(heron.group, 'The Lamplighter', 3.6);
let heronNext = 25, heronTold = 0, carvingSeen = false, cottageSaid = false;
if (heron) { heron.parts.rig.visible = false; heron.shadow.visible = false; heron.mode = 'stand'; scene.add(heron.group); }
function heronSays(line) { heron.say(line); addLog('Lamplighter', line, 'sys'); heronNext = Math.max(heronNext, t + 30); }
const HERON_LINES = ['One stone a day. Some days the wind takes it back.', 'She was a fine tower. She will be again.', 'I can lift. I cannot carry. That is the trouble with being a heron.', 'The lamp room went into the sea, and the lens with it. Or so I have always thought.', 'He used to whistle, all night. I complained. I would give a good deal to hear it now.', 'Mind the scaffold.'];
function greetHeron() {
  questEvent('heron');
  me.targetYaw = Math.atan2(world.heron.x - me.x, world.heron.z - me.z); playEmote('greet'); addLog('', 'You greet the Lamplighter.', 'sys');
  const asked = askedBy('heron'); if (asked) { setTimeout(() => heronSays(asked), 700); return; }
  const lines = [];
  if (journal.lens) lines.push('You found a lens? On his beach? Then it was not lost. Then there is a point to all this.');
  if (store('ember.tune')) lines.push('That was you, on the meadow. I heard it. I had to sit down.');
  const k = lightStage(), L = LIGHT[k];
  lines.push('You came all the way up from the Landing? Then you have legs. I could use legs.');
  lines.push(L ? `${L.says} ${L.where} We have ${Math.min(L.need, lightTotals[L.kind] || 0)} of the ${L.need} it wants.` : 'She is mended, all but her eye. I light the wick every evening anyway. It does not carry past the rocks.');
  setTimeout(() => heronSays(heronTold === 0 || Math.random() < 0.5 ? lines[lines.length - 1] : lines[heronTold % lines.length]), 700); heronTold++;
}
function lookAtCarving() {
  questEvent('carving');
  carvingSeen = true;
  openSheet({ title: 'Over the door', lines: [
    { text: 'Somebody has cut two animals into the lintel, small and with care: a stag with his head up, and beside him, no taller than his knee, an otter.' },
    { text: 'Under them is one word, worn almost flat by the weather: HOME.' },
  ], note: 'The cuts are old. The same hand made the new peg on the post by the dock.' });
}
function updateHeron(dt) {
  const H = world.heron, d = Math.hypot(me.x - H.x, me.z - H.z);
  heron.x = H.x; heron.z = H.z; heron.y = groundHeight(H.x, H.z) + 0.9; heron.bubbleFade = 1 - smoothstep(10, 14, d);
  if (heron.parts.rig.visible) { heron.parts.rig.visible = false; heron.shadow.visible = false; }
  heron.update(dt, t);
  if (H.group) { const want = d < 8 ? Math.atan2(-(me.z - H.z), me.x - H.x) : H.home; let dy = want - H.group.rotation.y; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); H.group.rotation.y += dy * (1 - Math.exp(-dt * 1.3)); }
  if (entered && d < 10 && t > heronNext) { heronNext = t + 50 + Math.random() * 40; heronSays(HERON_LINES[Math.floor(Math.random() * HERON_LINES.length)]); }
}
// ---------- the standing stones ----------
// Seven stones, seven notes. Every so often the wind plays five of them in a certain order; touch the same five in
// the same order and the ring answers. It is the tune the keeper of the light used to whistle. Afterwards the ring
// is an instrument: any stone touched gives its note, for one animal or several.
const NOTES = [392, 440, 494, 587, 659, 784, 880], TUNE = [2, 5, 0, 3, 6];
let tuneKnown = !!store('ember.tune'), tuneAt = 0, windAt = -99, windSaid = false, named = !!store('ember.named'), summitSaid = false;
function sound(i, soft) { world.ringStone(i, soft ? 700 : 1100); audio.chime(NOTES[i], (soft ? 0.5 : 1) * Math.max(0.15, hearFrom(HILL.x, HILL.z, 80)), soft ? 1.3 : 2.2); const st = world.stones[i]; ripple(st.x, st.z, soft ? 2.5 : 4, 0x9ff0e0); }
function windPlays() {
  questEvent('wind');
  windAt = t;
  TUNE.forEach((n, k) => setTimeout(() => sound(n, true), 500 + k * 850));
  if (!windSaid) { windSaid = true; addLog('', 'The wind comes over the meadow and the stones take it up, one after another. It is very nearly a tune.', 'sys'); }
}
function touchStone(i) { me.targetYaw = Math.atan2(world.stones[i].x - me.x, world.stones[i].z - me.z); playEmote('paw'); tellEvent('stone', i); stoneNote(i, true); }
// A stone sounded by anybody: it is heard, and for whoever is in the ring it is the next note of the tune (or not).
function stoneNote(i, mine) {
  const inRing = Math.hypot(me.x - HILL.x, me.z - HILL.z) < 16;
  if (mine || hearFrom(HILL.x, HILL.z, 90) > 0.05) sound(i, !mine);
  if (tuneKnown || !inRing) return;
  windAt = t;      // the wind waits while somebody is trying
  if (i === TUNE[tuneAt]) tuneAt++; else tuneAt = i === TUNE[0] ? 1 : 0;
  if (tuneAt < TUNE.length) return;
  tuneKnown = true; store('ember.tune', true); tuneAt = 0;
  setTimeout(() => { TUNE.concat([4, 1]).forEach((n, k) => setTimeout(() => sound(n), k * 260)); }, 900);
  setTimeout(() => {
    flash('The keeper\'s tune', 'The stones remember it'); cutTo([HILL.x + 13, me.y + 6.5, HILL.z + 4], [LIGHTHOUSE.x, LIGHTHOUSE.y + 6, LIGHTHOUSE.z], 7);
    addLog('', 'The whole ring sounds at once, and the tune goes out over the island towards the broken tower. Somebody stood here and whistled this every night, so that it would carry.', 'sys');
    setTimeout(() => wantStamp('stones', [HILL.x + 12, me.y + 4.6, HILL.z + 7], [HILL.x - 1, me.y + 1.6, HILL.z - 1]), 7600);
  }, 1500);
}
// ---------- the echo chamber ----------
// Three crystals stand round the chamber. Call out beside one and it takes the voice and rings for a while; when
// all three are ringing at once, the stone door opens. Three animals do it easily; one can, with quick feet.
const RING_MS = 24000;
let echoOpen = !!store('ember.echo'), echoHint = 0, markSeen = false, poolSaid = false, scene3 = null;
if (FAR) world.setEchoOpen(echoOpen);
function echoCall(x, z) {
  if (!FAR || echoOpen) return;
  const E = world.echo, i = E.crystals.findIndex((c) => Math.hypot(c.x - x, c.z - z) < 3.8);
  if (i < 0) { if (caveNow > 0.5 && Math.hypot(x - CAVE.pts[2][0], z - CAVE.pts[2][1]) < 7.5 && echoHint < 1) { echoHint = 1; addLog('', 'Your voice goes round the chamber and comes back. One of the big crystals hums with it, faintly, and stops.', 'sys'); } return; }
  world.ringCrystal(i, RING_MS); if (!journal.crystal) setTimeout(() => found('crystal', true), 600); audio.chime(660 + i * 165, 1, 3.2); ripple(E.crystals[i].x, E.crystals[i].z, 5, 0x8fe6f0);
  const ringing = E.crystals.filter((c) => c.until > Date.now()).length;
  if (ringing >= 3) {
    echoOpen = true; store('ember.echo', true); world.setEchoOpen(true);
    const B = CAVE.pts[2], D = E.door, y = groundHeight(B[0], B[1]);
    cutTo([B[0] + (B[0] - D.x) * 0.35, y + 2.3, B[1] + (B[1] - D.z) * 0.35], [D.x, y + 2.2, D.z], 6.5);
    flash('The hill answers', 'A door is opening'); audio.pop(300); setTimeout(() => audio.pop(240), 500);
    addLog('', 'All three crystals are ringing at once. The sound gathers in the middle of the chamber, and under it something heavy begins to move.', 'sys');
  } else if (echoHint < 2) { echoHint = 2; addLog('', 'The crystal takes your voice and holds it, ringing. A ring of light comes up on the stone door. There are three rings, and three crystals, and this one will not ring for long.', 'sys'); }
}
function lookAtMark() {
  questEvent('poolmark');
  markSeen = true;
  openSheet({ title: 'The mark by the pool', lines: [
    { text: 'A small boat with one sail, scratched into the rock with something sharp.' },
    { text: 'Above it, pressed into what was once wet clay: the print of a paw, four toes and a pad. It is not a badger\'s, and not a stag\'s. It is webbed.' },
    { text: 'Beside it an arrow in chalk, pointing west.' },
  ], note: 'The clay has been dry a long time. But the storm was longer ago than that.' });
}
// A short look elsewhere: the camera leaves the visitor, shows something, and comes back.
function cutTo(pos, look, secs) { scene3 = { pos: new THREE.Vector3(...pos), look: new THREE.Vector3(...look), from: performance.now(), ms: secs * 1000 }; }
function updateHermit(dt) {
  const H = world.hermit, d = Math.hypot(me.x - H.x, me.z - H.z);
  hermit.x = H.x; hermit.z = H.z; hermit.y = groundHeight(H.x, H.z) - 0.1; hermit.bubbleFade = 1 - smoothstep(9, 13, d);
  if (hermit.parts.rig.visible) { hermit.parts.rig.visible = false; hermit.shadow.visible = false; }
  hermit.update(dt, t);
  if (H.group) { const want = d < 7 ? Math.atan2(-(me.z - H.z), me.x - H.x) : H.home; let dy = want - H.group.rotation.y; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); H.group.rotation.y += dy * (1 - Math.exp(-dt * 1.6)); H.group.scale.set(1.15, 1.15 * (1 + Math.sin(t * 1.1) * 0.012), 1.15); }
  if (entered && d < 9 && t > hermitNext) { hermitNext = t + 50 + Math.random() * 40; hermitSays(HERMIT_LINES[Math.floor(Math.random() * HERMIT_LINES.length)]); }
  // The lantern: carried light, and what it does to the painted stones. It does not leave the hill.
  if (lamp && Math.hypot(me.x - CAVE.pts[1][0], me.z - CAVE.pts[1][1]) > 85) { lamp = false; addLog('', 'The lantern is not yours to carry off. You turn round, and it is back on its hook at the mouth of the cave.', 'sys'); }
  if (me.parts && me.parts.lantern) me.parts.lantern.visible = lamp || nights >= 7;
  lampLight.intensity = lamp ? 7 : nights >= 7 ? 4 : 0; lampLight.distance = lamp ? 17 : 9;
  for (const pn of world.paintings) if (pn.mat) { const pd = Math.hypot(me.x - pn.x, me.z - pn.z); pn.mat.opacity = lerp(pn.mat.opacity, litNow() ? 0.06 + 0.94 * (1 - smoothstep(4.5, 10, pd)) : 0.035, 1 - Math.exp(-dt * 3)); }
}
function wantStamp(id, pos, look) {
  if (cards[id] || cardWanted || !entered || Date.now() - cardAt < 12000 || !MY_SIGHTS.some((sg) => sg.id === id)) return;
  cardWanted = { id, pos, look };
}
// Called from the frame, just before the picture the visitor sees is drawn: so the postcard's view never shows.
function takeCard() {
  const { id, pos, look } = cardWanted; cardWanted = null; cardAt = Date.now();
  const sight = MY_SIGHTS.find((sg) => sg.id === id), el = renderer.domElement, w = el.width, h = el.height;
  let img = '';
  try {
    cardCam.aspect = w / h; cardCam.position.set(pos[0], pos[1], pos[2]); cardCam.lookAt(look[0], look[1], look[2]); cardCam.updateProjectionMatrix();
    cutaway.me.value.y = 9999;      // nothing is cut out of a postcard
    const beam = beacon.visible; beacon.visible = false;      // the guide's column of light is not part of the view
    renderer.render(scene, cardCam);
    beacon.visible = beam;
    const c = document.createElement('canvas'); c.width = 480; c.height = 320;
    const sw = Math.min(w, h * 1.5), sh = sw / 1.5;
    c.getContext('2d').drawImage(el, (w - sw) / 2, (h - sh) / 2, sw, sh, 0, 0, 480, 320);
    img = c.toDataURL('image/jpeg', 0.74);
  } catch (e) { img = ''; }
  const company = [...peers.values()].filter((p) => p.fade > 0.5 && Math.hypot(p.av.x - me.x, p.av.z - me.z) < 7).map((p) => p.data.name).slice(0, 4);
  cards[id] = { at: Date.now(), img, with: company, isle: ISLE };
  savePic('card:' + id, img); saveCards();
  flash('A stamp for your journal', sight.name); audio.pop(900); if (company.length) setTimeout(() => questEvent('card2'), 6000);
  showMap();
  addLog('', `${sight.name}: stamped in your journal${company.length ? `, with ${company.join(' and ')} beside you` : ''}.`, 'sys');
  showJournalCount();
}
function updateSights() {
  if (!entered) return;
  const gy = me.y;
  if (FAR) {
    const inHollow = Math.abs(me.x - CRAG.x) < 2.4 && me.z > CRAG.z + 0.2 && me.z < CRAG.z + 4;
    if (inHollow && !hollowSaid) { hollowSaid = true; addLog('', 'Behind the water the rock is hollow, and quiet. The flat stone in here is worn smooth: somebody used to sit on it.', 'sys'); }
    const inTree = Math.hypot(me.x - HOLLOW_TREE.x, me.z - HOLLOW_TREE.z) < 1.5;
    if (inTree && !treeSaid) { treeSaid = true; addLog('', 'The old tree is hollow right up into the dark. It smells of dry leaves. There is room in here for a dozen animals out of the rain.', 'sys'); }
    if (caveNow > 0.5 && !caveSaid) { caveSaid = true; addLog('', 'The air is cool and still, and the day does not come this far in. Small lights hang on the roof. Somewhere ahead, water is dripping.', 'sys'); }
    const B = CAVE.pts[2], inRound = caveNow > 0.5 && Math.hypot(me.x - B[0], me.z - B[1]) < 5;
    if (inRound && !roundSaid) { roundSaid = true; addLog('', 'A round chamber, high as a tree. Your steps come back to you from the walls a moment late.', 'sys'); }
    // Hidden places.
    const atMoon = Math.hypot(me.x - MOONPOOL.x, me.z - MOONPOOL.z) < 5, atBones = Math.hypot(me.x - BONES.x, me.z - BONES.z) < 9;
    if (atMoon && !moonSaid) { moonSaid = true; addLog('', skyNow.dark > 0.5 ? 'A ring of pale stones, and inside it a pool that has the whole sky in it. Small lights rise off the water and go out.' : 'A ring of pale stones set on edge round a dark pool. It is only a pool, by day. The stones look as if they are waiting for something.', 'sys'); }
    if (atBones && !bonesSaid) { bonesSaid = true; addLog('', 'Ribs taller than a stag, bleached white, and a skull as long as a boat. It died here before there was a lighthouse, when the sea came higher. The grass has grown up through it.', 'sys'); }
    if (!cards.moonpool && atMoon && skyNow.dark > 0.5) wantStamp('moonpool', [MOONPOOL.x + 6.5, gy + 3.2, MOONPOOL.z + 5], [MOONPOOL.x, gy + 0.2, MOONPOOL.z]);
    else if (!cards.whale && atBones) wantStamp('whale', [BONES.x + 13, gy + 4, BONES.z + 9], [BONES.x, gy + 1.6, BONES.z]);
    // The Far Beach, its shelter, and the hot spring on the ledge.
    const inSpring = Math.hypot(me.x - SPRING.x, me.z - SPRING.z) < 2.1, atShelter = Math.hypot(me.x - SHELTER.x, me.z - SHELTER.z) < 4.2;
    if (inSpring && !springSaid) { springSaid = true; addLog('', 'The water is hot, and smells faintly of struck matches. It comes up out of the rock and has nowhere to be. Neither, for the moment, have you.', 'sys'); }
    if (atShelter && !shelterSaid) { shelterSaid = true; addLog('', 'Somebody leaned driftwood against a pole to keep the wind off, and hung shells in it to knock together. It faces west, where the sun goes down into open sea.', 'sys'); }
    if (inSpring) warmth = Math.min(1, warmth + 0.05);      // a soak warms you right through, as the fire does
    if (!cards.spring && inSpring) wantStamp('spring', [SPRING.x + 5.5, gy + 3, SPRING.z + 4.5], [SPRING.x - 1, gy + 0.4, SPRING.z - 1]);
    else if (!cards.farbeach && atShelter) wantStamp('farbeach', [SHELTER.x - Math.cos(FARBEACH.a) * 10 + 4, gy + 3.2, SHELTER.z - Math.sin(FARBEACH.a) * 10 + 5], [SHELTER.x + Math.cos(FARBEACH.a) * 14, gy + 0.6, SHELTER.z + Math.sin(FARBEACH.a) * 14]);
    // The Tide Flats and the islet.
    updateTide();
    const onIslet = Math.hypot(me.x - ISLET.x, me.z - ISLET.z) < 7;
    if (onIslet && !isletSaid) { isletSaid = true; addLog('', 'A hump of rock and turf with the sea all round it, and a ship\'s bell on a post. From here the whole south side of the island can be seen, and none of it can reach you.', 'sys'); }
    if (!cards.islet && onIslet) wantStamp('islet', [ISLET.x + 9, gy + 3.6, ISLET.z + 7], [ISLET.x - 6, gy + 0.4, ISLET.z - 14]);
    // Lantern Point: the tower, and the cottage beside it.
    const inCottage = world.cottage.inside(me.x, me.z);
    if (inCottage && !cottageSaid) { cottageSaid = true; addLog('', 'One room. A table, a stool, the frame of a bed, and a hearth that has been cold for years. He left the book on the table.', 'sys'); }
    if (!cards.cottage && inCottage) wantStamp('cottage', [world.cottage.door.x + (world.cottage.door.x - COTTAGE.x) * 2.4, gy + 2.6, world.cottage.door.z + (world.cottage.door.z - COTTAGE.z) * 2.4], [COTTAGE.x, gy + 1.6, COTTAGE.z]);
    else if (!cards.tower && Math.hypot(me.x - LIGHTHOUSE.x, me.z - LIGHTHOUSE.z) < 11) wantStamp('tower', [LIGHTHOUSE.x + 15, gy + 3, LIGHTHOUSE.z + 9], [LIGHTHOUSE.x, gy + 5.5, LIGHTHOUSE.z]);
    // The High Meadow: the wind plays the stones for anyone standing among them who has not yet played them back.
    const inRing = Math.hypot(me.x - HILL.x, me.z - HILL.z) < 13;
    if (inRing && !tuneKnown && t - windAt > 38) windPlays();
    // The top of the island, where it gets its name back.
    const onTop = Math.hypot(me.x - SUMMIT.x, me.z - SUMMIT.z) < 3.2;
    if (onTop && !summitSaid) {
      summitSaid = true;
      addLog('', 'This is the top. The whole island lies under you: the woods, the hidden valley, the broken tower on its point, and sea on every side.', 'sys');
      if (!named) { named = true; store('ember.named', true); setTimeout(() => { flash('Lantern Rock', 'The island has its name again'); addLog('', 'The Mapmaker calls it the far shore, because he had no other name for it. But there is one cut into an old post on the island you came from: Lantern Rock.', 'sys'); showIsleName(); showMap(); }, 3200); }
      else { const top = prints['s-summit']; if (top && !top.mine) addLog('', `${fullName(top.name, top.code)} stood here before anyone, and remembered the name cut into the old post across the water. That is why the map says Lantern Rock.`, 'sys'); }
    }
    if (!cards.summit && onTop) wantStamp('summit', [SUMMIT.x + 7.5, gy + 3.4, SUMMIT.z - 4], [SUMMIT.x - 10, gy - 4, SUMMIT.z + 6]);
    const inPool = caveNow > 0.5 && Math.hypot(me.x - CAVE.pool.x, me.z - CAVE.pool.z) < CAVE.pool.r - 0.5;
    if (inPool && !poolSaid) { poolSaid = true; addLog('', 'A low room, and in it a pool so still it looks like glass. The water has its own light. Nobody has stood here for years.', 'sys'); }
    if (!cards.deeppool && inPool) wantStamp('deeppool', [CAVE.pool.x - 3.6, gy + 2.1, CAVE.pool.z - 3.8], [CAVE.pool.x + 0.6, gy + 0.9, CAVE.pool.z + 3]);
    else if (!cards.underhill && inRound) wantStamp('underhill', [B[0] + 5.4, gy + 2.4, B[1] + 2.6], [B[0] - 1, gy + 1.6, B[1] - 0.5]);
    else if (!cards.hollowtree && inTree) { const a = -HOLLOW_TREE.ry; wantStamp('hollowtree', [HOLLOW_TREE.x + Math.cos(a) * 9, gy + 3.2, HOLLOW_TREE.z + Math.sin(a) * 9 + 3], [HOLLOW_TREE.x, gy + 3.4, HOLLOW_TREE.z]); }
    else if (!cards.grotto && inHollow) wantStamp('grotto', [CRAG.x + 1.9, CRAG.y + 1.5, CRAG.z + 3.5], [CRAG.x - 0.8, CRAG.y + 1.3, CRAG.z - 8]);
    else if (!cards.stillwater && Math.hypot(me.x - POOL.x, me.z - POOL.z) < POOL.r + 3) wantStamp('stillwater', [me.x + 7, gy + 4.2, me.z - 9], [CRAG.x, CRAG.y + 4.2, CRAG.z]);
    return;
  }
  if (!cards.hill && Math.hypot(me.x - HILL.x, me.z - HILL.z) < 3.4) wantStamp('hill', [me.x + 6.5, gy + 2.6, me.z + 3.2], [me.x - 9, gy + 0.6, me.z - 2]);
  else if (!cards.dock && atDockEnd()) wantStamp('dock', [me.x + 6.5, gy + 2.4, me.z + 4.5], [me.x - 12, gy + 1.4, me.z - 3]);
  else if (!cards.sea && voyageSeated && voyageNow && voyageNow.phase === 'sail' && timeNow() - seenCast > 22000) { const d = Math.hypot(me.x, me.z) || 1; wantStamp('sea', [me.x + me.x / d * 12 + me.z / d * 4, gy + 3.2, me.z + me.z / d * 12 - me.x / d * 4], [me.x, gy + 1.6, me.z]); }
}
function pickUpFind() {
  const i = lying.near(me.x, me.z);
  if (i < 0) return;
  const kind = lying.take(i);
  if (!kind) return;
  playEmote('paw'); audio.step('sand', 1);
  found(kind, kind === 'page');
  if (kind === 'page') readPage(journal.page.n - 1);
}
// ---------- things left from before ----------
function readPage(n) {
  const [title, text] = PAGES[n % PAGES.length];
  addLog('', 'An old bottle, the glass gone cloudy. There is a page rolled up inside.', 'sys');
  openSheet({ title, lines: [{ text }], note: n + 1 < PAGES.length ? 'The paper is years old. Nobody on this island wrote it.' : 'That is the last of them. The first will come round again.' });
}
function readPost() {
  me.targetYaw = Math.atan2(POST.x - me.x, POST.z - me.z);
  questEvent('post');
  openSheet({ title: 'The old signpost', lines: [
    { text: 'An old signpost, grey with salt. It once pointed the way to seven lighthouses along this sea, each close enough to see the next one\'s light.' },
    { text: 'All seven have gone dark. Six of the names have worn away.' },
    { text: 'One can still be read: LANTERN ROCK, with an arrow pointing west across the water.' },
    { text: 'At the bottom somebody has added a new mark, for this island: a small fire. The Keeper cut it. His campfire is the only light left.' },
  ], note: 'There is another island to the west, and it had a lighthouse.' });
}
function findLens() {
  if (journal.lens) return;
  me.targetYaw = Math.atan2(LENS.x - me.x, LENS.z - me.z);
  playEmote('paw'); audio.step('sand', 1.2);
  addLog('', 'You dig it out of the sand: a great disc of ringed glass in a brass frame, heavy as a stone.', 'sys');
  found('lens'); world.setLens(true);
}
function tryChest() {
  me.targetYaw = Math.atan2(CHEST.x - me.x, CHEST.z - me.z);
  playEmote('paw'); audio.step('wood', 0.9);
  if (quests.chest) addLog('', 'Still locked.', 'sys'); else addLog('', 'You try the lid. It does not move.', 'sys');
  questEvent('chest');
}
world.setLens(!!journal.lens);
// The journal is a traveller's album with three parts: stamps (a postcard for every sight reached), quests, finds.
let journalTab = 'stamps';
function openJournal(tab = journalTab) {
  journalTab = tab;
  const lines = [];
  if (tab === 'quests') {
    for (const c of MY_CHAPTERS) {
      if (!chapterOpen(c)) { lines.push({ text: c.side ? c.title : 'A later chapter', kind: 'head' }); lines.push({ text: 'Not yet', meta: 'Finish what came before.' }); continue; }
      lines.push({ text: `${c.title} · ${c.quests.length - chapterLeft(c)} of ${c.quests.length}`, kind: 'head' });
      for (const q of c.quests) {
        if (quests[q.id]) lines.push({ text: q.title, meta: `${q.tells} · ${stampDate(quests[q.id])}` });
        else lines.push({ text: q.title, meta: q.needsBoat && !boatBuilt() ? 'When the boat is built.' : `${q.from} asks: ${lower(questAsk(q))}.` });
      }
    }
  } else if (tab === 'satchel') {
    const again = { label: 'Back to the satchel', run: () => openJournal('satchel') };
    lines.push({ text: 'In your paws', kind: 'head' });
    lines.push(held ? { text: ['', 'A stick for the fire', 'A fish', 'A length of driftwood'][held] || 'Something' } : { text: 'Nothing', meta: 'Sticks, fish and driftwood are carried one at a time.' });
    if (FAR || bagCount()) {
      lines.push({ text: `For the tower · ${bagCount()} of ${BAG_MAX} places filled`, kind: 'head' });
      for (const l of LIGHT) if (bag[l.kind]) lines.push({ text: `${bag[l.kind]} of ${l.many}`, meta: LIGHT[lightStage()] === l ? 'The Lamplighter is asking for this now.' : 'Not wanted at the tower yet. It will keep.' });
      if (!bagCount()) lines.push({ text: 'Empty', meta: LIGHT[lightStage()] ? `The tower wants ${LIGHT[lightStage()].many}. ${LIGHT[lightStage()].where}` : 'The tower wants nothing more that a satchel can carry.' });
    }
    if (lamp) lines.push({ text: 'The Hermit\'s lantern', meta: 'Lent, not given. It goes back on its hook if you carry it too far.' });
    if (FAR || logs.length) {
      lines.push({ text: `The keeper's logbook · ${logs.length} of ${LOGBOOK.length} pages`, kind: 'head' });
      LOGBOOK.forEach(([title, text], i) => lines.push(logs.includes(i) ? { text: title, meta: 'Press to read', kind: 'pick', run: () => openSheet({ title, lines: [{ text }], extra: again }) } : { text: 'A page is missing here', meta: 'Torn out by the storm. It is somewhere on Lantern Rock, under a pebble.' }));
    }
    const read = Math.min(PAGES.length, journal.page ? journal.page.n : 0);
    if (read) { lines.push({ text: `Pages from old bottles · ${read} of ${PAGES.length}`, kind: 'head' }); PAGES.slice(0, read).forEach(([title, text]) => lines.push({ text: title, meta: 'Press to read', kind: 'pick', run: () => openSheet({ title, lines: [{ text }], extra: again }) })); }
    if (letters.length) { lines.push({ text: 'Letters from the chests', kind: 'head' }); for (const i of letters) lines.push({ text: LETTERS[i][0], meta: 'Press to read', kind: 'pick', run: () => openSheet({ title: LETTERS[i][0], lines: [{ text: LETTERS[i][1] }], extra: again }) }); }
    if (journal.lens) { lines.push({ text: 'Kept safe elsewhere', kind: 'head' }); lines.push({ text: 'The old lamp lens', meta: 'By the Keeper\'s woodpile on Hush Island. Too heavy for a satchel.' }); }
  } else if (tab === 'finds-list') {
    let group = '';
    for (const f of myFinds()) {
      if (f.group !== group) { group = f.group; lines.push({ text: group, kind: 'head' }); }
      const j = journal[f.id];
      lines.push(j ? { text: f.name, meta: `${j.n === 1 ? 'found once' : `found ${j.n} times`} · first on ${stampDate(j.at)}` } : { text: 'Not found yet', meta: f.hint });
    }
  }
  const got = MY_SIGHTS.filter((sg) => cards[sg.id]).length;
  openSheet({ title: tab === 'quests' ? 'Quests' : tab === 'satchel' ? 'Your satchel' : 'Your journal', lines, note: tab === 'stamps' ? (MY_SIGHTS.length ? `${got} of ${MY_SIGHTS.length} sights on ${ISLE_NAME[ISLE]}. Each card is the place as it was when you stood there.` : 'No sights have been marked on this shore yet.')
    : tab === 'quests' ? `${questsDone()} of ${MY_STORY.length} quests done on ${ISLE_NAME[ISLE]}.` : tab === 'satchel' ? 'What you carry goes with you from island to island. Press a page to read it again.' : `${journalCount()} of ${myFinds().length} found. Some things only show at night, in rain, or at campfire hour.` });
  sheet.dataset.kind = 'journal';
  const body = $('sheet-body');
  // Three plain words across the top to turn between the parts.
  const tabs = document.createElement('div'); tabs.className = 'tabs';
  for (const [k, label] of tab === 'stamps' || tab === 'finds' ? [['stamps', 'Stamps'], ['finds', 'Finds']] : []) {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = label; if (k === tab) b.className = 'here';
    b.onclick = () => openJournal(k); tabs.appendChild(b);
  }
  if (tabs.children.length) body.insertBefore(tabs, body.firstChild);
  if (tab === 'satchel') { fillSatchel(body); return; }
  if (tab === 'finds') {
    // A poster of everything there is to find: a picture of the moment for each one found, a blank frame and a hint for the rest.
    const poster = document.createElement('div'); poster.className = 'album finds';
    let group = '';
    for (const f of myFinds()) {
      if (f.group !== group) { group = f.group; const h = document.createElement('h4'); h.textContent = group; poster.appendChild(h); }
      const j = journal[f.id], fig = document.createElement('figure'), frame = document.createElement('div'), cap = document.createElement('figcaption'); frame.className = 'photo';
      if (j) { const url = pics.get('find:' + f.id); if (url) { const im = document.createElement('img'); im.src = url; im.alt = f.name; frame.appendChild(im); } else { frame.textContent = f.name; frame.classList.add('plain'); } cap.textContent = `${f.name} · ${j.n === 1 ? 'found once' : `found ${j.n} times`} · first on ${stampDate(j.at)}`; }
      else { fig.className = 'blank'; frame.textContent = '?'; cap.textContent = f.hint; }
      fig.append(frame, cap); poster.appendChild(fig);
    }
    body.appendChild(poster); return;
  }
  if (tab !== 'stamps') return;
  const album = document.createElement('div'); album.className = 'album';
  MY_SIGHTS.forEach((sg, i) => {
    const c = cards[sg.id], fig = document.createElement('figure');
    fig.style.setProperty('--tilt', `${[-1.4, 1.1, 0.8, -1][i % 4]}deg`);
    if (c) {
      const frame = document.createElement('div'); frame.className = 'photo';
      if (c.img) { const im = document.createElement('img'); im.src = c.img; im.alt = `${sg.name}, as it was on ${stampDate(c.at)}`; frame.appendChild(im); }
      frame.insertAdjacentHTML('beforeend', postmark(c.isle || ISLE, sg.name, c.at, i));
      const cap = document.createElement('figcaption'); cap.textContent = `${sg.name} · ${stampDate(c.at)}${c.with && c.with.length ? ` · with ${c.with.join(', ')}` : ''}`;
      fig.append(frame, cap);
    } else {
      fig.className = 'blank';
      const frame = document.createElement('div'); frame.className = 'photo'; frame.textContent = 'Not yet';
      const cap = document.createElement('figcaption'); cap.textContent = sg.hint;
      fig.append(frame, cap);
    }
    album.appendChild(fig);
  });
  body.appendChild(album);
}
$('journal-btn').addEventListener('click', () => { openJournal(journalTab === 'finds' ? 'finds' : 'stamps'); });
$('quests-btn').addEventListener('click', () => openJournal('quests'));
$('satchel-btn').addEventListener('click', () => openJournal('satchel'));
$('map-btn').addEventListener('click', () => openMap());
window.__emberCards = () => cards;
showJournalCount();
let whaleCheck = 0;
function updateFinds() {
  lying.update(t, { dark: skyNow.dark, rain: rainNow });
  if (t - whaleCheck < 1) return;
  whaleCheck = t;
  if (entered && !journal.whale && life.whaleUp && (voyageSeated || atDockEnd() || Math.hypot(me.x - HILL.x, me.z - HILL.z) < 6)) { addLog('', 'Far out, a great back rolls up out of the sea and under again.', 'sys'); found('whale'); }
}

// ---------- the far shore: saying where you are ----------
// Walking into one of the island's areas, its name comes up once.
let areaNow = '', areaCheck = 0;
function showIsleName() { const nm = store('ember.named') ? 'Lantern Rock' : 'The far shore'; document.title = `${nm}, west of Hush Island`; const h = $('title'); if (h) h.textContent = nm; const b = document.querySelector('.brand b'); if (b) b.textContent = nm; }
if (FAR) { document.body.classList.add('far'); showIsleName(); }
function updateArea() {
  if (!FAR || !entered || t - areaCheck < 0.7) return;
  areaCheck = t; updateSights();
  const a = areaAt(me.x, me.z), id = a ? a.id : '';
  if (id && id !== areaNow) { flash(a.name); addLog('', id === 'flats' ? `${a.name}. ${tideWords()}` : `${a.name}.`, 'sys'); }
  if (id) areaNow = id;
  if (id && !walked.has(id)) { walked.add(id); store('ember.walked', [...walked]); showMap(); }
  claimFirsts(); smallThings(); caveRooms();
}

// ---------- the satchel ----------
// What a visitor owns: things picked up (with how many), keys, and things to wear. Nothing is ever lost from it
// except a key, which stays in its lock. What is worn goes on the head, round the neck or on the back.
const inv = (() => { const v = store('ember.inv'); return v && typeof v === 'object' ? v : {}; })();
const wearing = (() => { const v = store('ember.wear'); return v && typeof v === 'object' ? v : {}; })();
const opened = new Set((() => { const v = store('ember.chests'); return Array.isArray(v) ? v : []; })());
const letters = (() => { const v = store('ember.letters'); return Array.isArray(v) ? v : []; })();
const MY_CHESTS = CHESTS[ISLE] || [];
const wearList = () => SLOTS.map((sl) => Math.max(0, WEAR_IDS.indexOf(wearing[sl] || '')));
function give(id, n = 1, quiet = false) {
  const it = ITEMS[id]; if (!it) return;
  inv[id] = (inv[id] || 0) + n; store('ember.inv', inv);
  if (!quiet) addLog('', `${it.name}${n > 1 ? ` (${n})` : ''}, into the satchel.`, 'sys');
}
function wear(id) {
  const it = ITEMS[id]; if (!it || it.kind !== 'wear' || !inv[id]) return;
  if (wearing[it.slot] === id) delete wearing[it.slot]; else wearing[it.slot] = id;
  store('ember.wear', wearing); me.setWear(wearList()); pushPresence(true); audio.pop(640); questEvent('wore');
}
me.setWear(wearList());
// Small pictures of what is in the satchel, drawn once each from the models themselves.
const thumbs = new Map(); let thumbRT = null, thumbScene = null, thumbCam = null;
function thumbOf(model, img) {
  if (thumbs.has(model)) { img.src = thumbs.get(model); return; }
  loadProps().then((make) => {
    const obj = make && make(model); if (!obj) return;
    if (!thumbRT) { thumbRT = new THREE.WebGLRenderTarget(128, 128); thumbScene = new THREE.Scene(); thumbScene.add(new THREE.HemisphereLight(0xffffff, 0x9a8a76, 2.4)); const sun2 = new THREE.DirectionalLight(0xffffff, 1.8); sun2.position.set(2, 4, 3); thumbScene.add(sun2); thumbCam = new THREE.PerspectiveCamera(28, 1, 0.01, 60); }
    const box = new THREE.Box3().setFromObject(obj), c = box.getCenter(new THREE.Vector3()), r = Math.max(0.05, box.getBoundingSphere(new THREE.Sphere()).radius);
    thumbScene.add(obj); thumbCam.position.set(c.x + r * 2.1, c.y + r * 1.7, c.z + r * 2.7); thumbCam.lookAt(c);
    const was = renderer.getRenderTarget(), col = renderer.getClearColor(new THREE.Color()), al = renderer.getClearAlpha(), px = new Uint8Array(128 * 128 * 4);
    renderer.setRenderTarget(thumbRT); renderer.setClearColor(0x000000, 0); renderer.clear(); renderer.render(thumbScene, thumbCam); renderer.readRenderTargetPixels(thumbRT, 0, 0, 128, 128, px);
    renderer.setRenderTarget(was); renderer.setClearColor(col, al); thumbScene.remove(obj);
    const cv = document.createElement('canvas'); cv.width = cv.height = 128; const g2 = cv.getContext('2d'), im = g2.createImageData(128, 128);
    for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) { const a = ((127 - y) * 128 + x) * 4, b = (y * 128 + x) * 4; for (let k = 0; k < 3; k++) im.data[b + k] = 255 * Math.pow(px[a + k] / 255, 1 / 2.2); im.data[b + 3] = px[a + 3]; }
    g2.putImageData(im, 0, 0); const url = cv.toDataURL(); thumbs.set(model, url); img.src = url;
  });
}
// ---------- things lying about, and chests ----------
function takePickup(i) {
  const pk = world.pickups[i]; if (!pk || !pk.there) return;
  me.targetYaw = Math.atan2(pk.x - me.x, pk.z - me.z); playEmote('paw'); audio.step('sand', 0.8);
  world.setPickup(i, false); pk.back = Date.now() + 9 * 60000;
  give(pk.kind, 1, true); questEvent('picked');
  addLog('', `${ITEMS[pk.kind].name}. ${inv[pk.kind] === 1 ? ITEMS[pk.kind].says : `That is ${inv[pk.kind]} in the satchel.`}`, 'sys');
}
for (const id of opened) world.setChestOpen(id, true, true);
const chestsOpen = () => MY_CHESTS.filter((c) => opened.has(c.id)).length;
function openChest(c) {
  me.targetYaw = Math.atan2(c.x - me.x, c.z - me.z);
  if (opened.has(c.id)) { addLog('', 'The chest is open and empty. What was in it is in your satchel.', 'sys'); return; }
  if (c.when === 'night' && skyNow.dark < 0.55) { playEmote('paw'); addLog('', 'The lid will not lift. There is a moon cut into the lock, and the lock is cold. Perhaps it wants the dark.', 'sys'); questEvent('chestshut'); return; }
  if (c.when === 'lowtide' && tideAt(timeNow()).y > TIDE.flat - 0.14) { addLog('', 'The sea is over it. It will have to wait for the tide.', 'sys'); return; }
  if (c.needs && !inv[c.needs]) { playEmote('paw'); audio.step('wood', 0.9); addLog('', `Locked. The lock is brass and the keyhole is ${c.needs === 'key_cottage' ? 'small' : c.needs === 'key_islet' ? 'green with salt' : c.needs === 'key_summit' ? 'long and narrow' : 'wide and black'}. The key is somewhere on this island.`, 'sys'); questEvent('chestshut'); return; }
  if (c.needs) { inv[c.needs]--; if (inv[c.needs] <= 0) delete inv[c.needs]; store('ember.inv', inv); addLog('', `${ITEMS[c.needs].name} turns in the lock, and stays there.`, 'sys'); }
  opened.add(c.id); store('ember.chests', [...opened]); world.setChestOpen(c.id, true); playEmote('paw'); audio.step('wood', 1.2); setTimeout(() => audio.pop(760), 350);
  const got = [];
  for (const [id, n] of c.gives || []) { give(id, n, true); got.push(n > 1 ? `${n} × ${ITEMS[id].name.toLowerCase()}` : ITEMS[id].name.toLowerCase()); }
  if (c.bundle && FAR) { const L = LIGHT[Math.min(lightStage(), LIGHT.length - 1)], room = Math.max(0, BAG_MAX - bagCount()), n = Math.min(6, room); if (n) { bag[L.kind] = (bag[L.kind] || 0) + n; store('ember.bag', bag); got.push(`${n} of ${L.many} for the tower`); } }
  if (Number.isInteger(c.paper) && !letters.includes(c.paper)) { letters.push(c.paper); store('ember.letters', letters); got.push('a folded letter'); }
  flash('In the chest', got.join(', ') || 'Dust'); questEvent('chest1');
  addLog('', `The lid goes back. Inside: ${got.join(', ') || 'nothing but dust'}. ${chestsOpen()} of ${MY_CHESTS.length} chests found on ${ISLE_NAME[ISLE]}.`, 'sys');
  const worn = (c.gives || []).map(([id]) => id).find((id) => ITEMS[id].kind === 'wear');
  if (worn) setTimeout(() => { if (!wearing[ITEMS[worn].slot]) wear(worn); addLog('', `${ITEMS[worn].name}: ${ITEMS[worn].says} Your satchel has it, under Wearing.`, 'sys'); }, 2600);
  if (Number.isInteger(c.paper)) setTimeout(() => openSheet({ title: LETTERS[c.paper][0], lines: [{ text: LETTERS[c.paper][1] }], note: 'It keeps in your satchel, with the other papers.' }), 3200);
}
let snapWanted = null;
// A small picture of the moment something was first found: taken from just behind the camera's shoulder.
function takeSnap() {
  const key = snapWanted; snapWanted = null;
  try {
    const el = renderer.domElement, w = el.width, h = el.height, dir = new THREE.Vector3(me.x - camera.position.x, 0, me.z - camera.position.z).normalize();
    cardCam.aspect = w / h; cardCam.position.set(me.x - dir.x * 3.4, me.y + 1.9, me.z - dir.z * 3.4); cardCam.lookAt(me.x, me.y + 0.55, me.z); cardCam.updateProjectionMatrix();
    cutaway.me.value.y = 9999; const beam = beacon.visible; beacon.visible = false; renderer.render(scene, cardCam); beacon.visible = beam;
    const c = document.createElement('canvas'); c.width = 300; c.height = 200; const sw = Math.min(w, h * 1.5), sh = sw / 1.5;
    c.getContext('2d').drawImage(el, (w - sw) / 2, (h - sh) / 2, sw, sh, 0, 0, 300, 200); savePic(key, c.toDataURL('image/jpeg', 0.7));
  } catch (e) { /* no picture this time */ }
}
let caveSaidLake = false, caveSaidGallery = false, caveSaidEnd = false;
function caveRooms() {
  if (caveNow < 0.5) return;
  const near = (q, r) => Math.hypot(me.x - q.x, me.z - q.z) < r;
  if (!caveSaidLake && near(CAVE.lake, CAVE.lake.r + 1)) { caveSaidLake = true; questEvent('lake'); addLog('', 'The passage opens out and the floor is gone: black water, wall to wall, perfectly still. Your light goes a long way across it and does not find the other side.', 'sys'); }
  if (!caveSaidGallery && near(CAVE.gallery, 6)) { caveSaidGallery = true; addLog('', 'Crystal everywhere, out of the floor and the walls, some of it taller than you. It rings faintly at the sound of your feet.', 'sys'); }
  if (!caveSaidEnd && near(CAVE.deadend, 4.5)) { caveSaidEnd = true; addLog('', 'The passage ends in a small dry room. Somebody slept here once: there is a ring of stones, and soot on the roof above it.', 'sys'); }
  const due = world.pickups.findIndex((pk) => !pk.there && pk.back && Date.now() > pk.back); if (due >= 0) { world.pickups[due].back = 0; world.setPickup(due, true); }
}

// ---------- the keeper's logbook, and the small things of Lantern Rock ----------
for (const i of logs) world.setLogPage(i, false);
function pickPage(i) {
  const pg = world.logPages[i];
  if (!pg || logs.includes(i)) return;
  me.targetYaw = Math.atan2(pg.x - me.x, pg.z - me.z); playEmote('paw'); audio.step('sand', 0.8);
  logs.push(i); store('ember.logs', logs); world.setLogPage(i, false);
  addLog('', 'A page of stiff paper under a pebble, torn down one edge. The ink has held. It goes into your satchel.', 'sys');
  found('logpage', true);
  const [title, text] = LOGBOOK[i];
  setTimeout(() => openSheet({ title, lines: [{ text }], note: logs.length >= LOGBOOK.length ? 'That is all six. The whole of it is in your satchel.' : `${logs.length} of ${LOGBOOK.length} pages found. They keep in your satchel.` }), 500);
}
let stillAt = 0, poolLooks = 0;
function smallThings() {
  const dark = skyNow.dark > 0.5, once = (id, line) => { if (journal[id]) return; if (line) addLog('', line, 'sys'); found(id, true); };
  if (me.speed > 0.15 || me.mode !== 'stand') stillAt = t;
  if (areaNow === 'woods' && dark && caveNow < 0.5 && t - stillAt > 6 && Math.hypot(me.x - WOODS_AT.x, me.z - WOODS_AT.z) < 50) once('firefly', 'You hold still. One of the fireflies drifts down, thinks about it, and settles on the end of your nose.');
  if (dark && Math.hypot(me.x - POOL.x, me.z - POOL.z) < 15) once('glowcap', 'Round the pool the mushrooms have begun to shine, blue-green, like something lit from underneath.');
  if (Math.hypot(me.x - SPRING.x, me.z - SPRING.z) < 2.1 && warmth >= 0.99) once('warmwater', 'The heat has gone right through you. You could carry it a long way.');
  if (dark && rainNow < 0.25 && Math.hypot(me.x - MOONPOOL.x, me.z - MOONPOOL.z) < 4) once('moonwater', 'The stars are in the water, every one of them, and none of them moves.');
}
function lookInPool() {
  addLog('', POOL_LINES[poolLine++ % POOL_LINES.length], 'sys');
  if (!journal.starfish && (++poolLooks >= 3 || Math.random() < 0.35)) setTimeout(() => { addLog('', 'Under a ledge of weed there is a starfish, orange, the size of your paw, doing nothing at all.', 'sys'); found('starfish', true); }, 1400);
}

// ---------- together ----------
// What one visitor does on Lantern Rock, the others nearby share in. A lantern lights whoever keeps close to its
// carrier and leaves a trail of sparks behind for whoever does not. The bell and the standing stones are heard by
// everybody, and a stone sounded by one visitor counts towards the tune for all who are in the ring.
let myEvent = null;
function tellEvent(kind, n) { myEvent = [kind, n, timeNow()]; pushPresence(true); }
const lampPeer = (r) => [...peers.values()].find((q) => q.fade > 0.5 && q.data.lamp && Math.hypot(q.av.x - me.x, q.av.z - me.z) < r) || null;
const litNow = () => lamp || !!lampPeer(7);
function heardEvent(d) {
  if (!FAR) return;
  if (d.ev.kind === 'bell') {
    const B = world.flats.bell, v = Math.max(0.12, hearFrom(B.x, B.z, 260)); world.ringBell(); audio.bell(v); setTimeout(() => audio.bell(v * 0.8), 620);
    if (v < 0.9) addLog('', `From the flats, a bell: two strokes, clear over the water. ${d.name} is out on the islet.`, 'sys');
    questEvent('heardbell');
  } else if (d.ev.kind === 'stone' && world.stones[d.ev.n]) { stoneNote(d.ev.n, false); if (Math.hypot(me.x - HILL.x, me.z - HILL.z) < 16) questEvent('heardstone'); }
}
const peerLamp = new THREE.PointLight(0xffc27a, 7, 15, 1.8);      // only in the scene while somebody else's lantern is near: a light costs every surface something
const TRAIL_N = 72, trail = [], trailPos = new Float32Array(TRAIL_N * 3), trailLast = new Map();
const trailPts = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(trailPos, 3)), new THREE.PointsMaterial({ size: 0.6, map: makeGlowTexture('rgba(255,255,255,1)'), color: 0xffcf8a, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
trailPts.frustumCulled = false; trailPts.visible = false; if (FAR) scene.add(trailPts);
let sharedSaid = false;
function updateTogether() {
  const carriers = [];
  if (lamp) carriers.push({ id: 'me', x: me.x, y: me.y, z: me.z });
  for (const [id, q] of peers) if (q.fade > 0.5 && q.data.lamp) carriers.push({ id, x: q.av.x, y: q.av.y, z: q.av.z, peer: true });
  const now = performance.now();
  for (const c of carriers) { const l = trailLast.get(c.id); if (!l || Math.hypot(c.x - l.x, c.z - l.z) > 1.7) { trailLast.set(c.id, { x: c.x, z: c.z }); trail.push({ x: c.x, y: c.y + 0.35, z: c.z, at: now }); } }
  while (trail.length && (now - trail[0].at > 45000 || trail.length > TRAIL_N)) trail.shift();
  trailPts.visible = trail.length > 0;
  if (trailPts.visible) { for (let i = 0; i < TRAIL_N; i++) { const q = trail[i]; trailPos[i * 3] = q ? q.x : 0; trailPos[i * 3 + 1] = q ? q.y + Math.sin(now / 700 + i) * 0.06 : -999; trailPos[i * 3 + 2] = q ? q.z : 0; } trailPts.geometry.attributes.position.needsUpdate = true; }
  const near = carriers.filter((c) => c.peer).sort((a, b) => Math.hypot(a.x - me.x, a.z - me.z) - Math.hypot(b.x - me.x, b.z - me.z))[0];
  if (near) peerLamp.position.set(near.x, near.y + 0.9, near.z);
  const want = !!near && Math.hypot(near.x - me.x, near.z - me.z) < 40; if (want !== !!peerLamp.parent) { if (want) scene.add(peerLamp); else scene.remove(peerLamp); }
  // Sharing a light, either way round.
  if ((!lamp && lampPeer(7)) || (lamp && company(7))) { questEvent('sharedlight'); if (!sharedSaid) { sharedSaid = true; addLog('', lamp ? 'Your lantern is lighting the way for more than you.' : 'You are walking in somebody else\'s light. Keep close and it is as good as your own.', 'sys'); } }
}

// ---------- what pushes back ----------
// Nothing on Lantern Rock will fight a visitor, but some of it will not be hurried or gone at alone. The dark under
// the hill turns back anyone with no light and no company. Some nights fog comes in off the sea and the island
// shrinks to what is in reach. The hares and the seals keep their distance from anything in a hurry.
const shy = FAR ? buildShy(scene, world.flats.pools) : null;
let crabSaid = 0, plopAt = 8;
let fogForce = null, fogSaid = false, darkSecs = 0, darkSaid = false, woodsSaid = false, caveIn = null, boltSaid = 0, slipSaid = 0;
const nightRoll = (n) => { const s = Math.sin(n * 91.7 + 13.1) * 43758.5453; return s - Math.floor(s); };
// One night in three, the same night for everybody on the island.
const fogNight = () => (fogForce !== null ? fogForce : nightRoll(Math.floor((timeNow() + DAY_MS / 2) / DAY_MS)) < 0.34);
const company = (r = 8) => [...peers.values()].some((q) => q.fade > 0.5 && Math.hypot(q.av.x - me.x, q.av.z - me.z) < r);
if (shy) {
  shy.events.onBolt = () => { if (Date.now() - boltSaid > 60000) { boltSaid = Date.now(); addLog('', 'A hare. It is gone before you have finished seeing it. They do not care for being walked at.', 'sys'); } };
  shy.events.onSlip = () => { audio.splash(0.9); setTimeout(() => audio.splash(0.6), 350); if (Date.now() - slipSaid > 60000) { slipSaid = Date.now(); addLog('', 'The seals look at you, and then they are in the water without seeming to have moved. That was too close.', 'sys'); } };
  shy.events.onHare = () => { addLog('', 'One of the hares has come over, in its own time, and sat down an arm\'s length off. It looks at you sideways. Do not move.', 'sys'); if (!journal.hare) found('hare', true); };
  shy.events.onCrab = () => { if (Date.now() - crabSaid > 90000) { crabSaid = Date.now(); addLog('', 'A crab the colour of a brick holds up both claws at you, thinks better of it, and leaves sideways at speed.', 'sys'); } };
  shy.events.onSealBark = (sl) => { audio.bark(Math.max(0.25, hearFrom(sl.hx, sl.hz, 45))); addLog('', 'One of the seals lifts its head off the rock and barks back at you.', 'sys'); if (!journal.seal) found('seal', true); };
}
let pushAt = 0;
function updatePushback() {
  const nowMs = performance.now(), dt = Math.min(0.25, (nowMs - (pushAt || nowMs)) / 1000); pushAt = nowMs;      // by the clock on the wall, so a slow machine waits no longer than a fast one
  updateTogether();
  const dark = skyNow.dark, lit = litNow() || company(), fog = fogNight() ? smoothstep(0.45, 0.8, dark) : 0;
  // Fog nights, and the dark under the trees: a lantern or company pushes both back.
  const woods = areaNow === 'woods' && Math.hypot(me.x - WOODS_AT.x, me.z - WOODS_AT.z) < 50 ? smoothstep(0.55, 0.85, dark) * 0.55 : 0;
  world.setMurk(caveNow > 0.5 ? 0 : Math.max(fog, woods) * (lit ? 0.45 : 1));
  if (fog > 0.6 && !fogSaid) { fogSaid = true; flash('Fog', 'It has come in off the sea'); addLog('', 'Fog, coming in off the sea faster than you can walk. The tower is gone, and the stars. Keep to the paths, or keep together: a lantern or a friend pushes it back a little.', 'sys'); if (!journal.fog) setTimeout(() => found('fog', true), 2500); }
  if (fog < 0.05) fogSaid = false;
  if (woods > 0.3 && !woodsSaid && !lit) { woodsSaid = true; addLog('', 'It is very dark under the trees. The fireflies know where they are going, at least.', 'sys'); }
  // Under the hill with no light and nobody beside you: so far and no further.
  const deep = caveNow > 0.5 && Math.hypot(me.x - CAVE.pts[0][0], me.z - CAVE.pts[0][1]) > 20 && Math.hypot(me.x - CAVE.pts[3][0], me.z - CAVE.pts[3][1]) > 14;
  if (deep && !lit) {
    darkSecs += dt;
    if (darkSecs > 14 && !darkSaid) { darkSaid = true; addLog('', 'You cannot see your own paws. The wall you were following is not where you left it. This wants a light, or somebody to go with.', 'sys'); }
    if (darkSecs > 30) {
      darkSecs = 0; darkSaid = false; const A = CAVE.pts[0], B = CAVE.pts[1], l = Math.hypot(A[0] - B[0], A[1] - B[1]);
      me.x = A[0] + (A[0] - B[0]) / l * 3; me.z = A[1] + (A[1] - B[1]) / l * 3; moveTarget = null; world.hideMarker(); caveIn = null;
      flash('The dark', 'It turned you round'); audio.pop(260);
      addLog('', 'You go on by feel, and the passage bends, and bends again, and there is daylight ahead: the mouth you came in by. The hill has walked you out. The Hermit lends a lantern to anyone who asks.', 'sys');
    }
  } else { darkSecs = Math.max(0, darkSecs - dt * 2); if (darkSecs === 0) darkSaid = false; }
  // In at one mouth and out at the other.
  if (caveNow > 0.5 && !caveIn) caveIn = Math.hypot(me.x - CAVE.pts[0][0], me.z - CAVE.pts[0][1]) < Math.hypot(me.x - CAVE.pts[3][0], me.z - CAVE.pts[3][1]) ? 'a' : 'b';
  if (caveNow < 0.05 && caveIn) { const out = Math.hypot(me.x - CAVE.pts[0][0], me.z - CAVE.pts[0][1]) < Math.hypot(me.x - CAVE.pts[3][0], me.z - CAVE.pts[3][1]) ? 'a' : 'b'; if (out !== caveIn) questEvent('through'); caveIn = null; }
  if (shy) {
    const who = [{ x: me.x, z: me.z, speed: me.speed, resting: me.mode !== 'stand' }];
    for (const q of peers.values()) if (q.fade > 0.5) who.push({ x: q.av.x, z: q.av.z, speed: q.av.speed, resting: false });
    if (Math.hypot(me.x - HILL.x, me.z - HILL.z) < 70 || Math.hypot(me.x - ISLET.x, me.z - ISLET.z) < 70 || Math.hypot(me.x - FLATS.x, me.z - FLATS.z) < 80) shy.update(dt, t, who, dark);
    // In the pool at Stillwater something rises now and then.
    plopAt -= dt; if (plopAt < 0) { plopAt = 5 + Math.random() * 11; const pd = Math.hypot(me.x - POOL.x, me.z - POOL.z); if (pd < 34 && caveNow < 0.5) { const a = Math.random() * 6.28, r = Math.random() * POOL.r * 0.6; world.ripple(POOL.x + Math.cos(a) * r, POOL.z + Math.sin(a) * r); audio.splash(0.35 * clamp(1 - pd / 34, 0, 1)); } }
  }
}

// ---------- mending the light ----------
// The tower is put back by everyone, in four parts, each needing something that has to be carried there: stone for
// the wall, timber for the gallery and frame, crystal for the glass, lamp-seed for the oil. A satchel holds six
// pieces. What has been brought is kept by the island, so the tower stands the same for every visitor.
const LIGHT = [
  { kind: 'stone', need: 60, one: 'a stone', many: 'stone', take: 'Take a stone from the heap', done: 'The wall stands', sub: 'The tower is whole to the gallery', says: 'Stone first. The wall has to stand before anything can sit on it.', where: 'There are heaps of it on the point, and more under the crag.' },
  { kind: 'timber', need: 40, one: 'a timber', many: 'timber', take: 'Take a length of timber', done: 'The gallery is up', sub: 'There is a rail to lean on, and a way to the top', says: 'Timber now, for the gallery and the frame of the lamp room.', where: 'There is ship\'s timber stacked on the Far Beach. And the wreck, when the tide is off her.' },
  { kind: 'glass', need: 30, one: 'a shard of crystal', many: 'crystal', take: 'Work a shard of crystal loose', done: 'The lamp room is glazed', sub: 'Glass all round, and a roof over it', says: 'Glass. There is none on the island but what grows in the hill.', where: 'The badger\'s round room is full of crystal. Ask him nicely.' },
  { kind: 'oil', need: 30, one: 'a head of lamp-seed', many: 'lamp-seed', take: 'Pick a head of lamp-seed', done: 'The lamp is filled', sub: 'Everything is ready but the lens', says: 'Oil. He pressed it from lamp-seed. I never learned how, so I shall learn.', where: 'It has gone wild in the valley, by the old beds.' },
];
const BAG_MAX = 6;
const bag = (() => { const b = store('ember.bag'); return b && typeof b === 'object' ? b : {}; })();
const bagCount = () => LIGHT.reduce((n, l) => n + (bag[l.kind] || 0), 0);
let lightTotals = { stone: 0, timber: 0, glass: 0, oil: 0 }, lightState = 'loading', lightCrew = [], myLight = Number(store('ember.myLight')) || 0, perch = false, takeAt = 0;
const lightStage = () => { let k = 0; while (k < LIGHT.length && (lightTotals[LIGHT[k].kind] || 0) >= LIGHT[k].need) k++; return k; };
if (FAR) saved.watchLight((totals, state, crew) => {
  const was = lightState === 'loading' ? -1 : lightStage();
  lightTotals = { stone: 0, timber: 0, glass: 0, oil: 0, ...totals }; lightState = state; if (crew) lightCrew = crew;
  const now = lightStage();
  world.setLightStage(now);
  if (was >= 0 && now > was && entered) stageDone(now - 1);
});
function stageDone(k) {
  const L = LIGHT[k], T = LIGHTHOUSE;
  flash(L.done, L.sub); audio.pop(620); setTimeout(() => audio.pop(820), 350);
  addLog('', `${L.done}. ${L.sub}. Everyone who carried ${L.many} to the point did this.`, 'sys');
  if (!perch && caveNow < 0.5) cutTo([T.x + 26, T.y + 13, T.z + 20], [T.x, T.y + 13, T.z], 7);
  if (k + 1 < LIGHT.length) setTimeout(() => addLog('Lamplighter', LIGHT[k + 1].says + ' ' + LIGHT[k + 1].where, 'sys'), 7500);
  else setTimeout(() => addLog('Lamplighter', 'It wants only a lens now. And there is no lens on this island. I have looked.', 'sys'), 7500);
}
function takeFrom(sc) {
  const L = LIGHT.find((l) => l.kind === sc.kind);
  me.targetYaw = Math.atan2(sc.x - me.x, sc.z - me.z);
  if (bagCount() >= BAG_MAX) { addLog('', `Your satchel is full: ${BAG_MAX} pieces is all it holds. The tower is on the western point.`, 'sys'); return; }
  if (Date.now() - takeAt < 1400) return;
  takeAt = Date.now(); playEmote('paw'); audio.step(sc.kind === 'stone' ? 'sand' : 'wood', 1);
  // Two can shift what one cannot: with somebody beside you, each go fills two places in the satchel.
  const mate = [...peers.values()].some((q) => q.fade > 0.5 && Math.hypot(q.av.x - me.x, q.av.z - me.z) < 7);
  const n = Math.min(mate ? 2 : 1, BAG_MAX - bagCount()); if (mate) setTimeout(() => questEvent('took2'), 5000);
  bag[sc.kind] = (bag[sc.kind] || 0) + n; store('ember.bag', bag); questEvent('took');
  addLog('', `${n === 2 ? `With help you get two: ${L.many}` : L.one.charAt(0).toUpperCase() + L.one.slice(1)}, into the satchel. ${bagCount()} of ${BAG_MAX}.${lightStage() < LIGHT.length && LIGHT[lightStage()].kind !== sc.kind && bagCount() <= 2 ? ` The Lamplighter is not ready for ${L.many} yet, but it will keep.` : ''}`, 'sys');
}
function giveToTower() {
  const k = lightStage(), L = LIGHT[k];
  me.targetYaw = Math.atan2(LIGHTHOUSE.x - me.x, LIGHTHOUSE.z - me.z);
  if (!L) { heronSays('It wants only a lens now. Keep what you have. I have nowhere to put it.'); return; }
  const n = bag[L.kind] || 0;
  if (!n) { heronSays(`${L.says} ${L.where}`); return; }
  bag[L.kind] = 0; store('ember.bag', bag); myLight += n; store('ember.myLight', myLight);
  playEmote('paw'); audio.step('wood', 1.3);
  const left = Math.max(0, L.need - (lightTotals[L.kind] || 0) - n);
  addLog('', `You set down ${n === 1 ? L.one : `${n} of ${L.many}`} at the foot of the tower. ${left ? `It wants ${left} more.` : 'That is the last of it.'}`, 'sys');
  saved.addLight(L.kind, n, me.name, myCode).then((r) => { if (r === 'local') { lightTotals[L.kind] = (lightTotals[L.kind] || 0) + n; const st = lightStage(); world.setLightStage(st); if (st > k) stageDone(k); } });
  questEvent('gave');
  setTimeout(() => heronSays(left ? ['That is the way. I lift, you carry.', 'Good. She is taller than she was this morning.', 'Set it there. I know where each one goes.', 'I have waited years for somebody with legs.'][Math.floor(Math.random() * 4)] : 'That is enough. Stand back and let me work.'), 900);
}
// Up the tower: once the gallery is there to stand on. Turning the view walks you round it.
function climbTower() {
  if (lightStage() < 2) { addLog('', 'The stair inside goes up into open sky and stops. There is nothing to stand on at the top, yet.', 'sys'); return; }
  perch = true; world.setGalleryView(true); moveTarget = null; world.hideMarker(); questEvent('climb'); audio.step('wood', 1);
  addLog('', 'Round and round, a hundred and four steps, and out through a low door into the wind. The whole island is under you. Turn to walk the gallery.', 'sys');
}
function climbDown() { perch = false; world.setGalleryView(false); me.x = world.lighthouse.door.x + 1.2; me.z = world.lighthouse.door.z; audio.step('wood', 1); addLog('', 'Down again, and out at the foot of the tower.', 'sys'); }

// ---------- the Mapmaker's record ----------
// The island's map is kept by everyone who walks it. The first visitor into each part of the island, and the first
// to each sight, has their name written beside it for good; the board at the Landing shows what anyone has found,
// with your own ground in dark ink. The island gets its name back the first time anybody stands on its top.
let prints = {}, roll = [], firstsState = 'loading', claimAt = 0, toldFirst = '';
const walked = new Set((() => { const w = store('ember.walked'); return Array.isArray(w) ? w : []; })());
walked.add('landing');
const claimTried = new Set();
const WHERE = { woods: 'the trees to the west of here', flats: 'the mud to the south', hollow: 'the hill in the north', valley: 'the middle of the island, behind the ridges', meadow: 'the high ground in the west', point: 'the far western point', farbeach: 'the coast in the north-west' };
const placeName = (key) => ((key[0] === 'a' ? AREAS : MY_SIGHTS).find((q) => q.id === key.slice(2)) || { name: 'Somewhere' }).name;
const farCards = () => new Set(MY_SIGHTS.filter((sg) => cards[sg.id]).map((sg) => sg.id));
function showMap() { if (!FAR) return; const top = prints['s-summit']; world.setMap({ firsts: prints, walked, cards: farCards(), named, namer: top ? top.name : '' }); }
if (FAR) saved.watchFirsts((f, r, state) => {
  const before = prints, was = firstsState;
  prints = f; roll = r; firstsState = state;
  if (was !== 'loading' && entered) for (const k in f) if (!before[k] && !f[k].mine) addLog('', `${placeName(k)}: ${fullName(f[k].name, f[k].code)} is the first to stand there. It is on the Mapmaker's map now.`, 'sys');
  const top = f['s-summit'];
  if (top && !named) {
    named = true; store('ember.named', true); showIsleName();
    if (was !== 'loading' && entered && !top.mine) { flash('Lantern Rock', `${top.name} stood on the top, and the island has its name again`); addLog('', `${fullName(top.name, top.code)} has climbed to the top of the island and remembered the name cut into the old post across the water: Lantern Rock.`, 'sys'); }
  }
  showMap();
});
// One claim at a time, a few seconds apart: whatever you have walked or stamped that has no name beside it yet.
function claimFirsts() {
  if (firstsState === 'loading' || Date.now() - claimAt < 5000) return;
  const keys = [...[...walked].filter((id) => id !== 'landing').map((id) => 'a-' + id), ...[...farCards()].map((id) => 's-' + id)];
  const k = keys.find((q) => !prints[q] && !claimTried.has(q));
  if (k) {
    claimTried.add(k); claimAt = Date.now();
    saved.claimFirst(k, me.name, myCode).then((r) => {
      if (r !== 'ok' && r !== 'local') return;
      prints = { ...prints, [k]: { name: me.name, code: /^\d{4}$/.test(String(myCode)) ? String(myCode) : '', at: Date.now(), mine: true } };
      toldFirst = k; showMap();
      setTimeout(() => { flash('First footprint', placeName(k)); audio.pop(700); addLog('', `${placeName(k)}: nobody had stood here before you. The Mapmaker will write your name beside it on the map.`, 'sys'); }, 2800);
    });
    return;
  }
  if (!store('ember.whole') && walked.size >= AREAS.length && farCards().size >= MY_SIGHTS.length) {
    store('ember.whole', true); saved.signRoll(me.name, myCode);
    flash('The whole island', 'Your name is on the Mapmaker\'s roll'); addLog('', 'You have walked every part of the island and found every sight on it. The Mapmaker keeps a roll of those who have; your name is on it now.', 'sys');
  }
}
function mapmakerHello() {
  if (toldFirst) { const k = toldFirst; toldFirst = ''; return `${placeName(k)}. You were the first there. I have put your name beside it.`; }
  const blank = AREAS.filter((a) => a.id !== 'landing' && !prints['a-' + a.id] && !walked.has(a.id));
  const got = farCards().size, r = Math.random();
  if (walked.size >= AREAS.length && got >= MY_SIGHTS.length) return 'You have walked all of it. Your name is on my roll, and I am glad of it.';
  if (blank.length && r < 0.45) return `Nobody has walked ${WHERE[blank[Math.floor(Math.random() * blank.length)].id]} yet. Whoever gets there first, I will write their name on the map.`;
  if (r < 0.8) return `By my count you have walked ${walked.size} of the island's ${AREAS.length} parts and found ${got} of its ${MY_SIGHTS.length} sights. The map has the rest.`;
  return KEEPER_HELLO[Math.floor(Math.random() * KEEPER_HELLO.length)];
}
function fillSatchel(body) {
  const top = document.createElement('div'); top.className = 'bag';
  const tile = (id, n, on) => {
    const it = ITEMS[id], b = document.createElement(it.kind === 'wear' ? 'button' : 'div'), im = document.createElement('img'), nm = document.createElement('span');
    b.className = 'tile' + (on ? ' on' : ''); im.alt = ''; thumbOf(it.model, im); nm.textContent = it.kind === 'wear' ? `${it.name}${on ? ' · on' : ''}` : `${it.name}${n > 1 ? ` × ${n}` : ''}`;
    b.title = it.says; b.append(im, nm);
    if (it.kind === 'wear') { b.type = 'button'; b.onclick = () => { wear(id); openJournal('satchel'); }; }
    return b;
  };
  const head = (t) => { const h = document.createElement('h4'); h.textContent = t; top.appendChild(h); };
  const mine = Object.keys(ITEMS).filter((id) => inv[id] > 0), wears = mine.filter((id) => ITEMS[id].kind === 'wear'), keys = mine.filter((id) => ITEMS[id].kind === 'key'), things = mine.filter((id) => ITEMS[id].kind === 'thing');
  head(`Wearing · press one to put it on or take it off`);
  if (wears.length) for (const id of wears) top.appendChild(tile(id, 1, wearing[ITEMS[id].slot] === id)); else { const p = document.createElement('p'); p.textContent = 'Nothing to wear yet. There are things in chests.'; top.appendChild(p); }
  if (keys.length) { head('Keys'); for (const id of keys) top.appendChild(tile(id, inv[id])); }
  head(`Carrying · ${things.reduce((n, id) => n + inv[id], 0)} things of ${things.length} kinds`);
  if (things.length) for (const id of things) top.appendChild(tile(id, inv[id])); else { const p = document.createElement('p'); p.textContent = 'Nothing yet. Small things lie about all over both islands.'; top.appendChild(p); }
  if (MY_CHESTS.length) { const p = document.createElement('p'); p.className = 'count'; p.textContent = `${chestsOpen()} of ${MY_CHESTS.length} chests opened on ${ISLE_NAME[ISLE]}.`; top.appendChild(p); }
  body.insertBefore(top, body.firstChild);
}
// The map, from anywhere: the Mapmaker's own on Lantern Rock; on Hush Island a list of what there is.
function openMap() {
  if (FAR) { lookAtMap(true); return; }
  const got = MY_SIGHTS.filter((sg) => cards[sg.id]).length;
  openSheet({ title: 'Hush Island', lines: [
    { text: 'A small island with a fire in the middle of it, a hill behind the fire, a dock to the east and a boat on the west beach.' },
    { text: `Sights: ${got} of ${MY_SIGHTS.length} stamped.`, meta: MY_SIGHTS.filter((sg) => !cards[sg.id]).map((sg) => sg.hint).join(' ') },
    { text: `Chests: ${chestsOpen()} of ${MY_CHESTS.length} opened.`, meta: MY_CHESTS.filter((c) => !opened.has(c.id)).map((c) => c.hint).join(' ') },
    { text: 'West across the water there is another island. The signpost by the dock has its name.' },
  ], note: 'Nobody has drawn a map of this island. It is small enough to keep in your head.' });
}
function lookAtMap(pocket) {
  questEvent('map');
  if (pocket !== true) me.targetYaw = Math.atan2(MAP_BOARD.x - me.x, MAP_BOARD.z - me.z);
  const by = (f, word) => (f ? `${word} by ${f.mine ? 'you' : fullName(f.name, f.code)}${f.at ? ', ' + stampDate(f.at) : ''}` : '');
  const lines = [{ text: 'The parts of the island', kind: 'head' }];
  for (const a of AREAS) {
    const f = prints['a-' + a.id], mine = walked.has(a.id);
    if (a.id === 'landing') lines.push({ text: 'The Landing.', meta: 'drawn by the Mapmaker' });
    else if (f || mine) lines.push({ text: `${a.name}.${mine ? '' : ' You have not been there.'}`, meta: by(f, 'first walked') });
    else lines.push({ text: `Blank paper: ${WHERE[a.id]}.`, meta: 'nobody has walked it' });
  }
  const marked = MY_SIGHTS.filter((sg) => prints['s-' + sg.id] || cards[sg.id]);
  lines.push({ text: `Sights marked with a cross: ${marked.length} of ${MY_SIGHTS.length}`, kind: 'head' });
  for (const sg of marked) lines.push({ text: `${sg.name}.${cards[sg.id] ? '' : ' You have not found it.'}`, meta: by(prints['s-' + sg.id], 'first found') });
  if (!marked.length) lines.push({ text: 'None yet. The Mapmaker marks a sight when somebody comes back having seen it.' });
  lines.push({ text: `Chests: ${chestsOpen()} of ${MY_CHESTS.length} opened`, kind: 'head' });
  for (const c of MY_CHESTS) lines.push(opened.has(c.id) ? { text: 'Opened.', meta: c.hint } : { text: c.hint });
  if (roll.length) { lines.push({ text: 'Those who have walked all of it', kind: 'head' }); for (const w of roll.slice(0, 40)) lines.push({ text: fullName(w.name, w.code), meta: w.at ? stampDate(w.at) : '' }); }
  openSheet({ title: named ? 'The map of Lantern Rock' : 'The map of the far shore', lines, note: `You have walked ${walked.size} of ${AREAS.length} parts of the island and found ${farCards().size} of its ${MY_SIGHTS.length} sights.${firstsState === 'off' ? ' The record cannot be reached just now; this is what you have found yourself.' : ''}` });
  try { const im = document.createElement('img'); im.className = 'mapimg'; im.alt = 'The map as far as it has been drawn'; im.src = world.mapmaker.canvas().toDataURL('image/jpeg', 0.8); const body = $('sheet-body'); body.insertBefore(im, body.firstChild); } catch (e) { /* the list still says it all */ }
}

// ---------- campfire hour ----------
// Twice a day (see campfire.js) the island has a set hour for gathering. The fire roars, the Keeper has a few
// things to say, and whoever sits in for a while carries a small flame by their name afterwards.
let campShift = 0, campWas = null, campCheck = 0, campSecs = 0, campSaid = -1, campWarned = 0;
const campNow = () => campfireAt(timeNow() + campShift);
const KEEPER_AT_CAMPFIRE = [
  'Campfire hour. Pull in close, there is room for everyone.',
  'I build it high at this hour so it can be seen from far off.',
  'Say where you have come from. The fire likes to know, and so do I.',
  'Somebody start a dance. I will mind the fire.',
  'There were lights all along this sea once. You could cross it at night.',
  'A howl goes further when it is not alone.',
  'Leave a mark on the wall before you go, so the next ones know you were here.',
  'Good company. I had forgotten what it was like.',
  'One more log, and then the hour is done.',
  'Same time tomorrow. I will keep your place, and the fire.',
];
function campLine() {
  const c = campNow(), now = timeNow() + campShift;
  return c.on ? `Campfire hour is on now: ${inWords(c.ends - now)} left. Animals gather at the fire.` : `Campfire hour is every day at ${bothTimes()}. The next starts in ${inWords(c.next - now)}.`;
}
function updateCampfire(dt) {
  const c = campNow(), now = timeNow() + campShift;
  world.setGathering(c.on);
  if (c.on && entered && !asleepSince && fireDist() < 9) campSecs += dt;
  if (t - campCheck < 1) return;
  campCheck = t;
  $('campfire-note').textContent = campLine();
  $('camp').textContent = c.on ? `Campfire hour is on: ${inWords(c.ends - now)} left` : `Campfire hour in ${inWords(c.next - now)} (${clockTime(c.next)})`;
  if (!entered) { campWas = c.on ? c.id : 0; return; }
  if (campWas === null) campWas = c.on ? c.id : 0;
  if (c.on && campWas !== c.id) {
    campWas = c.id; campSecs = 0; campSaid = -1;
    flash('Campfire hour', 'Come and sit by the fire'); audio.pop(620);
    addLog('', 'It is campfire hour. For the next hour this is where everyone gathers.', 'sys');
  } else if (!c.on && campWas) {
    campWas = 0; campSecs = 0;
    addLog('', `Campfire hour is over. The next is at ${clockTime(c.next)}, in ${inWords(c.next - now)}.`, 'sys');
  }
  if (!c.on && c.next - now < 600000 && campWarned !== c.next) { campWarned = c.next; addLog('', `Campfire hour starts in ${inWords(c.next - now)}. Others may be on their way.`, 'sys'); }
  if (c.on) {
    // The Keeper speaks every six minutes of the hour, the same words for everyone.
    const n = Math.min(KEEPER_AT_CAMPFIRE.length - 1, Math.floor((now - c.id) / 360000));
    if (n !== campSaid) { const firstSight = campSaid === -1 && now - c.id > 20000; campSaid = n; if (!firstSight || n === 0) keeperSays(KEEPER_AT_CAMPFIRE[n]); else keeperSays('Campfire hour. Pull in close, there is room for everyone.'); }
    // Three quarters of a minute by the fire and you were there.
    if (campSecs >= 45 && fires.last !== c.id) {
      fires = { count: fires.count + 1, last: c.id }; store('ember.fires', fires);
      flash('You kept the fire with him', fires.count === 1 ? 'A small flame by your name says so' : `${fires.count} campfire hours`);
      addLog('', fires.count === 1 ? 'You kept the campfire hour with the Keeper. A small flame by your name says so.' : `That is ${fires.count} campfire hours you have been at.`, 'sys');
      audio.pop(880); me.setName(me.name, mySub()); pushPresence(true);
      net.note('campfire'); net.note('cf' + String(c.hour).padStart(2, '0'));
      setTimeout(() => questEvent('campfire'), 6000);
      setTimeout(() => wantStamp('campfire', [8.5, groundHeight(0, 0) + 3.4, 7.5], [0, groundHeight(0, 0) + 1.1, 0]), 2500);
    }
  }
}
// The title screen says when the next one is, before anyone has stepped ashore.
setInterval(() => { if (!entered) $('campfire-note').textContent = campLine(); }, 15000);
setTimeout(() => { $('campfire-note').textContent = campLine(); }, 0);
function keeperSays(line) {
  keeper.say(line);
  speaker = { av: keeper, until: t + 5 };
  addLog(KNAME, line, 'sys');
}

// Drop detail if the device cannot keep up: first the shadows, then the resolution.
let quality = 2, qualityLocked = false, slowFor = 0, fpsAvg = 60;
if (touch && FAR) { quality = 1; world.setShadows(false); world.setReach(0.7, 0.6); }      // Lantern Rock is a great deal bigger than Hush Island: a phone starts it with less drawn
function watchQuality(dtRaw) {
  if (qualityLocked || !entered || t < 6 || document.hidden) return;
  fpsAvg = lerp(fpsAvg, 1 / Math.max(dtRaw, 0.001), 0.05);
  slowFor = fpsAvg < 30 ? slowFor + dtRaw : 0;
  if (slowFor > 2.5 && quality > 0) {
    quality--; slowFor = 0; fpsAvg = 45;
    if (quality === 1) { world.setShadows(false); world.setReach(0.7, 0.6); }
    if (quality === 0) { renderer.setPixelRatio(1); world.setReach(0.55, 0.35); resize(); }
  }
}

// A readout for looking into slowness: add ?stats to the address. Frames a second, what is being drawn, and the
// level of detail the game has settled on.
const statsEl = /[?&]stats\b/.test(location.search) ? Object.assign(document.createElement('div'), { id: 'stats' }) : null;
if (statsEl) { statsEl.style.cssText = 'position:fixed;right:10px;bottom:10px;z-index:9;font:700 12px/1.35 ui-monospace,monospace;color:#fff;background:rgba(0,0,0,0.6);padding:6px 9px;border-radius:4px;pointer-events:none;white-space:pre'; document.body.appendChild(statsEl); }
let statsAt = 0, statsFrames = 0;
function showStats(nowMs) {
  statsFrames++;
  if (nowMs - statsAt < 500) return;
  const fps = statsFrames * 1000 / (nowMs - statsAt), i = renderer.info.render; statsAt = nowMs; statsFrames = 0;
  statsEl.textContent = `${fps.toFixed(0)} frames a second\n${Math.round(i.triangles / 1000)}k triangles\n${i.calls} draws\ndetail ${quality} of 2${qualityLocked ? ' (held)' : ''}\n${renderer.domElement.width}x${renderer.domElement.height}`;
}
let lastFrame = performance.now();
let t = 0;
const tmpV = new THREE.Vector3();
const viewFrustum = new THREE.Frustum(), viewMatrix = new THREE.Matrix4(), viewSphere = new THREE.Sphere(new THREE.Vector3(), 2.4);
function frame() {
  const nowMs = performance.now();
  const dt = Math.min((nowMs - lastFrame) / 1000, 0.05);
  lastFrame = nowMs;
  t += dt;

  watchQuality(Math.min((nowMs - (frame.prev || nowMs)) / 1000 || dt, 1));
  if (statsEl) showStats(nowMs);
  frame.prev = nowMs;

  // Movement: ease toward the wanted speed rather than snapping to it.
  let wantX = 0, wantZ = 0;
  const stroll = keys.has('shift') || held === 1 || fireDist() < 7 || (moveTarget && moveTarget.short);
  let top = (stroll ? 1.5 : 3.6) * Math.min(1.25, SPECIES[me.species].height / 0.8);
  if (itWho === 'me' && !stroll) top = Math.max(top * 1.15, 3.6 * 1.25 * 1.12);      // whoever is it outruns everyone, whatever their size
  if (entered) {
    if (world.surface(me.x, me.z) === 'water') top *= 0.62;
    let ix = 0, iy = 0;
    if (!typing()) {
      if (keys.has('w') || keys.has('arrowup')) iy += 1;
      if (keys.has('s') || keys.has('arrowdown')) iy -= 1;
      if (keys.has('d') || keys.has('arrowright')) ix += 1;
      if (keys.has('a') || keys.has('arrowleft')) ix -= 1;
    }
    if ((ix || iy) && !voyage) {
      if (me.mode !== 'stand') { standUp(); pushPresence(true); }
      moveTarget = null; world.hideMarker();
      const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw);
      wantX = fx * iy + -fz * ix; wantZ = fz * iy + fx * ix;
      const l = Math.hypot(wantX, wantZ); wantX /= l; wantZ /= l;
    } else if (moveTarget && me.mode === 'stand') {
      // Follow the route one point at a time.
      let next = moveTarget[0];
      let dx = next.x - me.x, dz = next.z - me.z, d = Math.hypot(dx, dz);
      if (d < (moveTarget.length > 1 ? 0.45 : 0.25)) {
        moveTarget.shift();
        if (!moveTarget.length) { moveTarget = null; world.hideMarker(); }
        else { next = moveTarget[0]; dx = next.x - me.x; dz = next.z - me.z; d = Math.hypot(dx, dz); }
      }
      if (moveTarget && d > 0.001) { wantX = dx / d; wantZ = dz / d; }
    }
  }
  const moving = wantX || wantZ;
  const ease = 1 - Math.exp(-dt * (moving ? 8 : 11));
  vel.x = lerp(vel.x, wantX * top, ease); vel.z = lerp(vel.z, wantZ * top, ease);
  const wantSpeed = Math.hypot(vel.x, vel.z);
  if (wantSpeed > 0.03 && me.mode === 'stand') {
    const bx = me.x, bz = me.z;
    const p = moveWithCollision(me.x, me.z, vel.x * dt, vel.z * dt, 0.34);
    me.x = p.x; me.z = p.z;
    const got = Math.hypot(me.x - bx, me.z - bz) / dt;
    if (got < wantSpeed * 0.5) { vel.x *= 0.6; vel.z *= 0.6; if (moveTarget) stuckFor += dt; }
    me.speed = lerp(me.speed, got, 0.35);
    if (wantSpeed > 0.5) me.targetYaw = Math.atan2(vel.x, vel.z);
    if (moveTarget && stuckFor > 0.8) { moveTarget = null; stuckFor = 0; world.hideMarker(); }
    if (got >= wantSpeed * 0.5) stuckFor = Math.max(0, stuckFor - dt);
  } else {
    vel.x = vel.z = 0;
    me.speed = lerp(me.speed, 0, 0.35);
  }
  // Lean into a start, sit back into a stop.
  me.lean = lerp(me.lean, clamp(((moving ? top : 0) - me.speed) / 3.4, -1, 1) * 0.17, 1 - Math.exp(-dt * 8));

  // Warmth: resting by the fire warms you right through, and you carry the glow away with you for a while.
  if (entered) {
    const near = fireDist() < 4.4, heat = clamp(fuelNow(), 0.15, 1.2);
    if (world.surface(me.x, me.z) === 'water' && !voyage) warmth = Math.max(0, warmth - dt / 10);
    else if (near && me.mode !== 'stand') {
      // Warmer together: each animal resting at the fire with you (up to two) adds as much again.
      let company = 0, friend = null;
      for (const p of peers.values()) if (p.data.mode !== 'stand' && Math.hypot(p.av.x - FIRE.x, p.av.z - FIRE.z) < 5.5) { company++; friend = friend || p.data.name; }
      warmth = Math.min(1, warmth + dt * (0.01 + 0.028 * heat) * (1 + Math.min(company, 2)));
      if (company && !companySaid && warmth < 0.9) { companySaid = true; addLog('', `${friend} is by the fire too. You warm through ${company > 1 ? 'three times' : 'twice'} as fast in company.`, 'sys'); }
    }
    else if (near) warmth = warmth < 0.4 ? Math.min(0.4, warmth + dt * 0.012) : warmth;
    else warmth = Math.max(0, warmth - dt / 240);
    if (warmth >= 1 && !warmSaid) { warmSaid = true; addLog('', 'You are warm right through. The glow will stay with you a while.', 'sys'); audio.pop(520); pushPresence(true); did('warm'); }
    if (warmth < 0.5) warmSaid = false;
    if (me.mode === 'stand') companySaid = false;
    // Wading soaks the coat. It dries slowly on its own, quickly by the fire, at once with a good shake.
    if (!treeList) treeList = world.trees;
    const sheltered = treeList.some((c) => Math.hypot(c.x - me.x, c.z - me.z) < c.r * 0.9);
    // The stone holds the day's sun: lying on it warms you the way the fire does.
    const onStone = me.mode === 'lie' && Math.hypot(life.stone.x - me.x, life.stone.z - me.z) < 1.3;
    if (onStone && skyNow.dark < 0.4 && rainNow < 0.2) {
      warmth = Math.min(1, warmth + dt * 0.03); stoneFor += dt;
      if (stoneFor > 5 && !stoneSaid) { stoneSaid = true; addLog('', 'The stone is warm from the sun.', 'sys'); did('stone'); found('stone', true); }
    } else {
      if (onStone && !stoneSaid) { stoneSaid = true; addLog('', rainNow >= 0.2 ? 'The stone is wet and cold.' : 'The stone has gone cold. It warms up again by day.', 'sys'); }
      if (!onStone) { stoneFor = 0; stoneSaid = false; }
    }
    // Butterflies settle on an animal that keeps still, and leave the moment it moves.
    const mn = life.meadowNear(me.x, me.z);
    if (mn.flying && mn.dist < 3.4 && me.speed > 2.4) life.startle(mn.meadow);
    stillFor = mn.flying && mn.dist < 3.2 && me.speed < 0.1 && !me.emote && mn.meadow.scare < 0.1 ? stillFor + dt : 0;
    if (!hasButterfly && stillFor > 5) { hasButterfly = true; me.setButterfly(true); found(skyNow.dark > 0.55 ? 'moth' : 'butterfly', true); addLog('', 'A butterfly has landed on your nose. Keep still.', 'sys'); did('butterfly'); pushPresence(true); }
    if (hasButterfly && (me.speed > 0.5 || !mn.flying || mn.dist > 4.5 || me.emote === 'shake' || me.emote === 'hop' || me.emote === 'call')) { hasButterfly = false; me.setButterfly(false); pushPresence(true); }
    if (voyage) wet = Math.max(0, wet - dt / 150);
    else if (world.surface(me.x, me.z) === 'water') wet = Math.min(1, wet + dt / 1.8);
    else if (rainNow > 0.3 && !sheltered) wet = Math.min(1, wet + dt / 7);
    else wet = Math.max(0, wet - dt / (near ? 14 : 150));
    if (wet > 0.8 && !wetSaid && world.surface(me.x, me.z) !== 'water') { wetSaid = true; addLog('', rainNow > 0.3 ? 'Your coat is soaked. Get under a tree and shake it off.' : 'Your coat is soaked. Shake it off, or dry out by the fire.', 'sys'); }
    if (wet < 0.1) wetSaid = false;
    me.setCoat(warmth, wet);
  }
  world.setFuel(fuelNow());
  me.look = speaker && speaker.until > t && speaker.av !== me ? speaker.av : null;
  const yWas = me.y;
  me.y = groundHeight(me.x, me.z);
  updateParty(dt);
  if (voyage && voyageSeated) me.y = yWas;
  if (perch) { const a = camYaw + Math.PI; me.x = LIGHTHOUSE.x + Math.sin(a) * 2.85; me.z = LIGHTHOUSE.z + Math.cos(a) * 2.85; me.y = world.lighthouse.galleryY; me.targetYaw = a; me.speed = 0; moveTarget = null; }
  updateVoyage(dt);
  if (hop) updateHop();
  updateCampfire(dt);
  updateFinds();
  updateArea();
  updateWith();
  me.update(dt, t);

  // Keeper.
  keeper.bubbleFade = 1 - smoothstep(9, 13, Math.hypot(me.x - keeper.x, me.z - keeper.z));
  if (entered && t > keeperNext) {
    keeperNext = t + 45 + Math.random() * 40;
    if (keeper.bubbleFade > 0.3) {
      keeperSays(KEEPER_LINES[Math.floor(Math.random() * KEEPER_LINES.length)]);
    }
  }
  if (entered && fuelNow() < 0.26 && t - keeperLowAt > 100 && keeper.bubbleFade > 0.3) {
    keeperLowAt = t; keeperNext = Math.max(keeperNext, t + 30);
    keeperSays(FAR ? 'The fire is getting low. There\'s wood on the pile.' : 'It is burning low. Don\'t let it go out. Please.');
  }
  keeper.look = speaker && speaker.until > t && speaker.av !== keeper ? speaker.av : null;

  if (!updateKeeperGame(dt)) placeKeeper();
  keeper.update(dt, t);
  // The Mapmaker turns, slowly, to look at whoever comes near, and bobs his head when he speaks.
  if (FAR && keeper.parts.rig.visible) { keeper.parts.rig.visible = false; keeper.shadow.visible = false; }      // his body arrives late; it stays out of sight
  if (FAR) { updateHermit(dt); updateHeron(dt); if (entered) updatePushback(dt); }
  if (FAR && world.mapmaker.group) {
    const m = world.mapmaker, near = Math.hypot(me.x - m.x, me.z - m.z) < 7;
    const want = near ? Math.atan2(-(me.z - m.z), me.x - m.x) : m.home;
    let d = want - m.group.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d));
    m.group.rotation.y += d * (1 - Math.exp(-dt * 1.4));
    const talk = keeper.bubbleLife > 0 ? Math.sin(t * 7) * 0.012 : 0;
    m.group.scale.set(1.25, 1.25 * (1 + Math.sin(t * 1.3) * 0.012 + talk), 1.25);
  }

  viewFrustum.setFromProjectionMatrix(viewMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
  // Other visitors glide toward where they last said they were.
  for (const [id, p] of peers) {
    const av = p.av, d = p.data;
    const k = 1 - Math.exp(-dt * 8);
    const px = av.x, pz = av.z;
    av.x = lerp(av.x, d.x, k); av.z = lerp(av.z, d.z, k);
    av.speed = lerp(av.speed, Math.hypot(av.x - px, av.z - pz) / dt, 0.25);
    av.targetYaw = d.yaw;
    av.y = groundHeight(av.x, av.z);
    const crewAt = voyageNow && d.voyage && d.voyage.seated && d.voyage.id === seenVoyage ? voyageCrew.indexOf(id) : -1;
    if (crewAt >= 0 && voyageNow.phase !== 'done') {
      // Aboard: in their place in the boat, wherever the boat is, rather than where they last said they were.
      const seat = yard.seat(crewAt), kk = voyageNow.phase === 'sail' && p.aboard ? 1 : 1 - Math.exp(-dt * 7);
      av.x = lerp(px, seat.x, kk); av.z = lerp(pz, seat.z, kk); av.y = lerp(p.aboardY ?? av.y, seat.y, kk); p.aboardY = av.y;
      if (Math.hypot(av.x - seat.x, av.z - seat.z) < 0.1) p.aboard = true;
      av.speed = 0;
    } else { p.aboard = false; p.aboardY = undefined; }
    const dist = Math.hypot(av.x - me.x, av.z - me.z);
    const bothAtFire = mySeat >= 0 && d.mode !== 'stand' && d.seat >= 0;
    p.fade = bothAtFire ? 1 : 1 - smoothstep(8, 12, dist);
    av.bubbleFade = p.fade;
    av.look = speaker && speaker.until > t && speaker.av !== av && dist < 14 ? speaker.av : null;
    // A crowded island: animals out of sight are not drawn, far ones are animated less often,
    // and only those near the fire throw shadows.
    viewSphere.center.set(av.x, av.y + 0.8, av.z);
    const seen = dist < 85 && viewFrustum.intersectsSphere(viewSphere);
    av.group.visible = seen;
    av.setShadows(Math.hypot(av.x - FIRE.x, av.z - FIRE.z) < 6.5);
    if (d.mode === 'stand' && dist < 70) traces.walk(av, SPECIES[d.species].height, !!SPECIES[d.species].hoof);
    p.acc = (p.acc || 0) + dt; p.skip = (p.skip || 0) + 1;
    const every = dist > 32 ? 3 : dist > 18 ? 2 : 1;
    if (!seen) { av.group.position.set(av.x, av.y, av.z); p.acc = 0; p.skip = 0; }
    else if (p.skip >= every) { av.update(p.acc, t); p.acc = 0; p.skip = 0; }
  }

  // Camera.
  const sway = reducedMotion ? 0 : 1;
  const wide = camera.aspect > 1;
  const introPos = tmpV.set(
    me.x + (wide ? 2.1 : 0.25) + Math.sin(t * 0.21) * 0.25 * sway,
    me.y + 1.25 + Math.sin(t * 0.17) * 0.08 * sway,
    me.z + (wide ? 3.5 : 5.2),
  ).clone();
  const introLook = new THREE.Vector3(me.x + (wide ? 1.9 : 0), me.y + (wide ? 1.0 : -1.0), me.z - 3);
  let goalPos, goalLook, fov = 58;
  if (stargazing) {
    goalPos = new THREE.Vector3(me.x + Math.sin(camYaw) * 1.6, me.y + 1.1, me.z + Math.cos(camYaw) * 1.6);
    goalLook = new THREE.Vector3(
      goalPos.x - Math.sin(camYaw) * Math.cos(skyEl) * 10, goalPos.y + Math.sin(skyEl) * 10, goalPos.z - Math.cos(camYaw) * Math.cos(skyEl) * 10,
    );
    fov = 70;
  } else {
    goalLook = new THREE.Vector3(me.x, me.y + 1.2 - (me.mode === 'stand' ? 0 : 0.35), me.z);
    goalPos = new THREE.Vector3();
    // Come closer if the hillside would hide you from the camera.
    for (let dist = camDist; dist > 1.4; dist -= 0.5) {
      goalPos.set(
        goalLook.x + Math.sin(camYaw) * Math.cos(camPitch) * dist,
        goalLook.y + Math.sin(camPitch) * dist,
        goalLook.z + Math.cos(camYaw) * Math.cos(camPitch) * dist,
      );
      let clear = true;
      for (let f = 0.25; f <= 1.001 && clear; f += 0.25) {
        const x = lerp(goalLook.x, goalPos.x, f), z = lerp(goalLook.z, goalPos.z, f);
        if (lerp(goalLook.y, goalPos.y, f) < Math.max(groundHeight(x, z), 0) + 0.3) clear = false;
      }
      if (clear) break;
    }
    const floor = Math.max(groundHeight(goalPos.x, goalPos.z), 0) + 0.45;
    if (goalPos.y < floor) goalPos.y = floor;
  }
  enterBlend = entered ? Math.min(1, enterBlend + dt / 2.4) : Math.max(0, enterBlend - dt / 1.6);
  const eb = enterBlend * enterBlend * (3 - 2 * enterBlend);
  goalPos.lerpVectors(introPos, goalPos, eb);
  goalLook.lerpVectors(introLook, goalLook, eb);
  const ck = entered ? 1 - Math.exp(-dt * 7) : 1;
  if (t < 0.1) { camPos.copy(goalPos); camLook.copy(goalLook); }
  camPos.lerp(goalPos, ck); camLook.lerp(goalLook, ck);
  if (scene3) {
    const el = performance.now() - scene3.from, k = el > scene3.ms ? 0 : Math.min(1, el / 900, (scene3.ms - el) / 900), e = k * k * (3 - 2 * k);
    camera.position.copy(camPos).lerp(scene3.pos, e); camera.lookAt(cutLook.copy(camLook).lerp(scene3.look, e));
    if (el > scene3.ms) scene3 = null;
  } else { camera.position.copy(camPos); camera.lookAt(camLook); }
  world.fadeCanopies(camPos, camLook, dt);
  if (Math.abs(camera.fov - fov) > 0.05) { camera.fov = lerp(camera.fov, fov, 1 - Math.exp(-dt * 3)); camera.updateProjectionMatrix(); }

  // The hour: sky, light and sea follow island time.
  if (!frame.skyAt || nowMs - frame.skyAt > 400) {
    frame.skyAt = nowMs;
    rainNow = rainForce === null ? rainAt() : rainForce;
    if ((rainNow > 0.15) !== raining) {
      raining = rainNow > 0.15;
      if (entered) {
        addLog('', raining ? 'Rain is coming in off the sea.' : 'The rain has passed.', 'sys');
        if (raining && keeper.bubbleFade > 0.3) setTimeout(() => keeperSays('Rain. Get under a tree, or come in close to the fire.'), 1200);
      }
    }
    audio.setRain(entered ? rainNow : 0);
    const hour = (islandHour() + hourShift) % 24, k = skyAt(hour, rainNow);
    skyNow = k;
    world.setSky(k);
    life.setDaylight(1 - k.dark);
    life.setRain(rainNow, null);
    renderer.toneMappingExposure = lerp(0.98, 1.15, k.dark);
    viewLight.intensity = 0.28 * k.dark;
    // The day bar: a marker sliding from dawn to dawn, and a line saying what comes next and how soon.
    const di = dayInfo(hour), mins = Math.max(1, Math.round(di.minutes));
    const text = `${di.part}. ${di.next} ${di.minutes < 0.75 ? 'any moment' : `in ${mins} min`}${rainNow > 0.3 ? '. Raining' : ''}`;
    $('daydot').style.left = `${(di.pos * 100).toFixed(1)}%`;
    if (text !== frame.clockText) {
      frame.clockText = text;
      $('daytext').textContent = text;
      $('day').setAttribute('aria-label', `Island time: ${text}`);
      $('daydot').className = di.night ? 'moon' : 'sun';
    }
  }
  life.setRain(rainNow, camPos);
  updateGuide(nowMs);
  world.update(dt, t);
  life.update(dt, t);
  if (entered && me.mode === 'stand') traces.walk(me, SPECIES[me.species].height, hoofed());
  traces.update(t);
  updateCalls();
  updateTag();
  yard.update(dt, t);
  frame.players = frame.players || [];
  frame.players.length = 0;
  frame.players.push(me);
  for (const p of peers.values()) frame.players.push(p.av);
  critters.update(dt, t, { dark: skyNow.dark, rain: rainNow, players: frame.players, me });
  audio.setScene(skyNow.dark > 0.55, !!seenParty && fireDist() < 30);
  audio.tick(dt, { fireDist: Math.hypot(camPos.x - FIRE.x, camPos.z - FIRE.z), shore: shoreProximity(me.x, me.z), heat: world.heat, cave: FAR ? caveNow : 0,
    falls: FAR ? clamp(1 - Math.hypot(me.x - CRAG.x, me.z - CRAG.z) / 42, 0, 1) ** 1.6 : 0, wind: FAR ? clamp((me.y - 11) / 13, 0, 1) * (perch ? 1.3 : 1) : clamp((me.y - 4) / 5, 0, 1) * 0.5 });
  if (entered) { updateActions(); pushPresence(false); }
  cutaway.cam.value.copy(camera.position); cutaway.me.value.set(me.x, me.y, me.z);
  if (FAR) { caveNow = lerp(caveNow, inCave(me.x, me.z) ? 1 : 0, 1 - Math.exp(-dt * 2.2)); if (caveNow < 0.002) caveNow = 0; world.setCave(caveNow); caveGlow.intensity = 1.5 * caveNow; }
  if (cardWanted) takeCard(); else if (snapWanted) takeSnap();
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// A small handle for checking the page from a test script.
window.__ember = {
  me, peers, world, camera, renderer, keeper, POSE, life, mapBoard: MAP_BOARD,
  yard, did, listToday,
  critters,
  leaveIsland,
  get goal() { return goal ? { text: goal.text, x: goal.at ? goal.at.x : 0, z: goal.at ? goal.at.z : 0, step: goal.step } : null; },
  get starterAt() { return starterAt; },
  traces, companion, noteCall, setHeld, addToBoat, tagPeer, inviteTag, acceptTag, joinTag, leaveTag,
  get game() { return game; },
  gestureTo, askFriend, openFriends, whisperTo, openWhisper,
  get friends() { return friends; },
  get friendAsks() { return friendAsks; },
  get pid() { return myPid; },
  get keptBy() { return keptBy; },
  get code() { return myCode; },
  get boatTotal() { return boatTotal; }, get drawn() { return { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles }; }, get carvings() { return carvings; }, store: saved,
  startParty, joinParty, leaveParty,
  boardBoat, castOff, leaveBoat,
  get journal() { return journal; }, found, openJournal, lying, pickUpFind,
  get campfire() { const c = campNow(); return { on: c.on, id: c.id, next: c.next, secs: campSecs, fires: fires.count, line: campLine(), top: $('camp').textContent }; },
  set campShift(ms) { campShift = ms; campCheck = 0; }, set campSecs(v) { campSecs = v; },
  surface: (x, z) => world.surface(x, z), get moving() { return !!moveTarget || !!hop; },
  get voyage() { return { mine: voyage, seen: seenVoyage, cast: seenCast, crew: voyageCrew.slice(), seated: voyageSeated, dolphins: life.escorting, phase: voyageNow ? voyageNow.phase : '', left: voyageNow ? voyageNow.left : 0, u: voyageNow ? voyageNow.u : 0, sailed, line: voyageLine }; },
  set voyageCast(v) { if (voyage) { voyageCast = v; pushPresence(true); } },
  get party() { return party; },
  get seenParty() { return seenParty; },
  askKeeper, K,
  get keeperLoose() { return keeperLoose; },
  get keeperState() { const s = spotAt(KEEPER_SEAT, bodyLen(keeper)); return { loose: keeperLoose, homing: keeperHoming, wasHost, host: keeperHost(), game: K.data.game, seat: [s.x, s.z], at: [keeper.x, keeper.z], party: partyStand }; },
  get seenGame() { return seenGame; },
  get it() { return itWho; },
  set tagTime(v) { tagTime = v; },
  get netId() { return net.id; },
  get mutedUntil() { return mutedUntil; },
  seaReady,
  audio,
  get country() { return COUNTRY; },
  get skew() { return clockSkew(); }, timeNow,
  shiftTime(ms) { setIslandTime(timeNow() + ms); },
  setBoat(total, crew) { boatTotal = total; boatCrew = crew || boatCrew; yard.setProgress(total); },
  lookAtBoat, setOwnName,
  openVisitor, ignored,
  get room() { return `${net.mode} ${net.status}`; },
  get log() { return [...document.querySelectorAll('#log > *')].map((e) => e.textContent); },
  get answerTo() { return answerTo; },
  get lonely() { return lonely; },
  set idleAfter(v) { idleAfter = v; },
  get asleep() { return !!asleepSince; },
  get identity() { return identity; },
  setRain(v) { rainForce = v; frame.skyAt = 0; },
  get butterfly() { return hasButterfly; },
  setHour(h) { hourShift = (h - islandHour() + 48) % 24; frame.skyAt = 0; },
  get boat() { return boatTotal; },
  get wet() { return wet; },
  set wet(v) { wet = v; },
  teleport(x, z, yaw) { me.x = x; me.z = z; vel.x = vel.z = 0; moveTarget = null; if (yaw !== undefined) me.yaw = me.targetYaw = yaw; },
  paths: PATHS, sightAt: SIGHT_AT,
  inv, give, wear, opened, pics, openMap,
  scene, shy, setReach(k, c) { world.setReach(k, c); }, setFog(v) { fogForce = v; }, setLamp(v) { lamp = v; },
  cutTo, get light() { return { totals: lightTotals, stage: lightStage(), bag, perch }; },
  cam(yaw, pitch, dist) { camYaw = yaw; if (pitch !== undefined) camPitch = pitch; if (dist !== undefined) camDist = dist; },
  turn(d) { camYaw += d; },
  setMode, standUp, sendChat, playEmote, callOut, toggleRest, comeAshore,
  get warmth() { return warmth; },
  set warmth(v) { warmth = v; },
  setFire(fuel) { const now = timeNow(); fireRec = { fuel, at: now, stamp: now }; pushPresence(true); },
  lockQuality() { qualityLocked = true; },
  walkTo(x, z) { moveTarget = findPath(me.x, me.z, x, z); stuckFor = 0; return moveTarget ? moveTarget.map((p) => [Math.round(p.x * 10) / 10, Math.round(p.z * 10) / 10]) : null; },
  get walking() { return !!moveTarget; },
  get fuel() { return fuelNow(); },
  get held() { return held; },
  get quality() { return quality; },
  setIdentity(species, palette) { identity.species = species; identity.palette = palette; showIdentity(); },
  setNights, lookForBottle, closeSheet,
  get bottle() { return bottle; },
  get bottleSpot() { return bottleSpot; },
  get nights() { return nights; },
  get actions() { return actions.map((a) => (a ? a.label : null)); },
  run(i) { if (actions[i]) actions[i].run(); },
};
