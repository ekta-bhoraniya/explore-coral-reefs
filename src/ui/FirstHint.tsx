import { useEffect, useState } from 'react';
import { useStore } from '../store';

/** "Drag to look · Arrows to swim · Click a fish" — fades once all three are done, or after 15 s. */
export function FirstHint() {
  const done = useStore((s) => s.hintsDone);
  const ready = useStore((s) => s.spotReady);
  const [expired, setExpired] = useState(false);
  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => setExpired(true), 15000);
    return () => clearTimeout(t);
  }, [ready]);
  const allDone = done.look && done.swim && done.fish;
  const visible = ready && !expired && !allDone;
  const item = (label: string, ok: boolean) => <span className={ok ? 'text-white/45 line-through decoration-white/30' : ''}>{label}</span>;
  return (
    <div aria-hidden={!visible} className="pointer-events-none fixed inset-x-0 bottom-20 z-20 flex justify-center transition-opacity duration-1000" style={{ opacity: visible ? 1 : 0 }}>
      <div className="glass rounded-full px-5 py-2.5 text-sm">
        {item('Drag to look', done.look)} <span className="text-white/40">·</span> {item('Arrows to swim', done.swim)} <span className="text-white/40">·</span> {item('Click a fish', done.fish)}
      </div>
    </div>
  );
}
