// Jointed animals made in Blender. Each one is a single skinned mesh: every part of it follows exactly one joint,
// so a leg bends at the knee and a head turns on its neck, and the whole animal still costs one draw.
// The motion is worked out here from a few numbers (how fast it is walking, how far its head is down to graze,
// how far it has lain down), so every animal built on the same joints moves without anything drawn by hand.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const paint = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95, metalness: 0 });
const rigs = new Map();

// Read one animal out of the loaded props: its joints (empties named <name>_j_<joint>) and the geometry that hangs on each.
function read(scene, name, turn = 0) {
  if (rigs.has(name)) return rigs.get(name);
  const root = scene.getObjectByName(name);
  if (!root) { rigs.set(name, null); return null; }
  // Some of the older models were drawn facing along x. They are turned here so that every animal faces the same way
  // (forward is +z), and the same motion code suits them all.
  const pre = name + '_j_', inv = new THREE.Matrix4().makeRotationY(turn).multiply(new THREE.Matrix4().copy(root.matrixWorld).invert()), m4 = new THREE.Matrix4();
  const joints = [{ key: 'root', parent: -1, pos: new THREE.Vector3() }], geos = [];
  const walk = (o, bi) => {
    if (o !== root && o.name.startsWith(pre)) { const p = new THREE.Vector3().setFromMatrixPosition(m4.multiplyMatrices(inv, o.matrixWorld)); joints.push({ key: o.name.slice(pre.length), parent: bi, pos: p }); bi = joints.length - 1; }
    if (o.isMesh) {
      let g = o.geometry.clone().applyMatrix4(m4.multiplyMatrices(inv, o.matrixWorld));
      for (const k of Object.keys(g.attributes)) if (k !== 'position') g.deleteAttribute(k);
      if (g.index) g = g.toNonIndexed();
      const n = g.attributes.position.count, col = new Float32Array(n * 3), si = new Uint16Array(n * 4), sw = new Float32Array(n * 4), c = o.material.color;
      for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; si[i * 4] = bi; sw[i * 4] = 1; }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4)); g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
      geos.push(g);
    }
    o.children.forEach((ch) => walk(ch, bi));
  };
  walk(root, 0);
  const geometry = geos.length ? mergeGeometries(geos, false) : null;
  if (geometry) geometry.computeVertexNormals();
  const out = geometry ? { geometry, joints } : null;
  rigs.set(name, out);
  return out;
}

// A fresh copy of the animal: its own bones, sharing the geometry.
export function makePuppet(scene, name, turn = 0) {
  const src = read(scene, name, turn);
  if (!src) return null;
  const bones = src.joints.map((j) => { const b = new THREE.Bone(); b.name = j.key; return b; }), by = {};
  src.joints.forEach((j, i) => { const b = bones[i]; by[j.key] = b; if (j.parent >= 0) { b.position.copy(j.pos).sub(src.joints[j.parent].pos); bones[j.parent].add(b); } });
  const mesh = new THREE.SkinnedMesh(src.geometry, paint);
  mesh.add(bones[0]); mesh.bind(new THREE.Skeleton(bones)); mesh.frustumCulled = false; mesh.castShadow = true;
  const group = new THREE.Group(), pivot = new THREE.Group(); pivot.rotation.y = -turn; pivot.add(mesh); group.add(pivot);
  const rest = {}; for (const k in by) rest[k] = by[k].position.clone();
  return { group, mesh, bones: by, rest, phase: Math.random() * 6.28, seed: Math.random() * 100, walk: 0, graze: 0, lie: 0, look: 0, flick: 0, nextFlick: 2 + Math.random() * 5 };
}

const damp = (a, b, dt, k) => a + (b - a) * (1 - Math.exp(-dt * k));
// One frame of a four-legged animal. want: { speed (m/s), graze 0..1, lie 0..1, look (radians, head to one side), size }.
export function moveQuad(p, want, dt, t) {
  const B = p.bones, R = p.rest, size = want.size || 1;
  const sp = want.speed || 0, go = Math.min(1, sp / 0.5);
  p.walk = damp(p.walk, go, dt, 8); p.graze = damp(p.graze, sp > 0.1 ? 0 : want.graze || 0, dt, 2.2); p.lie = damp(p.lie, sp > 0.1 ? 0 : want.lie || 0, dt, 1.6); p.look = damp(p.look, want.look || 0, dt, 3);
  if (sp > 0.02) p.phase += dt * 6.283 * sp / (0.95 * size * (sp > 3 ? 1.5 : 1));
  const w = p.walk, ph = p.phase, lie = p.lie, g = p.graze * (1 - lie), run = Math.min(1, Math.max(0, (sp - 2.5) / 2.5));
  const A = (0.42 + run * 0.25) * w, Bn = (0.75 + run * 0.4) * w;
  // Legs: opposite corners move together. A leg lifts and folds at the knee as it comes forward.
  const leg = (key, off, hind) => {
    const up = B[key + '1'], low = B[key + '2']; if (!up || !low) return;
    const s = Math.sin(ph + off), c = Math.cos(ph + off), fold = Math.max(0, c);
    let u = -s * A + (hind ? 0.06 : -0.03) * w, l = (hind ? 0.9 : 1) * fold * Bn;
    if (hind) u -= fold * Bn * 0.35;
    // Lying down: the legs tuck under.
    u = u * (1 - lie) + (hind ? 1.0 : -1.25) * lie; l = l * (1 - lie) + (hind ? -2.2 : 2.35) * lie;
    up.rotation.x = u; low.rotation.x = l;
  };
  leg('fl', 0, false); leg('br', 0.25, true); leg('fr', Math.PI, false); leg('bl', Math.PI + 0.25, true);
  const breath = Math.sin(t * 1.7 + p.seed);
  if (B.body) {
    B.body.position.y = R.body.y + Math.abs(Math.sin(ph)) * 0.022 * w - lie * R.body.y * 0.52;
    B.body.rotation.z = Math.sin(ph) * 0.035 * w; B.body.rotation.x = Math.sin(ph * 2) * 0.02 * w + g * 0.05;
    B.body.scale.set(1 + breath * 0.012, 1 + breath * 0.016, 1);
  }
  if (B.neck) B.neck.rotation.x = g * 0.95 + Math.sin(ph * 2 + 0.6) * 0.05 * w + lie * 0.12 + Math.sin(t * 0.5 + p.seed) * 0.03;
  if (B.head) { B.head.rotation.x = g * 0.3 + Math.sin(t * 0.8 + p.seed) * 0.03 - lie * 0.1; B.head.rotation.y = p.look * (1 - g) + Math.sin(t * 0.31 + p.seed * 2) * 0.12 * (1 - w) * (1 - g); B.head.rotation.z = Math.sin(t * 0.23 + p.seed) * 0.04 * (1 - w); }
  if (B.jaw) B.jaw.rotation.x = g > 0.6 ? Math.max(0, Math.sin(t * 7 + p.seed)) * 0.28 : 0;
  if (B.tail) { B.tail.rotation.y = Math.sin(t * (2 + w * 6) + p.seed) * (0.25 + w * 0.2); B.tail.rotation.x = -0.1 - w * 0.3; }
  // An ear flicks now and then.
  p.nextFlick -= dt; if (p.nextFlick < 0) { p.nextFlick = 2.5 + Math.random() * 6; p.flick = 1; p.flickSide = Math.random() < 0.5 ? 'earL' : 'earR'; }
  p.flick = Math.max(0, p.flick - dt * 3.2);
  for (const k of ['earL', 'earR']) if (B[k]) { const side = k === 'earL' ? -1 : 1; B[k].rotation.z = side * (-0.12 + (p.flickSide === k ? Math.sin(p.flick * 9) * 0.5 * p.flick : 0) - g * 0.15); B[k].rotation.y = side * w * 0.2; }
}

// A window that opens now and then: 0 most of the time, rising to 1 and back over `len` seconds every `period`.
const win = (t, period, len, phase) => { const u = (((t + phase) % period) + period) % period / len; return u < 1 ? Math.sin(u * Math.PI) : 0; };
// One frame of somebody who stays where they are: breathing, looking about, and the small things each of them does.
// kind: forager, gardener, beachcomber, castaway, mapmaker, hermit, heron. want: { near, talk }.
export function moveFolk(p, kind, want, dt, t) {
  const B = p.bones, R = p.rest, s = p.seed, calm = want.near ? 0.35 : 1, bird = kind === 'castaway' || kind === 'heron';
  const slow = kind === 'mapmaker' ? 0.45 : kind === 'hermit' ? 0.7 : 1, br = Math.sin(t * 1.5 * slow + s), tk = want.talk ? Math.sin(t * 9) * 0.05 : 0;
  const side = (k) => (R[k] && R[k].x < 0 ? -1 : 1);
  if (B.body) { B.body.scale.set(1 + br * 0.012, 1 + br * 0.018, 1 + br * 0.012); B.body.rotation.z = Math.sin(t * 0.4 * slow + s) * 0.02; B.body.rotation.x = Math.sin(t * 0.27 * slow + s * 2) * 0.014; }
  // Where the head is turned. A bird looks in quick steps and holds; the rest drift.
  if (bird) { p.nextLook = (p.nextLook || 0) - dt; if (p.nextLook < 0) { p.nextLook = 1.2 + Math.random() * 3.2; p.lookTo = (Math.random() - 0.5) * (kind === 'castaway' ? 1.7 : 1.1); } p.look = damp(p.look, (p.lookTo || 0) * calm, dt, 11); }
  else p.look = Math.sin(t * 0.33 * slow + s) * 0.3 * calm + Math.sin(t * 0.13 * slow + s * 3) * 0.12 * calm;
  let pitch = Math.sin(t * 0.7 * slow + s) * 0.04 + tk, tilt = Math.sin(t * 0.21 + s) * 0.04;
  const sniff = kind === 'forager' ? win(t, 6.5, 2.2, s) : kind === 'gardener' ? win(t, 9, 1.4, s) : kind === 'hermit' ? win(t, 14, 1.6, s) : 0;
  const dig = kind === 'gardener' && !want.near ? win(t, 13, 6, s + 4) : 0, peer = kind === 'beachcomber' && !want.near ? win(t, 11, 4.5, s) : 0;
  if (kind === 'forager') pitch += sniff * 0.18;
  if (dig) pitch += dig * 0.22; if (peer) { pitch += peer * 0.3; tilt += peer * 0.12; }
  if (B.neck) {
    if (kind === 'heron') { const n = Math.sin(t * 0.35 + s) * 0.07; B.neck.rotation.x = n; pitch -= n; }
    else if (kind === 'mapmaker') { const n = Math.sin(t * 0.22 + s) * 0.1 + (want.near ? -0.08 : 0); B.neck.rotation.x = n; pitch -= n * 0.7; B.neck.rotation.y = p.look * 0.4; }
    else if (kind === 'castaway') { B.neck.rotation.x = Math.sin(t * 0.5 + s) * 0.05; B.neck.rotation.y = p.look * 0.35; }
  }
  if (B.head) { B.head.rotation.y = p.look * (B.neck && kind !== 'heron' ? 0.65 : 1); B.head.rotation.x = pitch; B.head.rotation.z = tilt; }
  if (B.snout) { B.snout.rotation.x = sniff * Math.sin(t * 21) * 0.07; B.snout.rotation.y = sniff * Math.sin(t * 17) * 0.05; }
  // Ears.
  p.nextFlick -= dt; if (p.nextFlick < 0) { p.nextFlick = 2.5 + Math.random() * 6; p.flick = 1; p.flickSide = Math.random() < 0.5 ? 'earL' : 'earR'; }
  p.flick = Math.max(0, p.flick - dt * 3.2);
  for (const k of ['earL', 'earR']) if (B[k]) { const f = p.flickSide === k ? Math.sin(p.flick * 9) * 0.45 * p.flick : 0; B[k].rotation.x = f * 0.6; B[k].rotation.z = side(k) * f; }
  // Arms and paws.
  const hang = (k, ph) => Math.sin(t * 0.8 * slow + s + ph) * 0.06;
  if (B.armL) { let a = hang('armL', 0); if (kind === 'forager') a -= sniff * (0.5 + Math.sin(t * 7) * 0.08); if (peer) a -= peer * 1.15; B.armL.rotation.x = a; B.armL.rotation.z = -side('armL') * (peer * 0.25); }
  if (B.armR) { let a = hang('armR', 2); if (kind === 'forager') a -= sniff * (0.5 - Math.sin(t * 7) * 0.08); if (dig) a -= dig * Math.max(0, Math.sin(t * 2.6)) * 0.95; if (kind === 'hermit') a -= win(t, 17, 3, s + 6) * 0.35; B.armR.rotation.x = a; }
  // Tails.
  if (B.tail) { if (bird) { B.tail.rotation.x = Math.sin(t * 0.7 + s) * 0.06; B.tail.rotation.y = win(t, 7, 0.7, s) * Math.sin(t * 26) * 0.25; } else { B.tail.rotation.y = Math.sin(t * 0.9 * slow + s) * 0.22; if (B.tail2) B.tail2.rotation.y = Math.sin(t * 0.9 * slow + s - 0.9) * 0.4; } }
  // Wings: a shrug and a settle. The Castaway has only the one to do it with.
  const ruffle = bird ? win(t, kind === 'castaway' ? 9 : 16, 1.3, s + 2) : 0;
  for (const k of ['wingL', 'wingR']) if (B[k]) { B[k].rotation.z = side(k) * (ruffle * 0.42 + Math.sin(t * 24) * 0.03 * ruffle); B[k].rotation.x = -ruffle * 0.12; }
  // The heron stands on one leg for a while, as herons do.
  if (B.legR1 && B.legR2) { const up = want.near ? 0 : win(t, 26, 11, s); p.legUp = damp(p.legUp || 0, up > 0.05 ? 1 : 0, dt, 2); B.legR1.rotation.x = -p.legUp * 0.95; B.legR2.rotation.x = p.legUp * 1.9; }
}
