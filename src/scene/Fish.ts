import * as THREE from 'three';
import wiggleChunk from '../shaders/wiggle.vert?raw';
import common from '../shaders/common.glsl?raw';
import type { Species, Swimmer } from '../data/schema';
import { cloneTemplate, type FishTemplate } from './fishModels';

export const dirFromYawPitch = (yawDeg: number, pitchDeg: number, out = new THREE.Vector3()) => {
  const y = THREE.MathUtils.degToRad(yawDeg), p = THREE.MathUtils.degToRad(pitchDeg);
  return out.set(Math.cos(p) * Math.sin(y), Math.sin(p), -Math.cos(p) * Math.cos(y));
};

/** Uniforms shared by every fish (photo match + caustics). */
export const fishShared = {
  uTime: { value: 0 },
  uGradeTint: { value: new THREE.Color(0x2a7f9e) },
  uGradeSat: { value: 0.9 },
  uGradeExp: { value: 1 },
  uCausticAmt: { value: 0.6 },
};

function patchMaterial(src: THREE.Material, own: Record<string, THREE.IUniform>) {
  const mat = src.clone() as THREE.MeshStandardMaterial;
  mat.transparent = true;
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, fishShared, own);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        uniform float uWiggleAmp; uniform float uWiggleFreq; uniform float uFishTime;
        varying vec3 vWPos; varying vec3 vWNormal;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${wiggleChunk}`)
      .replace('#include <project_vertex>', `#include <project_vertex>
        vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vWNormal = normalize(mat3(modelMatrix) * objectNormal);`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uTime; uniform vec3 uGradeTint; uniform float uGradeSat; uniform float uGradeExp;
        uniform float uCausticAmt; uniform float uRim; uniform float uFade;
        varying vec3 vWPos; varying vec3 vWNormal;
        ${common}`)
      .replace('#include <fog_fragment>', `
        {
          float up = clamp(vWNormal.y, 0.0, 1.0);
          gl_FragColor.rgb += caustic(vWPos.xz * 1.6, uTime * 0.9) * 0.22 * up * uCausticAmt * vec3(0.85, 1.0, 1.0);
          float l = dot(gl_FragColor.rgb, vec3(0.2126, 0.7152, 0.0722));
          gl_FragColor.rgb = mix(vec3(l), gl_FragColor.rgb, uGradeSat);
          gl_FragColor.rgb = mix(gl_FragColor.rgb, gl_FragColor.rgb * uGradeTint * 1.6, 0.22) * uGradeExp;
          float fres = pow(1.0 - abs(dot(normalize(normal), normalize(vViewPosition))), 2.0);
          gl_FragColor.rgb += vec3(0.749, 0.965, 1.0) * fres * uRim;
          gl_FragColor.a *= uFade;
        }
        #include <fog_fragment>`);
  };
  mat.customProgramCacheKey = () => 'reef-fish';
  return mat;
}

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);

export class Fish {
  readonly root = new THREE.Group();
  readonly pickBox: THREE.Mesh;
  private body: THREE.Object3D;
  private own = {
    uWiggleAmp: { value: 0 }, uWiggleFreq: { value: 0 }, uFishTime: { value: 0 },
    uRim: { value: 0 }, uFade: { value: 0 },
  };
  private mixer: THREE.AnimationMixer | null = null;
  private center = new THREE.Vector3();
  private prev = new THREE.Vector3();
  private vel = new THREE.Vector3();
  private param: number;
  private passDir = 1;
  private waitLeft = 0;
  private hoverTarget = new THREE.Vector3();
  private hoverTimer = 0;
  private bank = 0;
  private heading = 0;
  speedScale = 1;
  private paused = false;
  private fadeTarget = 0;
  private rimTarget = 0;
  private time = Math.random() * 100;
  private first = true;

  constructor(readonly species: Species, template: FishTemplate, readonly cfg: Swimmer, readonly index: number, yawOffset: number) {
    const m = species.model!;
    this.body = cloneTemplate(template);
    this.body.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map((x) => patchMaterial(x, this.own)) : patchMaterial(mesh.material, this.own);
      mesh.frustumCulled = false;
    });
    this.root.add(this.body);
    this.root.scale.setScalar(m.displayLength);
    this.own.uWiggleAmp.value = m.wiggle.amp;
    this.own.uWiggleFreq.value = m.wiggle.freq;
    if (template.skinned && template.animations[0]) {
      this.mixer = new THREE.AnimationMixer(this.body);
      this.mixer.clipAction(template.animations[0]).play();
    }
    // generous invisible pick box (1.3x, with a minimum thickness so small fish are easy to click)
    const h = template.halfSize;
    const bx = new THREE.BoxGeometry(Math.max(h.x * 2.6, 1.3), Math.max(h.y * 2.6, 0.55), Math.max(h.z * 2.6, 0.55));
    this.pickBox = new THREE.Mesh(bx, new THREE.MeshBasicMaterial({ visible: false }));
    this.pickBox.userData.fish = this;
    this.root.add(this.pickBox);

    dirFromYawPitch(cfg.yaw + yawOffset, cfg.pitch, this.center).multiplyScalar(cfg.distance);
    this.param = (index / Math.max(1, cfg.count)) * Math.PI * 2 + Math.random() * 0.4;
    if (cfg.path === 'pass') {
      this.param = -1 - index * 0.25;
      this.passDir = index % 2 ? -1 : 1;
    }
    this.hoverTarget.copy(this.center);
    this.root.visible = false;
    this.step(0);
    this.prev.copy(this.root.position);
  }

  get isPaused() { return this.paused; }
  setFade(v: number) { this.fadeTarget = v; }
  setHover(on: boolean) { this.rimTarget = on ? 0.35 : 0; }
  pause() { this.paused = true; }
  resume() { this.paused = false; }

  /** World position of the fish's centre. */
  worldCenter(out = new THREE.Vector3()) { return this.root.getWorldPosition(out); }

  /** Advance the path parameter and place the fish. */
  private step(dt: number) {
    const c = this.cfg;
    const sp = c.speed * this.speedScale;
    if (c.path === 'loop') {
      const r = Math.max(0.3, c.radius) * (1 + (this.index % 3) * 0.12);
      this.param += (sp / r) * dt;
      const a = this.param;
      this.root.position.set(
        this.center.x + Math.cos(a) * r,
        this.center.y + Math.sin(a * 0.5 + this.index) * 0.25 + Math.sin(this.time * 0.6) * 0.06,
        this.center.z + Math.sin(a) * r * 0.6,
      );
    } else if (c.path === 'pass') {
      if (this.waitLeft > 0) {
        this.waitLeft -= dt;
        if (this.waitLeft <= 0) { this.passDir *= -1; this.param = -1; }
        return;
      }
      const R = Math.max(1, c.radius);
      this.param += (sp / R) * dt * 0.5;
      if (this.param > 1) { this.waitLeft = 10 + Math.random() * 20; return; }
      const right = new THREE.Vector3(this.center.z, 0, -this.center.x).normalize().negate();
      const t = Math.max(-1, this.param) * this.passDir;
      this.root.position.copy(this.center).addScaledVector(right, t * R);
      this.root.position.y += Math.sin(this.time * 0.5 + this.index) * 0.15;
    } else {
      this.hoverTimer -= dt;
      if (this.hoverTimer <= 0) {
        this.hoverTimer = 3 + Math.random() * 5;
        const r = Math.max(0.2, c.radius);
        this.hoverTarget.copy(this.center).add(new THREE.Vector3((Math.random() - 0.5) * 2 * r, (Math.random() - 0.5) * r * 0.6, (Math.random() - 0.5) * 2 * r));
      }
      const to = this.hoverTarget.clone().sub(this.root.position);
      const d = to.length();
      if (d > 0.01) this.root.position.addScaledVector(to.normalize(), Math.min(d, sp * dt));
      this.root.position.y += Math.sin(this.time * 0.9 + this.index) * 0.002;
    }
  }

  update(dt: number) {
    this.time += dt;
    // ease speed toward 0 when paused (400 ms) and back to 1 when resumed
    const target = this.paused ? 0 : 1;
    this.speedScale += (target - this.speedScale) * (1 - Math.pow(0.0001, dt / 0.4)) ;
    if (Math.abs(this.speedScale - target) < 0.002) this.speedScale = target;

    this.step(dt);
    const waiting = this.waitLeft > 0;

    // fades
    const f = this.own.uFade;
    f.value += ((waiting ? 0 : this.fadeTarget) - f.value) * Math.min(1, dt * 3);
    this.root.visible = f.value > 0.01;
    this.own.uRim.value += (this.rimTarget - this.own.uRim.value) * Math.min(1, dt * 8);

    // orientation: face travel direction, smoothed, banking into turns
    if (dt > 0) this.vel.copy(this.root.position).sub(this.prev).divideScalar(dt);
    this.prev.copy(this.root.position);
    const spd = this.vel.length();
    if (spd > 0.02 && !this.first) {
      // fish stay mostly level: damp vertical heading so they never point straight up or down
      const fwd = this.vel.clone(); fwd.y *= 0.3; fwd.normalize();
      const heading = Math.atan2(fwd.z, fwd.x);
      let dh = heading - this.heading;
      dh = Math.atan2(Math.sin(dh), Math.cos(dh));
      this.heading = heading;
      const bankTarget = THREE.MathUtils.clamp(-dh / Math.max(dt, 1e-3) * 0.25, -0.26, 0.26);
      this.bank += (bankTarget - this.bank) * Math.min(1, dt * 3);
      const z = new THREE.Vector3().crossVectors(fwd, UP);
      if (z.lengthSq() < 1e-6) z.set(0, 0, 1);
      z.normalize();
      const y = new THREE.Vector3().crossVectors(z, fwd).normalize();
      tmpM.makeBasis(fwd, y, z);
      tmpQ.setFromRotationMatrix(tmpM);
      tmpQ.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), this.bank));
      this.root.quaternion.slerp(tmpQ, 1 - Math.pow(0.9, dt * 60));
    } else if (this.first && spd > 0) {
      this.first = false;
    }

    // swim motion
    const m = this.species.model!;
    const swimRate = (0.5 + Math.min(1.5, spd)) * (this.paused ? 0.3 : 1);
    this.own.uFishTime.value += dt * swimRate;
    if (m.motion === 'roll') {
      this.body.rotation.x = Math.sin(this.time * 0.8) * THREE.MathUtils.degToRad(4);
      this.body.position.y = Math.sin(this.time * 0.6) * 0.05;
    }
    this.mixer?.update(dt * swimRate);
  }

  dispose() {
    this.root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach((x) => x.dispose());
      if (mesh === this.pickBox) mesh.geometry.dispose();
    });
  }
}
