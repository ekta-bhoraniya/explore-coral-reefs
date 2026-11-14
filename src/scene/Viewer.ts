import * as THREE from 'three';
import { PanoSphere } from './PanoSphere';
import { WaterFX } from './WaterFX';
import { FishManager, dirToUv } from './FishManager';
import { Hotspots, type Hotspot } from './Hotspots';
import { Picking, sameTarget, setTargetHover, type Target } from './Picking';
import { SwimTransition, angleDiff, ease } from './Transition';
import { loadPanoTexture } from './loadTexture';
import { dirFromYawPitch } from './Fish';
import { spotById, spotsFile, flags, type RuntimeSpot } from '../data/content';
import { bus, store, reducedMotion, type Tier } from '../store';

type Level = 'preview' | '4k' | '8k';
const LEVEL_RANK: Record<Level, number> = { preview: 0, '4k': 1, '8k': 2 };
interface CacheEntry { tex: THREE.Texture; level: Level }

const BASE_FOV = 75;
const DEG = THREE.MathUtils.degToRad;

/**
 * The underwater scene. Plain TypeScript, outside React; talks to the UI only through store/bus.
 */
export class Viewer {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(BASE_FOV, 1, 0.1, 1000);
  private sphere: PanoSphere;
  private fx: WaterFX;
  private fish: FishManager;
  private hotspots = new Hotspots();
  private picking = new Picking();
  private swim: SwimTransition;
  private timer = new THREE.Timer();
  private time = 0;
  private raf = 0;

  // view state (degrees)
  private yaw = 0;
  private pitch = -15;
  private fov = BASE_FOV;
  private fovTarget = BASE_FOV;
  private yawVel = 0;
  private pitchVel = 0;
  private keyYaw = 0;
  private keyYawSmoothed = 0;
  private dragging = false;
  private dragMoved = 0;
  private lastPointer = { x: 0, y: 0, t: 0 };
  private pointerNdc = new THREE.Vector2(9, 9);
  private pointerInside = false;
  private focusAnim: { from: [number, number, number]; to: [number, number, number]; start: number; dur: number } | null = null;

  // content state
  private spot!: RuntimeSpot;
  private history: string[] = [];
  private cache = new Map<string, CacheEntry>();
  private loading = new Map<string, Promise<void>>();
  private swimTo: { spot: RuntimeSpot; arriveYaw: number } | null = null;
  private hover: Target | null = null;
  private focused: Target | null = null;
  private cardTarget: Target | null = null;
  private nextExhale = 4;
  private nothingHintShown = false;
  private reduced = reducedMotion();
  private perf = { measuring: false, start: 0, frames: 0, total: 0, done: false };
  private a11yLayer: HTMLDivElement;
  private a11yButtons = new Map<Target, HTMLButtonElement>();
  private a11yKey = '';
  private label: HTMLDivElement;
  private author?: { points: [number, number][]; panel: HTMLDivElement; markers: THREE.Points };
  private disposers: (() => void)[] = [];

  constructor(private container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.domElement.className = 'scene-canvas';
    this.renderer.domElement.setAttribute('aria-hidden', 'true');
    container.appendChild(this.renderer.domElement);

    this.camera.rotation.order = 'YXZ';
    this.sphere = new PanoSphere(this.renderer.capabilities.getMaxAnisotropy());
    this.scene.add(this.sphere.mesh);
    this.fx = new WaterFX(this.renderer, this.scene, this.camera);
    this.fx.setReducedMotion(this.reduced);
    this.fish = new FishManager(this.scene);
    this.scene.add(this.hotspots.group);

    this.swim = new SwimTransition({
      targetReady: () => !!this.swimTo && this.cache.has(this.swimTo.spot.file),
      beginCrossfade: () => this.beginCrossfade(),
      onCommit: () => this.commitSwim(),
      onDone: () => this.finishSwim(),
    });

    // DOM helpers: accessible buttons for scene targets + hotspot label
    this.a11yLayer = document.createElement('div');
    this.a11yLayer.className = 'a11y-layer';
    container.appendChild(this.a11yLayer);
    this.label = document.createElement('div');
    this.label.className = 'hotspot-label';
    this.label.textContent = 'Swim this way';
    container.appendChild(this.label);

    const startId = this.idFromHash() ?? spotsFile.start;
    this.spot = spotById(startId) ?? spotById(spotsFile.start)!;
    this.yaw = this.spot.initialYaw + this.spot.yawOffset;
    this.pitch = this.spot.initialPitch;
    store.set({ spotId: this.spot.id, spotReady: false, loadProgress: 0 });

    this.initTier();
    this.bindEvents();
    this.resize();
    if (flags.author) this.initAuthor();
    void this.enterSpot(this.spot, true);
    this.loop();
  }

  // ---------------------------------------------------------------- loading

  private idFromHash() {
    const id = decodeURIComponent(location.hash.slice(1));
    return id && spotById(id) ? id : null;
  }

  private initTier() {
    const caps = this.renderer.capabilities;
    const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
    const can8k = caps.maxTextureSize >= 8192 && (mem === undefined || mem >= 4);
    this.setTier(can8k ? 'high' : 'medium');
  }

  private setTier(tier: Tier) {
    store.set({ tier });
    const pr = tier === 'high' ? Math.min(devicePixelRatio, 2) : tier === 'medium' ? Math.min(devicePixelRatio, 1.5) : 1;
    this.renderer.setPixelRatio(pr);
    this.fx.setTier(tier, pr);
    this.resize();
  }

  /** Load one level of a spot's panorama into the cache (never downgrades). */
  private loadLevel(spot: RuntimeSpot, level: Level, track = false): Promise<void> {
    const key = `${spot.file}:${level}`;
    if (this.loading.has(key)) return this.loading.get(key)!;
    const p = (async () => {
      const have = this.cache.get(spot.file);
      if (have && LEVEL_RANK[have.level] >= LEVEL_RANK[level]) return;
      const tex = await loadPanoTexture(`/panos/${level}/${spot.file}.webp`, track ? (v) => store.set({ loadProgress: v }) : undefined);
      if (!tex) return;
      const cur = this.cache.get(spot.file);
      if (cur && LEVEL_RANK[cur.level] >= LEVEL_RANK[level]) { tex.dispose(); return; }
      this.cache.set(spot.file, { tex, level });
      this.onLevelLoaded(spot, tex, level, cur);
    })();
    this.loading.set(key, p);
    return p;
  }

  private onLevelLoaded(spot: RuntimeSpot, tex: THREE.Texture, level: Level, prev?: CacheEntry) {
    if (spot.file !== this.spot.file || this.swim.active) {
      // not on screen: just replace the cached version
      if (prev && prev.tex !== this.sphere.uniforms.uPanoA.value && prev.tex !== this.sphere.uniforms.uPanoB.value) prev.tex.dispose();
      return;
    }
    if (!this.sphere.uniforms.uPanoA.value) {
      this.sphere.setNow(tex, spot.yawOffset);
    } else {
      // progressive upgrade: crossfade in over 400 ms
      void this.sphere.crossfade(tex, spot.yawOffset, 400, performance.now()).then(() => {
        if (prev && prev.tex !== tex) prev.tex.dispose();
      });
    }
    if (LEVEL_RANK[level] >= 1) store.set({ spotReady: true, loadProgress: 1 });
  }

  /** Progressive loading for the current spot, then preload its neighbours' 4K. */
  private async loadSpotProgressive(spot: RuntimeSpot) {
    await this.loadLevel(spot, 'preview');
    await this.loadLevel(spot, '4k', true);
    if (store.get().tier === 'high') await this.loadLevel(spot, '8k');
    for (const l of spot.links) {
      const s = spotById(l.to);
      if (s) { void this.loadLevel(s, 'preview').then(() => this.loadLevel(s, '4k')); void this.fish.preload(s); }
    }
  }

  private async enterSpot(spot: RuntimeSpot, initial = false) {
    this.spot = spot;
    this.fx.applySpot(spot);
    this.sphere.uniforms.uCaustics.value = spot.water.caustics;
    this.hotspots.set(spot);
    history.replaceState(null, '', `${location.pathname}${location.search}#${spot.id}`);
    store.set({ spotId: spot.id });
    if (initial) {
      const have = this.cache.get(spot.file);
      if (have) this.sphere.setNow(have.tex, spot.yawOffset);
      void this.loadSpotProgressive(spot);
    }
    void this.fish.enter(spot, performance.now());
    this.rebuildA11y();
  }

  // ---------------------------------------------------------------- swimming

  /** Start a swim to a linked spot. */
  swimToSpot(toId: string, viaKey = false) {
    const s = store.get();
    if (this.swim.active || s.cardSpecies || s.phase !== 'underwater') return;
    const link = this.spot.links.find((l) => l.to === toId);
    const target = spotById(toId);
    if (!link || !target) return;
    this.history.push(this.spot.id);
    if (viaKey && this.history.length > 50) this.history.shift();
    this.swimTo = { spot: target, arriveYaw: (link.arriveYaw ?? target.initialYaw) + target.yawOffset };
    void this.loadLevel(target, 'preview').then(() => this.loadLevel(target, '4k'));
    void this.fish.preload(target);
    this.setHover(null);
    this.hotspots.visibleTarget = 0;
    store.set({ transitioning: true });
    this.sphere.finishFade();
    this.swimTurnOffset = 0;
    this.swim.begin(performance.now(), this.yaw, this.pitch, link.yaw + this.spot.yawOffset, link.pitch);
    this.fish.leaveAll(performance.now());
    const fwd = dirFromYawPitch(this.yaw, this.pitch);
    this.fx.burst(this.reduced ? 10 : 24, new THREE.Vector3(0, -0.4, 0).addScaledVector(fwd, 0.8), 0.8);
    bus.emit('swimStart', { to: toId });
  }

  private beginCrossfade() {
    const to = this.swimTo!;
    const entry = this.cache.get(to.spot.file);
    if (!entry) return;
    // rotate the view to the arrival yaw now, compensating A so nothing visibly jumps
    // measure from where the turn-to-face-the-ring ends, so we land exactly on arriveYaw
    const base = this.swim.turn ? this.swim.toYaw : this.yaw;
    const delta = angleDiff(base, to.arriveYaw);
    this.yaw += delta;
    this.yawVel = 0;
    const u = this.sphere.uniforms;
    u.uYawA.value += DEG(delta);
    u.uPanoB.value = this.sphere.prepare(entry.tex);
    u.uYawB.value = DEG(to.spot.yawOffset);
    this.swimTurnOffset = delta;
  }
  private swimTurnOffset = 0;

  private commitSwim() {
    const to = this.swimTo!;
    this.sphere.commitB();
    void this.enterSpot(to.spot);
    // make sure the new spot keeps upgrading and preloading neighbours
    void this.loadSpotProgressive(to.spot);
    const cur = this.cache.get(to.spot.file);
    store.set({ spotReady: !!cur && LEVEL_RANK[cur.level] >= 1 });
  }

  private finishSwim() {
    const to = this.swimTo!;
    this.swimTo = null;
    this.hotspots.visibleTarget = 1;
    store.set({ transitioning: false, hintsDone: { ...store.get().hintsDone, swim: true } });
    bus.emit('arrived', { spotId: to.spot.id, title: to.spot.title });
    this.evictFarTextures();
  }

  /** Keep only the current spot, its neighbours and the start spot on the GPU. */
  private evictFarTextures() {
    const keep = new Set([this.spot.file, ...this.spot.links.map((l) => spotById(l.to)?.file)]);
    for (const [file, e] of this.cache) {
      if (keep.has(file) || e.tex === this.sphere.uniforms.uPanoA.value) continue;
      e.tex.dispose();
      this.cache.delete(file);
      for (const lv of ['preview', '4k', '8k']) this.loading.delete(`${file}:${lv}`);
    }
  }

  /** Arrow-key navigation relative to where the user is looking. */
  private keySwim(key: 'up' | 'right' | 'left' | 'down') {
    if (key === 'down' && this.history.length) {
      const prev = this.history[this.history.length - 1];
      if (this.spot.links.some((l) => l.to === prev)) {
        this.history.pop();
        this.swimToSpot(prev);
        this.history.pop(); // don't push the spot we're leaving back on
        return;
      }
    }
    const offset = { up: 0, right: 90, left: -90, down: 180 }[key];
    const dir = this.yaw + offset;
    let best: { to: string; d: number } | null = null;
    for (const l of this.spot.links) {
      const d = Math.abs(angleDiff(dir, l.yaw + this.spot.yawOffset));
      if (d <= 60 && (!best || d < best.d)) best = { to: l.to, d };
    }
    if (best) { this.swimToSpot(best.to, true); return; }
    const fwd = dirFromYawPitch(this.yaw, this.pitch);
    this.fx.burst(8, new THREE.Vector3(0, -0.3, 0).addScaledVector(fwd, 0.7), 0.3);
    bus.emit('nothingThatWay');
    if (!this.nothingHintShown) {
      this.nothingHintShown = true;
      this.toast('Nothing that way. Look around for a glowing ring.');
    }
  }

  private toast(msg: string) {
    const el = document.createElement('div');
    el.className = 'scene-toast';
    el.setAttribute('role', 'status');
    el.textContent = msg;
    this.container.appendChild(el);
    setTimeout(() => el.classList.add('out'), 2600);
    setTimeout(() => el.remove(), 3200);
  }

  // ---------------------------------------------------------------- fish focus + card

  private targetDir(t: Target): THREE.Vector3 {
    if (t.kind === 'fish') return t.fish.worldCenter().normalize();
    if (t.kind === 'resident') return t.resident.center.clone().normalize();
    return t.hotspot.sprite.position.clone().normalize();
  }

  private activate(t: Target) {
    if (t.kind === 'hotspot') { this.swimToSpot(t.hotspot.to); return; }
    if (store.get().cardSpecies || this.swim.active) return;
    const species = t.kind === 'fish' ? t.fish.species : t.resident.species;
    if (t.kind === 'fish') t.fish.pause();
    this.cardTarget = t;
    const d = this.targetDir(t);
    const yaw = THREE.MathUtils.radToDeg(Math.atan2(d.x, -d.z));
    const pitch = THREE.MathUtils.radToDeg(Math.asin(d.y));
    // centre the fish in the part of the screen the card leaves visible
    const shift = this.cardShiftDeg();
    this.focusTo(this.yaw + angleDiff(this.yaw, yaw + shift), THREE.MathUtils.clamp(pitch, -75, 60), 65, 600);
    this.yawVel = this.pitchVel = 0;
    this.hotspots.visibleTarget = 0;
    store.set({ cardSpecies: species.id, hintsDone: { ...store.get().hintsDone, fish: true } });
    bus.emit('openCard', { speciesId: species.id });
  }

  /** The card covers ~424 px on the right; aim the fish at the centre of what's left. */
  private cardShiftDeg() {
    const w = this.container.clientWidth;
    const px = Math.min(424, w * 0.5) / 2;
    const hfov = 2 * Math.atan(Math.tan(DEG(65) / 2) * this.camera.aspect);
    return THREE.MathUtils.radToDeg(hfov) * (px / w);
  }

  private closeCard() {
    const t = this.cardTarget;
    if (t?.kind === 'fish') t.fish.resume();
    this.cardTarget = null;
    this.focusTo(this.yaw, this.pitch, BASE_FOV, 500);
    this.hotspots.visibleTarget = 1;
    if (store.get().cardSpecies) store.set({ cardSpecies: null });
  }

  private focusTo(yaw: number, pitch: number, fov: number, dur: number) {
    this.focusAnim = { from: [this.yaw, this.pitch, this.fov], to: [yaw, pitch, fov], start: performance.now(), dur };
  }

  // ---------------------------------------------------------------- input

  private bindEvents() {
    const el = this.renderer.domElement;
    const on = <K extends keyof HTMLElementEventMap>(t: HTMLElement | Window | Document, k: K | string, h: (e: never) => void, o?: AddEventListenerOptions) => {
      t.addEventListener(k, h as EventListener, o);
      this.disposers.push(() => t.removeEventListener(k, h as EventListener));
    };
    on(window, 'resize', () => this.resize());
    on(el, 'pointerdown', (e: PointerEvent) => {
      if (store.get().phase !== 'underwater') return;
      this.dragging = true; this.dragMoved = 0;
      this.lastPointer = { x: e.clientX, y: e.clientY, t: performance.now() };
      this.yawVel = this.pitchVel = 0;
      this.focusAnim = null;
      el.setPointerCapture(e.pointerId);
      this.updateCursor();
    });
    on(el, 'pointermove', (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      this.pointerNdc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      this.pointerInside = true;
      if (!this.dragging) return;
      const now = performance.now();
      const dx = e.clientX - this.lastPointer.x, dy = e.clientY - this.lastPointer.y;
      const dt = Math.max(1, now - this.lastPointer.t) / 1000;
      const sens = 0.12 * (this.fov / BASE_FOV);
      if (!this.swim.active) {
        this.yaw -= dx * sens;
        this.pitch = THREE.MathUtils.clamp(this.pitch + dy * sens, -75, 60);
        this.yawVel = (-dx * sens) / dt;
        this.pitchVel = (dy * sens) / dt;
      }
      this.dragMoved += Math.abs(dx) + Math.abs(dy);
      this.lastPointer = { x: e.clientX, y: e.clientY, t: now };
      if (this.dragMoved > 6 && !store.get().hintsDone.look) store.set({ hintsDone: { ...store.get().hintsDone, look: true } });
    });
    on(el, 'pointerleave', () => { this.pointerInside = false; this.pointerNdc.set(9, 9); });
    on(el, 'pointerup', (e: PointerEvent) => {
      if (!this.dragging) return;
      this.dragging = false;
      el.releasePointerCapture(e.pointerId);
      if (performance.now() - this.lastPointer.t > 80) { this.yawVel = this.pitchVel = 0; }
      if (this.dragMoved < 6) this.onClick();
      this.updateCursor();
    });
    on(el, 'wheel', (e: WheelEvent) => {
      if (store.get().phase !== 'underwater') return;
      e.preventDefault();
      this.fovTarget = THREE.MathUtils.clamp(this.fovTarget + e.deltaY * 0.03, 55, 85);
    }, { passive: false });
    on(window, 'keydown', (e: KeyboardEvent) => this.onKey(e, true));
    on(window, 'keyup', (e: KeyboardEvent) => this.onKey(e, false));
    on(window, 'hashchange', () => {
      const id = this.idFromHash();
      if (id && id !== this.spot.id && this.spot.links.some((l) => l.to === id)) this.swimToSpot(id);
    });
    this.disposers.push(bus.on('closeCard', () => this.closeCard()));
    this.disposers.push(store.subscribe(() => {
      const s = store.get();
      if (!s.cardSpecies && this.cardTarget) this.closeCard();
      this.fx.post.uniforms.uMask.value = s.maskOn ? 1 : 0;
      if (s.phase === 'underwater' && !this.perf.measuring && !this.perf.done) {
        this.perf = { measuring: true, start: performance.now() + 500, frames: 0, total: 0, done: false };
      }
    }));
    this.fx.post.uniforms.uMask.value = store.get().maskOn ? 1 : 0;
  }

  private onKey(e: KeyboardEvent, down: boolean) {
    const s = store.get();
    if (s.phase !== 'underwater' || s.route !== 'experience') return;
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    const k = e.key.toLowerCase();
    if (k === 'a' || k === 'd') {
      this.keyYaw = down ? (k === 'a' ? -60 : 60) : 0;
      return;
    }
    if (!down || e.repeat || s.cardSpecies) return; // arrows drive the card carousel while it's open
    const map: Record<string, 'up' | 'right' | 'left' | 'down'> = { arrowup: 'up', w: 'up', arrowright: 'right', arrowleft: 'left', arrowdown: 'down', s: 'down' };
    if (map[k]) { e.preventDefault(); this.keySwim(map[k]); }
  }

  private onClick() {
    if (this.author) { this.authorClick(); return; }
    const s = store.get();
    if (s.cardSpecies) { bus.emit('closeCard'); return; }
    const t = this.pickAtPointer();
    if (t) this.activate(t);
  }

  private pickAtPointer(): Target | null {
    if (!this.pointerInside) return null;
    const objs = [...this.fish.pickables(), ...(this.hotspots.group.visible && !store.get().cardSpecies ? this.hotspots.items.map((h) => h.sprite) : [])];
    return this.picking.pick(this.pointerNdc, this.camera, objs);
  }

  private setHover(t: Target | null) {
    if (sameTarget(t, this.hover)) return;
    // keep the clicked fish glowing while its card is open
    if (this.hover && !sameTarget(this.hover, this.cardTarget)) setTargetHover(this.hover, false);
    this.hover = t;
    if (t) {
      setTargetHover(t, true);
      if (t.kind !== 'hotspot') bus.emit('fishHover');
    }
    this.updateCursor();
  }

  private updateCursor() {
    const c = this.renderer.domElement.style;
    if (this.dragging) c.cursor = 'grabbing';
    else if (this.hover) c.cursor = 'pointer';
    else c.cursor = this.author ? 'crosshair' : 'grab';
  }

  // ---------------------------------------------------------------- accessibility layer

  /** Real <button>s positioned over fish and hotspots so Tab / Enter / screen readers work. */
  private rebuildA11y() {
    const targets = this.a11yTargets();
    const key = targets.map((t) => (t.kind === 'hotspot' ? t.hotspot.to : t.kind === 'fish' ? t.fish.species.id + t.fish.index + t.fish.cfg.yaw : 'r' + t.resident.species.id)).join('|');
    if (key === this.a11yKey) return;
    this.a11yKey = key;
    this.a11yLayer.replaceChildren();
    this.a11yButtons.clear();
    for (const t of targets) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'a11y-target';
      b.setAttribute('aria-label', t.kind === 'hotspot' ? `Swim to ${t.hotspot.title}` : `${t.kind === 'fish' ? t.fish.species.commonName : t.resident.species.commonName}: open info card`);
      b.addEventListener('focus', () => { this.focused = t; this.setHover(t); });
      b.addEventListener('blur', () => { if (sameTarget(this.focused, t)) { this.focused = null; this.setHover(null); } });
      b.addEventListener('click', () => this.activate(t));
      this.a11yLayer.appendChild(b);
      this.a11yButtons.set(t, b);
    }
  }

  private a11yTargets(): Target[] {
    const a = this.fish.active;
    const out: Target[] = [];
    if (a) {
      a.fish.forEach((fish) => out.push({ kind: 'fish', fish }));
      a.residents.forEach((resident) => out.push({ kind: 'resident', resident }));
    }
    this.hotspots.items.forEach((hotspot: Hotspot) => out.push({ kind: 'hotspot', hotspot }));
    return out;
  }

  private updateA11y() {
    this.rebuildA11y();
    const w = this.container.clientWidth, h = this.container.clientHeight;
    const s = store.get();
    const v = new THREE.Vector3();
    for (const [t, b] of this.a11yButtons) {
      let visible = s.phase === 'underwater' && !this.swim.active && !s.cardSpecies;
      if (t.kind === 'fish') { visible &&= t.fish.root.visible; t.fish.worldCenter(v); }
      else if (t.kind === 'resident') v.copy(t.resident.center);
      else v.copy(t.hotspot.sprite.position);
      v.project(this.camera);
      const onScreen = v.z < 1 && Math.abs(v.x) < 0.98 && Math.abs(v.y) < 0.98;
      const show = visible && onScreen;
      b.tabIndex = show ? 0 : -1;
      b.style.display = show ? '' : 'none';
      if (show) b.style.transform = `translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h}px)`;
    }
    // hotspot hover label
    const hs = this.hover?.kind === 'hotspot' ? this.hover.hotspot : null;
    if (hs && !this.swim.active) {
      v.copy(hs.sprite.position).project(this.camera);
      this.label.style.transform = `translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h + 34}px)`;
      this.label.textContent = `Swim this way · ${hs.title}`;
      this.label.classList.add('on');
    } else this.label.classList.remove('on');
  }

  // ---------------------------------------------------------------- author tool (?author=1)

  private initAuthor() {
    const panel = document.createElement('div');
    panel.className = 'author-panel';
    panel.innerHTML = `<strong>Resident authoring</strong><p>Click points around a fish in the photo.</p>
      <pre></pre><div><button data-a="copy">Copy JSON</button> <button data-a="clear">Clear</button></div>`;
    const markers = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial({ color: 0xff3b6b, size: 8, sizeAttenuation: false, depthTest: false, fog: false }));
    markers.renderOrder = 30;
    this.scene.add(markers);
    this.author = { points: [], panel, markers };
    panel.addEventListener('click', (e) => {
      const a = (e.target as HTMLElement).dataset.a;
      if (a === 'clear') { this.author!.points = []; this.refreshAuthor(); }
      if (a === 'copy') {
        const json = JSON.stringify({ species: 'species-id', polygon: this.author!.points.map(([u, v]) => [+u.toFixed(4), +v.toFixed(4)]) });
        void navigator.clipboard?.writeText(json).catch(() => undefined);
        (e.target as HTMLElement).textContent = 'Copied';
      }
    });
    this.container.appendChild(panel);
  }

  private authorClick() {
    const ray = new THREE.Raycaster();
    ray.setFromCamera(this.pointerNdc, this.camera);
    this.author!.points.push(dirToUv(ray.ray.direction, this.spot.yawOffset));
    this.refreshAuthor();
  }

  private refreshAuthor() {
    const a = this.author!;
    a.panel.querySelector('pre')!.textContent = JSON.stringify(a.points.map(([u, v]) => [+u.toFixed(4), +v.toFixed(4)]));
    const pts = a.points.map(([u, v]) => dirFromYawPitch((u - 0.5) * 360 + this.spot.yawOffset, (0.5 - v) * 180).multiplyScalar(450));
    a.markers.geometry.dispose();
    a.markers.geometry = new THREE.BufferGeometry().setFromPoints(pts);
  }

  // ---------------------------------------------------------------- frame loop

  private resize() {
    const w = this.container.clientWidth || innerWidth, h = this.container.clientHeight || innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.fx.setSize(w, h);
  }

  private loop = (ts?: number) => {
    this.raf = requestAnimationFrame(this.loop);
    this.timer.update(ts);
    const dt = Math.min(this.timer.getDelta(), 0.1);
    const now = performance.now();
    this.time += dt;
    const s = store.get();
    if (s.route === 'credits') return; // nothing visible behind the credits page

    // look controls
    if (!this.dragging && !this.focusAnim) {
      this.yaw += this.yawVel * dt;
      this.pitch = THREE.MathUtils.clamp(this.pitch + this.pitchVel * dt, -75, 60);
      const decay = Math.pow(0.92, dt * 60);
      this.yawVel *= decay; this.pitchVel *= decay;
      if (Math.abs(this.yawVel) < 0.01) this.yawVel = 0;
      if (Math.abs(this.pitchVel) < 0.01) this.pitchVel = 0;
    }
    this.keyYawSmoothed += (this.keyYaw - this.keyYawSmoothed) * Math.min(1, dt * 6);
    if (!this.swim.active) this.yaw += this.keyYawSmoothed * dt;

    if (this.focusAnim) {
      const f = this.focusAnim;
      const t = Math.min(1, (now - f.start) / f.dur), e = ease.inOut(t);
      this.yaw = f.from[0] + (f.to[0] - f.from[0]) * e;
      this.pitch = f.from[1] + (f.to[1] - f.from[1]) * e;
      this.fov = f.from[2] + (f.to[2] - f.from[2]) * e;
      this.fovTarget = this.fov;
      if (t >= 1) this.focusAnim = null;
    } else if (!this.swim.active) {
      this.fov += (this.fovTarget - this.fov) * Math.min(1, dt * 8);
    }

    // swim transition
    let blur = 0;
    let camYaw = this.yaw, camPitch = this.pitch;
    if (this.swim.active) {
      const a = this.swim.update(now);
      const sw = this.swim;
      if (sw.turn) {
        camYaw = this.yaw = sw.fromYaw + (sw.toYaw - sw.fromYaw) * a.turnT + this.swimTurnOffset;
        camPitch = this.pitch = sw.fromPitch + (sw.toPitch - sw.fromPitch) * a.turnT;
      } else {
        camYaw = this.yaw;
      }
      this.fov = a.fov;
      blur = a.blur;
      const u = this.sphere.uniforms;
      u.uMix.value = a.mix; u.uZoomA.value = a.zoomA; u.uZoomB.value = a.zoomB;
      if (!sw.active) { this.fov = BASE_FOV; this.fovTarget = BASE_FOV; }
    }
    this.fx.post.uniforms.uBlur.value = blur;

    // subtle floating sway
    let swayYaw = 0, swayPitch = 0;
    if (!this.reduced) {
      swayYaw = 0.6 * Math.sin((this.time / 8) * Math.PI * 2);
      swayPitch = 0.4 * Math.sin((this.time / 6) * Math.PI * 2 + 1.3);
    }
    this.camera.rotation.y = -DEG(camYaw + swayYaw);
    this.camera.rotation.x = DEG(camPitch + swayPitch);
    if (Math.abs(this.camera.fov - this.fov) > 0.001) { this.camera.fov = this.fov; this.camera.updateProjectionMatrix(); }
    this.camera.getWorldDirection(this.sphere.uniforms.uForward.value);

    // hover picking (not while dragging or swimming)
    if (s.phase === 'underwater' && !this.dragging && !this.swim.active && !this.focused) this.setHover(this.pickAtPointer());

    // exhale bubbles every 6–12 s
    if (s.phase === 'underwater' && this.time > this.nextExhale) {
      this.nextExhale = this.time + 6 + Math.random() * 6;
      const fwd = dirFromYawPitch(this.yaw, Math.min(this.pitch, -5));
      this.fx.burst(10 + Math.floor(Math.random() * 12), new THREE.Vector3(0, -0.6, 0).addScaledVector(fwd, 0.5), 0.25);
      bus.emit('exhale');
    }

    this.sphere.uniforms.uTime.value = this.time;
    this.sphere.update(now);
    this.fish.update(dt, this.time, now);
    this.hotspots.update(dt, this.time);
    this.fx.update(this.time, dt);
    this.updateA11y();
    this.fx.render();
    this.measurePerf(now, dt);
  };

  /** Auto quality: average frame time over the first 3 s underwater; drop a tier if > 20 ms. */
  private measurePerf(now: number, dt: number) {
    const p = this.perf;
    if (!p.measuring || now < p.start) return;
    p.frames++; p.total += dt;
    if (now - p.start > 3000) {
      p.measuring = false;
      const avg = (p.total / p.frames) * 1000;
      const tier = store.get().tier;
      if (avg > 20 && tier !== 'low') {
        this.setTier(tier === 'high' ? 'medium' : 'low');
        // measure again at the lower tier
        this.perf = { measuring: true, start: now + 500, frames: 0, total: 0, done: false };
      } else p.done = true;
    }
  }

  /** Frames-per-second probe for tests (?debug). */
  get debugState() {
    return { yaw: this.yaw, pitch: this.pitch, fov: this.fov, spot: this.spot.id, fish: this.fish.active?.fish.length ?? 0, swimming: this.swim.active };
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.disposers.forEach((d) => d());
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.a11yLayer.remove();
    this.label.remove();
    this.author?.panel.remove();
  }
}

