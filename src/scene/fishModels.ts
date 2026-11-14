import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { Species } from '../data/schema';
import { asset } from '../asset';

const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);

export interface FishTemplate {
  root: THREE.Object3D;
  skinned: boolean;
  animations: THREE.AnimationClip[];
  /** half extents of the normalised fish (length 1 along X) */
  halfSize: THREE.Vector3;
}

const cache = new Map<string, Promise<FishTemplate | null>>();

/**
 * Loads a species model once and normalises it: head toward +X, 1 unit long, centred.
 * Static meshes get the transform baked into their geometry so the wiggle shader can use
 * object-space X as "head to tail". Skinned meshes keep their transform and animation.
 */
export function loadFishTemplate(sp: Species): Promise<FishTemplate | null> {
  const m = sp.model;
  if (!m) return Promise.resolve(null);
  if (!cache.has(sp.id)) {
    cache.set(sp.id, loader.loadAsync(asset(`models/${m.file}`)).then((gltf) => {
      const src = gltf.scene;
      src.rotation.set(...(m.rotation.map(THREE.MathUtils.degToRad) as [number, number, number]));
      src.updateMatrixWorld(true);
      let skinned = false;
      src.traverse((o) => { if ((o as THREE.SkinnedMesh).isSkinnedMesh) skinned = true; });

      const box = new THREE.Box3().setFromObject(src, true);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const s = m.scale ?? 1 / Math.max(size.x, 1e-6);
      const norm = new THREE.Matrix4().makeScale(s, s, s).multiply(new THREE.Matrix4().makeTranslation(-center.x, -center.y, -center.z));

      let root: THREE.Object3D;
      if (skinned) {
        const wrap = new THREE.Group();
        const inner = new THREE.Group();
        inner.add(src);
        inner.applyMatrix4(norm);
        wrap.add(inner);
        root = wrap;
      } else {
        root = new THREE.Group();
        src.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (!mesh.isMesh) return;
          const geo = mesh.geometry.clone();
          geo.applyMatrix4(new THREE.Matrix4().multiplyMatrices(norm, mesh.matrixWorld));
          geo.computeBoundingBox(); geo.computeBoundingSphere();
          const baked = new THREE.Mesh(geo, mesh.material);
          root.add(baked);
        });
      }
      const half = size.clone().multiplyScalar(s * 0.5);
      return { root, skinned, animations: gltf.animations, halfSize: half };
    }).catch((e) => { console.warn('fish model failed', sp.id, e); return null; }));
  }
  return cache.get(sp.id)!;
}

export function cloneTemplate(t: FishTemplate): THREE.Object3D {
  return t.skinned ? SkeletonUtils.clone(t.root) : t.root.clone(true);
}
