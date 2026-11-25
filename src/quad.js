// Four-legged animals from the Quaternius "Ultimate Animated Animal Pack" (public domain, CC0).
// Each species is one skinned model with hand-made animations; this file loads them and works out
// the few measurements the game needs (size, where the mouth and neck are).
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';

const models = new Map();    // species id -> { state, scene, clips, scale, ... }
const waiting = new Map();   // species id -> Set of callbacks

export function quadState(id) { const m = models.get(id); return m ? m.state : 'none'; }

// Ask for a species; cb runs once it is ready or has failed.
export function requestQuad(id, cb) {
  const m = models.get(id);
  if (m && m.state !== 'loading') { cb(m.state); return; }
  if (!waiting.has(id)) waiting.set(id, new Set());
  waiting.get(id).add(cb);
  if (m) return;
  const rec = { state: 'loading' };
  models.set(id, rec);
  const done = (state) => {
    if (rec.state !== 'loading') return;
    rec.state = state;
    const cbs = waiting.get(id) || [];
    waiting.delete(id);
    for (const f of cbs) f(state);
  };
  setTimeout(() => done('failed'), 12000);
  // The model travels as a JSON file holding the binary model as base64 text.
  fetch(`./q-${id}.json`).then((r) => (r.ok ? r.json() : Promise.reject(new Error('missing')))).then((j) => {
    const text = atob(j.base64), bytes = new Uint8Array(text.length);
    for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i);
    new GLTFLoader().parse(bytes.buffer, '', (gltf) => {
      try { measure(rec, gltf); done('ready'); } catch (e) { done('failed'); }
    }, () => done('failed'));
  }).catch(() => done('failed'));
}

const bone = (root, name) => root.getObjectByName(name) || null;

// Work out size and attachment points from the model standing in its rest pose.
function measure(rec, gltf) {
  const scene = gltf.scene;
  scene.updateMatrixWorld(true);
  const pts = [];
  const v = new THREE.Vector3();
  scene.traverse((o) => {
    if (!o.isMesh) return;
    o.geometry.userData.shared = true;
    const pos = o.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      if (o.isSkinnedMesh) o.getVertexPosition(i, v); else v.fromBufferAttribute(pos, i);
      pts.push(v.clone().applyMatrix4(o.matrixWorld));
    }
  });
  const box = new THREE.Box3().setFromPoints(pts);
  const head = bone(scene, 'Head'), neck = bone(scene, 'Neck2') || bone(scene, 'Neck1'), back = bone(scene, 'Back');
  const shoulder = bone(scene, 'FrontShoulderL'), body = bone(scene, 'Body');
  if (!head || !neck || !back || !shoulder || !body) throw new Error('unexpected skeleton');
  const wp = (o) => o.getWorldPosition(new THREE.Vector3());
  const headPos = wp(head), neckPos = wp(neck), hip = wp(back), sh = wp(shoulder);

  // Snout: the points furthest forward on the head. The mouth sits just under and behind its tip.
  const front = pts.filter((p) => p.z > box.max.z - (box.max.z - headPos.z) * 0.25 && p.y > headPos.y - (box.max.y - box.min.y) * 0.25);
  const snout = front.reduce((a, p) => a.add(p), new THREE.Vector3()).multiplyScalar(1 / Math.max(1, front.length));
  const snoutLow = Math.min(...front.map((p) => p.y));
  const mouth = new THREE.Vector3(0, lerp(snoutLow, snout.y, 0.25), snout.z - (box.max.z - snout.z) * 0.5);

  // Neck thickness, for the scarf: how far the skin sits from the neck bone, across the neck.
  const nextUp = neck.children.find((c) => c.isBone) || head;
  const dir = wp(nextUp).sub(neckPos).normalize();
  const radial = [];
  const slab = (box.max.y - box.min.y) * 0.05;
  for (const p of pts) {
    const rel = p.clone().sub(neckPos), along = rel.dot(dir);
    if (Math.abs(along) < slab) radial.push(rel.addScaledVector(dir, -along).length());
  }
  radial.sort((a, b) => a - b);
  const neckR = radial.length ? radial[Math.floor(radial.length * 0.85)] : (box.max.y - box.min.y) * 0.1;

  rec.scene = scene;
  rec.clips = gltf.animations;
  rec.box = box;
  rec.unitsTall = box.max.y - box.min.y;
  rec.mouth = { pos: mouth, bone: 'Head' };
  rec.neck = { pos: neckPos, dir, r: neckR, bone: neck.name };
  rec.hipY = hip.y - box.min.y;
  rec.spine = Math.max(0.2, sh.z - hip.z);
  rec.length = box.max.z - box.min.z;
  // Underside of the body, taken from the middle of the back where no leg hangs down.
  const z0 = hip.z + (sh.z - hip.z) * 0.38, z1 = hip.z + (sh.z - hip.z) * 0.62;
  let belly = Infinity;
  for (const p of pts) if (p.z > z0 && p.z < z1 && p.y < belly) belly = p.y;
  rec.bellyY = Number.isFinite(belly) ? belly - box.min.y : rec.hipY * 0.6;
}
const lerp = (a, b, t) => a + (b - a) * t;

// A copy of a species for one avatar: its own skeleton, materials and animation player.
export function buildQuad(spec, tint) {
  const src = models.get(spec.id);
  const scale = spec.height / src.unitsTall;
  const root = cloneSkinned(src.scene);
  const materials = new Map();
  let mainSeen = false;
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.frustumCulled = false;      // the skeleton moves the mesh well outside its resting bounds
    const base = o.material;
    if (!materials.has(base)) {
      const m = base.clone();
      // The first large fur material takes the colour variant.
      const isMain = !mainSeen && (base.name === 'Main' || base.name === 'Material');
      if (isMain) { mainSeen = true; if (tint) m.color.set(tint); }
      m.roughness = 0.9; m.metalness = 0;
      m.emissive.copy(m.color); m.emissiveIntensity = 0.22;   // keeps fur readable under moonlight
      m.userData.own = m.color.clone();
      materials.set(base, m);
    }
    o.material = materials.get(base);
  });
  const holder = new THREE.Group();
  holder.scale.setScalar(scale);
  holder.position.y = -src.box.min.y * scale;
  holder.add(root);
  const rig = new THREE.Group();
  rig.add(holder);
  rig.updateMatrixWorld(true);

  const mixer = new THREE.AnimationMixer(root);
  const actions = {};
  for (const clip of src.clips) actions[clip.name] = mixer.clipAction(clip);
  for (const n of ['idle', 'walk', 'run']) if (actions[n]) { actions[n].play(); actions[n].setEffectiveWeight(n === 'idle' ? 1 : 0); }

  // An anchor that follows a bone but, in the rest pose, sits at a given spot facing the way the animal faces.
  // Things parented to it are sized in metres.
  const inv = new THREE.Matrix4();
  function anchorOn(boneName, worldPos, worldQuat) {
    const b = bone(root, boneName);
    const a = new THREE.Group();
    inv.copy(b.matrixWorld).invert();
    const local = new THREE.Matrix4().compose(worldPos.clone().applyMatrix4(holder.matrixWorld), worldQuat || new THREE.Quaternion(), new THREE.Vector3(1, 1, 1)).premultiply(inv);
    local.decompose(a.position, a.quaternion, a.scale);
    b.add(a);
    return a;
  }
  const mouth = anchorOn(src.mouth.bone, src.mouth.pos);
  const neckQ = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), src.neck.dir);
  const neck = anchorOn(src.neck.bone, src.neck.pos, neckQ);

  const bones = {};
  for (const n of ['Body', 'Back', 'Torso', 'Neck1', 'Neck2', 'Neck3', 'Head', 'Tail1', 'Tail2',
    'FrontShoulderL', 'FrontShoulderR', 'FrontUpperLegL', 'FrontUpperLegR', 'FrontLowerLegL', 'FrontLowerLegR',
    'BackShoulderL', 'BackShoulderR', 'BackLegL', 'BackLegR', 'BackUpperLegL', 'BackUpperLegR', 'BackLowerLegL', 'BackLowerLegR',
    'IKFrontLegL', 'IKFrontLegR', 'IKBackLegL', 'IKBackLegR']) {
    const b = bone(root, n);
    if (b) bones[n] = b;
  }
  // Each paw is its own bone, animated separately from the leg above it, so the game carries it along with
  // the lower leg every frame. Remember where each paw sits relative to its lower leg.
  const feet = [];
  for (const [ik, lower] of [['IKFrontLegL', 'FrontLowerLegL'], ['IKFrontLegR', 'FrontLowerLegR'], ['IKBackLegL', 'BackLowerLegL'], ['IKBackLegR', 'BackLowerLegR']]) {
    if (!bones[ik] || !bones[lower]) continue;
    const rel = new THREE.Matrix4().copy(bones[lower].matrixWorld).invert().multiply(bones[ik].matrixWorld);
    feet.push({ ik: bones[ik], lower: bones[lower], rel, front: ik.includes('Front'), left: ik.endsWith('L'), restQ: bones[ik].quaternion.clone() });
  }
  // Leg segments, seen from the side: which way each one points (0 straight down, positive forward) and how long
  // it is, in metres. The lying pose is worked out from these so it fits every species.
  const at = (b) => new THREE.Vector3().setFromMatrixPosition(b.matrixWorld);
  const seg = (a, b) => { const p = at(a), q = at(b); return { bone: a, phi: Math.atan2(q.z - p.z, p.y - q.y), len: Math.hypot(q.z - p.z, q.y - p.y) }; };
  const legs = [];
  for (const s of ['L', 'R']) {
    const fu = bones['FrontUpperLeg' + s], fl = bones['FrontLowerLeg' + s], fi = bones['IKFrontLeg' + s];
    if (fu && fl && fi) legs.push({ front: true, side: s, segs: [seg(fu, fl), seg(fl, fi)], top: at(fu).y, foot: at(fi).y });
    const bl = bones['BackLeg' + s], bu = bones['BackUpperLeg' + s], bw = bones['BackLowerLeg' + s], bi = bones['IKBackLeg' + s];
    if (bl && bu && bw && bi) legs.push({ front: false, side: s, segs: [seg(bl, bu), seg(bu, bw), seg(bw, bi)], top: at(bl).y, foot: at(bi).y });
  }
  // How many metres one unit of the body bone's own up-and-down movement is worth.
  const pe = bones.Body.parent.matrixWorld.elements;
  const unit = Math.hypot(pe[4], pe[5], pe[6]) || scale;
  const rest = new Map();
  for (const b of Object.values(bones)) rest.set(b, { p: b.position.clone(), q: b.quaternion.clone() });

  return {
    quad: true, rig, holder, root, mixer, actions, bones, rest, feet, legs, unit, mouth, neck, scale,
    bellyY: src.bellyY * scale,
    height: spec.height, bodyLength: src.length * scale, neckR: src.neck.r * scale,
    hipY: src.hipY, spine: src.spine,       // in model units
    materials: [...materials.values()],
  };
}
