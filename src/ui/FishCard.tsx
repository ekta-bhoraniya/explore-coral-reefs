import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { bus, useStore } from '../store';
import { speciesById, credits } from '../data/content';
import type { Species } from '../data/schema';

function lengthText(l: Species['lengthCm']) {
  const fmt = (cm: number) => (cm >= 100 ? `${(cm / 100).toFixed(cm % 100 ? 1 : 0)} m` : `${cm} cm`);
  return l.typical ? `typically ${fmt(l.typical)}, up to ${fmt(l.max)}` : `up to ${fmt(l.max)}`;
}

function photoCredit(file: string) {
  const url = `/photos/${file}`;
  const c = credits.find((x) => new RegExp('^' + x.asset.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*') + '$').test(url));
  return c ? `${c.author} · ${c.licence}` : '';
}

function Carousel({ sp }: { sp: Species }) {
  const [i, setI] = useState(0);
  const n = sp.photos.length;
  const go = (d: number) => setI((v) => (v + d + n) % n);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  });
  const touch = useRef<number | null>(null);
  return (
    <div>
      <div
        className="relative aspect-[4/3] overflow-hidden rounded-xl bg-black/20"
        onPointerDown={(e) => { touch.current = e.clientX; }}
        onPointerUp={(e) => { if (touch.current !== null && Math.abs(e.clientX - touch.current) > 40) go(e.clientX < touch.current ? 1 : -1); touch.current = null; }}
      >
        <AnimatePresence initial={false} mode="popLayout">
          <motion.img
            key={i}
            src={`/photos/${sp.photos[i]}`}
            alt={`${sp.commonName}, photo ${i + 1} of ${n}`}
            className="absolute inset-0 h-full w-full object-cover"
            draggable={false}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}
          />
        </AnimatePresence>
        <button aria-label="Previous photo" className="focus-ring absolute left-2 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-black/35 text-lg" onClick={() => go(-1)}>‹</button>
        <button aria-label="Next photo" className="focus-ring absolute right-2 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-black/35 text-lg" onClick={() => go(1)}>›</button>
      </div>
      <div className="mt-2 flex items-center justify-between">
        <p className="truncate pr-2 text-[11px] text-white/60">{photoCredit(sp.photos[i])}</p>
        <div className="flex gap-1.5" role="tablist" aria-label="Photos">
          {sp.photos.map((_, k) => (
            <button key={k} role="tab" aria-selected={k === i} aria-label={`Photo ${k + 1}`} onClick={() => setI(k)}
              className={`focus-ring h-2 w-2 rounded-full ${k === i ? 'bg-white' : 'bg-white/35'}`} />
          ))}
        </div>
      </div>
    </div>
  );
}

export function FishCard() {
  const id = useStore((s) => s.cardSpecies);
  const sp = id ? speciesById(id) : undefined;
  const panel = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<Element | null>(null);

  useEffect(() => {
    if (!sp) return;
    returnFocus.current = document.activeElement;
    const t = setTimeout(() => panel.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus(), 50);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') bus.emit('closeCard');
      if (e.key === 'Tab' && panel.current) {
        // trap focus inside the card
        const f = [...panel.current.querySelectorAll<HTMLElement>('button, a[href]')].filter((x) => !x.hasAttribute('disabled'));
        if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    addEventListener('keydown', onKey);
    return () => {
      clearTimeout(t);
      removeEventListener('keydown', onKey);
      const el = returnFocus.current as HTMLElement | null;
      if (el && el.isConnected && el.style.display !== 'none') el.focus?.();
    };
  }, [sp]);

  return (
    <AnimatePresence>
      {sp && (
        <motion.aside
          key={sp.id}
          ref={panel}
          role="dialog"
          aria-modal="true"
          aria-labelledby="fish-card-title"
          className="glass fixed bottom-6 right-6 top-6 z-30 flex w-[400px] max-w-[calc(100vw-48px)] flex-col overflow-y-auto rounded-[20px] p-5 text-white shadow-2xl"
          initial={{ x: 60, opacity: 0 }}
          animate={{ x: 0, opacity: 1, transition: { duration: 0.32, ease: 'easeOut' } }}
          exit={{ x: 60, opacity: 0, transition: { duration: 0.22, ease: 'easeIn' } }}
        >
          <div className="mb-3 flex items-center justify-between">
            {import.meta.env.DEV && sp.factStatus === 'draft' ? (
              <span className="rounded-full bg-amber-300/90 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-950">Draft facts</span>
            ) : <span />}
            <button data-autofocus aria-label="Close" onClick={() => bus.emit('closeCard')}
              className="focus-ring grid h-9 w-9 place-items-center rounded-full bg-white/10 text-xl leading-none hover:bg-white/20">×</button>
          </div>
          <Carousel sp={sp} />
          <h2 id="fish-card-title" className="mt-5 font-display text-[28px] font-semibold leading-tight">{sp.commonName}</h2>
          <p className="text-[15px] italic text-white/75">{sp.scientificName}</p>
          <p className="mt-3 text-[15px] leading-relaxed text-white/90">{sp.description}</p>
          <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 text-[14px]">
            <div><dt className="text-[11px] uppercase tracking-wider text-white/55">Length</dt><dd>{lengthText(sp.lengthCm)}</dd></div>
            {sp.weight && <div><dt className="text-[11px] uppercase tracking-wider text-white/55">Weight</dt><dd>{sp.weight}</dd></div>}
            <div><dt className="text-[11px] uppercase tracking-wider text-white/55">Depth</dt><dd>{sp.depthM.min}–{sp.depthM.max} m</dd></div>
            <div className="col-span-2"><dt className="text-[11px] uppercase tracking-wider text-white/55">Where it hides</dt><dd>{sp.hidesIn}</dd></div>
          </dl>
          <p className="mt-auto pt-5 text-[12px] text-white/60">
            Facts:{' '}
            <a className="focus-ring underline decoration-white/40 underline-offset-2 hover:text-white" href={sp.sources[0]} target="_blank" rel="noreferrer">
              {sp.sources[0].includes('sealifebase') ? 'SeaLifeBase' : 'FishBase'}
            </a>
          </p>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
