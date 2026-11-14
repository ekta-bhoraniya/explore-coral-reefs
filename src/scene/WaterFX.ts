import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import postFrag from '../shaders/post.frag?raw';
import snowVert from '../shaders/particles.vert?raw';
import snowFrag from '../shaders/particles.frag?raw';
import { withCommon } from './PanoSphere';
import type { RuntimeSpot } from '../data/content';

const SNOW_MAX = 1500;
const BUBBLE_MAX = 120;
const BOX = 20;

function shaftTexture() {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 256;
  const g = c.getContext('2d')!;
  const v = g.createLinearGradient(0, 0, 0, 256);
  v.addColorStop(0, 'rgba(255,255,255,1)');
  v.addColorStop(0.5, 'rgba(255,255,255,0.45)');
  v.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = v; g.fillRect(0, 0, 64, 256);
  g.globalCompositeOperation = 'destination-in';
  const h = g.createLinearGradient(0, 0, 64, 0);
  h.addColorStop(0, 'rgba(0,0,0,0)'); h.addColorStop(0.5, 'rgba(0,0,0,1)'); h.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = h; g.fillRect(0, 0, 64, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function bubbleTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const r = g.createRadialGradient(26, 24, 2, 32, 32, 30);
  r.addColorStop(0, 'rgba(255,255,255,0.95)');
  r.addColorStop(0.35, 'rgba(220,250,255,0.15)');
  r.addColorStop(0.85, 'rgba(220,250,255,0.35)');
  r.addColorStop(1, 'rgba(220,250,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

interface Bubble { alive: boolean; pos: THREE.Vector3; vel: THREE.Vector3; life: number; size: number; wob: number }

export class WaterFX {
  readonly composer: EffectComposer;
  readonly post: ShaderPass;
  private shafts = new THREE.Group();
  private shaftMats: THREE.MeshBasicMaterial[] = [];
  private shaftPhase: number[] = [];
  private snow: THREE.Points;
  private snowMat: THREE.ShaderMaterial;
  private bubbleGeo = new THREE.BufferGeometry();
  private bubbles: Bubble[] = [];
  private bubblePoints: THREE.Points;
  /** spot.water values, eased when switching spots */
  rays = 0.5;
  wobble = 0.002;
  particles = 0.5;
  private snowCountTier = SNOW_MAX;
  private reduced = false;

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
    // --- light shafts
    const tex = shaftTexture();
    for (let i = 0; i < 9; i++) {
      const m = new THREE.MeshBasicMaterial({ map: tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, color: 0xcff6ff, opacity: 0, fog: false });
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), m);
      plane.renderOrder = 5;
      this.shafts.add(plane);
      this.shaftMats.push(m);
      this.shaftPhase.push(Math.random() * 10);
    }
    scene.add(this.shafts);

    // --- marine snow
    const pos = new Float32Array(SNOW_MAX * 3);
    const size = new Float32Array(SNOW_MAX);
    const seed = new Float32Array(SNOW_MAX);
    for (let i = 0; i < SNOW_MAX; i++) {
      pos[i * 3] = (Math.random() - 0.5) * BOX;
      pos[i * 3 + 1] = (Math.random() - 0.5) * BOX;
      pos[i * 3 + 2] = (Math.random() - 0.5) * BOX;
      size[i] = 1 + Math.random() * 2;
      seed[i] = Math.random();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    this.snowMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uBox: { value: BOX }, uPixelRatio: { value: renderer.getPixelRatio() }, uColor: { value: new THREE.Color(0xd8f4f0) }, uOpacity: { value: 0.55 } },
      vertexShader: snowVert, fragmentShader: snowFrag, transparent: true, depthWrite: false,
    });
    this.snow = new THREE.Points(g, this.snowMat);
    this.snow.frustumCulled = false;
    this.snow.renderOrder = 6;
    scene.add(this.snow);

    // --- bubbles
    for (let i = 0; i < BUBBLE_MAX; i++) this.bubbles.push({ alive: false, pos: new THREE.Vector3(), vel: new THREE.Vector3(), life: 0, size: 0, wob: 0 });
    this.bubbleGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(BUBBLE_MAX * 3), 3));
    this.bubbleGeo.setAttribute('size', new THREE.BufferAttribute(new Float32Array(BUBBLE_MAX), 1));
    const bm = new THREE.PointsMaterial({ map: bubbleTexture(), size: 0.06, transparent: true, depthWrite: false, sizeAttenuation: true, fog: false });
    this.bubblePoints = new THREE.Points(this.bubbleGeo, bm);
    this.bubblePoints.frustumCulled = false;
    this.bubblePoints.renderOrder = 7;
    scene.add(this.bubblePoints);

    // --- post
    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(scene, camera));
    this.post = new ShaderPass({
      uniforms: {
        tDiffuse: { value: null }, uTime: { value: 0 }, uWobble: { value: 0.002 }, uBlur: { value: 0 },
        uExposure: { value: 1 }, uSaturation: { value: 1 }, uTint: { value: new THREE.Color(0x2a7f9e) }, uTintAmt: { value: 0.12 },
        uMask: { value: 1 }, uAspect: { value: 1 }, uFlash: { value: 0 },
      },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: withCommon(postFrag),
    });
    this.composer.addPass(this.post);
    this.composer.addPass(new OutputPass());
  }

  setReducedMotion(r: boolean) { this.reduced = r; }

  setTier(tier: 'high' | 'medium' | 'low', pixelRatio: number) {
    this.snowCountTier = tier === 'high' ? 1500 : tier === 'medium' ? 800 : 300;
    this.shafts.visible = tier !== 'low';
    this.snowMat.uniforms.uPixelRatio.value = pixelRatio;
  }

  /** Apply a spot's water + grade settings. */
  applySpot(spot: RuntimeSpot) {
    const u = this.post.uniforms;
    this.wobble = spot.water.wobble;
    u.uExposure.value = spot.grade.exposure;
    u.uSaturation.value = spot.grade.saturation;
    (u.uTint.value as THREE.Color).set(spot.grade.tint);
    this.rays = spot.water.rays;
    this.particles = spot.water.particles;
    // Shafts fan out around the sun direction, leaning away from it.
    const sun = THREE.MathUtils.degToRad(spot.water.sunYaw + spot.yawOffset);
    this.shafts.children.forEach((s, i) => {
      const yaw = sun + (i - 4) * 0.22 + (Math.random() - 0.5) * 0.1;
      const dist = 14 + Math.random() * 14;
      const w = 1.2 + Math.random() * 2.2;
      s.position.set(Math.sin(yaw) * dist, 4, -Math.cos(yaw) * dist);
      s.scale.set(w, 34, 1);
      s.lookAt(0, 4, 0);
      s.rotateZ((Math.random() - 0.5) * 0.25 + 0.18);
    });
  }

  burst(n: number, origin: THREE.Vector3, spread = 0.5) {
    let made = 0;
    for (const b of this.bubbles) {
      if (b.alive) continue;
      b.alive = true;
      b.pos.copy(origin).add(new THREE.Vector3((Math.random() - 0.5) * spread, (Math.random() - 0.5) * spread * 0.5, (Math.random() - 0.5) * spread));
      b.vel.set((Math.random() - 0.5) * 0.15, 0.5 + Math.random() * 0.6, (Math.random() - 0.5) * 0.15);
      b.life = 2.5 + Math.random() * 1.5;
      b.size = 0.6 + Math.random() * 1.2;
      b.wob = Math.random() * 10;
      if (++made >= n) break;
    }
  }

  setSize(w: number, h: number) {
    this.composer.setSize(w, h);
    this.post.uniforms.uAspect.value = w / h;
  }

  update(time: number, dt: number) {
    const u = this.post.uniforms;
    u.uTime.value = time;
    u.uWobble.value = this.reduced ? 0 : this.wobble;
    this.snowMat.uniforms.uTime.value = time;
    const count = Math.round(this.snowCountTier * Math.min(1, this.particles * 1.4) * (this.reduced ? 0.5 : 1));
    this.snow.geometry.setDrawRange(0, count);
    this.shaftMats.forEach((m, i) => {
      const pulse = 0.5 + 0.5 * Math.sin(time * (0.25 + i * 0.03) + this.shaftPhase[i]);
      m.opacity = (0.04 + 0.08 * pulse) * this.rays;
    });
    // bubbles
    const pos = this.bubbleGeo.getAttribute('position') as THREE.BufferAttribute;
    let k = 0;
    for (const b of this.bubbles) {
      if (!b.alive) continue;
      b.life -= dt;
      if (b.life <= 0) { b.alive = false; continue; }
      b.vel.y += dt * 0.25;
      b.pos.addScaledVector(b.vel, dt);
      b.pos.x += Math.sin(time * 6 + b.wob) * dt * 0.08;
      pos.setXYZ(k++, b.pos.x, b.pos.y, b.pos.z);
    }
    this.bubbleGeo.setDrawRange(0, k);
    pos.needsUpdate = true;
  }

  render() { this.composer.render(); }
}
