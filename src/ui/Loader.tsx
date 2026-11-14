import { useStore } from '../store';
import { ProgressRing } from './Intro';

/** Shown over the blurred preview while the current spot's 4K panorama loads. */
export function Loader() {
  const ready = useStore((s) => s.spotReady);
  const p = useStore((s) => s.loadProgress);
  if (ready) return null;
  return (
    <div className="pointer-events-none fixed inset-0 z-10 grid place-items-center" role="status">
      <div className="glass flex items-center gap-3 rounded-full py-2 pl-2 pr-5">
        <ProgressRing value={p} />
        <span className="text-sm">Loading the reef… {Math.round(p * 100)}%</span>
      </div>
    </div>
  );
}
