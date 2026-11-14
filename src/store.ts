// Tiny shared store + event bus. The Three.js scene and the React overlay talk only through this.
import { useSyncExternalStore } from 'react';

export type Phase = 'landing' | 'underwater';
export type Tier = 'high' | 'medium' | 'low';

export interface State {
  phase: Phase;
  spotId: string;
  /** current spot has at least its 4K image */
  spotReady: boolean;
  loadProgress: number;
  cardSpecies: string | null;
  muted: boolean;
  soundUnlocked: boolean;
  maskOn: boolean;
  transitioning: boolean;
  tier: Tier;
  route: 'experience' | 'credits';
  hintsDone: { look: boolean; swim: boolean; fish: boolean };
}

function readBool(key: string, fallback: boolean) {
  try { const v = localStorage.getItem(key); return v === null ? fallback : v === '1'; } catch { return fallback; }
}
export function writeBool(key: string, v: boolean) {
  try { localStorage.setItem(key, v ? '1' : '0'); } catch { /* storage unavailable */ }
}

let state: State = {
  phase: 'landing',
  spotId: '',
  spotReady: false,
  loadProgress: 0,
  cardSpecies: null,
  muted: readBool('reef.muted', false),
  soundUnlocked: false,
  maskOn: readBool('reef.mask', true),
  transitioning: false,
  tier: 'high',
  route: location.hash === '#credits' ? 'credits' : 'experience',
  hintsDone: { look: false, swim: false, fish: false },
};
const listeners = new Set<() => void>();

export const store = {
  get: () => state,
  set(patch: Partial<State>) {
    state = { ...state, ...patch };
    listeners.forEach((l) => l());
  },
  subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; },
};

export function useStore<T>(sel: (s: State) => T): T {
  return useSyncExternalStore(store.subscribe, () => sel(state));
}

type Events = {
  openCard: { speciesId: string };
  closeCard: void;
  swimStart: { to: string };
  arrived: { spotId: string; title: string };
  exhale: void;
  fishHover: void;
  nothingThatWay: void;
  backToBeach: void;
  enterWater: void;
  splash: void;
};
type Handler<T> = (p: T) => void;
const handlers: { [K in keyof Events]?: Set<Handler<Events[K]>> } = {};

export const bus = {
  on<K extends keyof Events>(k: K, h: Handler<Events[K]>) {
    ((handlers[k] ??= new Set() as never) as Set<Handler<Events[K]>>).add(h);
    return () => { (handlers[k] as Set<Handler<Events[K]>>).delete(h); };
  },
  emit<K extends keyof Events>(k: K, ...p: Events[K] extends void ? [] : [Events[K]]) {
    (handlers[k] as Set<Handler<Events[K]>> | undefined)?.forEach((h) => h(p[0] as Events[K]));
  },
};

export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
