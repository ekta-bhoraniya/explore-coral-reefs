import * as THREE from 'three';
import vert from '../shaders/pano.vert?raw';
import frag from '../shaders/pano.frag?raw';
import common from '../shaders/common.glsl?raw';

export const withCommon = (src: string) => src.replace('#include <common_water>', common);

/** The inward-facing panorama sphere with two texture slots for crossfades. */
export class PanoSphere {
  readonly mesh: THREE.Mesh;
  readonly uniforms = {
    uPanoA: { value: null as THREE.Texture | null },
    uPanoB: { value: null as THREE.Texture | null },
    uMix: { value: 0 },
    uYawA: { value: 0 },
    uYawB: { value: 0 },
    uZoomA: { value: 0 },
    uZoomB: { value: 0 },
    uForward: { value: new THREE.Vector3(0, 0, -1) },
    uTime: { value: 0 },
    uCaustics: { value: 0.6 },
    uShimmer: { value: 1 },
    uDepth: { value: 2.2 },
  };
  private fade: { from: number; dur: number; resolve: () => void } | null = null;

  constructor(private anisotropy: number) {
    const geo = new THREE.SphereGeometry(500, 96, 64);
    geo.scale(-1, 1, 1);
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: vert,
      fragmentShader: withCommon(frag),
      depthWrite: false,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.renderOrder = -10;
  }

  prepare(tex: THREE.Texture) {
    tex.anisotropy = this.anisotropy;
    return tex;
  }

  /** Show a texture immediately in slot A. */
  setNow(tex: THREE.Texture, yawDeg = 0) {
    this.uniforms.uPanoA.value = this.prepare(tex);
    this.uniforms.uYawA.value = THREE.MathUtils.degToRad(yawDeg);
    this.uniforms.uMix.value = 0;
  }

  get busy() { return this.fade !== null; }

  /** Plain crossfade (used for progressive quality upgrades). */
  crossfade(tex: THREE.Texture, yawDeg: number, ms: number, now: number): Promise<void> {
    this.uniforms.uPanoB.value = this.prepare(tex);
    this.uniforms.uYawB.value = THREE.MathUtils.degToRad(yawDeg);
    this.uniforms.uZoomB.value = 0;
    return new Promise((resolve) => { this.fade = { from: now, dur: ms, resolve }; });
  }

  /** Promote slot B to slot A (end of a transition). */
  commitB() {
    const u = this.uniforms;
    const old = u.uPanoA.value;
    u.uPanoA.value = u.uPanoB.value;
    u.uYawA.value = u.uYawB.value;
    u.uZoomA.value = 0; u.uZoomB.value = 0; u.uMix.value = 0;
    u.uPanoB.value = null;
    return old;
  }

  /** Jump any running crossfade to its end. */
  finishFade() {
    if (!this.fade) return;
    this.commitB();
    const r = this.fade.resolve; this.fade = null; r();
  }

  update(now: number) {
    if (!this.fade) return;
    const t = Math.min(1, (now - this.fade.from) / this.fade.dur);
    this.uniforms.uMix.value = t * t * (3 - 2 * t);
    if (t >= 1) {
      this.commitB();
      const r = this.fade.resolve; this.fade = null; r();
    }
  }
}
