// Things to find, and the journal that remembers them.
// Some are caught (fish), some picked up off the sand, some simply seen. Which ones show depends on the hour, the
// weather and where you are, so the island is worth walking at different times. The journal is kept on the device.
import * as THREE from 'three';
import { shoreRadius, terrainHeight, HILL } from './terrain.js';
import { makeGlowTexture } from './labels.js';
import { timeNow } from './now.js';
import { loadProps } from './props.js';

export const FINDS = [
  { id: 'sprat', group: 'From the dock', name: 'Silver sprat', hint: 'Paw at the water from the end of the dock, by day.' },
  { id: 'perch', group: 'From the dock', name: 'Striped perch', hint: 'A daytime fish, less common than the sprat.' },
  { id: 'moonfish', group: 'From the dock', name: 'Moonfish', hint: 'Fish from the dock after dark.' },
  { id: 'rainfish', group: 'From the dock', name: 'Rain minnow', hint: 'They come up when it rains.' },
  { id: 'emberfin', group: 'From the dock', name: 'Emberfin', hint: 'It only bites during campfire hour.' },
  { id: 'oldone', group: 'From the dock', name: 'The old one', hint: 'Very rarely, something big takes the paw.' },
  { id: 'cockle', group: 'On the sand', name: 'Cockle shell', hint: 'On the beaches, most of the time.' },
  { id: 'whelk', group: 'On the sand', name: 'Whelk shell', hint: 'On the beaches, most of the time.' },
  { id: 'seaglass', group: 'On the sand', name: 'Sea glass', hint: 'Washed up during rain, and for a while after.' },
  { id: 'moonshell', group: 'On the sand', name: 'Moon shell', hint: 'It only shows on the sand at night.' },
  { id: 'conch', group: 'On the sand', name: 'Pink conch', hint: 'Rare. Walk the whole shore.' },
  { id: 'feather', group: 'On the sand', name: 'Gull feather', hint: 'Up on the hill, where the wind drops them.' },
  { id: 'butterfly', group: 'In the grass', name: 'Meadow butterfly', hint: 'Stand still among the flowers by day.' },
  { id: 'moth', group: 'In the grass', name: 'Lantern moth', hint: 'Stand still among the flowers after dark.' },
  { id: 'stone', group: 'In the grass', name: 'The warm stone', hint: 'Lie on the flat stone while the sun is on it.' },
  { id: 'star', group: 'Sky and sea', name: 'Shooting star', hint: 'Lie on the hilltop at night and call out.' },
  { id: 'dolphin', group: 'Sky and sea', name: 'Dolphins', hint: 'They come alongside the boat on her way round.' },
  { id: 'whale', group: 'Sky and sea', name: 'A whale', hint: 'Far out, now and then. Be on the dock, the hill or the boat.' },
];
export const FIND = Object.fromEntries(FINDS.map((f) => [f.id, f]));

// Which fish took the paw.
export function fishKind({ dark, rain, campfire }, r = Math.random()) {
  if (r < 0.04) return 'oldone';
  if (campfire && r < 0.5) return 'emberfin';
  if (rain > 0.3 && r < 0.6) return 'rainfish';
  if (dark > 0.55) return r < 0.85 ? 'moonfish' : 'sprat';
  return r < 0.35 ? 'perch' : 'sprat';
}

const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
const TURN = 8 * 60000;          // what lies on the sand changes every eight minutes
// Small things lying about to be picked up: shells and glass along the shore, feathers on the hill.
export function createFinds(scene) {
  const mat = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6, flatShading: true, emissive: c, emissiveIntensity: 0.12, ...o });
  const shapes = {
    cockle: () => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.16, 7, 4, 0, Math.PI * 2, 0, Math.PI / 2), mat(0xf1dcc0)); m.scale.set(1, 0.55, 0.85); return m; },
    whelk: () => { const m = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.34, 6), mat(0xc9a37a)); m.rotation.z = 1.25; m.position.y = 0.09; return m; },
    seaglass: () => { const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.12), mat(0x6fd3b0, { transparent: true, opacity: 0.8, roughness: 0.25 })); m.scale.set(1, 0.45, 0.8); m.position.y = 0.05; return m; },
    moonshell: () => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.13, 7, 5), mat(0xeaf2ff, { emissiveIntensity: 0.9 })); m.scale.y = 0.7; m.position.y = 0.07; return m; },
    conch: () => { const m = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.4, 7), mat(0xf5a3a8)); m.rotation.z = 1.2; m.position.y = 0.12; return m; },
    feather: () => { const m = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.46), mat(0xf7f7f2, { side: THREE.DoubleSide })); m.rotation.set(-1.4, 0.4, 0.3); m.position.y = 0.05; return m; },
  };
  const glow = makeGlowTexture();
  const spots = [];
  for (let i = 0; i < 16; i++) {
    const a = 0.1 + i * 0.3927 + (i % 3) * 0.05, r = shoreRadius(a) * (0.9 + (i % 4) * 0.02);
    spots.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, hill: false });
  }
  for (let i = 0; i < 3; i++) { const a = i * 2.1 + 0.4; spots.push({ x: HILL.x + Math.cos(a) * 3.2, z: HILL.z + Math.sin(a) * 3.2, hill: true }); }
  const items = spots.map((s, i) => {
    const g = new THREE.Group(); g.position.set(s.x, terrainHeight(s.x, s.z) + 0.02, s.z); g.rotation.y = i * 1.7; g.visible = false; scene.add(g);
    const glint = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: 0xfff1c9, transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending }));
    glint.scale.setScalar(0.9); glint.position.y = 0.2; g.add(glint);
    return { ...s, g, glint, kind: '', mesh: null, turn: -1, taken: false };
  });
  // The shells and feather are modelled (props.glb); the plain shapes above stand in until they arrive.
  loadProps().then((make) => {
    if (!make || !make('find_cockle')) return;
    for (const kind of Object.keys(shapes)) shapes[kind] = () => {
      const m = make('find_' + kind);
      m.traverse((o) => { if (o.isMesh && o.material.name === 'f_seaglass') { o.material.transparent = true; o.material.opacity = 0.82; } });
      return m;
    };
    for (const it of items) if (it.kind) { if (it.mesh) it.g.remove(it.mesh); it.mesh = shapes[it.kind](); it.g.add(it.mesh); }
  });
  let rainedAt = 0;
  const api = {
    // dark 0..1, rain 0..1: decides which of the things lying about can be seen just now.
    update(t, { dark, rain }) {
      const now = timeNow(), turn = Math.floor(now / TURN);
      if (rain > 0.3) rainedAt = now;
      items.forEach((it, i) => {
        if (it.turn !== turn) {
          // A new turn of the tide: something else lies here, or nothing.
          it.turn = turn; it.taken = false;
          const h = hash(turn * 31 + i * 7.3), h2 = hash(turn * 17 + i * 3.1);
          const kind = it.hill ? (h < 0.45 ? 'feather' : '') : h < 0.03 ? 'conch' : h < 0.2 ? 'cockle' : h < 0.36 ? 'whelk' : h < 0.5 ? 'moonshell' : h < 0.62 ? 'seaglass' : '';
          if (kind !== it.kind) { if (it.mesh) it.g.remove(it.mesh); it.mesh = kind ? shapes[kind]() : null; if (it.mesh) { it.mesh.castShadow = true; it.g.add(it.mesh); } it.kind = kind; }
          it.g.rotation.y = h2 * 6.28;
        }
        const shows = !!it.kind && !it.taken && (it.kind !== 'moonshell' || dark > 0.55) && (it.kind !== 'seaglass' || now - rainedAt < 12 * 60000);
        it.g.visible = shows;
        if (shows) it.glint.material.opacity = 0.28 + 0.2 * Math.sin(t * 2.2 + i);
      });
    },
    // The thing within reach of (x, z), if any: its index, or -1.
    near(x, z) { return items.findIndex((it) => it.g.visible && Math.hypot(it.x - x, it.z - z) < 1.6); },
    take(i) { const it = items[i]; if (!it || !it.g.visible) return ''; it.taken = true; it.g.visible = false; return it.kind; },
    get lying() { return items.filter((it) => it.g.visible).map((it) => ({ x: it.x, z: it.z, kind: it.kind })); },
    // For tests: put one of a kind at the first shore spot.
    plant(kind, i = 0) { const it = items[i]; if (it.mesh) it.g.remove(it.mesh); it.kind = kind; it.mesh = shapes[kind](); it.g.add(it.mesh); it.taken = false; it.turn = Math.floor(timeNow() / TURN); return { x: it.x, z: it.z }; },
  };
  return api;
}
