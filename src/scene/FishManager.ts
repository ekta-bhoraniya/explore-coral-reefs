import * as THREE from 'three';
import { ShapeUtils } from 'three';
import type { RuntimeSpot } from '../data/content';
import { speciesById } from '../data/content';
import type { Species } from '../data/schema';
import { Fish, fishShared, dirFromYawPitch } from './Fish';
import { loadFishTemplate } from './fishModels';

/** Equirect image UV (v = 0 at the top) -> direction, honouring the spot's yaw offset. */
export function uvToDir(u: number, v: number, yawOffsetDeg: number, out = new THREE.Vector3()) {
  const lon = (u - 0.5) * 360 + yawOffsetDeg;
  const lat = (0.5 - v) * 180;
  return dirFromYawPitch(lon, lat, out);
}
export function dirToUv(d: THREE.Vector3, yawOffsetDeg: number) {
  let lon = THREE.MathUtils.radToDeg(Math.atan2(d.x, -d.z)) - yawOffsetDeg;
  lon = ((lon + 540) % 360) - 180;
  const lat = THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(d.y, -1, 1)));
  return [lon / 360 + 0.5, 0.5 - lat / 180] as [number, number];
}

export class Resident {
  readonly fill: THREE.Mesh;
  readonly outline: THREE.LineLoop;
  readonly center = new THREE.Vector3();
  private hover = 0;
  private hoverTarget = 0;
  private fade = 0;
  private fadeTarget = 0;
  constructor(readonly species: Species, polygon: [number, number][], yawOffset: number) {
    const R = 499;
    const pts3 = polygon.map(([u, v]) => uvToDir(u, v, yawOffset).multiplyScalar(R));
    const tris = ShapeUtils.triangulateShape(polygon.map(([u, v]) => new THREE.Vector2(u, -v)), []);
    const geo = new THREE.BufferGeometry().setFromPoints(pts3);
    geo.setIndex(tris.flat());
    this.fill = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xbff6ff, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false }));
    this.fill.userData.resident = this;
    this.fill.renderOrder = 2;
    // slightly enlarged outline for the glow
    pts3.forEach((p) => this.center.add(p));
    this.center.divideScalar(pts3.length);
    const outlinePts = pts3.map((p) => p.clone().sub(this.center).multiplyScalar(1.12).add(this.center));
    this.outline = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(outlinePts),
      new THREE.LineBasicMaterial({ color: 0xbff6ff, transparent: true, opacity: 0, depthWrite: false, fog: false }));
    this.outline.renderOrder = 3;
  }
  setHover(on: boolean) { this.hoverTarget = on ? 1 : 0; }
  setFade(v: number) { this.fadeTarget = v; }
  update(dt: number, time: number) {
    this.hover += (this.hoverTarget - this.hover) * Math.min(1, dt * 8);
    this.fade += (this.fadeTarget - this.fade) * Math.min(1, dt * 3);
    const pulse = 0.85 + 0.15 * Math.sin(time * 4);
    (this.fill.material as THREE.MeshBasicMaterial).opacity = this.hover * 0.14 * this.fade;
    (this.outline.material as THREE.LineBasicMaterial).opacity = this.hover * 0.9 * pulse * this.fade;
  }
  dispose() {
    this.fill.geometry.dispose(); (this.fill.material as THREE.Material).dispose();
    this.outline.geometry.dispose(); (this.outline.material as THREE.Material).dispose();
  }
}

interface SpotFish { spotId: string; group: THREE.Group; fish: Fish[]; residents: Resident[]; leaving: boolean; leaveAt: number }

export class FishManager {
  readonly group = new THREE.Group();
  private sun = new THREE.DirectionalLight(0xfff4dc, 2.2);
  private hemi = new THREE.HemisphereLight(0x9fe6ff, 0x1d4f66, 1.4);
  private sets: SpotFish[] = [];
  private fog: THREE.Fog;

  constructor(scene: THREE.Scene) {
    this.group.add(this.sun, this.sun.target, this.hemi);
    scene.add(this.group);
    this.fog = new THREE.Fog(0x1d6a86, 2, 18);
    scene.fog = this.fog;
  }

  /** Preload the models a spot needs. */
  preload(spot: RuntimeSpot) {
    return Promise.all(spot.swimmers.map((w) => { const sp = speciesById(w.species); return sp ? loadFishTemplate(sp) : null; }));
  }

  applyGrade(spot: RuntimeSpot) {
    fishShared.uGradeTint.value.set(spot.grade.tint);
    fishShared.uGradeSat.value = spot.grade.saturation;
    fishShared.uGradeExp.value = spot.grade.exposure;
    fishShared.uCausticAmt.value = spot.water.caustics;
    this.fog.color.set(spot.grade.hazeColor);
    const sun = dirFromYawPitch(spot.water.sunYaw + spot.yawOffset, 70);
    this.sun.position.copy(sun).multiplyScalar(10);
  }

  /** Build fish for a spot and fade them in. Previous spot's fish fade out. */
  async enter(spot: RuntimeSpot, now: number) {
    this.leaveAll(now);
    const set: SpotFish = { spotId: spot.id, group: new THREE.Group(), fish: [], residents: [], leaving: false, leaveAt: 0 };
    this.sets.push(set);
    this.group.add(set.group);
    this.applyGrade(spot);
    for (const r of spot.residents) {
      const sp = speciesById(r.species);
      if (!sp) continue;
      const res = new Resident(sp, r.polygon as [number, number][], spot.yawOffset);
      res.setFade(1);
      set.residents.push(res);
      set.group.add(res.fill, res.outline);
    }
    for (const w of spot.swimmers) {
      const sp = speciesById(w.species);
      if (!sp) continue;
      const tpl = await loadFishTemplate(sp);
      if (!tpl || set.leaving) continue;
      for (let i = 0; i < w.count; i++) {
        const f = new Fish(sp, tpl, w, i, spot.yawOffset);
        f.setFade(1);
        set.fish.push(f);
        set.group.add(f.root);
      }
    }
  }

  leaveAll(now: number) {
    for (const s of this.sets) {
      if (s.leaving) continue;
      s.leaving = true; s.leaveAt = now;
      s.fish.forEach((f) => f.setFade(0));
      s.residents.forEach((r) => r.setFade(0));
    }
  }

  /** Active (non-leaving) fish and residents. */
  get active() { return this.sets.find((s) => !s.leaving) ?? null; }

  pickables(): THREE.Object3D[] {
    const a = this.active;
    if (!a) return [];
    return [...a.fish.filter((f) => f.root.visible).map((f) => f.pickBox), ...a.residents.map((r) => r.fill)];
  }

  update(dt: number, time: number, now: number) {
    fishShared.uTime.value = time;
    for (const s of this.sets) {
      s.fish.forEach((f) => f.update(dt));
      s.residents.forEach((r) => r.update(dt, time));
    }
    // dispose sets that finished fading out
    this.sets = this.sets.filter((s) => {
      if (s.leaving && now - s.leaveAt > 1500) {
        this.group.remove(s.group);
        s.fish.forEach((f) => f.dispose());
        s.residents.forEach((r) => r.dispose());
        return false;
      }
      return true;
    });
  }
}
