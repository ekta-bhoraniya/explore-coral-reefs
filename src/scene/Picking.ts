import * as THREE from 'three';
import type { Fish } from './Fish';
import type { Resident } from './FishManager';
import type { Hotspot } from './Hotspots';

export type Target =
  | { kind: 'fish'; fish: Fish }
  | { kind: 'resident'; resident: Resident }
  | { kind: 'hotspot'; hotspot: Hotspot };

export const sameTarget = (a: Target | null, b: Target | null) => {
  if (!a || !b) return a === b;
  if (a.kind !== b.kind) return false;
  if (a.kind === 'fish') return a.fish === (b as typeof a).fish;
  if (a.kind === 'resident') return a.resident === (b as typeof a).resident;
  return a.hotspot === (b as typeof a).hotspot;
};

/** Raycasts the pointer against pick boxes, resident outlines and hotspot rings. */
export class Picking {
  private ray = new THREE.Raycaster();

  pick(ndc: THREE.Vector2, camera: THREE.Camera, objects: THREE.Object3D[]): Target | null {
    this.ray.setFromCamera(ndc, camera);
    const hits = this.ray.intersectObjects(objects, false);
    for (const h of hits) {
      const u = h.object.userData;
      if (u.hotspot) return { kind: 'hotspot', hotspot: u.hotspot };
      if (u.fish) return { kind: 'fish', fish: u.fish };
      if (u.resident) return { kind: 'resident', resident: u.resident };
    }
    return null;
  }
}

export function setTargetHover(t: Target | null, on: boolean) {
  if (!t) return;
  if (t.kind === 'fish') t.fish.setHover(on);
  else if (t.kind === 'resident') t.resident.setHover(on);
  else t.hotspot.hoverTarget = on ? 1 : 0;
}
