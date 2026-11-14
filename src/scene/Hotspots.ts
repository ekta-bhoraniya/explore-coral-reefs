import * as THREE from 'three';
import type { RuntimeSpot } from '../data/content';
import { spotById } from '../data/content';
import { dirFromYawPitch } from './Fish';

function ringTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const glow = g.createRadialGradient(64, 64, 20, 64, 64, 62);
  glow.addColorStop(0, 'rgba(191,246,255,0)');
  glow.addColorStop(0.55, 'rgba(191,246,255,0.0)');
  glow.addColorStop(0.72, 'rgba(191,246,255,0.95)');
  glow.addColorStop(0.8, 'rgba(255,255,255,1)');
  glow.addColorStop(0.9, 'rgba(191,246,255,0.35)');
  glow.addColorStop(1, 'rgba(191,246,255,0)');
  g.fillStyle = glow; g.fillRect(0, 0, 128, 128);
  const inner = g.createRadialGradient(64, 64, 0, 64, 64, 34);
  inner.addColorStop(0, 'rgba(191,246,255,0.35)'); inner.addColorStop(1, 'rgba(191,246,255,0)');
  g.fillStyle = inner; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export interface Hotspot { sprite: THREE.Sprite; to: string; title: string; yaw: number; pitch: number; hover: number; hoverTarget: number }

/** Glowing rings 20 units away, one per link of the current spot. */
export class Hotspots {
  readonly group = new THREE.Group();
  items: Hotspot[] = [];
  private tex = ringTexture();
  private visibility = 1;
  visibleTarget = 1;

  set(spot: RuntimeSpot) {
    this.items.forEach((h) => { this.group.remove(h.sprite); (h.sprite.material as THREE.Material).dispose(); });
    this.items = spot.links.map((l) => {
      const mat = new THREE.SpriteMaterial({ map: this.tex, transparent: true, depthWrite: false, depthTest: false, fog: false, blending: THREE.AdditiveBlending });
      const s = new THREE.Sprite(mat);
      const yaw = l.yaw + spot.yawOffset;
      s.position.copy(dirFromYawPitch(yaw, l.pitch)).multiplyScalar(20);
      s.renderOrder = 20;
      const h: Hotspot = { sprite: s, to: l.to, title: spotById(l.to)?.title ?? l.to, yaw, pitch: l.pitch, hover: 0, hoverTarget: 0 };
      s.userData.hotspot = h;
      this.group.add(s);
      return h;
    });
    this.visibility = 0;
  }

  update(dt: number, time: number) {
    this.visibility += (this.visibleTarget - this.visibility) * Math.min(1, dt * 4);
    this.group.visible = this.visibility > 0.02;
    for (const h of this.items) {
      h.hover += (h.hoverTarget - h.hover) * Math.min(1, dt * 10);
      const pulse = (Math.sin((time / 2) * Math.PI * 2) + 1) / 2; // 2 s loop
      const scale = 1.6 * (1 + 0.15 * pulse) * (1 + 0.25 * h.hover);
      h.sprite.scale.set(scale, scale, 1);
      (h.sprite.material as THREE.SpriteMaterial).opacity = (0.55 + 0.3 * pulse + 0.4 * h.hover) * this.visibility;
    }
  }
}
