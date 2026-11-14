import { useEffect, useState } from 'react';
import { bus, store, useStore, writeBool } from '../store';
import { sound } from '../audio/Sound';

const btn = 'glass focus-ring grid h-10 min-w-10 place-items-center rounded-full px-3 text-sm';

export function Hud() {
  const muted = useStore((s) => s.muted);
  const unlocked = useStore((s) => s.soundUnlocked);
  const mask = useStore((s) => s.maskOn);
  const [idle, setIdle] = useState(false);

  useEffect(() => {
    let t = setTimeout(() => setIdle(true), 3000);
    const wake = () => { setIdle(false); clearTimeout(t); t = setTimeout(() => setIdle(true), 3000); };
    addEventListener('pointermove', wake);
    addEventListener('keydown', wake);
    return () => { clearTimeout(t); removeEventListener('pointermove', wake); removeEventListener('keydown', wake); };
  }, []);

  const soundOn = unlocked && !muted;
  return (
    <div className="pointer-events-none fixed inset-0 z-20 transition-opacity duration-700" style={{ opacity: idle ? 0.4 : 1 }}>
      <div className="pointer-events-auto absolute left-5 top-5 flex items-center gap-3">
        <span className="font-display text-lg font-semibold tracking-tight drop-shadow">Reef Snorkel</span>
        <button className="focus-ring rounded-full px-2 py-1 text-xs text-white/75 underline-offset-2 hover:underline" onClick={() => bus.emit('backToBeach')}>
          Back to the beach
        </button>
      </div>
      <div className="pointer-events-auto absolute bottom-5 left-5 flex gap-2">
        <button className={btn} aria-pressed={soundOn} aria-label={soundOn ? 'Mute sound' : 'Turn sound on'} onClick={() => sound.setMuted(soundOn)}>
          {soundOn ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4V5z" /><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" /></svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4V5z" /><path d="m16 9 6 6m0-6-6 6" /></svg>
          )}
        </button>
        <button className={btn} aria-pressed={mask} onClick={() => { store.set({ maskOn: !mask }); writeBool('reef.mask', !mask); }}>
          Mask {mask ? 'on' : 'off'}
        </button>
      </div>
      <a href="#credits" className={`${btn} pointer-events-auto absolute bottom-5 right-5`}>Credits</a>
    </div>
  );
}
