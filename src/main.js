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
import { islandHour, dayInfo, skyAt, rainAt } from './clock.js';
import { buildSite, BOAT_GOAL } from './build.js';
import { buildTraces } from './traces.js';
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
let asleepSince = 0, lastInputAt = Date.now(), laidByNap = false, idleAfter = 120000;
let mutedUntil = 0;                // until when the island will not pass on what you say
const ignored = new Set();         // visitors you have chosen not to hear, until you leave
let itWho = null;                  // who is "it" in a game of tag: 'me', another visitor's id, or nobody
// The line under a name stays what it was (country and local time). Being muted, away or "it" adds a small sign
// in front of it: §m, §z and §i are drawn as pictures by the name tag.
const originText = () => (showOrigin ? [COUNTRY, localTime()].filter(Boolean).join(' · ') : '');
// Every visitor has a four-figure number, made once and kept by their browser, so two with the same name can be told apart.
let myCode = store('ember.code');
if (!/^\d{4}$/.test(String(myCode))) { myCode = String(1000 + Math.floor(Math.random() * 9000)); store('ember.code', myCode); }
const fullName = (name, code) => (code ? `${name} #${code}` : name);
const withMarks = (muted, away, it, text, code) => `${code ? `§#${code}` : ''}${muted ? '§m' : ''}${away ? '§z' : ''}${it ? '§i' : ''}${String(text || '').replace(/§/g, '')}`;
const mySub = () => withMarks(mutedUntil > Date.now(), !!asleepSince, itWho === 'me', originText(), myCode);
const peerSub = (id, data) => withMarks(data.muted > Date.now(), data.asleep, itWho === id, data.sub, data.code);

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
let fireRec = { fuel: 0.5, at: Date.now(), stamp: 0 };
const fuelNow = () => Math.max(FIRE_FLOOR, fireRec.fuel - (Date.now() - fireRec.at) * BURN_PER_MS);
function adoptFire(rec) {
  if (!rec || rec.at > Date.now() + 15000 || rec.at <= fireRec.stamp) return;
  const before = fuelNow();
  fireRec = { fuel: rec.fuel, at: rec.at, stamp: rec.at };
  if (entered && fuelNow() > before + 0.2) { world.flareUp(); audio.whoosh(); }
}
function feedFire() {
  guideFlags.fire = true;
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
// ---------- the guide: always one clear next thing, and a way to find it ----------
// A first visit walks through four steps at the fire. After that the guide points at the next job on the
// keeper's list. Either way there is a line of words, an arrow, a distance, and a column of light at the spot.
const guideFlags = {};
const touch = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
const STARTER = [
  { text: touch ? 'Walk up to the fire. Tap the ground to move' : 'Walk up to the fire. W A S D, or click the ground', where: () => FIRE, done: () => fireDist() < 5.5 },
  { text: touch ? 'Rest by the fire. Tap the words at the bottom' : 'Rest by the fire. Press E', where: () => FIRE, done: () => me.mode !== 'stand' && fireDist() < 5.5 },
  { text: 'Fetch a stick from the woodpile and drop it on the fire', where: () => (held === 1 ? FIRE : WOODPILE), done: () => !!guideFlags.fire },
  { text: 'Greet the keeper, the stag lying by the fire', where: () => keeper, done: () => !!guideFlags.greet },
];
let starterAt = store('ember.starter');
if (!Number.isInteger(starterAt)) starterAt = 0;
const TASK_WHERE = {
  wood: () => (held === 3 ? yard.site : yard.pieces[0] || yard.site), dock: () => ({ x: DOCK.x1 - 0.6, z: 0 }), fire: () => (held === 1 ? FIRE : WOODPILE),
  warm: () => FIRE, hill: () => HILL, mark: () => WALL, bottle: () => CRATE, shake: () => ({ x: SPAWN.x, z: SPAWN.z + 4.6 }),
  butterfly: () => life.meadowNear(me.x, me.z).meadow || FIRE, stone: () => life.stone,
};
let goal = null;
function findGoal() {
  if (itWho === 'me') { const q = taggable(999, true); return { text: q ? `You are it. Catch ${q.p.data.name}` : 'You are it. The others are resting, so wait for one to get up', at: q ? q.p.av : me, step: '' }; }
  if (game && itWho && peers.has(itWho)) return { text: `${peers.get(itWho).data.name} is it. Keep away`, at: peers.get(itWho).av, step: '' };
  if (starterAt < STARTER.length) return { text: STARTER[starterAt].text, at: STARTER[starterAt].where(), step: `${starterAt + 1} of ${STARTER.length}` };
  const st = listState(), id = listToday().find((k) => !st.done.includes(k));
  return id ? { text: TASKS[id], at: TASK_WHERE[id](), step: '' } : null;
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
      if (starterAt >= STARTER.length) addLog('', 'That is how the island works. From here the keeper has three small jobs a day. The next one is at the top of the screen.', 'sys');
    }
    goal = asleepSince ? null : findGoal();
    // The keeper's list stays out of the way until the first four steps are done: one thing at a time.
    $('tasks').dataset.fresh = starterAt < STARTER.length ? 'true' : 'false';
    const el = $('goal');
    el.hidden = !goal;
    if (goal) {
      const label = goal.step ? `${goal.step}. ${goal.text}` : goal.text;
      if (label !== el.dataset.shown) { el.dataset.shown = label; $('goal-text').textContent = label; }
    }
  }
  if (!goal) { beacon.visible = false; return; }
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
  const st = listState(), today = listToday();
  for (const el of [$('list'), $('tasks-list')]) {
    el.textContent = '';
    for (const id of today) {
      const li = document.createElement('li');
      li.textContent = TASKS[id];
      if (st.done.includes(id)) li.className = 'done';
      else if (id === today.find((k) => !st.done.includes(k))) li.className = 'now';
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
// The nearest visitor who is awake and within reach, if there is one.
function companion(reach) {
  let best = null, bd = reach;
  for (const p of peers.values()) { if (p.data.asleep) continue; const d = Math.hypot(p.av.x - me.x, p.av.z - me.z); if (d < bd) { bd = d; best = p; } }
  return best;
}
function addPlanks(n) {
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
  const built = boatTotal >= BOAT_GOAL;
  const crew = boatCrew.slice(0, 40).map((c) => ({ text: c.name, meta: c.n === 1 ? '1 plank' : `${c.n} planks` }));
  const more = boatCrew.length > 40 ? [{ text: `and ${boatCrew.length - 40} more` }] : [];
  openSheet({
    title: built ? 'The boat is built' : 'The keeper\'s boat',
    lines: [
      { text: built
        ? `All ${BOAT_GOAL} planks are on. This boat will carry animals to the other islands. The voyages are still under construction, so for now she waits on the beach.`
        : `${boatTotal} of ${BOAT_GOAL} planks so far. When she is built she will carry animals to the other islands. Driftwood washes up on the beaches, and it counts twice with another animal beside you.` },
      ...(crew.length ? [{ text: built ? 'Built by' : 'Built so far by', kind: 'head' }, ...crew, ...more] : [{ text: 'Nobody has added a plank yet. Yours could be the first.' }]),
    ],
    note: built ? 'More driftwood still helps: it goes into the stores for the first voyage.' : '',
  });
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
  for (const [id, p] of peers) {
    if (p.data.mode !== 'stand' || p.data.asleep || (playersOnly && !inMyGame(p))) continue;
    const d = Math.hypot(p.av.x - me.x, p.av.z - me.z);
    if (d < bd) { bd = d; best = { id, p }; }
  }
  return best;
}
// A stamp later than any seen so far, so the order of tags is the same for everyone whatever their clocks say.
function tagStamp() {
  let at = Math.max(Date.now(), myIt + 1, tagSeen + 1, myTag ? myTag[1] + 1 : 0);
  for (const q of peers.values()) at = Math.max(at, q.data.it + 1, q.data.tagAt + 1);
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
  myInvite = [id, Date.now()]; myInviteAt = nowSec();
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
  const p = peers.get(id);
  if (!p || !entered || itWho !== 'me' || !inMyGame(p)) return;
  const at = tagStamp();
  me.targetYaw = Math.atan2(p.av.x - me.x, p.av.z - me.z);
  playEmote('paw'); audio.pop(760);
  ripple(p.av.x, p.av.z, 4, 0xffb04a);
  myTag = [id, at]; myIt = 0; tagSeen = at;
  flash(`You tagged ${p.data.name}!`, 'Now run');
  addLog('', `You tagged ${p.data.name}. Run!`, 'sys');
  net.note('tag');
  pushPresence(true);
}
// Called with every update from another visitor: have they asked you to play, or just tagged somebody?
function heardTag(id, p, data) {
  if (data.invAt > (p.invAt || 0)) {
    p.invAt = data.invAt;
    if (data.invTo === net.id && entered && !asleepSince && !game && !ignored.has(id)) {
      invitedBy = { id, name: data.name, until: nowSec() + 14 };
      flash(`${data.name} wants to play tag`, touch ? 'Tap the words below to play' : 'Press E to play');
      addLog('', `${data.name} asks you to play tag.`, 'sys');
      audio.pop(620);
    }
  }
  if (!(data.tagAt > (p.tagAt || 0))) return;
  p.tagAt = data.tagAt;
  if (data.tagAt > Date.now() + 60000 || data.tagAt <= tagSeen) return;      // a stamp from the future, or old news
  tagSeen = data.tagAt;
  if (!entered) return;
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
    const q = peers.get(data.tagTo);
    if (!q) return;
    ripple(q.av.x, q.av.z, 4, 0xffb04a);
    addLog('', `${data.name} tagged ${q.data.name}. ${q.data.name} is it.`, 'sys');
    if (game && data.game === game) flash(`${q.data.name} is it`, `${data.name} tagged them`);
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
  if (!g) for (const p of peers.values()) if (p.data.game > g && Date.now() - p.data.game < tagTime * 1000 + 5000) g = p.data.game;
  seenGame = g;
  const players = [];
  if (g) for (const [id, p] of peers) if (p.data.game === g) players.push(id);
  // Who is it: among the players, the newest "made it" that has not been passed on.
  let who = null, at = 0;
  if (game && myIt && (!myTag || myIt > myTag[1])) { who = 'me'; at = myIt; }
  for (const id of players) { const d = peers.get(id).data; if (d.it > d.tagAt && d.it > at && !d.asleep) { who = id; at = d.it; } }
  if (who !== 'me' && myIt && game) { let later = false; for (const id of players) { const d = peers.get(id).data; if (d.it > myIt && d.it > d.tagAt) later = true; } if (later) { myIt = 0; pushPresence(true); } }
  if (who !== itWho) { itWho = who; me.setName(me.name, mySub()); for (const [id, p] of peers) p.av.setName(p.data.name, peerSub(id, p.data)); pushPresence(true); }
  const left = g ? tagTime - (Date.now() - g) / 1000 : 0;
  const itName = who === 'me' ? 'You' : who ? peers.get(who).data.name : '';
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
  el.hidden = !line;
  if (line) {
    $('game-time').textContent = clockText(left);
    if (line !== gameLine) { const [a, b, c] = line.split('|'); $('game-text').textContent = a; $('game-count').textContent = b; $('game-btn').textContent = c; el.classList.toggle('it', who === 'me'); }
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
    for (const id of players) { const p = peers.get(id); if (p.av.group.visible !== false && p.data.mode === 'stand' && k < 14) ring(p.av, who === id); }
  }
  for (; k < tagRings.length; k++) tagRings[k].visible = false;
  const av = who === 'me' ? me : who ? peers.get(who).av : null;
  itMarker.visible = !!av && entered && av.group.visible !== false;
  if (itMarker.visible) {
    const sp = SPECIES[who === 'me' ? me.species : peers.get(who).data.species];
    itMarker.position.set(av.x, av.y + (av.tag ? av.tag.position.y : sp.height * 1.3) + 0.55 + Math.sin(t * 5) * 0.08, av.z);
    itMarker.rotation.y = t * 2.4;
  }
}
$('game-btn').addEventListener('click', () => { if (game) leaveTag(); else joinTag(); canvas.focus(); });

// Calling and answering. A call you hear can be answered for a few seconds; a call nobody answers is picked up
// by the owl or Clover if they are near, and otherwise by the keeper, so no call falls flat.
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
    if (!entered) return;
    keeper.play('call');
    audio.call('bellow', Math.max(0.1, hearFrom(keeper.x, keeper.z, 55)) * 0.75);
    ripple(keeper.x, keeper.z, 5, 0xffc978);
    if (mine && t - keeperCallLogAt > 40) { keeperCallLogAt = t; addLog('', 'By the fire, the keeper lifts his head and answers you.', 'sys'); }
  }
}
// Every call on the island passes through here: yours (by = null) and everyone else's.
function noteCall(by, x, z) {
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
  if (stargazing) { life.meteor(emoteMsg[1] % 100000); did('hill'); }      // call at the sky from the hill and a star answers
}
// Greeting: a dip of the head and a wagging tail.
function greet(av, name) {
  if (av === keeper) guideFlags.greet = true;
  me.targetYaw = Math.atan2(av.x - me.x, av.z - me.z);
  playEmote('greet');
  addLog('', `You greet ${name}.`, 'sys');
  if (av === critters.cow) critters.moo();
  if (av === keeper) setTimeout(() => { keeper.play('greet'); keeperSays(keeperHello()); keeperNext = Math.max(keeperNext, t + 30); }, 700);
}

// ---------- chat ----------
const logEl = $('log');
function addLog(name, text, kind, peerId) {
  const row = document.createElement('div');
  row.className = 'line' + (kind ? ' ' + kind : '');
  if (name) {
    const b = document.createElement('b');
    b.textContent = name;
    // Another visitor's name can be pressed, to stop hearing them or report them.
    if (peerId) { b.className = 'whom'; b.tabIndex = 0; b.setAttribute('role', 'button'); b.title = 'Stop hearing or report'; b.onclick = () => openVisitor(peerId); b.onkeydown = (e) => { if (e.key === 'Enter') openVisitor(peerId); }; }
    row.appendChild(b);
    row.appendChild(document.createTextNode(' ' + text));
  } else {
    row.textContent = text;
  }
  logEl.appendChild(row);
  while (logEl.children.length > 7) logEl.removeChild(logEl.firstChild);
  setTimeout(() => row.classList.add('old'), 14000);
}
// Muted: what you type is not passed on for a while. The island decides for how long; without it, ten minutes.
function setMuted(until, why) {
  const was = mutedUntil > Date.now();
  mutedUntil = Math.max(mutedUntil, until);
  store('ember.mute', mutedUntil);
  if (!was) addLog('', why === 'reports'
    ? `Several animals reported you, so you are muted for ${Math.ceil((mutedUntil - Date.now()) / 60000)} minutes. You can still walk, call and play.`
    : `That is not said on this island. You are muted for ${Math.ceil((mutedUntil - Date.now()) / 60000)} minutes. You can still walk, call and play.`, 'sys');
  me.setName(me.name, mySub());
  pushPresence(true);
}
{ const m = store('ember.mute'); if (Number.isFinite(m) && m > Date.now()) mutedUntil = Math.min(m, Date.now() + 3600000); }
// A note for whoever looks after the island.
function openFeedback() {
  openSheet({
    title: 'Tell the keeper',
    lines: [{ text: 'What did you like? What was confusing, broken or missing? Whoever looks after the island reads every note.' }],
    input: { free: true, max: 500, placeholder: 'Your note', button: 'Send it', submit: async (text) => {
      if (text.length < 3) { $('sheet-note').textContent = 'Write a few words first.'; return; }
      let status = 0;
      try { status = (await fetch('/room/feedback', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text, name: fullName(me.name, myCode) }) })).status; } catch (e) { status = 0; }
      if (status === 200) { closeSheet(); flash('Thank you', 'Your note is with the keeper'); audio.pop(660); addLog('', 'Your note is with the keeper. Thank you.', 'sys'); }
      else $('sheet-note').textContent = status === 429 ? 'That is plenty for one day, thank you. Come back tomorrow with more.' : 'That did not go through. Try again in a moment.';
    } },
    note: 'No name or address is attached, only the animal you are today.',
  });
}
$('btn-feedback').addEventListener('click', () => { openFeedback(); });
// Another visitor: stop hearing them, or tell the keeper what they said.
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
      addLog('', sent ? `Thank you. The keeper will read your report about ${name}, and you will not hear them again this visit.` : `You will not hear ${name} again this visit.`, 'sys');
    } },
    extra: { label: deaf ? `Hear ${name} again` : `Stop hearing ${name}`, run: () => { if (deaf) ignored.delete(id); else ignored.add(id); closeSheet(); addLog('', deaf ? `You can hear ${name} again.` : `You will not hear ${name} until you leave. They are not told.`, 'sys'); } },
    note: p.reported ? 'You have reported this animal.' : 'A report sends the keeper the last things this animal said. Animals reported by several others are muted.',
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
  if (mutedUntil > Date.now()) { addLog('', `You are muted, so nobody would hear that. ${Math.ceil((mutedUntil - Date.now()) / 60000)} more minutes. Everything else on the island still works.`, 'sys'); return; }
  const verdict = judge(text);
  if (verdict === 'mute') { net.selfMute(); setMuted(Date.now() + 600000, 'words'); return; }
  if (verdict === 'soft') { addLog('', 'Gently, please. That one was not sent.', 'sys'); return; }
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
    v: 1, n: me.name, k: myCode, s: me.species, c: me.palette, t: originText(),
    x: Math.round(me.x * 100) / 100, z: Math.round(me.z * 100) / 100, r: Math.round(me.targetYaw * 100) / 100,
    st: me.mode === 'sit' ? 1 : me.mode === 'lie' ? (stargazing ? 3 : 2) : 0, se: mySeat,
    m: sayMsg, e: emoteMsg, h: held, tl: Math.round(warmth * 10) / 10, w: Math.round(wet * 10) / 10, b: hasButterfly ? 1 : 0, zz: asleepSince, nv: nights,
    fr: fireRec.stamp ? [Math.round(fireRec.fuel * 1000) / 1000, fireRec.at] : null,
    it: myIt, tg: myTag, gm: game, ti: myInvite, mu: mutedUntil > Date.now() ? mutedUntil : 0,
  };
}
const net = createNet({
  onStatus() { updateCount(); },
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
        p = { av, data, sayId: data.say ? data.say.id : 0, emoteId: data.emote ? data.emote.id : 0, fade: 1, tagAt: data.tagAt, invAt: data.invAt };
        peers.set(id, p);
        if (entered) addLog('', `${data.name} came ashore.`, 'sys');
      }
      p.data = data;
      heardTag(id, p, data);
      p.av.setLook(data.species, data.palette);
      p.av.setName(data.name, peerSub(id, data));
      p.av.mode = data.mode;
      p.av.stargaze = data.gaze;
      if (data.say && data.say.id !== p.sayId) {
        p.sayId = data.say.id;
        // Not shown: anything from the muted or from someone you chose not to hear, and words that slipped past.
        if (p.fade > 0.05 && !ignored.has(id) && !(data.muted > Date.now()) && !judge(data.say.text)) {
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
  $('count').textContent = n === 1 ? 'Just you and the keeper' : `${n} visitors on the island`;
}
updateCount();

// ---------- what the island remembers ----------
const saved = createStore();
saved.watchBoat((total, state, crew) => { boatTotal = total; if (crew) boatCrew = crew; else if (total && !boatCrew.length) boatCrew = [{ name: fullName(me.name, myCode), n: total }]; yard.setProgress(total); });
const sheet = $('sheet');
let sheetSubmit = null, stopCarvings = null, sheetFree = false;
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
    sheetSubmit = input.submit; sheetFree = !!input.free;
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
  // Marks on the wall and notes in bottles are held to the same words as talk.
  if (judge(box.value) && !sheetFree) { $('sheet-note').textContent = 'Those words are not left on this island. Try it another way.'; btn.disabled = false; return; }
  try { await sheetSubmit(tidyMessage(box.value, Math.max(200, box.maxLength || 0))); } finally { btn.disabled = false; }
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
  const info = { first: store('ember.day') !== utcDay ? 1 : 0, fresh: store('ember.been') ? 0 : 1, step: starterAt };
  net.join((q) => {
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
  myIt = 0; myTag = null; itWho = null; game = 0; myInvite = null; invitedBy = null; ignored.clear();
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
  lastInputAt = Date.now();
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
  if (!asleepSince && Date.now() - lastInputAt > idleAfter) {
    asleepSince = Date.now(); me.asleep = true;
    if (me.mode === 'stand') { laidByNap = true; setMode('lie', nearestFreeSeat(2.0)); }
    else if (me.mode === 'sit') { laidByNap = false; setMode('lie', mySeat); }
    addLog('', 'You have dozed off. Touch anything to wake up.', 'sys');
  }
  if (asleepSince) { me.setName(me.name, mySub()); pushPresence(true); }
}, 4000);

function comeAshore(q = {}) {
  if (entered) return;
  entered = true;
  lastInputAt = Date.now();
  $('hint').textContent = '';
  $('queue').hidden = true;
  store('ember.identity', identity);
  document.body.classList.add('playing');
  me.targetYaw = Math.PI;      // turn to face the fire
  addLog('', 'You came ashore. The fire is straight ahead.', 'sys');
  // Signs of the others: how many have been here today, and whose tracks are still on the ground.
  // The island knows which country the connection comes from, which beats guessing from the time zone.
  if (/^[A-Z]{2}$/.test(String(q.cc || ''))) { try { COUNTRY = new Intl.DisplayNames(['en'], { type: 'region' }).of(q.cc) || COUNTRY; } catch (e) { /* keep the guess */ } me.setName(me.name, mySub()); }
  if (q.mu > Date.now()) { mutedUntil = Math.max(mutedUntil, q.mu); me.setName(me.name, mySub()); }
  const laid = traces.setLeft(q.tracks, (sp) => !!(SPECIES[sp] && SPECIES[sp].hoof), (sp) => (SPECIES[sp] ? SPECIES[sp].height : 1));
  if (Number.isFinite(q.today)) {
    const others = Math.max(0, q.today - 1);
    const line = others === 0 ? 'You are the first animal ashore today.' : others === 1 ? 'One other animal has been here today.' : `${others} other animals have been here today.`;
    setTimeout(() => addLog('', !laid ? line : others ? `${line} Some of their tracks are still on the ground.` : `${line} Tracks from earlier visitors are still on the ground.`, 'sys'), 2500);
  }
  pushPresence(true);
  canvas.focus();
  // If nobody here already knows how the fire is doing, your view of it becomes the shared one.
  setTimeout(() => { if (!fireRec.stamp) { fireRec.stamp = fireRec.at; pushPresence(true); } }, 3000);
  if (!comeAshore.before) { comeAshore.before = true; welcomeBack(); } else setTimeout(lookForBottle, 4000);
  showList();
  setTimeout(() => { if (starterAt >= STARTER.length && listState().done.length < 3) addLog('', 'The keeper has three small jobs today. They are listed on the left, and the next one is at the top of the screen.', 'sys'); }, 9000);
}
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
    const tr = traces.near(me.x, me.z);
    if (tr && !who && drift < 0) opts.push({ label: 'Sniff at the tracks', run: () => sniffTracks(tr) });
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
  // Tag: whoever is it tags the nearest animal on its feet. With no game on, anyone close can be asked to play.
  if (me.mode === 'stand') {
    const near = taggable(TAG_REACH, false), prey = taggable(TAG_REACH, true);
    if (itWho === 'me') { if (prey && nowSec() - myItAt > TAG_GRACE) { if (!alt && main) alt = main; main = { label: `Tag ${prey.p.data.name}`, run: () => tagPeer(prey.id) }; } }
    else if (invitedBy) { if (!alt && main) alt = main; main = { label: `Play tag with ${invitedBy.name}`, run: acceptTag }; }
    else if (!game && !held && !myInvite && near) {
      const play = seenGame ? (near.p.data.game === seenGame ? { label: 'Join the game of tag', run: joinTag } : null) : { label: `Ask ${near.p.data.name} to play tag`, run: () => inviteTag(near.id) };
      if (play) { if (!main) main = play; else if (!alt) alt = play; }
    }
  }
  // A call you just heard comes first: answering it is the main thing to do for a few seconds.
  if (answerTo && t < answerTo.until && !held) { if (!alt && main) alt = main; main = { label: `Answer ${answerTo.name}`, run: callOut }; }
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
const viewFrustum = new THREE.Frustum(), viewMatrix = new THREE.Matrix4(), viewSphere = new THREE.Sphere(new THREE.Vector3(), 2.4);
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

  viewFrustum.setFromProjectionMatrix(viewMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
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
  audio.tick(dt, { fireDist: Math.hypot(camPos.x - FIRE.x, camPos.z - FIRE.z), shore: shoreProximity(me.x, me.z), heat: world.heat });
  if (entered) { updateActions(); pushPresence(false); }
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// A small handle for checking the page from a test script.
window.__ember = {
  me, peers, world, camera, renderer, keeper, POSE, life,
  yard, did, listToday,
  critters,
  leaveIsland,
  get goal() { return goal ? { text: goal.text, x: goal.at.x, z: goal.at.z, step: goal.step } : null; },
  get starterAt() { return starterAt; },
  traces, companion, noteCall, setHeld, addToBoat, tagPeer, inviteTag, acceptTag, joinTag, leaveTag,
  get game() { return game; },
  get seenGame() { return seenGame; },
  get it() { return itWho; },
  set tagTime(v) { tagTime = v; },
  get netId() { return net.id; },
  get mutedUntil() { return mutedUntil; },
  get country() { return COUNTRY; },
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
  cam(yaw, pitch, dist) { camYaw = yaw; if (pitch !== undefined) camPitch = pitch; if (dist !== undefined) camDist = dist; },
  turn(d) { camYaw += d; },
  setMode, standUp, sendChat, playEmote, callOut, toggleRest, comeAshore,
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
