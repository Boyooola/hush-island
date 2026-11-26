// The island's furniture, modelled in Blender (assets/site/props.glb): the fire ring, the seat logs, the woodpile,
// rocks and so on. Each is a named piece in the one file. The shapes built in code stand in until the file arrives
// (or for good, if it never does), and are swapped for these when it does.
import * as THREE from 'three';
import { ISLE } from './terrain.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Batches (a wood of trees drawn as one piece) cannot fade one tree at a time when it comes between the camera and
// the visitor, so instead a hole is cut through them: whatever lies close to the line from the camera to the
// visitor, and above the visitor's head, is not drawn. main.js keeps these two points up to date.
export const cutaway = { cam: { value: new THREE.Vector3() }, me: { value: new THREE.Vector3(0, -999, 0) } };
export function cutInto(material, inner, outer) {
  material.onBeforeCompile = (sh) => {
    sh.uniforms.uCutCam = cutaway.cam; sh.uniforms.uCutMe = cutaway.me;
    sh.vertexShader = 'varying vec3 vCutP;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n  vec4 cutP = vec4(transformed, 1.0);\n  #ifdef USE_INSTANCING\n  cutP = instanceMatrix * cutP;\n  #endif\n  vCutP = (modelMatrix * cutP).xyz;');
    sh.fragmentShader = 'varying vec3 vCutP;\nuniform vec3 uCutCam;\nuniform vec3 uCutMe;\n' + sh.fragmentShader.replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>\n  { vec3 ab = uCutMe - uCutCam; float ck = clamp(dot(vCutP - uCutCam, ab) / dot(ab, ab), 0.0, 1.0); float cd = length(vCutP - (uCutCam + ab * ck)); if (ck > 0.02 && vCutP.y > uCutMe.y + 1.25 && cd < ${outer.toFixed(2)}) { if (cd < ${inner.toFixed(2)} || mod(floor(gl_FragCoord.x) + floor(gl_FragCoord.y), 2.0) < 1.0) discard; } }`);
  };
  return material;
}
let loading = null;
const baked = new Map();
// Resolves to a maker: make(name, skip) gives a fresh copy of the named piece (or null), with all its small parts
// merged into one mesh per material so that a pile of forty logs costs four draws, not forty.
export function loadProps() {
  if (!loading) loading = new Promise((res) => {
    new GLTFLoader().load('./props.glb', (gltf) => {
      const scene = gltf.scene;
      scene.updateMatrixWorld(true);
      // On Lantern Rock the leaves follow the real month: fresh in spring, deep green in summer, as modelled in autumn, frosted in winter.
      if (ISLE === 'far') {
        const m = new Date().getMonth(), to = m <= 1 || m === 11 ? [0xdfe6e8, 0.5] : m <= 4 ? [0x8cc063, 0.6] : m <= 7 ? [0x4f8a45, 0.6] : null, seen = new Set();
        if (to) scene.traverse((o) => { if (o.isMesh && o.material && !seen.has(o.material) && /leaf|needle|pine_/.test(o.material.name) && !/^ga_|bark|trunk/.test(o.material.name)) { seen.add(o.material); o.material.color.lerp(new THREE.Color(to[0]), to[1]); } });
      }
      const bake = (name, skip) => {
        const key = name + '|' + (skip || '');
        if (baked.has(key)) return baked.get(key);
        const root = scene.getObjectByName(name);
        if (!root) { baked.set(key, null); return null; }
        const inv = new THREE.Matrix4().copy(root.matrixWorld).invert(), by = new Map();
        const walk = (o) => {
          if (o !== root && skip && (skip.test ? skip.test(o.name) : o.name.startsWith(skip))) return;
          if (o.isMesh) {
            const g = o.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
            for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
            if (!by.has(o.material)) by.set(o.material, []);
            by.get(o.material).push(g);
          }
          o.children.forEach(walk);
        };
        walk(root);
        const parts = [...by.entries()].map(([m, gs]) => { m.flatShading = true; return [mergeGeometries(gs, false), m]; }).filter(([g]) => g);
        baked.set(key, parts);
        return parts;
      };
      // One piece as a single lump of geometry, its colours painted onto the corners: for things that are
      // scattered in their hundreds (a wood of trees) and must cost one draw between them, not one each.
      const lumps = new Map();
      const paint = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95, metalness: 0, side: THREE.DoubleSide });
      cutInto(paint, 1.4, 2.0);
      const single = (name, skip) => {
        const key = name + '|' + (skip || '');
        if (lumps.has(key)) return lumps.get(key);
        const parts = bake(name, skip);
        if (!parts || !parts.length) { lumps.set(key, null); return null; }
        const gs = parts.map(([geo, m]) => {
          const g = geo.clone(), n = g.attributes.position.count, col = new Float32Array(n * 3);
          for (let i = 0; i < n; i++) { col[i * 3] = m.color.r; col[i * 3 + 1] = m.color.g; col[i * 3 + 2] = m.color.b; }
          g.setAttribute('color', new THREE.BufferAttribute(col, 3));
          return g.index ? g.toNonIndexed() : g;
        });
        const out = { geometry: mergeGeometries(gs, false), material: paint };
        lumps.set(key, out);
        return out;
      };
      const make = (name, skip) => {
        const parts = bake(name, skip);
        if (!parts || !parts.length) return null;
        const g = new THREE.Group();
        for (const [geo, m] of parts) { const mesh = new THREE.Mesh(geo, m); mesh.castShadow = true; mesh.receiveShadow = true; g.add(mesh); }
        return g;
      };
      make.single = single;
      res(make);
    }, undefined, () => res(null));
  });
  return loading;
}
