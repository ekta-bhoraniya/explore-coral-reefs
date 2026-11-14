import { credits } from '../data/content';
import { store } from '../store';

const GROUPS = ['Panoramas', '3D models', 'Photos', 'Fish facts', 'Sound', 'Code libraries'] as const;

export function Credits() {
  const close = () => {
    history.pushState(null, '', `${location.pathname}${location.search}#${store.get().spotId}`);
    store.set({ route: 'experience' });
  };
  return (
    <div className="fixed inset-0 z-40 overflow-y-auto bg-[#062234] text-white">
      <div className="mx-auto max-w-3xl px-6 py-14">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-4xl font-semibold">Credits</h1>
            <p className="mt-2 text-white/70">Every panorama, model, photo, fact source and sound in Reef Snorkel, with its licence.</p>
          </div>
          <button className="glass focus-ring rounded-full px-4 py-2 text-sm" onClick={close}>Back to the reef</button>
        </div>
        {GROUPS.map((g) => {
          const items = credits.filter((c) => c.group === g);
          if (!items.length) return null;
          return (
            <section key={g} className="mt-10">
              <h2 className="border-b border-white/15 pb-2 font-display text-2xl">{g}</h2>
              <ul className="mt-3 divide-y divide-white/10">
                {items.map((c) => (
                  <li key={c.asset} className="py-3 text-[15px]">
                    <div className="font-medium">
                      {c.source.startsWith('http') ? <a className="focus-ring underline decoration-white/30 underline-offset-2 hover:decoration-white" href={c.source} target="_blank" rel="noreferrer">{c.title}</a> : c.title}
                    </div>
                    <div className="text-white/70">
                      {c.author} · <a className="focus-ring underline decoration-white/30 underline-offset-2" href={c.licenceUrl} target="_blank" rel="noreferrer">{c.licence}</a>
                      {c.modified ? <span className="text-white/50"> · {c.modified}</span> : null}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
