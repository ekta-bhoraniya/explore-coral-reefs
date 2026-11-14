import * as THREE from 'three';

export const ease = {
  inOut: (t: number) => t * t * (3 - 2 * t),
  out: (t: number) => 1 - Math.pow(1 - t, 3),
  in: (t: number) => t * t * t,
};
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
export const seg = (t: number, a: number, b: number) => clamp01((t - a) / (b - a));

/** Shortest signed angle difference in degrees. */
export const angleDiff = (a: number, b: number) => ((((b - a) % 360) + 540) % 360) - 180;

export interface SwimHooks {
  /** returns true once the target panorama texture is ready to show */
  targetReady: () => boolean;
  /** fired at 350 ms (or when the target becomes ready): put B in the sphere, rotate the view */
  beginCrossfade: () => void;
  onCommit: () => void;
  onDone: () => void;
}

/**
 * The 1,000 ms swim. Drives FOV, blur and the sphere crossfade; holds in the blurred
 * state (max 3 s) if the next panorama isn't loaded yet.
 */
export class SwimTransition {
  private start = 0;
  private held = 0;
  private holdFrom = -1;
  private crossfadeBegun = false;
  private committed = false;
  active = false;
  fromYaw = 0; toYaw = 0; fromPitch = 0; toPitch = 0;
  turn = false;

  constructor(private hooks: SwimHooks) {}

  begin(now: number, viewYaw: number, viewPitch: number, linkYaw: number, linkPitch: number) {
    this.active = true; this.start = now; this.held = 0; this.holdFrom = -1;
    this.crossfadeBegun = false; this.committed = false;
    this.fromYaw = viewYaw; this.fromPitch = viewPitch;
    const off = Math.abs(angleDiff(viewYaw, linkYaw)) > 10 || Math.abs(linkPitch - viewPitch) > 10;
    this.turn = off;
    this.toYaw = viewYaw + angleDiff(viewYaw, linkYaw);
    this.toPitch = THREE.MathUtils.clamp(linkPitch, -40, 20);
  }

  /** Returns animation values for this frame. */
  update(now: number) {
    let t = now - this.start - this.held;
    if (!this.crossfadeBegun && t >= 350) {
      const ready = this.hooks.targetReady();
      if (!ready && (this.holdFrom < 0 || now - this.holdFrom < 3000)) {
        if (this.holdFrom < 0) this.holdFrom = now;
        this.held = now - this.start - 350;
        t = 350;
      } else {
        this.crossfadeBegun = true;
        this.hooks.beginCrossfade();
      }
    }
    if (this.crossfadeBegun && !this.committed && t >= 750) {
      this.committed = true;
      this.hooks.onCommit();
    }
    const push = ease.inOut(seg(t, 0, 450));
    const back = ease.inOut(seg(t, 750, 1000));
    const mix = this.crossfadeBegun ? ease.inOut(seg(t, 350, 750)) : 0;
    const out = {
      turnT: ease.inOut(seg(t, 0, 450)),
      fov: 75 - 15 * push + 15 * back,
      blur: push * (1 - back),
      mix: this.committed ? 0 : mix,
      zoomA: this.committed ? 0 : 0.6 * mix,
      zoomB: 0.25 * (1 - mix),
    };
    if (t >= 1000 && this.committed) {
      this.active = false;
      this.hooks.onDone();
    }
    return out;
  }
}
