import * as THREE from 'three';
import {
  clamp, lerp, smoothstep, groundHeight, moveWithCollision, shoreProximity,
  FIRE, HILL, SPAWN, DOCK, WOODPILE, SEATS, spotAt, WALL, CRATE, BOTTLE_SPOTS,
} from './terrain.js';
import { buildWorld } from './world.js';
import { Avatar, SPECIES, PLAYABLE, NAME_WORDS, POSE } from './avatar.js';
import { buildCritters } from './critters.js';
import { createAudio } from './audio.js';
import { createNet } from './net.js';
import { findPath } from './path.js';
import { createStore, todayKey } from './store.js';
import { buildLife, showerState } from './life.js';
import { islandHour, clockText, skyAt, rainAt } from './clock.js';
import { buildSite, BOAT_GOAL } from './build.js';

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
const COUNTRY = countryName();
const mySub = () => (showOrigin ? [COUNTRY, localTime()].filter(Boolean).join(' · ') : '');

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
const world = buildWorld(scene, { pixelRatio: PR });
const life = buildLife(scene, world);
const yard = buildSite(scene);
const critters = buildCritters(scene, world);
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
  if (surf === 'sand') world.footprint(me.x, me.z, me.yaw, left);
  if (surf === 'water') world.ripple(me.x, me.z);
};

// The keeper: part of the island, clearly not a player.
const KEEPER_SEAT = 3;
const keeper = new Avatar({ species: 5, palette: 0, name: 'Keeper', sub: 'island keeper' });
const bodyLen = (av) => (av.parts && av.parts.bodyLength) || SPECIES[av.species].height * 1.2;
function placeKeeper() {
  const s = spotAt(KEEPER_SEAT, bodyLen(keeper));
  keeper.x = s.x; keeper.z = s.z; keeper.y = groundHeight(s.x, s.z); keeper.targetYaw = s.yaw;
}
placeKeeper();
keeper.yaw = keeper.targetYaw; keeper.mode = 'lie';
scene.add(keeper.group);
const KEEPER_LINES = [
  'Drop a stick on if it burns low.', 'The stars are clearer from the hill.', 'Mind the dock. It creaks.',
  'No hurry here.', 'Good weather for it.', 'Lie as long as you like.', 'The sand stays warm near the fire.',
  'The sea is calm.', 'Sticks are on the pile.', 'The boat needs driftwood. The beaches are full of it.',
];
const KEEPER_HELLO = ['Evening.', 'Good to see you.', 'Find a warm spot.', 'Welcome back to the fire.'];
let keeperNext = 14, keeperLowAt = -999;

// ---------- state ----------
let entered = false;
let enterBlend = 0;
let camYaw = 0, camPitch = 0.32, camDist = 7.5, skyEl = 1.0;
const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
const keys = new Set();
const vel = { x: 0, z: 0 };
let moveTarget = null, stuckFor = 0;   // moveTarget is a list of points still to walk through
let mySeat = -1;
let sayMsg = null, emoteMsg = null;
let lastSayAt = 0;
let held = 0;
let warmth = 0, warmSaid = false;   // how warmed through you are, 0 to 1
let stargazing = false;
let wet = 0, wetSaid = false;        // how soaked your coat is, 0 to 1
let fishTonight = 0;
let boatTotal = 0;
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
let fireRec = { fuel: 0.5, at: Date.now(), stamp: 0 };
const fuelNow = () => Math.max(FIRE_FLOOR, fireRec.fuel - (Date.now() - fireRec.at) * BURN_PER_MS);
function adoptFire(rec) {
  if (!rec || rec.at > Date.now() + 15000 || rec.at <= fireRec.stamp) return;
  const before = fuelNow();
  fireRec = { fuel: rec.fuel, at: rec.at, stamp: rec.at };
  if (entered && fuelNow() > before + 0.2) { world.flareUp(); audio.whoosh(); }
}
function feedFire() {
  const wasLow = fuelNow() < 0.3;
  const now = Date.now();
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

// The keeper knows when the stars will fall.
function keeperHello() {
  if (bottle && bottle.kind === 'reply') return 'A bottle came back for you. It is on the beach.';
  const st = showerState();
  const todo = listToday().find((id) => !listState().done.includes(id));
  if (todo && !st.on && st.startsIn > 6 * 60000) return `Today I could use a hand. ${TASKS[todo]}.`;
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

// The keeper's list: three small jobs a day. Each one done adds planks to the boat in your name.
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
function showList() {
  const st = listState(), today = listToday();
  for (const el of [$('list'), $('tasks-list')]) {
    el.textContent = '';
    for (const id of today) {
      const li = document.createElement('li');
      li.textContent = TASKS[id];
      if (st.done.includes(id)) li.className = 'done';
      el.appendChild(li);
    }
  }
  const n = today.filter((id) => st.done.includes(id)).length;
  $('tasks-count').textContent = n === today.length ? 'all done today' : `${n} of ${today.length}`;
}
// The list on the left folds away under its heading; small screens start with it folded.
{
  const box = $('tasks'), head = $('tasks-head');
  let closed = store('ember.tasksClosed');
  if (typeof closed !== 'boolean') closed = window.innerWidth < 720;
  const apply = () => { box.dataset.closed = closed ? 'true' : 'false'; head.setAttribute('aria-expanded', closed ? 'false' : 'true'); };
  apply();
  head.addEventListener('click', () => { closed = !closed; store('ember.tasksClosed', closed); apply(); canvas.focus(); });
}
function did(id) {
  const today = listToday(), st = listState();
  if (!entered || !today.includes(id) || st.done.includes(id)) return;
  st.done.push(id);
  store('ember.list', st);
  showList();
  const left = today.length - st.done.length;
  addLog('', `Done for the keeper: ${TASKS[id].toLowerCase()}. ${left ? `${left} more on today's list.` : 'That is the whole list for today.'} Two planks go on the boat in your name.`, 'sys');
  addPlanks(2);
  if (!left) setTimeout(() => playEmote('hop'), 800);
}
function addPlanks(n) {
  saved.addPlanks(n, me.name).then((r) => { if (r === 'local') { boatTotal += n; yard.setProgress(boatTotal); } });
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
    addPlanks(1);
    addLog('', `Your driftwood is part of the boat now. ${Math.min(BOAT_GOAL, boatTotal + 1)} of ${BOAT_GOAL} planks.`, 'sys');
    did('wood');
  }, 300);
}
function lookAtBoat() {
  addLog('', boatTotal >= BOAT_GOAL ? 'The hull is planked. The keeper says it sails soon, to the next island.' : `The keeper is building a boat for the next island. ${boatTotal} of ${BOAT_GOAL} planks so far. Driftwood washes up on the beaches.`, 'sys');
}

// Fish: watch the shadows from the end of the dock and bring a paw down when one passes underneath.
const atDockEnd = () => me.x > DOCK.x1 - 1.6 && me.x <= DOCK.x1 + 0.3 && Math.abs(me.z) < 1.3;
function pawAtWater() {
  if (me.emote) return;
  me.targetYaw = Math.PI / 2;
  playEmote('paw');
  did('dock');
  const fs = life.fishingSpot, canCatch = !hoofed() && !held;
  setTimeout(() => {
    audio.step('water', 1.6);
    if (life.splash(fs.x, fs.z + (me.z * 0.5), canCatch)) {
      fishTonight++;
      setHeld(2);
      addLog('', fishTonight === 1 ? 'You caught a fish.' : `You caught a fish. That makes ${fishTonight} this visit.`, 'sys');
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
  if (held !== 2) return;
  me.targetYaw = Math.atan2(keeper.x - me.x, keeper.z - me.z);
  playEmote('throw');
  setTimeout(() => {
    setHeld(0); pushPresence(true);
    addLog('', 'You left the fish for the keeper.', 'sys');
    setTimeout(() => { keeper.play('greet'); keeperSays(['For me? Thank you.', 'A fine one. Thank you.', 'You are quick with a paw.'][fishTonight % 3]); keeperNext = Math.max(keeperNext, t + 30); }, 700);
  }, 300);
}

// Calls: each animal has its own voice, and it carries.
function callOut() {
  if (t - lastCallAt < 2.8) return;
  lastCallAt = t;
  audio.call(SPECIES[me.species].call, 1);
  playEmote('call');
  critters.heard(me.x, me.z, skyNow.dark);
  if (stargazing) { life.meteor(emoteMsg[1] % 100000); did('hill'); }      // call at the sky from the hill and a star answers
}
// Greeting: a dip of the head and a wagging tail.
function greet(av, name) {
  me.targetYaw = Math.atan2(av.x - me.x, av.z - me.z);
  playEmote('greet');
  addLog('', `You greet ${name}.`, 'sys');
  if (av === critters.cow) critters.moo();
  if (av === keeper) setTimeout(() => { keeper.play('greet'); keeperSays(keeperHello()); keeperNext = Math.max(keeperNext, t + 30); }, 700);
}

// ---------- chat ----------
const logEl = $('log');
function addLog(name, text, kind) {
  const row = document.createElement('div');
  row.className = 'line' + (kind ? ' ' + kind : '');
  if (name) {
    const b = document.createElement('b');
    b.textContent = name;
    row.appendChild(b);
    row.appendChild(document.createTextNode(' ' + text));
  } else {
    row.textContent = text;
  }
  logEl.appendChild(row);
  while (logEl.children.length > 7) logEl.removeChild(logEl.firstChild);
  setTimeout(() => row.classList.add('old'), 14000);
}
function tidyMessage(text) {
  return text.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/(https?:\/\/|www\.)\S+/gi, '[link removed]').replace(/\s+/g, ' ').trim().slice(0, 200);
}
function sendChat(raw) {
  const text = tidyMessage(raw);
  if (!text) return;
  const now = performance.now();
  if (now - lastSayAt < 900) return;
  lastSayAt = now;
  me.say(text);
  speaker = { av: me, until: t + 5 };
  addLog(me.name, text, 'you');
  sayMsg = [text, Date.now()];
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
  emoteMsg = [name, Date.now()];
  pushPresence(true);
}
// ---------- other people ----------
function presenceState() {
  return {
    v: 1, n: me.name, s: me.species, c: me.palette, t: mySub(),
    x: Math.round(me.x * 100) / 100, z: Math.round(me.z * 100) / 100, r: Math.round(me.targetYaw * 100) / 100,
    st: me.mode === 'sit' ? 1 : me.mode === 'lie' ? (stargazing ? 3 : 2) : 0, se: mySeat,
    m: sayMsg, e: emoteMsg, h: held, tl: Math.round(warmth * 10) / 10, w: Math.round(wet * 10) / 10, b: hasButterfly ? 1 : 0, nv: nights,
    fr: fireRec.stamp ? [Math.round(fireRec.fuel * 1000) / 1000, fireRec.at] : null,
  };
}
const net = createNet({
  onStatus() { updateCount(); },
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
          if (surf === 'sand') world.footprint(av.x, av.z, av.yaw, left);
          if (surf === 'water') world.ripple(av.x, av.z);
        };
        p = { av, data, sayId: data.say ? data.say.id : 0, emoteId: data.emote ? data.emote.id : 0, fade: 1 };
        peers.set(id, p);
        if (entered) addLog('', `${data.name} came ashore.`, 'sys');
      }
      p.data = data;
      p.av.setLook(data.species, data.palette);
      p.av.setName(data.name, data.sub);
      p.av.mode = data.mode;
      p.av.stargaze = data.gaze;
      if (data.say && data.say.id !== p.sayId) {
        p.sayId = data.say.id;
        if (p.fade > 0.05) { p.av.say(data.say.text); speaker = { av: p.av, until: t + 5 }; addLog(data.name, data.say.text); audio.blip(700); }
      }
      if (data.emote && data.emote.id !== p.emoteId) {
        p.emoteId = data.emote.id;
        const name = data.emote.name, dist = Math.hypot(p.av.x - me.x, p.av.z - me.z);
        if (EMOTES.includes(name)) p.av.play(name);
        if (name === 'throw') setTimeout(() => world.tossLog(p.av.x, p.av.y + SPECIES[data.species].height * 0.72, p.av.z, null), 260);
        if (name === 'shake' && data.wet > 0.15) life.shakeOff(p.av.x, p.av.y + SPECIES[data.species].height * 0.6, p.av.z, SPECIES[data.species].height);
        if (name === 'paw' && p.av.x > DOCK.x1 - 1.8) setTimeout(() => life.splash(life.fishingSpot.x, p.av.z * 0.5, false), 420);
        if (name === 'call' && data.gaze) life.meteor(data.emote.id % 100000);
        if (name === 'call') critters.heard(p.av.x, p.av.z, skyNow.dark);
        if (name === 'call' && entered) {
          const sp = SPECIES[data.species], reach = sp.call === 'howl' || sp.call === 'bellow' || sp.call === 'bray' ? 45 : 24;
          audio.call(sp.call, clamp(1 - dist / reach, 0, 1) * 0.9);
          if (dist > 12 && dist < reach) addLog('', `Somewhere on the island, ${data.name} ${sp.calls}.`, 'sys');
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
  $('count').textContent = n === 1 ? 'Just you and the keeper' : `${n} visitors on the island`;
}
updateCount();

// ---------- what the island remembers ----------
const saved = createStore();
saved.watchBoat((total) => { boatTotal = total; yard.setProgress(total); });
const sheet = $('sheet');
let sheetSubmit = null, stopCarvings = null;
function closeSheet() {
  sheet.hidden = true;
  sheetSubmit = null;
  if (stopCarvings) { stopCarvings(); stopCarvings = null; }
  canvas.focus();
}
// One panel for everything you read or write: a title, some lines, an optional box to write in.
function openSheet({ title, lines = [], input = null, extra = null, note = '' }) {
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
    sheetSubmit = input.submit;
  } else sheetSubmit = null;
  const ex = $('sheet-extra');
  ex.hidden = !extra;
  if (extra) { ex.textContent = extra.label; ex.onclick = extra.run; }
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
  try { await sheetSubmit(tidyMessage(box.value)); } finally { btn.disabled = false; }
});
$('sheet-close').addEventListener('click', closeSheet);

function ago(ms) {
  const m = Math.max(0, Date.now() - ms) / 60000;
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
  if (k === 'r' && actions[1]) { actions[1].run(); return; }
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
const toggle = (btn, on) => { btn.setAttribute('aria-pressed', on ? 'true' : 'false'); };
$('btn-sound').addEventListener('click', () => { audio.start(); audio.setSound(!audio.soundOn); toggle($('btn-sound'), audio.soundOn); $('btn-sound').textContent = audio.soundOn ? 'Sound on' : 'Sound off'; });
$('btn-music').addEventListener('click', () => { audio.start(); audio.setMusic(!audio.musicOn); toggle($('btn-music'), audio.musicOn); $('btn-music').textContent = audio.musicOn ? 'Music on' : 'Music off'; });
$('btn-help').addEventListener('click', () => { const h = $('help'); h.hidden = !h.hidden; toggle($('btn-help'), !h.hidden); });
$('help-close').addEventListener('click', () => { $('help').hidden = true; toggle($('btn-help'), false); });
$('origin').checked = showOrigin;
$('origin').addEventListener('change', (e) => { showOrigin = e.target.checked; store('ember.origin', showOrigin); me.setName(me.name, mySub()); pushPresence(true); });

function showIdentity() {
  $('who-name').textContent = identity.name;
  me.setLook(identity.species, identity.palette);
  me.setName(identity.name, mySub());
  const sp = SPECIES[identity.species];
  $('emote-call').textContent = sp.callLabel;
  $('emote-sit').hidden = !!sp.hoof;
  $('help-keys').textContent = sp.hoof ? `${sp.callLabel}, hop, shake, wag. 6 to lie down.` : `${sp.callLabel}, hop, shake, wag, sit, lie down.`;
}
showIdentity();
if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) { $('hint').textContent = 'Tap the ground to walk. Drag to look around.'; $('say').placeholder = 'Tap here to speak'; }
$('reroll').addEventListener('click', () => {
  identity = rollIdentity();
  showIdentity();
  me.play('hop');
});
$('enter').addEventListener('click', () => {
  if (entered) return;
  entered = true;
  store('ember.identity', identity);
  audio.start();
  document.body.classList.add('playing');
  me.targetYaw = Math.PI;      // turn to face the fire
  addLog('', 'You came ashore. The fire is straight ahead.', 'sys');
  pushPresence(true);
  canvas.focus();
  // If nobody here already knows how the fire is doing, your view of it becomes the shared one.
  setTimeout(() => { if (!fireRec.stamp) { fireRec.stamp = fireRec.at; pushPresence(true); } }, 3000);
  welcomeBack();
  showList();
  setTimeout(() => { if (listState().done.length < 3) addLog('', 'The keeper has three small jobs today. They are listed on the left.', 'sys'); }, 9000);
});
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { me.tag.userData.draw(me.name, me.sub); keeper.tag.userData.draw(keeper.name, keeper.sub); });
setInterval(() => { me.setName(me.name, mySub()); pushPresence(false); }, 20000);

// ---------- frame ----------
function updateActions() {
  // Two fixed slots: E does the main thing here, R is the second choice or the way out of what you are doing.
  let main = null, alt = null;
  const dFire = fireDist();
  if (held === 1) {
    if (dFire < 5.2) main = { label: 'Drop the stick on the fire', run: tossLog };
    alt = { label: 'Put the stick down', run: dropLog };
  } else if (held === 3) {
    if (Math.hypot(yard.site.x - me.x, yard.site.z - me.z) < 3.4) main = { label: 'Add the driftwood to the boat', run: addToBoat };
    alt = { label: 'Leave the driftwood here', run: () => { setHeld(0); pushPresence(true); } };
  } else if (held === 2) {
    main = Math.hypot(keeper.x - me.x, keeper.z - me.z) < 3.2 ? { label: 'Leave the fish for the keeper', run: giveFish } : { label: 'Eat the fish', run: eatFish };
    alt = main.run === giveFish ? { label: 'Eat the fish', run: eatFish } : null;
  } else if (me.mode !== 'stand') {
    if (me.mode === 'sit') main = { label: 'Lie down', run: () => { setMode('lie', mySeat); pushPresence(true); } };
    alt = { label: 'Get up', run: () => { standUp(); pushPresence(true); } };
  } else {
    const opts = [];
    if (Math.hypot(me.x - WOODPILE.x, me.z - WOODPILE.z) < 1.7) opts.push({ label: 'Pick up a stick', run: pickUpLog });
    const seat = nearestFreeSeat(1.9);
    if (seat >= 0) opts.push({ label: hoofed() ? 'Lie down by the fire' : 'Sit by the fire', run: () => { setMode('sit', seat); pushPresence(true); }, side: true });
    // Someone close enough to greet: the nearest visitor, or the keeper.
    let who = null, wd = 2.0;
    for (const p of peers.values()) { const d = Math.hypot(p.av.x - me.x, p.av.z - me.z); if (d < wd && p.fade > 0.5) { wd = d; who = { av: p.av, name: p.data.name }; } }
    if (!who && Math.hypot(keeper.x - me.x, keeper.z - me.z) < 2.6) who = { av: keeper, name: 'the keeper' };
    if (!who && Math.hypot(critters.cow.x - me.x, critters.cow.z - me.z) < 2.8) who = { av: critters.cow, name: 'Clover' };
    if (who) opts.push({ label: `Greet ${who.name}`, run: () => greet(who.av, who.name), side: true });
    const drift = yard.near(me.x, me.z);
    if (drift >= 0) opts.push({ label: 'Pick up the driftwood', run: () => pickUpDriftwood(drift) });
    if (Math.hypot(yard.site.x - me.x, yard.site.z - me.z) < 3.4) opts.push({ label: 'Look over the boat', run: lookAtBoat });
    const mn = life.meadowNear(me.x, me.z);
    if (mn.flying && mn.dist < 3.6 && !hasButterfly) opts.push({ label: 'Pounce at the butterflies', run: () => { me.targetYaw = Math.atan2(mn.meadow.x - me.x, mn.meadow.z - me.z); playEmote('hop'); setTimeout(() => life.startle(mn.meadow), 350); } });
    if (Math.hypot(life.stone.x - me.x, life.stone.z - me.z) < 2.2) opts.push({ label: skyNow.dark < 0.4 && rainNow < 0.2 ? 'Lie on the warm stone' : 'Lie on the stone', run: () => { me.x = life.stone.x; me.z = life.stone.z; setMode('lie'); pushPresence(true); } });
    if (atDockEnd()) opts.push({ label: hoofed() ? 'Stamp at the water' : 'Paw at the fish', run: pawAtWater });
    if (Math.hypot(me.x - WALL.x, me.z - WALL.z) < 2.7) opts.push({ label: 'Nose over the marks on the driftwood', run: openCarvings });
    if (bottleSpot && Math.hypot(me.x - bottleSpot.x, me.z - bottleSpot.z) < 2.0) opts.push({ label: bottle.kind === 'reply' ? 'Dig up the bottle that came back' : 'Dig up the bottle', run: openBottle });
    if (Math.hypot(me.x - CRATE.x, me.z - CRATE.z) < 2.0) opts.push({ label: 'Send a bottle out to sea', run: openWriteNote });
    if (Math.hypot(me.x - HILL.x, me.z - HILL.z) < 2.8) opts.push({ label: skyNow.dark > 0.6 ? 'Lie down and watch the stars' : rainNow > 0.3 ? 'Lie down and watch the rain' : 'Lie back and watch the sky', run: () => { me.x = HILL.x - 0.2; me.z = HILL.z + 0.1; me.targetYaw = 0.4; setMode('lie', -1, true); camYaw = 0.5; pushPresence(true); } });
    main = opts[0] || null;
    alt = opts[1] && opts[1].side ? opts[1] : null;
  }
  const next = [main, alt];
  ['action', 'action2'].forEach((id, i) => {
    const btn = $(id), a = next[i], old = actions[i];
    if ((a && a.label) !== (old && old.label)) {
      if (a) { btn.querySelector('.label').textContent = a.label; btn.hidden = false; } else { btn.hidden = true; }
    }
  });
  actions = next;
}

function keeperSays(line) {
  keeper.say(line);
  speaker = { av: keeper, until: t + 5 };
  addLog('Keeper', line, 'sys');
}

// Drop detail if the device cannot keep up: first the shadows, then the resolution.
let quality = 2, qualityLocked = false, slowFor = 0, fpsAvg = 60;
function watchQuality(dtRaw) {
  if (qualityLocked || !entered || t < 6 || document.hidden) return;
  fpsAvg = lerp(fpsAvg, 1 / Math.max(dtRaw, 0.001), 0.05);
  slowFor = fpsAvg < 30 ? slowFor + dtRaw : 0;
  if (slowFor > 2.5 && quality > 0) {
    quality--; slowFor = 0; fpsAvg = 45;
    if (quality === 1) world.setShadows(false);
    if (quality === 0) { renderer.setPixelRatio(1); resize(); }
  }
}

let lastFrame = performance.now();
let t = 0;
const tmpV = new THREE.Vector3();
function frame() {
  const nowMs = performance.now();
  const dt = Math.min((nowMs - lastFrame) / 1000, 0.05);
  lastFrame = nowMs;
  t += dt;

  watchQuality(Math.min((nowMs - (frame.prev || nowMs)) / 1000 || dt, 1));
  frame.prev = nowMs;

  // Movement: ease toward the wanted speed rather than snapping to it.
  let wantX = 0, wantZ = 0;
  const stroll = keys.has('shift') || held === 1 || fireDist() < 7 || (moveTarget && moveTarget.short);
  let top = (stroll ? 1.5 : 3.6) * Math.min(1.25, SPECIES[me.species].height / 0.8);
  if (entered) {
    if (world.surface(me.x, me.z) === 'water') top *= 0.62;
    let ix = 0, iy = 0;
    if (!typing()) {
      if (keys.has('w') || keys.has('arrowup')) iy += 1;
      if (keys.has('s') || keys.has('arrowdown')) iy -= 1;
      if (keys.has('d') || keys.has('arrowright')) ix += 1;
      if (keys.has('a') || keys.has('arrowleft')) ix -= 1;
    }
    if (ix || iy) {
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
    if (world.surface(me.x, me.z) === 'water') warmth = Math.max(0, warmth - dt / 10);
    else if (near && me.mode !== 'stand') warmth = Math.min(1, warmth + dt * (0.01 + 0.028 * heat));
    else if (near) warmth = warmth < 0.4 ? Math.min(0.4, warmth + dt * 0.012) : warmth;
    else warmth = Math.max(0, warmth - dt / 240);
    if (warmth >= 1 && !warmSaid) { warmSaid = true; addLog('', 'You are warm right through. The glow will stay with you a while.', 'sys'); audio.pop(520); pushPresence(true); did('warm'); }
    if (warmth < 0.5) warmSaid = false;
    // Wading soaks the coat. It dries slowly on its own, quickly by the fire, at once with a good shake.
    if (!treeList) treeList = world.trees;
    const sheltered = treeList.some((c) => Math.hypot(c.x - me.x, c.z - me.z) < c.r * 0.9);
    // The stone holds the day's sun: lying on it warms you the way the fire does.
    const onStone = me.mode === 'lie' && Math.hypot(life.stone.x - me.x, life.stone.z - me.z) < 1.3;
    if (onStone && skyNow.dark < 0.4 && rainNow < 0.2) {
      warmth = Math.min(1, warmth + dt * 0.03); stoneFor += dt;
      if (stoneFor > 5 && !stoneSaid) { stoneSaid = true; addLog('', 'The stone is warm from the sun.', 'sys'); did('stone'); }
    } else {
      if (onStone && !stoneSaid) { stoneSaid = true; addLog('', rainNow >= 0.2 ? 'The stone is wet and cold.' : 'The stone has gone cold. It warms up again by day.', 'sys'); }
      if (!onStone) { stoneFor = 0; stoneSaid = false; }
    }
    // Butterflies settle on an animal that keeps still, and leave the moment it moves.
    const mn = life.meadowNear(me.x, me.z);
    if (mn.flying && mn.dist < 3.4 && me.speed > 2.4) life.startle(mn.meadow);
    stillFor = mn.flying && mn.dist < 3.2 && me.speed < 0.1 && !me.emote && mn.meadow.scare < 0.1 ? stillFor + dt : 0;
    if (!hasButterfly && stillFor > 5) { hasButterfly = true; me.setButterfly(true); addLog('', 'A butterfly has landed on your nose. Keep still.', 'sys'); did('butterfly'); pushPresence(true); }
    if (hasButterfly && (me.speed > 0.5 || !mn.flying || mn.dist > 4.5 || me.emote === 'shake' || me.emote === 'hop' || me.emote === 'call')) { hasButterfly = false; me.setButterfly(false); pushPresence(true); }
    if (world.surface(me.x, me.z) === 'water') wet = Math.min(1, wet + dt / 1.8);
    else if (rainNow > 0.3 && !sheltered) wet = Math.min(1, wet + dt / 7);
    else wet = Math.max(0, wet - dt / (near ? 14 : 150));
    if (wet > 0.8 && !wetSaid && world.surface(me.x, me.z) !== 'water') { wetSaid = true; addLog('', rainNow > 0.3 ? 'Your coat is soaked. Get under a tree and shake it off.' : 'Your coat is soaked. Shake it off, or dry out by the fire.', 'sys'); }
    if (wet < 0.1) wetSaid = false;
    me.setCoat(warmth, wet);
  }
  world.setFuel(fuelNow());
  me.look = speaker && speaker.until > t && speaker.av !== me ? speaker.av : null;
  me.y = groundHeight(me.x, me.z);
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
    keeperSays('The fire is getting low. There\'s wood on the pile.');
  }
  keeper.look = speaker && speaker.until > t && speaker.av !== keeper ? speaker.av : null;

  placeKeeper();
  keeper.update(dt, t);

  // Other visitors glide toward where they last said they were.
  for (const p of peers.values()) {
    const av = p.av, d = p.data;
    const k = 1 - Math.exp(-dt * 8);
    const px = av.x, pz = av.z;
    av.x = lerp(av.x, d.x, k); av.z = lerp(av.z, d.z, k);
    av.speed = lerp(av.speed, Math.hypot(av.x - px, av.z - pz) / dt, 0.25);
    av.targetYaw = d.yaw;
    av.y = groundHeight(av.x, av.z);
    const dist = Math.hypot(av.x - me.x, av.z - me.z);
    const bothAtFire = mySeat >= 0 && d.mode !== 'stand' && d.seat >= 0;
    p.fade = bothAtFire ? 1 : 1 - smoothstep(8, 12, dist);
    av.bubbleFade = p.fade;
    av.look = speaker && speaker.until > t && speaker.av !== av && dist < 14 ? speaker.av : null;
    av.update(dt, t);
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
  if (entered) enterBlend = Math.min(1, enterBlend + dt / 2.4);
  const eb = enterBlend * enterBlend * (3 - 2 * enterBlend);
  goalPos.lerpVectors(introPos, goalPos, eb);
  goalLook.lerpVectors(introLook, goalLook, eb);
  const ck = entered ? 1 - Math.exp(-dt * 7) : 1;
  if (t < 0.1) { camPos.copy(goalPos); camLook.copy(goalLook); }
  camPos.lerp(goalPos, ck); camLook.lerp(goalLook, ck);
  camera.position.copy(camPos);
  camera.lookAt(camLook);
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
    const text = clockText(hour);
    if (text !== frame.clockText) { frame.clockText = text; $('clock').textContent = text; }
  }
  life.setRain(rainNow, camPos);
  world.update(dt, t);
  life.update(dt, t);
  yard.update(dt, t);
  frame.players = frame.players || [];
  frame.players.length = 0;
  frame.players.push(me);
  for (const p of peers.values()) frame.players.push(p.av);
  critters.update(dt, t, { dark: skyNow.dark, rain: rainNow, players: frame.players, me });
  audio.tick(dt, { fireDist: Math.hypot(camPos.x - FIRE.x, camPos.z - FIRE.z), shore: shoreProximity(me.x, me.z), heat: world.heat });
  if (entered) { updateActions(); pushPresence(false); }
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// A small handle for checking the page from a test script.
window.__ember = {
  me, peers, world, camera, keeper, POSE, life,
  yard, did, listToday,
  critters,
  setRain(v) { rainForce = v; frame.skyAt = 0; },
  get butterfly() { return hasButterfly; },
  setHour(h) { hourShift = (h - islandHour() + 48) % 24; frame.skyAt = 0; },
  get boat() { return boatTotal; },
  get wet() { return wet; },
  set wet(v) { wet = v; },
  teleport(x, z, yaw) { me.x = x; me.z = z; vel.x = vel.z = 0; moveTarget = null; if (yaw !== undefined) me.yaw = me.targetYaw = yaw; },
  cam(yaw, pitch, dist) { camYaw = yaw; if (pitch !== undefined) camPitch = pitch; if (dist !== undefined) camDist = dist; },
  setMode, standUp, sendChat, playEmote, callOut, toggleRest,
  get warmth() { return warmth; },
  set warmth(v) { warmth = v; },
  setFire(fuel) { const now = Date.now(); fireRec = { fuel, at: now, stamp: now }; pushPresence(true); },
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
