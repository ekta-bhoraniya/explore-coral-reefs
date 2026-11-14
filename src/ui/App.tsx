import { useEffect, useRef, useState } from 'react';
import { Viewer } from '../scene/Viewer';
import { bus, store, useStore } from '../store';
import { sound } from '../audio/Sound';
import { Intro } from './Intro';
import { Hud } from './Hud';
import { FishCard } from './FishCard';
import { Credits } from './Credits';
import { Loader } from './Loader';
import { FirstHint } from './FirstHint';
import { LiveRegion } from './LiveRegion';
import { Unsupported } from './Unsupported';

function hasWebGL2() {
  try { return !!document.createElement('canvas').getContext('webgl2'); } catch { return false; }
}
const isMobile = () => matchMedia('(pointer: coarse)').matches && Math.min(innerWidth, innerHeight) < 820;

export function App() {
  const [support] = useState<'ok' | 'webgl' | 'mobile'>(() => (!hasWebGL2() ? 'webgl' : isMobile() && !location.search.includes('forceDesktop') ? 'mobile' : 'ok'));
  const sceneRef = useRef<HTMLDivElement>(null);
  const phase = useStore((s) => s.phase);
  const route = useStore((s) => s.route);
  const [introKey, setIntroKey] = useState(0);

  // the scene lives outside React; mount it once
  useEffect(() => {
    if (support !== 'ok' || !sceneRef.current) return;
    const v = new Viewer(sceneRef.current);
    if (import.meta.env.DEV) (window as unknown as { viewer: Viewer }).viewer = v;
    return () => v.dispose();
  }, [support]);

  // hash routing for the credits page
  useEffect(() => {
    const onHash = () => store.set({ route: location.hash === '#credits' ? 'credits' : 'experience' });
    addEventListener('hashchange', onHash);
    return () => removeEventListener('hashchange', onHash);
  }, []);

  // page scrolls during the intro only
  useEffect(() => {
    document.body.classList.toggle('locked', phase === 'underwater' && route === 'experience');
  }, [phase, route]);

  // any click in the viewer unlocks audio (browsers need a gesture)
  useEffect(() => {
    if (phase !== 'underwater') return;
    const unlock = () => { if (!store.get().muted) sound.unlock(); };
    addEventListener('pointerdown', unlock, { once: true });
    return () => removeEventListener('pointerdown', unlock);
  }, [phase]);

  useEffect(() => bus.on('backToBeach', () => {
    store.set({ phase: 'landing', cardSpecies: null });
    window.scrollTo(0, 0);
    setIntroKey((k) => k + 1);
  }), []);

  if (support !== 'ok') return <Unsupported reason={support} />;

  return (
    <>
      <div ref={sceneRef} className={`scene-root ${phase === 'underwater' ? '' : 'inactive'}`} />
      {route === 'experience' && phase === 'landing' && <Intro key={introKey} />}
      {route === 'experience' && phase === 'underwater' && (
        <>
          <Hud />
          <Loader />
          <FirstHint />
        </>
      )}
      <FishCard />
      {route === 'credits' && <Credits />}
      <LiveRegion />
    </>
  );
}
