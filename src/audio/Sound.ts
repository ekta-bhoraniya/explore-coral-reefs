import { Howl, Howler } from 'howler';
import { bus, store, writeBool } from '../store';
import { asset } from '../asset';

const src = (n: string) => [asset(`audio/${n}.ogg`), asset(`audio/${n}.mp3`)];

/** All audio. Nothing plays until unlock() is called from a user gesture. */
class SoundSystem {
  private ambience?: Howl;
  private breathing?: Howl;
  private bubbles: Howl[] = [];
  private fin?: Howl;
  private splash?: Howl;
  private tick?: Howl;
  private chime?: Howl;
  private started = false;
  private lastTick = 0;
  private underwater = false;

  constructor() {
    Howler.mute(store.get().muted);
    document.addEventListener('visibilitychange', () => {
      Howler.mute(document.hidden || store.get().muted);
    });
    bus.on('swimStart', () => this.play(this.fin, 0.6));
    bus.on('exhale', () => this.play(this.bubbles[Math.floor(Math.random() * this.bubbles.length)], 0.35));
    bus.on('fishHover', () => {
      const now = performance.now();
      if (now - this.lastTick > 250) { this.lastTick = now; this.play(this.tick, 0.25); }
    });
    bus.on('nothingThatWay', () => this.play(this.bubbles[0], 0.25));
    bus.on('openCard', () => this.play(this.chime, 0.35));
    bus.on('splash', () => this.play(this.splash, 0.7));
    bus.on('enterWater', () => this.setUnderwater(true));
    bus.on('backToBeach', () => this.setUnderwater(false));
  }

  /** Call from a click/keypress handler. */
  unlock() {
    if (this.started) return;
    this.started = true;
    this.ambience = new Howl({ src: src('ambience'), loop: true, volume: 0, html5: false });
    this.breathing = new Howl({ src: src('breathing'), loop: false, volume: 0.25 });
    this.breathing.on('end', () => {
      if (!this.underwater) return;
      this.breathing!.rate(1 + (Math.random() - 0.5) * 0.06);
      this.breathing!.play();
    });
    this.bubbles = [1, 2, 3, 4].map((i) => new Howl({ src: src(`bubbles-${i}`), volume: 0.35 }));
    this.fin = new Howl({ src: src('fin-kick'), volume: 0.6 });
    this.splash = new Howl({ src: src('splash'), volume: 0.7 });
    this.tick = new Howl({ src: src('tick'), volume: 0.25 });
    this.chime = new Howl({ src: src('chime'), volume: 0.35 });
    this.ambience.play();
    this.ambience.fade(0, this.underwater ? 0.5 : 0.15, 1500);
    if (this.underwater) this.breathing.play();
    store.set({ soundUnlocked: true });
  }

  private setUnderwater(on: boolean) {
    this.underwater = on;
    if (!this.started) return;
    this.ambience?.fade(this.ambience.volume(), on ? 0.5 : 0.15, 1200);
    if (on && this.breathing && !this.breathing.playing()) this.breathing.play();
    if (!on) this.breathing?.stop();
  }

  private play(h: Howl | undefined, vol: number) {
    if (!h || !this.started) return;
    const id = h.play();
    h.volume(vol, id);
  }

  setMuted(m: boolean) {
    store.set({ muted: m });
    writeBool('reef.muted', m);
    Howler.mute(m || document.hidden);
    if (!m) this.unlock();
  }
}

export const sound = new SoundSystem();
