// The animals visitors walk around as. Four-legged models come from quad.js; the simple upright shapes
// further down are only a stand-in for when a model cannot be loaded.
import * as THREE from 'three';
import { quadState, requestQuad, buildQuad } from './quad.js';
import { lerp, clamp } from './terrain.js';
import { makeNameTag, makeBubble, makeGlowTexture } from './labels.js';
import { loadProps } from './props.js';
import { ITEMS, WEAR_IDS } from './items.js';

// Each species is a four-legged model (see quad.js). `tints` are fur colour variants: null keeps the artist's colour.
// `toy` is the simple stand-in shape used only if a model cannot be loaded.
export const SPECIES = [
  { id: 'fox', label: 'Fox', height: 0.8, call: 'yip', callLabel: 'Yip', calls: 'yips', tints: [null, '#8e8f9c', '#ece7df', '#6b3a22'], toy: ['fox', '#e2742f', '#fff1e0', '#3a2a22'] },
  { id: 'shiba', label: 'Shiba', height: 0.8, call: 'bark', callLabel: 'Bark', calls: 'barks', tints: [null, '#2e2a28', '#e9dcc4', '#a8552a'], toy: ['cat', '#e09a4a', '#fff0dc', '#f4a6b4'] },
  { id: 'husky', label: 'Husky', height: 0.9, call: 'howl', callLabel: 'Howl', calls: 'howls', tints: [null, '#7a4a32', '#9aa2ad', '#2a2a2e'], toy: ['raccoon', '#8d8f98', '#eceaf0', '#2b2b33'] },
  { id: 'wolf', label: 'Wolf', height: 0.95, call: 'howl', callLabel: 'Howl', calls: 'howls', tints: [null, '#e6e4de', '#3a3632', '#8a6a4c'], toy: ['raccoon', '#74808c', '#e6eef4', '#232a31'] },
  { id: 'deer', label: 'Deer', height: 1.15, hoof: true, call: 'bleat', callLabel: 'Bleat', calls: 'bleats', tints: [null, '#b08a5c', '#6e4a34'], toy: ['rabbit', '#a8846a', '#f3e6d6', '#f4a6b4'] },
  { id: 'stag', label: 'Stag', height: 1.5, hoof: true, call: 'bellow', callLabel: 'Bellow', calls: 'bellows', tints: [null, '#7a5a3c', '#4a3626'], toy: ['bear', '#6b4a34', '#d9b98f', '#2a1c13'] },
  { id: 'alpaca', label: 'Alpaca', height: 1.3, hoof: true, call: 'hum', callLabel: 'Hum', calls: 'hums', tints: [null, '#efe6d6', '#c9a070', '#3a3230'], toy: ['rabbit', '#d9d2c8', '#ffffff', '#f4a6b4'] },
  { id: 'donkey', label: 'Donkey', height: 1.2, hoof: true, call: 'bray', callLabel: 'Bray', calls: 'brays', tints: [null, '#7a5c44', '#d8d2c6'], toy: ['bear', '#8a5a3c', '#e8cfa6', '#33221a'] },
  // Not a costume for visitors: the cow who lives on the island.
  { id: 'cow', label: 'Cow', height: 1.4, hoof: true, npc: true, call: 'moo', callLabel: 'Moo', calls: 'moos', tints: [null], toy: ['bear', '#e8e2d6', '#ffffff', '#33221a'] },
];
export const PLAYABLE = SPECIES.filter((s) => !s.npc).length;
for (const sp of SPECIES) sp.palettes = sp.tints;   // other code counts variants through `palettes`

export const NAME_WORDS = ['Sleepy', 'Quiet', 'Gentle', 'Drowsy', 'Mellow', 'Cosy', 'Wandering', 'Misty', 'Dozy', 'Humming', 'Starlit', 'Mossy', 'Salty', 'Dreamy', 'Curious', 'Patient', 'Shy', 'Muddy', 'Moonlit', 'Toasty', 'Soft', 'Late', 'Easy', 'Hazy'];

let shadowTex = null;
const EMBER = new THREE.Color(0xff8a3c);

function mat(color, extra = {}) {
  // A little self-glow keeps fur colours readable under moonlight.
  return new THREE.MeshStandardMaterial({ color, roughness: 0.82, metalness: 0, emissive: color, emissiveIntensity: 0.26, ...extra });
}
function sphere(r, material, sx = 1, sy = 1, sz = 1, ws = 12, hs = 9) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, ws, hs), material);
  m.scale.set(sx, sy, sz);
  return m;
}
function cone(r, h, material, seg = 8) {
  return new THREE.Mesh(new THREE.ConeGeometry(r, h, seg), material);
}
function capsule(r, len, material) {
  return new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 4, 8), material);
}
function at(mesh, x, y, z) { mesh.position.set(x, y, z); return mesh; }

function buildBody(speciesIndex, paletteIndex) {
  const spec = SPECIES[speciesIndex];
  const pal = spec.toy.slice(1);
  const M = { main: mat(pal[0]), light: mat(pal[1]), accent: mat(pal[2]), eye: mat('#15151c', { roughness: 0.3 }), white: mat('#ffffff', { roughness: 0.4 }) };
  const id = spec.toy[0];
  const rig = new THREE.Group();

  // Torso.
  const torso = new THREE.Group();
  torso.position.y = 0.5;
  rig.add(torso);
  torso.add(sphere(0.3, M.main, 1, 1.12, 0.92, 24, 16));
  torso.add(at(sphere(0.2, M.light, 1, 1.12, 0.6, 24, 16), 0, -0.04, 0.185));

  // Head.
  const head = new THREE.Group();
  head.position.y = 0.98;
  rig.add(head);
  head.add(sphere(0.31, M.main, 1.06, 0.95, 1, 24, 16));
  const eyes = [];
  const addEyes = (ex, ey, ez, r) => {
    for (const s of [-1, 1]) {
      const e = at(sphere(r, M.eye, 1, 1.15, 0.7, 8, 6), s * ex, ey, ez);
      head.add(e);
      eyes.push(e);
      head.add(at(sphere(r * 0.32, M.white, 1, 1, 1, 6, 4), s * ex + r * 0.3, ey + r * 0.35, ez + r * 0.55));
    }
  };

  // Limbs. The pivot sits at the shoulder or hip; the limb hangs down from it.
  const limb = (x, y, r, len, material, foot) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, 0);
    const c = capsule(r, len, material);
    c.position.y = -(len / 2 + r * 0.6);
    pivot.add(c);
    if (foot) pivot.add(at(sphere(r * 1.25, foot, 1, 0.6, 1.5, 8, 6), 0, -(len + r * 1.5), r * 0.6));
    rig.add(pivot);
    return pivot;
  };
  let armL, armR;
  const legL = limb(0.13, 0.3, 0.085, 0.12, M.main, id === 'owl' ? M.accent : M.main);
  const legR = limb(-0.13, 0.3, 0.085, 0.12, M.main, id === 'owl' ? M.accent : M.main);
  if (id === 'owl') {
    const wing = (s) => {
      const pivot = new THREE.Group();
      pivot.position.set(s * 0.27, 0.72, 0);
      pivot.add(at(sphere(0.2, M.main, 0.38, 1.15, 0.85), 0, -0.2, 0));
      rig.add(pivot);
      return pivot;
    };
    armL = wing(1); armR = wing(-1);
  } else {
    armL = limb(0.29, 0.7, 0.068, 0.2, M.main, null);
    armR = limb(-0.29, 0.7, 0.068, 0.2, M.main, null);
  }

  // Tail.
  const tail = new THREE.Group();
  tail.position.set(0, 0.36, -0.24);
  rig.add(tail);

  // Species features.
  if (id === 'fox') {
    addEyes(0.125, 0.03, 0.265, 0.042);
    head.add(at(sphere(0.13, M.light, 1.1, 0.8, 1.1), 0, -0.08, 0.22));
    head.add(at(sphere(0.036, M.accent, 1, 1, 1, 6, 5), 0, -0.04, 0.355));
    for (const s of [-1, 1]) {
      const ear = cone(0.11, 0.26, M.main, 4); ear.position.set(s * 0.18, 0.33, 0); ear.rotation.z = -s * 0.25; head.add(ear);
      const tip = cone(0.055, 0.12, M.accent, 4); tip.position.set(s * 0.198, 0.405, 0); tip.rotation.z = -s * 0.25; head.add(tip);
    }
    const t = sphere(0.15, M.main, 1, 1, 2.1); t.position.set(0, 0.12, -0.26); t.rotation.x = 0.6; tail.add(t);
    const tip = sphere(0.1, M.light, 1, 1, 1.3); tip.position.set(0, 0.29, -0.5); tip.rotation.x = 0.6; tail.add(tip);
  } else if (id === 'otter') {
    addEyes(0.12, 0.04, 0.27, 0.04);
    head.add(at(sphere(0.14, M.light, 1.2, 0.8, 1), 0, -0.08, 0.22));
    head.add(at(sphere(0.04, M.accent, 1.2, 0.9, 1, 6, 5), 0, -0.03, 0.35));
    for (const s of [-1, 1]) head.add(at(sphere(0.06, M.main), s * 0.27, 0.2, -0.02));
    const t = cone(0.11, 0.62, M.main, 7); t.rotation.x = -1.95; t.position.set(0, -0.12, -0.28); tail.add(t);
  } else if (id === 'owl') {
    for (const s of [-1, 1]) head.add(at(sphere(0.135, M.light, 1, 1, 0.3), s * 0.125, 0.03, 0.245));
    addEyes(0.125, 0.03, 0.285, 0.058);
    const beak = cone(0.045, 0.1, M.accent, 4); beak.rotation.x = Math.PI / 2 + 0.5; beak.position.set(0, -0.05, 0.32); head.add(beak);
    for (const s of [-1, 1]) { const tuft = cone(0.06, 0.18, M.main, 4); tuft.position.set(s * 0.2, 0.3, 0); tuft.rotation.z = -s * 0.5; head.add(tuft); }
    const t = sphere(0.12, M.main, 1, 0.35, 1.4); t.position.set(0, -0.05, -0.1); t.rotation.x = -0.5; tail.add(t);
  } else if (id === 'frog') {
    for (const s of [-1, 1]) head.add(at(sphere(0.105, M.main), s * 0.15, 0.27, 0.1));
    addEyes(0.15, 0.285, 0.165, 0.05);
    const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.012, 4, 12, Math.PI), M.accent);
    mouth.rotation.x = Math.PI / 2 + 0.25; mouth.rotation.z = Math.PI; mouth.position.set(0, -0.1, 0.19); mouth.scale.set(1, 1, 1);
    head.add(mouth);
    for (const s of [-1, 1]) head.add(at(sphere(0.045, mat('#f4a6b4'), 1, 0.6, 0.5), s * 0.22, -0.06, 0.2));
  } else if (id === 'raccoon') {
    for (const s of [-1, 1]) head.add(at(sphere(0.1, M.accent, 1.25, 0.85, 0.35), s * 0.135, 0.03, 0.245));
    addEyes(0.125, 0.035, 0.28, 0.04);
    head.add(at(sphere(0.12, M.light, 1.1, 0.8, 1.1), 0, -0.09, 0.22));
    head.add(at(sphere(0.036, M.accent, 1, 1, 1, 6, 5), 0, -0.05, 0.35));
    for (const s of [-1, 1]) { const ear = cone(0.1, 0.17, M.accent, 5); ear.position.set(s * 0.2, 0.28, 0); ear.rotation.z = -s * 0.35; head.add(ear); }
    const tg = new THREE.Group(); tg.position.set(0, 0.1, -0.24); tg.rotation.x = 0.55; tail.add(tg);
    tg.add(sphere(0.13, M.main, 1, 1, 2.2));
    for (const z of [-0.14, 0.02, 0.18]) { const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.125, 0.125, 0.06, 10), M.accent); ring.rotation.x = Math.PI / 2; ring.position.z = z - 0.02; ring.scale.setScalar(1 - Math.abs(z) * 1.2); tg.add(ring); }
  } else if (id === 'cat') {
    addEyes(0.125, 0.03, 0.27, 0.044);
    head.add(at(sphere(0.085, M.light, 1.3, 0.75, 1), 0, -0.085, 0.25));
    head.add(at(sphere(0.026, M.accent, 1.2, 0.8, 1, 6, 5), 0, -0.05, 0.325));
    for (const s of [-1, 1]) {
      const ear = cone(0.12, 0.2, M.main, 4); ear.position.set(s * 0.19, 0.3, 0); ear.rotation.z = -s * 0.3; head.add(ear);
      const inner = cone(0.07, 0.12, M.accent, 4); inner.position.set(s * 0.19, 0.29, 0.03); inner.rotation.z = -s * 0.3; head.add(inner);
    }
    let cur = tail;
    for (let i = 0; i < 4; i++) {
      const seg = new THREE.Group();
      seg.position.set(0, i === 0 ? 0 : 0.17, 0);
      seg.rotation.x = i === 0 ? -1.2 : 0.42;
      const c = capsule(0.042, 0.14, M.main); c.position.y = 0.09; seg.add(c);
      cur.add(seg); cur = seg;
    }
  } else if (id === 'rabbit') {
    addEyes(0.125, 0.03, 0.27, 0.042);
    head.add(at(sphere(0.1, M.light, 1.25, 0.8, 1), 0, -0.09, 0.24));
    head.add(at(sphere(0.026, M.accent, 1.2, 0.8, 1, 6, 5), 0, -0.05, 0.33));
    for (const s of [-1, 1]) {
      const pivot = new THREE.Group(); pivot.position.set(s * 0.12, 0.24, -0.02); pivot.rotation.z = -s * 0.16; pivot.rotation.x = -0.12;
      const ear = capsule(0.065, 0.3, M.main); ear.position.y = 0.2; ear.scale.z = 0.6; pivot.add(ear);
      const inner = capsule(0.035, 0.24, M.accent); inner.position.set(0, 0.2, 0.03); inner.scale.z = 0.5; pivot.add(inner);
      head.add(pivot);
    }
    tail.add(at(sphere(0.1, M.light), 0, 0, -0.06));
  } else if (id === 'bear') {
    addEyes(0.12, 0.04, 0.275, 0.038);
    head.add(at(sphere(0.14, M.light, 1.1, 0.85, 1), 0, -0.085, 0.22));
    head.add(at(sphere(0.045, M.accent, 1.2, 0.85, 1, 6, 5), 0, -0.04, 0.345));
    for (const s of [-1, 1]) {
      head.add(at(sphere(0.095, M.main), s * 0.22, 0.25, -0.02));
      head.add(at(sphere(0.055, M.light, 1, 1, 0.5), s * 0.22, 0.25, 0.04));
    }
    tail.add(at(sphere(0.075, M.main), 0, 0.02, -0.04));
  }

  // Rewards for nights visited: a scarf, then a lantern, then a firefly (the firefly lives outside the rig).
  const reddish = /^#(e|c|f0)/i.test(pal[0]) && id === 'fox';
  const scarfMat = mat(reddish ? '#3fa7a0' : '#d9483b');
  const scarf = new THREE.Group();
  const wrap = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.055, 7, 16), scarfMat);
  wrap.rotation.x = Math.PI / 2;
  wrap.scale.set(1, 0.92, 1);
  scarf.add(wrap);
  const end = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.22, 0.04), scarfMat);
  end.position.set(0.11, -0.12, 0.2);
  end.rotation.z = -0.15;
  scarf.add(end);
  scarf.position.y = 0.775;
  scarf.visible = false;
  rig.add(scarf);
  const lantern = new THREE.Group();
  const frame = mat('#4a3a2c');
  const cage = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.13, 0.1), new THREE.MeshBasicMaterial({ color: 0xffd9a0, toneMapped: false }));
  const top = new THREE.Mesh(new THREE.ConeGeometry(0.085, 0.06, 4), frame); top.position.y = 0.095; top.rotation.y = Math.PI / 4;
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.02, 0.11), frame); base.position.y = -0.075;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.008, 4, 8), frame); ring.position.y = 0.15;
  lantern.add(cage, top, base, ring);
  lantern.position.set(0, -0.5, 0.02);
  lantern.visible = false;
  armR.add(lantern);

  rig.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  cage.castShadow = false;

  // Things an avatar can hold: a log for the fire, or a stick with a marshmallow.
  const logMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.82, 7), new THREE.MeshStandardMaterial({ color: 0x7a5536, roughness: 0.95, flatShading: true, emissive: 0x1c130c }));
  logMesh.rotation.z = Math.PI / 2;
  logMesh.position.set(0, 0.6, 0.34);
  logMesh.castShadow = true;
  logMesh.visible = false;
  rig.add(logMesh);
  const stick = new THREE.Group();
  stick.position.set(0.27, 0.66, 0.3);
  stick.rotation.x = 0.1;
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.018, 1.7, 5), new THREE.MeshStandardMaterial({ color: 0x9a7a52, roughness: 0.9, emissive: 0x2a1c10 }));
  rod.rotation.x = Math.PI / 2;
  rod.position.z = 0.85;
  stick.add(rod);
  const mallowMat = new THREE.MeshStandardMaterial({ color: 0xfff6ea, roughness: 0.7, emissive: 0xfff6ea, emissiveIntensity: 0.25 });
  const mallow = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.11, 10), mallowMat);
  mallow.rotation.x = Math.PI / 2;
  mallow.position.z = 1.68;
  stick.add(mallow);
  stick.visible = false;
  rig.add(stick);

  return { rig, torso, head, armL, armR, legL, legR, tail, eyes, logMesh, stick, mallowMat, scarf, lantern, headY: 0.98, eyeScale: 1.15, mouth: null, mouthOpen: 0 };
}

// ---- four-legged animals ----
// Angles for the lying pose, seen from the side (0 points straight down, positive forward), by kind of leg.
export const POSE = {
  paw: { clear: 0.0, frontLower: 1.5, thigh: 1.84, hindFoot: 1.5, frontSplay: 0, hindSplay: 0.3, tail: 0.5, headAwake: -0.35, headDown: 0.45, headUp: -0.8 },
  hoof: { clear: 0.0, frontLower: -1.45, thigh: 1.84, hindFoot: 1.5, frontSplay: 0, hindSplay: 0.3, tail: 0.3, headAwake: 0, headDown: 0.5, headUp: -0.45 },
};
// How long each animal's call lasts, in seconds.
export const CALL_TIME = { moo: 1.6, yip: 0.9, bark: 0.8, howl: 2.6, bleat: 1.0, bellow: 1.9, hum: 1.2, bray: 2.1 };
const avatars = new Set();
const AX = new THREE.Vector3(1, 0, 0), AY = new THREE.Vector3(0, 1, 0), AZ = new THREE.Vector3(0, 0, 1), _v = new THREE.Vector3(), _s = new THREE.Vector3(), _m = new THREE.Matrix4();
const _q = new THREE.Quaternion(), _qp = new THREE.Quaternion(), _r = new THREE.Quaternion();

function makeQuad(spec, paletteIndex) {
  const P = buildQuad(spec, spec.tints[paletteIndex % spec.tints.length]);
  const inv = 1 / P.scale;
  // Things carried in the mouth, sized in metres.
  P.mouth.scale.setScalar(inv);
  // A stick for the fire, carried crosswise in the mouth.
  const wood = new THREE.MeshStandardMaterial({ color: 0x7a5536, roughness: 0.95, flatShading: true, emissive: 0x1c130c });
  const logMesh = new THREE.Group();
  const len = clamp(spec.height * 0.85, 0.6, 1.0);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.038, len, 6), wood);
  shaft.rotation.z = Math.PI / 2;
  const twig = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.02, 0.2, 5), wood);
  twig.position.set(len * 0.3, 0.07, 0.03); twig.rotation.z = -0.6; twig.rotation.x = 0.4;
  logMesh.add(shaft, twig);
  logMesh.traverse((o) => { o.castShadow = true; });
  logMesh.position.set(0, 0, 0.02);
  logMesh.visible = false;
  P.mouth.add(logMesh);
  // A caught fish, held crosswise the same way.
  const silver = new THREE.MeshStandardMaterial({ color: 0xbfd3de, roughness: 0.35, metalness: 0.3, emissive: 0x24313a });
  const fishMesh = new THREE.Group();
  const fb = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), silver); fb.scale.set(2.1, 0.75, 0.45);
  const ft = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.14, 4), silver); ft.rotation.z = -Math.PI / 2; ft.position.x = -0.26; ft.scale.z = 0.3;
  fishMesh.add(fb, ft);
  fishMesh.rotation.z = -0.25;
  fishMesh.position.set(0, -0.02, 0.03);
  fishMesh.visible = false;
  P.mouth.add(fishMesh);
  // A butterfly that has settled on the nose.
  const bwing = new THREE.BufferGeometry();
  bwing.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.05, 0, 0, -0.05, 0.11, 0, -0.07, 0, 0, 0.05, 0.11, 0, -0.07, 0.1, 0, 0.08], 3));
  const bmat = new THREE.MeshBasicMaterial({ color: 0xffc85a, side: THREE.DoubleSide });
  const bfly = new THREE.Group(), bflyL = new THREE.Mesh(bwing, bmat), bflyR = new THREE.Mesh(bwing, bmat);
  bflyR.scale.x = -1;
  bfly.add(bflyL, bflyR);
  bfly.position.set(0, 0.1 + spec.height * 0.03, 0.09);
  bfly.visible = false;
  P.mouth.add(bfly);
  // Driftwood for the boat.
  const plankMesh = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.06, 0.16), new THREE.MeshStandardMaterial({ color: 0xb8a888, roughness: 0.95, flatShading: true, emissive: 0x2a2418 }));
  plankMesh.position.set(0, -0.01, 0.05);
  plankMesh.castShadow = true;
  plankMesh.visible = false;
  P.mouth.add(plankMesh);
  // Keepsakes: a scarf round the neck, with a lantern hanging from it.
  P.neck.scale.setScalar(inv);
  P.crown.scale.setScalar(inv); P.back.scale.setScalar(inv);
  const scarfMat = mat(spec.id === 'fox' ? '#3fa7a0' : '#d9483b');
  const scarf = new THREE.Group();
  const wrap = new THREE.Mesh(new THREE.TorusGeometry(P.neckR * 1.04 + 0.01, 0.04, 7, 18), scarfMat);
  wrap.rotation.x = Math.PI / 2;
  scarf.add(wrap);
  scarf.visible = false;
  P.neck.add(scarf);
  const lantern = new THREE.Group();
  const frame = mat('#4a3a2c');
  const cage = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.13, 0.1), new THREE.MeshBasicMaterial({ color: 0xffd9a0, toneMapped: false }));
  const top = new THREE.Mesh(new THREE.ConeGeometry(0.085, 0.06, 4), frame); top.position.y = 0.095; top.rotation.y = Math.PI / 4;
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.02, 0.11), frame); base.position.y = -0.075;
  lantern.add(cage, top, base);
  lantern.visible = false;
  P.rig.add(lantern);          // placed each frame under the neck, so it always hangs straight
  return Object.assign(P, { logMesh, fishMesh, plankMesh, bfly, bflyL, bflyR, scarf, lantern, eyes: [], mouthNode: null });
}

// Orientation of a bone's parent in the model's own space.
function parentQuat(b, root, out) {
  out.identity();
  for (let p = b.parent; p && p !== root; p = p.parent) out.premultiply(p.quaternion);
  return out;
}
// Turn a bone about one of the animal's own axes (x = side to side, y = up), whatever way the bone itself points.
function twist(P, b, axis, angle) {
  if (!b || !angle) return;
  parentQuat(b, P.root, _qp);
  _r.setFromAxisAngle(axis, angle);
  _q.copy(_qp).invert().multiply(_r).multiply(_qp);
  b.quaternion.premultiply(_q);
}

const TAU = Math.PI * 2;
// The stand-in shapes only know three gestures.
const TOY_EMOTE = { hop: 'cheer', sniff: 'eat', call: 'wave', greet: 'wave', wag: 'wave', shake: 'wave', paw: 'wave' };
function angleLerp(a, b, t) {
  let d = ((b - a + Math.PI) % TAU + TAU) % TAU - Math.PI;
  return a + d * t;
}

export class Avatar {
  constructor({ species = 0, palette = 0, name = 'Guest', sub = '', isYou = false }) {
    this.group = new THREE.Group();
    this.isYou = isYou;
    this.species = -1;
    this.palette = -1;
    this.x = 0; this.z = 0; this.y = 0; this.yaw = 0;
    this.targetYaw = 0;
    this.speed = 0;
    this.mode = 'stand';
    this.phase = Math.random() * 6;
    this.blinkAt = 1 + Math.random() * 4;
    this.emote = null;
    this.emoteT = 0;
    this.pose = { sit: 0, lie: 0, walk: 0 };
    this.bubbleLife = 0;
    this.bubbleFade = 1;
    this.lean = 0;
    this.look = null;
    this.headYaw = 0;
    this.held = 0;
    this.warmth = 0;
    this.wet = 0;
    this.stargaze = false;
    this.onStep = null;
    this.stepIndex = 0;
    this.nights = 0;
    this.talk = 0;
    avatars.add(this);

    if (!shadowTex) shadowTex = makeGlowTexture('rgba(0,0,0,1)', 'rgba(0,0,0,0)');
    this.shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(1.1, 1.1),
      new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, opacity: 0.45, depthWrite: false, fog: false }),
    );
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = 0.03;
    this.group.add(this.shadow);

    this.tag = makeNameTag(name, sub, isYou);
    this.tag.position.y = 1.72;
    this.group.add(this.tag);
    this.name = name; this.sub = sub;

    this.bubble = makeBubble();
    this.bubble.position.y = 1.98;
    this.group.add(this.bubble);

    this.firefly = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeGlowTexture('rgba(255,255,255,1)'), color: 0xd9ff8a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, toneMapped: false }));
    this.firefly.scale.setScalar(0.2);
    this.firefly.visible = false;
    this.group.add(this.firefly);

    this.setLook(species, palette);
  }

  setLook(species, palette) {
    species = clamp(species | 0, 0, SPECIES.length - 1);
    palette = Math.abs(palette | 0) % SPECIES[species].palettes.length;
    if (species === this.species && palette === this.palette) return;
    if (this.parts) {
      this.group.remove(this.parts.rig);
      if (this.parts.mixer) this.parts.mixer.stopAllAction();
      this.parts.rig.traverse((o) => {
        if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose();
        if (o.material && !o.material.userData.shared) o.material.dispose();
      });
    }
    this.species = species; this.palette = palette;
    const spec = SPECIES[species], state = quadState(spec.id);
    if (state === 'ready') this.parts = makeQuad(spec, palette);
    else if (state === 'failed') this.parts = buildBody(species, palette);
    else {
      // Nothing to show until the model arrives; the name tag stays up meanwhile.
      this.parts = { rig: new THREE.Group(), empty: true };
      requestQuad(spec.id, () => { if (avatars.has(this) && this.species === species) this.rebuild(); });
    }
    this.group.add(this.parts.rig);
    this.setHeld(this.held);
    if (this.wear) { this.wearKey = ''; this.setWear(this.wear); }
    this.coatShown = false; this.setCoat(this.warmth, this.wet);
    this.castsShadow = undefined;
    this.setButterfly(this.butterfly);
    this.setRewards(this.nights);
    const size = this.parts.quad ? Math.max(0.9, this.parts.bodyLength * 0.8) : 1.1;
    this.shadow.scale.set(size / 1.1 * (this.parts.quad ? 0.7 : 1), size / 1.1, 1);
  }

  // Scarf from the 3rd night, lantern from the 7th, firefly from the 14th.
  setRewards(nights) {
    this.nights = nights;
    this.firefly.visible = nights >= 14;
    if (!this.parts || this.parts.empty) return;
    this.parts.scarf.visible = nights >= 3 && !this.parts.scarf.userData.hide;
    this.parts.lantern.visible = nights >= 7;
  }

  // What is worn: places in WEAR_IDS for the head, the neck and the back (0 for nothing). The pieces are modelled
  // for a head and neck of a set size and fitted to each animal from its own measurements.
  setWear(list) {
    const want = [0, 1, 2].map((i) => (Array.isArray(list) && WEAR_IDS[list[i]] ? list[i] | 0 : 0));
    if (this.wearKey === want.join() && this.wearOn === this.parts) return;
    this.wearKey = want.join(); this.wear = want;
    const P = this.parts;
    if (!P || !P.quad) return;
    this.wearOn = P;
    for (const g of P.worn || []) g.parent && g.parent.remove(g);
    P.worn = [];
    if (P.scarf) P.scarf.userData.hide = want[1] > 0;      // a keepsake scarf gives way to anything else worn round the neck
    if (!want.some(Boolean)) return;
    loadProps().then((make) => {
      if (!make || this.parts !== P || this.wearKey !== want.join()) return;
      want.forEach((n, slot) => {
        if (!n) return;
        const it = ITEMS[WEAR_IDS[n]];
        let m;
        if (slot === 1) {
          // Round the neck: the band is made to the animal's own neck; what hangs from it is modelled, and hangs
          // straight down from the lowest point of the band however the neck is carried.
          m = new THREE.Group();
          const R = P.neckR * 1.04 + 0.01;
          const band = new THREE.Mesh(new THREE.TorusGeometry(R, it.ring[1], 7, 18), new THREE.MeshStandardMaterial({ color: it.ring[0], roughness: 0.85, flatShading: true }));
          band.rotation.x = Math.PI / 2; m.add(band);
          const hang = make(it.model + '_hang');
          if (hang) {
            P.rig.updateMatrixWorld(true);
            const down = new THREE.Vector3(0, -1, 0).applyQuaternion(P.neck.getWorldQuaternion(new THREE.Quaternion()).invert()).normalize();
            const out = new THREE.Vector3(down.x, 0, down.z); if (out.lengthSq() < 0.01) out.set(0, 0, 1); out.normalize();
            const right = new THREE.Vector3().crossVectors(down.clone().negate(), out).normalize(), fwd = new THREE.Vector3().crossVectors(right, down.clone().negate()).normalize();
            const pivot = new THREE.Group(); pivot.position.copy(out).multiplyScalar(R);
            pivot.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, down.clone().negate(), fwd));
            const k = Math.max(0.85, Math.min(1.5, P.neckR / 0.12)); hang.scale.setScalar(k); hang.position.set(0, 0, -0.11 * k);
            pivot.add(hang); m.add(pivot);
          }
        } else {
          m = make(it.model); if (!m) return;
          m.scale.setScalar(Math.max(0.6, Math.min(2.2, slot === 0 ? P.crownR / 0.1 : P.backW / 0.14)));
        }
        m.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.userData.caster = false; if (o.material.name === 'c_lantern_glow') { o.material = o.material.clone(); o.material.emissive.set(0xffb45a); o.material.emissiveIntensity = 1.8; o.material.color.set(0xffd9a0); } } });
        (slot === 0 ? P.crown : slot === 1 ? P.neck : P.back).add(m); P.worn.push(m);
      });
    });
  }

  // 0 nothing, 1 a stick for the fire, 2 a fish, 3 driftwood for the boat.
  setHeld(kind) {
    this.held = kind;
    if (!this.parts || this.parts.empty) return;
    this.parts.logMesh.visible = kind === 1;
    if (this.parts.fishMesh) this.parts.fishMesh.visible = kind === 2;
    if (this.parts.plankMesh) this.parts.plankMesh.visible = kind === 3;
    if (this.parts.stick) this.parts.stick.visible = false;
  }

  // Whether this animal throws a shadow. Only worth the cost near the fire, the one light that casts them.
  setShadows(on) {
    if (this.castsShadow === on || !this.parts || this.parts.empty) return;
    this.castsShadow = on;
    this.parts.rig.traverse((o) => { if (o.isMesh && o.userData.caster !== false) o.castShadow = on; });
  }

  setButterfly(on) {
    this.butterfly = !!on;
    if (this.parts && this.parts.bfly) this.parts.bfly.visible = this.butterfly;
  }

  // Warmth: 0 cold, 1 warmed right through by the fire, when the coat takes on a faint ember glow.
  // Wet: 0 dry, 1 soaked, when the coat goes dark and slick.
  setWarmth(level) { this.setCoat(level, this.wet); }
  setWet(level) { this.setCoat(this.warmth, level); }
  setCoat(warmth, wet) {
    warmth = clamp(warmth, 0, 1); wet = clamp(wet, 0, 1);
    if (Math.abs(warmth - this.warmth) < 0.02 && Math.abs(wet - this.wet) < 0.02 && this.coatShown) return;
    this.warmth = warmth; this.wet = wet;
    if (!this.parts || !this.parts.quad) return;
    this.coatShown = true;
    for (const m of this.parts.materials) {
      m.color.copy(m.userData.own).multiplyScalar(1 - 0.42 * wet);
      m.roughness = 0.9 - 0.45 * wet;
      m.emissive.copy(m.color).lerp(EMBER, 0.3 * warmth);
      m.emissiveIntensity = 0.22 + 0.2 * warmth;
    }
  }

  // Build the body again, for when the modelled animals finish loading.
  rebuild() {
    const s = this.species, p = this.palette;
    this.species = -1;
    this.setLook(s, p);
  }

  setName(name, sub) {
    if (name === this.name && sub === this.sub) return;
    this.name = name; this.sub = sub;
    this.tag.userData.draw(name, sub);
  }

  say(text) {
    this.bubble.userData.setText(text);
    this.bubble.visible = true;
    this.bubbleLife = clamp(3.5 + text.length * 0.06, 4, 11);
    this.talk = clamp(0.5 + text.length * 0.05, 0.8, 2.6);
  }

  play(emote) { this.emote = emote; this.emoteT = 0; }

  update(dt, t) {
    if (this.parts.quad) return this.updateQuad(dt, t);
    if (this.parts.empty) return this.updateCommon(dt, 1.2, 0);
    return this.updateToy(dt, t);
  }

  // Position, facing, chat bubble and name tag: the same for every kind of body.
  updateCommon(dt, tagY, sit) {
    this.yaw = angleLerp(this.yaw, this.targetYaw, 1 - Math.exp(-dt * 10));
    this.group.position.set(this.x, this.y, this.z);
    this.parts.rig.rotation.y = this.yaw;
    this.shadow.material.opacity = 0.45 * (1 - 0.3 * sit);
    this.shadow.position.y = 0.03;
    this.shadow.rotation.z = this.yaw;
    if (this.bubble.visible) {
      this.bubbleLife -= dt;
      this.bubble.material.opacity = clamp(this.bubbleLife / 0.6, 0, 1) * this.bubbleFade;
      if (this.bubbleLife <= 0) this.bubble.visible = false;
    }
    this.tag.position.y = tagY;
    this.bubble.position.y = tagY + 0.26;
    this.talk = Math.max(0, this.talk - dt);
  }

  updateQuad(dt, t) {
    const P = this.parts, A = P.actions, B = P.bones, spec = SPECIES[this.species];
    const k = 1 - Math.exp(-dt * 8);
    // Hoofed animals do not sit: asked to, they lie down.
    const lying = this.mode === 'lie' || (this.mode === 'sit' && spec.hoof);
    this.pose.sit = lerp(this.pose.sit, this.mode === 'sit' && !lying ? 1 : 0, 1 - Math.exp(-dt * 5));
    this.pose.lie = lerp(this.pose.lie, lying ? 1 : 0, 1 - Math.exp(-dt * 4));
    this.pose.walk = lerp(this.pose.walk, this.mode === 'stand' ? this.speed : 0, k);
    const sit = this.pose.sit, lie = this.pose.lie, v = this.pose.walk;
    const stride = P.height / 0.8;      // bigger animals cover more ground per step

    // Walk at a stroll, break into a run when moving fast.
    const run = clamp((v - 1.9 * stride) / (0.8 * stride), 0, 1), wRun = run * run * (3 - 2 * run);
    const wWalk = clamp((v - 0.08) / 0.4, 0, 1) * (1 - wRun);
    A.walk.timeScale = clamp(v / (1.1 * stride), 0.6, 2.2);
    A.run.timeScale = clamp(v / (3.4 * stride), 0.75, 1.4);

    // Things an animal does for a moment. Two come from the artist's animations (a hop, nose to the ground);
    // the rest are posed here: head, tail, a shake, a scratching paw.
    let shot = 0, pitch = 0, roll = 0, bodyRoll = 0, wag = 0, paw = 0, pawSwing = 0;
    if (this.emote) {
      this.emoteT += dt;
      const e = this.emoteT;
      const env = (dur, rise = 0.2, fall = 0.3) => clamp(e / rise, 0, 1) * clamp((dur - e) / fall, 0, 1);
      const clipFor = this.emote === 'hop' ? A.jump : this.emote === 'sniff' ? A.eat : null;
      let dur = 0;
      if (clipFor) {
        if (this.shot !== clipFor) {
          if (this.shot) this.shot.stop();
          this.shot = clipFor;
          clipFor.reset().setLoop(THREE.LoopOnce, 1); clipFor.clampWhenFinished = true;
          clipFor.timeScale = this.emote === 'sniff' ? 1.5 : 1; clipFor.play();
        }
        dur = clipFor.getClip().duration / clipFor.timeScale;
        shot = clamp(e / 0.15, 0, 1) * clamp((dur - e) / 0.25, 0, 1);
      } else if (this.emote === 'call') {
        const kind = spec.call;
        dur = CALL_TIME[kind];
        if (kind === 'moo') pitch = -0.4 * env(dur, 0.3, 0.4);
        else if (kind === 'howl' || kind === 'bellow') pitch = -0.95 * env(dur, 0.35, 0.5);
        else if (kind === 'bray') pitch = (-0.5 + 0.28 * Math.sin(e * 6.5)) * env(dur, 0.2, 0.4);
        else if (kind === 'bark' || kind === 'yip') pitch = -0.38 * Math.abs(Math.sin(e * Math.PI / (kind === 'yip' ? 0.24 : 0.36))) * env(dur, 0.05, 0.15);
        else pitch = -0.32 * env(dur, 0.25, 0.35);
      } else if (this.emote === 'shake') {
        dur = 1.1;
        const a = Math.sin(clamp(e / dur, 0, 1) * Math.PI), o = Math.sin(e * 36);
        roll = 0.55 * o * a; bodyRoll = 0.09 * o * a; wag = 0.5 * Math.sin(e * 36 + 1.6) * a;
      } else if (this.emote === 'wag') {
        dur = 1.9;
        wag = 0.75 * Math.sin(e * 17) * env(dur);
      } else if (this.emote === 'greet') {
        dur = 1.5;
        pitch = (0.16 + 0.2 * Math.sin(e * 9)) * env(dur);
        wag = 0.7 * Math.sin(e * 17) * env(dur);
      } else if (this.emote === 'paw') {
        dur = 1.4;
        paw = env(dur, 0.2, 0.25); pawSwing = Math.sin(e * 13);
        pitch = 0.38 * paw;
      } else if (this.emote === 'throw') {
        dur = 0.6;
        pitch = -0.7 * Math.sin(clamp(e / dur, 0, 1) * Math.PI);
      }
      if (e >= dur) this.emote = null;
    }
    if (!this.emote && this.shot) { this.shot.stop(); this.shot = null; }
    if (sit > 0.5 || lie > 0.5) shot *= this.shot === A.eat ? 0.6 : 0.3;
    const base = 1 - shot;
    A.idle.setEffectiveWeight(Math.max(0.001, (1 - wWalk - wRun) * base));
    A.walk.setEffectiveWeight(wWalk * base);
    A.run.setEffectiveWeight(wRun * base);
    if (this.shot) this.shot.setEffectiveWeight(shot);

    // Bones we adjust by hand start each frame from rest, then the animation plays over them.
    for (const [b, r] of P.rest) { b.position.copy(r.p); b.quaternion.copy(r.q); }
    P.mixer.update(dt);

    // Sitting: haunches down, chest up, front legs straight.
    if (sit > 0.001) {
      const drop = Math.min(0.56 * P.hipY, 0.58 * P.spine);
      const th = Math.asin(drop / P.spine) * sit;
      B.Body.position.y -= drop * sit;
      B.Body.position.z += P.spine * (1 - Math.cos(th)) * 0.9;
      twist(P, B.Back, AX, -th);
      for (const s of ['L', 'R']) {
        twist(P, B['BackShoulder' + s], AX, th * 0.55);
        twist(P, B['BackLeg' + s], AX, -1.05 * sit);
        twist(P, B['BackUpperLeg' + s], AX, 1.55 * sit);
        twist(P, B['BackLowerLeg' + s], AX, -0.75 * sit);
        twist(P, B['FrontShoulder' + s], AX, th);
      }
      twist(P, B.Neck1, AX, th * 0.75);
      twist(P, B.Tail1, AX, th * 0.9);
    }
    // Lying down: belly on the ground, every leg folded so its foot rests at ground level.
    if (lie > 0.001) {
      const L = POSE[spec.hoof ? 'hoof' : 'paw'];
      const D = Math.max(0, P.bellyY - L.clear * P.height);
      B.Body.position.y -= (D / P.unit) * lie;
      for (const leg of P.legs) {
        const h = leg.top - D - leg.foot, S = leg.segs;
        let want;
        if (leg.front) {
          const a = Math.acos(clamp(h / S[0].len, -1, 1));
          want = spec.hoof ? [a, L.frontLower] : [-a, L.frontLower];
        } else {
          const knee = h - S[0].len * Math.cos(L.thigh);
          want = [L.thigh, -Math.acos(clamp(knee / S[1].len, -1, 1)), L.hindFoot];
        }
        let above = 0;
        for (let i = 0; i < S.length; i++) {
          const total = S[i].phi - want[i];
          twist(P, S[i].bone, AX, (total - above) * lie);
          above = total;
        }
        // Tuck the folded legs in against the body rather than through it.
        twist(P, S[0].bone, AZ, (leg.side === 'L' ? -1 : 1) * (leg.front ? L.frontSplay : L.hindSplay) * lie);
      }
      twist(P, B.Tail1, AX, L.tail * lie);
    }
    // A shake runs down the spine; a scratching paw lifts one front leg.
    if (bodyRoll) { twist(P, B.Torso, AZ, bodyRoll); twist(P, B.Back, AZ, -bodyRoll * 0.6); }
    if (paw > 0.001) {
      twist(P, B.FrontUpperLegL, AX, -(0.5 + 0.3 * pawSwing) * paw);
      twist(P, B.FrontLowerLegL, AX, (0.2 - 0.45 * pawSwing) * paw);
    }
    // Carry each paw along with the leg above it.
    P.root.updateMatrixWorld(true);
    for (const f of P.feet) {
      _m.copy(f.ik.parent.matrixWorld).invert().multiply(f.lower.matrixWorld).multiply(f.rel);
      _m.decompose(_v, _q, _s);
      f.ik.position.copy(_v);
      // With the leg posed by hand the paw turns with it, except lying down, where it rests flat on the ground.
      const carried = Math.max(sit, f.front && f.left ? paw : 0) * (1 - lie);
      if (carried > 0.001) f.ik.quaternion.slerp(_q, carried);
      if (lie > 0.001) f.ik.quaternion.slerp(f.restQ, lie);
    }

    // Head: turn toward whoever is speaking, bob while talking, rest on the ground or tip up to the sky when lying.
    let hy = 0;
    if (this.look && !this.stargaze) {
      const d = ((Math.atan2(this.look.x - this.x, this.look.z - this.z) - this.yaw + Math.PI) % TAU + TAU) % TAU - Math.PI;
      if (Math.abs(d) < 2.2) hy = clamp(d, -1.0, 1.0);
    }
    this.headYaw = lerp(this.headYaw, hy, 1 - Math.exp(-dt * 5));
    this.lieFor = lying ? (this.lieFor || 0) + dt : 0;
    const dozing = this.asleep || (this.lieFor > 6 && this.talk <= 0 && !this.look && !this.emote);
    const restTo = !lying ? 0 : this.stargaze ? -1 : dozing ? 1 : 0;
    this.pose.rest = lerp(this.pose.rest || 0, restTo, 1 - Math.exp(-dt * 1.6));
    const LP = POSE[spec.hoof ? 'hoof' : 'paw'], r = this.pose.rest;
    pitch += lie * (r >= 0 ? lerp(LP.headAwake, LP.headDown, r) : lerp(LP.headAwake, LP.headUp, -r));
    pitch += (this.talk > 0 ? Math.sin(t * 13 + this.phase) * 0.06 : 0) + (this.held ? -0.12 : 0);
    twist(P, B.Neck1, AX, pitch * 0.3);
    twist(P, B.Neck2 || B.Neck1, AY, this.headYaw * 0.45);
    twist(P, B.Neck3 || B.Head, AX, pitch * 0.35);
    twist(P, B.Head, AY, this.headYaw * 0.5);
    twist(P, B.Head, AX, pitch * 0.35);
    if (roll) { twist(P, B.Neck2 || B.Neck1, AZ, roll * 0.4); twist(P, B.Head, AZ, roll * 0.6); }
    if (wag) { twist(P, B.Tail1, AY, wag); twist(P, B.Tail2, AY, wag * 0.7); }

    // Footfalls.
    if (v > 0.3 && this.mode === 'stand') {
      const rate = wRun > 0.5 ? (2 / A.run.getClip().duration) * A.run.timeScale : (4 / A.walk.getClip().duration) * A.walk.timeScale;
      this.phase += dt * rate;
      const stepIndex = Math.floor(this.phase);
      if (stepIndex !== this.stepIndex) { this.stepIndex = stepIndex; if (this.onStep) this.onStep(stepIndex % 2 === 0); }
    }

    if (P.bfly.visible) { const f = 0.55 + Math.sin(t * 5 + this.phase) * 0.5; P.bflyL.rotation.z = f; P.bflyR.rotation.z = -f; }
    // Lantern hangs under the neck; firefly circles overhead.
    if (P.lantern.visible) {
      P.rig.updateWorldMatrix(true, true);
      P.neck.getWorldPosition(_v);
      P.rig.worldToLocal(_v);
      P.lantern.position.set(_v.x, _v.y - P.neckR - 0.2, _v.z + 0.02);
    }
    const low = Math.max(0.3 * sit, 0.55 * lie);
    if (this.firefly.visible) {
      const a = t * 1.3 + this.phase * 0.02;
      this.firefly.position.set(Math.cos(a) * 0.6, P.height * (1 - low) + 0.25 + Math.sin(t * 2.1) * 0.14, Math.sin(a) * 0.6);
      this.firefly.material.opacity = 0.7 + 0.3 * Math.sin(t * 5);
    }
    this.updateCommon(dt, lerp(P.height + 0.42, Math.max(0.75, P.height - P.bellyY + 0.5), lie), sit);
  }

  updateToy(dt, t) {
    const P = this.parts;
    if (this.emote && TOY_EMOTE[this.emote]) this.emote = TOY_EMOTE[this.emote];
    const k = 1 - Math.exp(-dt * 9);
    this.yaw = angleLerp(this.yaw, this.targetYaw, 1 - Math.exp(-dt * 10));
    this.group.position.set(this.x, this.y, this.z);
    P.rig.rotation.y = this.yaw;

    const walking = this.mode === 'stand' ? clamp(this.speed / 3.2, 0, 1.3) : 0;
    this.pose.walk = lerp(this.pose.walk, walking, k);
    this.pose.sit = lerp(this.pose.sit, this.mode === 'sit' ? 1 : 0, k);
    this.pose.lie = lerp(this.pose.lie, this.mode === 'lie' ? 1 : 0, 1 - Math.exp(-dt * 5));
    const w = this.pose.walk, sit = this.pose.sit, lie = this.pose.lie;
    this.phase += dt * (2 + 9 * w);
    const stepIndex = Math.floor(this.phase / Math.PI);
    if (stepIndex !== this.stepIndex) {
      this.stepIndex = stepIndex;
      if (w > 0.35 && this.onStep) this.onStep(stepIndex % 2 === 0);
    }
    const s = Math.sin(this.phase), c = Math.cos(this.phase);
    const breathe = Math.sin(t * 1.8 + this.phase * 0.01);

    // Whole-body placement.
    let rigY = Math.abs(s) * 0.045 * w - 0.14 * sit;
    let rigRotX = 0.04 * sit + this.lean * (1 - sit);
    let rigZ = 0;
    if (lie > 0.001) {
      rigRotX = lerp(rigRotX, -Math.PI / 2, lie);
      rigY = lerp(rigY, 0.3, lie);
      rigZ = 0.55 * lie;
    }
    // Emotes.
    let armLz = 0.12, armRz = -0.12, armLx = 0, armRx = 0, headTilt = 0, swing = 1;
    if (this.held === 1) { armLx = -1.2; armRx = -1.2; armLz = -0.22; armRz = 0.22; swing = 0.1; }
    if (this.held === 2) { armLx = -1.35; swing = 0.3; }
    const lamp = this.nights >= 7 && this.held !== 1 ? 1 - lie : 0;   // hold the lantern a little forward
    if (this.emote) {
      this.emoteT += dt;
      const e = this.emoteT;
      if (this.emote === 'wave') {
        const a = Math.sin(clamp(e / 0.25, 0, 1) * Math.PI / 2) * (e > 1.9 ? clamp((2.2 - e) / 0.3, 0, 1) : 1);
        armLz = lerp(armLz, 2.45 + Math.sin(e * 13) * 0.32, a);
        headTilt = 0.12 * a;
        if (e > 2.2) this.emote = null;
      } else if (this.emote === 'cheer') {
        const a = e < 1.3 ? 1 : clamp((1.5 - e) / 0.2, 0, 1);
        armLz = lerp(armLz, 2.7 + Math.sin(e * 16) * 0.15, a);
        armRz = lerp(armRz, -2.7 - Math.sin(e * 16) * 0.15, a);
        if (lie < 0.5 && sit < 0.5) rigY += Math.abs(Math.sin(e * Math.PI / 0.65)) * 0.3 * a;
        if (e > 1.5) this.emote = null;
      } else if (this.emote === 'throw') {
        const a = Math.sin(clamp(e / 0.7, 0, 1) * Math.PI);
        armLx = -2.4 * a; armRx = -2.4 * a;
        if (e > 0.7) this.emote = null;
      } else if (this.emote === 'eat') {
        const a = Math.sin(clamp(e / 1.1, 0, 1) * Math.PI);
        armLx = lerp(armLx, -2.5, a); armLz = lerp(armLz, -0.35, a);
        headTilt = Math.sin(e * 14) * 0.05 * a;
        if (e > 1.1) this.emote = null;
      } else {
        this.emote = null;
      }
    }
    P.rig.position.set(Math.sin(this.yaw) * rigZ, rigY, Math.cos(this.yaw) * rigZ);
    P.rig.rotation.order = 'YXZ';
    P.rig.rotation.x = rigRotX;
    P.rig.rotation.z = s * 0.06 * w;

    // Legs and arms.
    const legSit = -1.45 * sit;
    P.legL.rotation.x = s * 0.8 * w + legSit * (1 - lie);
    P.legR.rotation.x = -s * 0.8 * w + legSit * (1 - lie);
    P.legL.rotation.z = 0.12 * sit + 0.15 * lie;
    P.legR.rotation.z = -0.12 * sit - 0.15 * lie;
    P.armL.rotation.x = -s * 0.65 * w * swing - 0.45 * sit * (armLx ? 0.2 : 1) + armLx;
    P.armR.rotation.x = (s * 0.65 * w * swing - 0.45 * sit * (armRx ? 0.2 : 1)) * (1 - 0.75 * lamp) + armRx - 0.55 * lamp * (armRx ? 0 : 1);
    P.lantern.rotation.x = -P.armR.rotation.x;   // the lantern hangs straight down whatever the arm does
    if (this.firefly.visible) {
      const a = t * 1.3 + this.phase * 0.02;
      this.firefly.position.set(Math.cos(a) * 0.5, 1.3 + Math.sin(t * 2.1) * 0.14 - 0.4 * sit, Math.sin(a) * 0.5);
      this.firefly.material.opacity = 0.7 + 0.3 * Math.sin(t * 5);
    }
    P.armL.rotation.z = armLz + 0.9 * lie;
    P.armR.rotation.z = armRz - 0.9 * lie;

    // Small life: breathing, head, tail, blink.
    P.torso.scale.setScalar(1 + breathe * 0.012);
    P.head.position.y = P.headY + breathe * 0.006;
    P.head.rotation.z = c * 0.035 * w + headTilt + Math.sin(t * 0.6 + this.phase) * 0.03 * (1 - w);
    P.head.rotation.x = -0.12 * sit * (1 - lie) + Math.sin(t * 0.43 + this.phase * 0.3) * 0.03;
    // Turn the head toward whoever is speaking, if they are in front or beside.
    let hy = 0;
    if (this.look && lie < 0.3) {
      const d = ((Math.atan2(this.look.x - this.x, this.look.z - this.z) - this.yaw + Math.PI) % TAU + TAU) % TAU - Math.PI;
      if (Math.abs(d) < 2.1) hy = clamp(d, -1.1, 1.1);
    }
    this.headYaw = lerp(this.headYaw, hy, 1 - Math.exp(-dt * 5));
    P.head.rotation.y = this.headYaw;
    P.tail.rotation.y = Math.sin(t * 2.4 + this.phase * 0.2) * 0.22 + s * 0.2 * w;
    this.blinkAt -= dt;
    let blink = 1;
    if (this.blinkAt < 0.12) blink = 0.12;
    if (this.blinkAt < 0) this.blinkAt = 2.5 + Math.random() * 4;
    if (lie > 0.9 && this.emote === null && false) blink = 0.12;
    if (this.emote === 'cheer' || this.emote === 'eat') blink = Math.min(blink, 0.38);   // happy eyes
    for (const e of P.eyes) e.scale.y = P.eyeScale * blink;
    // The mouth moves while a line is being said.
    this.talk = Math.max(0, this.talk - dt);
    if (P.mouth) {
      const open = this.talk > 0 ? 0.35 + 0.65 * Math.abs(Math.sin(t * 15 + this.phase)) : 0;
      P.mouth.scale.y = lerp(P.mouth.scale.y, 1 + open * P.mouthOpen, 1 - Math.exp(-dt * 22));
    }

    this.shadow.material.opacity = 0.45 * (1 - 0.3 * sit);
    this.shadow.position.y = 0.03;

    // Chat bubble.
    if (this.bubble.visible) {
      this.bubbleLife -= dt;
      const a = clamp(this.bubbleLife / 0.6, 0, 1) * this.bubbleFade;
      this.bubble.material.opacity = a;
      if (this.bubbleLife <= 0) this.bubble.visible = false;
    }
    const tagY = lerp(1.72, 1.15, lie) - 0.1 * sit;
    this.tag.position.y = tagY;
    this.bubble.position.y = tagY + 0.26;
  }

  dispose() {
    avatars.delete(this);
    if (this.parts && this.parts.mixer) this.parts.mixer.stopAllAction();
    this.group.traverse((o) => {
      if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose();
      if (o.material && !o.material.userData.shared) { if (o.material.map && o.material.map !== shadowTex) o.material.map.dispose(); o.material.dispose(); }
    });
  }
}
