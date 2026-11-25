// Trim the Quaternius animals for the game: keep the animations we use, drop redundant keyframes,
// store rotations as 16-bit values, write GLB.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { resample, prune, dedup, quantize } from '@gltf-transform/functions';
import fs from 'node:fs';
import path from 'node:path';

const [srcDir, outDir] = process.argv.slice(2);
const SPECIES = { cow: 'Cow', fox: 'Fox', shiba: 'ShibaInu', husky: 'Husky', wolf: 'Wolf', deer: 'Deer', stag: 'Stag', alpaca: 'Alpaca', donkey: 'Donkey' };
const KEEP = { Idle: 'idle', Idle_2: 'idle2', Walk: 'walk', Gallop: 'run', Gallop_Jump: 'jump', Eating: 'eat',  };
const CONTROL = /^PoleTarget/;   // aiming helpers only; the IK and FF bones carry the paws and must keep their motion
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
fs.mkdirSync(outDir, { recursive: true });
for (const [id, file] of Object.entries(SPECIES)) {
  const doc = await io.read(path.join(srcDir, file + '.gltf'));
  const root = doc.getRoot();
  const skinned = new Set();
  for (const mesh of root.listMeshes()) for (const prim of mesh.listPrimitives()) {
    const j = prim.getAttribute('JOINTS_0'), w = prim.getAttribute('WEIGHTS_0');
    if (!j || !w) continue;
    for (let i = 0; i < j.getCount(); i++) { const je = j.getElement(i, []), we = w.getElement(i, []); je.forEach((jj, k) => { if (we[k] > 0) skinned.add(jj); }); }
  }
  const joints = root.listSkins()[0].listJoints();
  const used = new Set([...skinned].map((i) => joints[i].getName()));
  let dropped = 0, kept = 0;
  for (const anim of root.listAnimations()) {
    const to = KEEP[anim.getName()];
    if (!to) { anim.listChannels().forEach((c) => c.dispose()); anim.listSamplers().forEach((x) => x.dispose()); anim.dispose(); continue; }
    anim.setName(to);
    for (const ch of anim.listChannels()) {
      const node = ch.getTargetNode();
      const name = node ? node.getName() : '';
      // Helper bones and scale tracks carry nothing the game needs.
      if (CONTROL.test(name) || ch.getTargetPath() === 'scale') { const sm = ch.getSampler(); ch.dispose(); if (sm) sm.dispose(); dropped++; } else kept++;
    }
  }
  await doc.transform(resample({ tolerance: 0.0005 }), prune(), dedup());
  // Rotations as normalised 16-bit integers: half the size, no visible difference.
  for (const anim of root.listAnimations()) for (const s of anim.listSamplers()) {
    const out = s.getOutput();
    if (out.getType() === 'VEC4' && out.getComponentType() === 5126) {
      const src = out.getArray(), dst = new Int16Array(src.length);
      for (let i = 0; i < src.length; i++) dst[i] = Math.round(Math.max(-1, Math.min(1, src[i])) * 32767);
      out.setArray(dst).setNormalized(true);
    }
  }
  await doc.transform(quantize({ quantizePosition: 14, quantizeNormal: 10, quantizeWeight: 8 }), prune(), dedup());
  const glb = await io.writeBinary(doc);
  fs.writeFileSync(path.join(outDir, id + '.glb'), glb);
  const verts = root.listMeshes().flatMap((m) => m.listPrimitives()).reduce((n, p) => n + p.getAttribute('POSITION').getCount(), 0);
  const animBytes = root.listAnimations().flatMap((a) => a.listSamplers()).reduce((n, s) => n + s.getInput().getByteLength() + s.getOutput().getByteLength(), 0);
  console.log(id.padEnd(7), (glb.byteLength / 1024).toFixed(0).padStart(5), 'KB | verts', verts, '| animation', (animBytes / 1024).toFixed(0), 'KB | channels kept', kept, 'dropped', dropped, '| skinned bones', used.size, 'of', joints.length);
}
