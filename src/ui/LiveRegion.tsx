import { useEffect, useState } from 'react';
import { bus } from '../store';
import { speciesById } from '../data/content';

/** Screen-reader announcements: arrivals and opened cards. */
export function LiveRegion() {
  const [msg, setMsg] = useState('');
  useEffect(() => {
    const a = bus.on('arrived', ({ title }) => setMsg(`Arrived at ${title.toLowerCase()}`));
    const b = bus.on('openCard', ({ speciesId }) => setMsg(`${speciesById(speciesId)?.commonName ?? 'Fish'} info card opened`));
    return () => { a(); b(); };
  }, []);
  return <div className="sr-only" aria-live="polite" role="status">{msg}</div>;
}
