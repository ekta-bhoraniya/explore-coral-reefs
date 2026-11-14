import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { bus, store, useStore, writeBool, reducedMotion } from '../store';
import { sound } from '../audio/Sound';

gsap.registerPlugin(ScrollTrigger);

const VISITED = 'reef.visited';
const readVisited = () => { try { return localStorage.getItem(VISITED) === '1'; } catch { return false; } };

/** Simple, friendly, neutral snorkeller. Named groups so GSAP can animate parts. */
function Avatar() {
  return (
    <g id="avatar">
      <g id="avatar-inner" className="avatar-inner">
        <g id="legs" className="av-legs">
          <rect x="-15" y="-74" width="12" height="52" rx="6" fill="#1f4f6b" />
          <rect x="3" y="-74" width="12" height="52" rx="6" fill="#1f4f6b" />
        </g>
        <g id="fins" className="av-fins">
          <path d="M-20 -24 h18 l6 22 h-34 z" fill="#f2c14e" />
          <path d="M2 -24 h18 l10 22 h-34 z" fill="#f2c14e" />
        </g>
        <g id="body" className="av-body">
          <rect x="-20" y="-132" width="40" height="64" rx="16" fill="#2a8fb3" />
          <rect x="-20" y="-104" width="40" height="8" fill="#e9f7fb" opacity="0.8" />
        </g>
        <g id="arms" className="av-arms">
          <rect x="-31" y="-128" width="11" height="48" rx="5.5" fill="#c98c64" />
          <rect x="20" y="-128" width="11" height="48" rx="5.5" fill="#c98c64" />
        </g>
        <g id="head" className="av-head">
          <circle cx="0" cy="-152" r="20" fill="#c98c64" />
          <path d="M-20 -158 a20 20 0 0 1 40 0 q-20 -10 -40 0z" fill="#3b2a20" />
        </g>
        <g id="mask" className="av-mask">
          <rect x="-17" y="-160" width="34" height="15" rx="7" fill="#bff6ff" stroke="#123" strokeWidth="2.5" opacity="0.9" />
          <rect x="-21" y="-156" width="42" height="4" fill="#123" />
        </g>
        <g id="snorkel" className="av-snorkel">
          <path d="M18 -150 v-32 q0 -6 6 -6" stroke="#f08a3c" strokeWidth="5" fill="none" strokeLinecap="round" />
        </g>
      </g>
    </g>
  );
}

export function Intro() {
  const root = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0);
  const [visited] = useState(readVisited);
  const [choice, setChoice] = useState(visited);
  const ready = useStore((s) => s.spotReady);
  const unlocked = useStore((s) => s.soundUnlocked);
  const loadProgress = useStore((s) => s.loadProgress);
  const finishing = useRef(false);

  const finish = () => {
    if (finishing.current) return;
    finishing.current = true;
    writeBool(VISITED, true);
    ScrollTrigger.getAll().forEach((t) => t.kill());
    store.set({ phase: 'underwater' });
    bus.emit('enterWater');
    window.scrollTo(0, 0);
  };

  useLayoutEffect(() => {
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ defaults: { ease: 'none' } });
      // 0–20%: title + hint fade, avatar crouches
      tl.to('.intro-copy', { opacity: 0, y: -30, duration: 0.15 }, 0)
        .to('.avatar-inner', { scaleY: 0.86, transformOrigin: '50% 100%', duration: 0.12, ease: 'power1.out' }, 0.06)
        .to('.av-arms', { rotate: -150, transformOrigin: '50% 10%', duration: 0.12 }, 0.06)
      // 20–45%: jump in an arc, scene follows down
        .to('.avatar-inner', { scaleY: 1, duration: 0.04 }, 0.2)
        .to('#avatar-pos', { x: '+=340', duration: 0.25 }, 0.2)
        .to('#avatar-pos', { y: '-=170', duration: 0.11, ease: 'power2.out' }, 0.2)
        .to('#avatar-pos', { y: '+=230', duration: 0.14, ease: 'power2.in' }, 0.31)
        .to('#avatar-rot', { rotate: 150, svgOrigin: '0 -80', duration: 0.25, ease: 'power1.inOut' }, 0.2)
        .to('#world', { y: -170, duration: 0.17, ease: 'power1.inOut' }, 0.28)
      // 45–55%: splash + flash
        .fromTo('.droplet', { scale: 0, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.03, stagger: 0.002 }, 0.45)
        .to('.droplet', { y: (i) => -80 - (i % 5) * 30, x: (i) => ((i % 7) - 3) * 30, duration: 0.07, stagger: 0.002 }, 0.46)
        .to('.droplet', { opacity: 0, duration: 0.03 }, 0.52)
        .set('#avatar', { opacity: 0 }, 0.47)
        .fromTo('.intro-flash', { opacity: 0 }, { opacity: 0.8, duration: 0.02 }, 0.46)
        .to('.intro-flash', { opacity: 0, duration: 0.05 }, 0.48)
      // 55–85%: waterline rises past the top, colours shift to blue, bubbles, mask edge in
        .to('#world', { y: -1100, duration: 0.3, ease: 'power1.in' }, 0.55)
        .to('.underwater-tint', { opacity: 1, duration: 0.25 }, 0.58)
        .fromTo('.bubble', { y: 0, opacity: 0 }, { y: -900, opacity: 0.9, duration: 0.3, stagger: 0.01 }, 0.56)
        .to('.intro-mask', { opacity: 1, duration: 0.2 }, 0.65);

      ScrollTrigger.create({
        trigger: root.current,
        start: 'top top',
        end: 'bottom bottom',
        scrub: reducedMotion() ? true : 0.6,
        animation: tl,
        onUpdate: (self) => {
          setProgress(self.progress);
          // splash sound once, only when scrolling forward through it
          if (self.direction > 0 && self.progress > 0.46 && self.progress < 0.56 && !(self as unknown as { _splashed?: boolean })._splashed) {
            (self as unknown as { _splashed?: boolean })._splashed = true;
            bus.emit('splash');
          }
          if (self.progress < 0.4) (self as unknown as { _splashed?: boolean })._splashed = false;
        },
      });
    }, root);
    return () => ctx.revert();
  }, []);

  // 85–100%: crossfade into the live panorama, holding if it isn't ready
  const fade = Math.min(1, Math.max(0, (progress - 0.85) / 0.15));
  const stageOpacity = ready ? 1 - fade : 1;
  const holding = progress > 0.85 && !ready;
  useEffect(() => {
    if (progress >= 0.995 && ready) finish();
  }, [progress, ready]);

  const autoDive = () => {
    setChoice(false);
    const startY = window.scrollY;
    const end = document.documentElement.scrollHeight - innerHeight;
    const t0 = performance.now();
    const dur = reducedMotion() ? 1200 : 5200;
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / dur);
      window.scrollTo(0, startY + (end - startY) * (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2));
      if (t < 1 && !finishing.current) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };

  return (
    <div ref={root} className="relative z-10" style={{ height: '350vh' }}>
      <div ref={stage} className="sticky top-0 h-screen w-full overflow-hidden" style={{ opacity: stageOpacity, transition: 'opacity 0.25s' }}>
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          <defs>
            <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#7cc8e6" />
              <stop offset="0.7" stopColor="#d6f1f4" />
              <stop offset="1" stopColor="#fbe9c8" />
            </linearGradient>
            <linearGradient id="sea" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#3fb3c9" />
              <stop offset="0.12" stopColor="#1d8fb0" />
              <stop offset="0.5" stopColor="#136b92" />
              <stop offset="1" stopColor="#0b3f63" />
            </linearGradient>
            <radialGradient id="sunGlow">
              <stop offset="0" stopColor="#fff7d6" />
              <stop offset="0.5" stopColor="#ffe9a8" stopOpacity="0.6" />
              <stop offset="1" stopColor="#ffe9a8" stopOpacity="0" />
            </radialGradient>
          </defs>
          <g id="world">
            <rect x="-200" y="-400" width="2000" height="1000" fill="url(#sky)" />
            <circle cx="1220" cy="190" r="170" fill="url(#sunGlow)" />
            <circle cx="1220" cy="190" r="56" fill="#fff6d2" />
            <rect x="-200" y="560" width="2000" height="1700" fill="url(#sea)" />
            {/* gentle sea-line highlights */}
            {Array.from({ length: 14 }, (_, i) => (
              <rect key={i} x={80 + i * 110 + (i % 3) * 20} y={575 + (i % 4) * 14} width={60 + (i % 3) * 25} height="3" rx="1.5" fill="#e8fbff" opacity="0.55" />
            ))}
            {/* a few coral shapes deep below for the descent */}
            {Array.from({ length: 9 }, (_, i) => (
              <ellipse key={i} cx={100 + i * 180} cy={1650 + (i % 3) * 40} rx={90 + (i % 4) * 20} ry={50} fill={['#c2412d', '#e0782f', '#8f4a8a', '#d9a73a'][i % 4]} opacity="0.75" />
            ))}
            {/* rocky ledge */}
            <path d="M-200 520 L180 500 Q300 505 380 540 L420 600 L-200 640 Z" fill="#6b5b4d" />
            <path d="M-200 520 L180 500 Q300 505 380 540 L360 548 Q280 520 170 522 L-200 540 Z" fill="#8a7764" />
            <g id="avatar-pos" transform="translate(300 515)">
              <g id="avatar-rot">
                <Avatar />
              </g>
            </g>
            {/* splash */}
            <g transform="translate(660 565)">
              {Array.from({ length: 22 }, (_, i) => (
                <circle key={i} className="droplet" cx={((i * 37) % 60) - 30} cy={-((i * 13) % 20)} r={4 + (i % 3) * 2} fill="#e8fbff" opacity="0" />
              ))}
            </g>
          </g>
          <rect className="underwater-tint" x="0" y="0" width="1600" height="900" fill="#0b4d73" opacity="0" />
          {Array.from({ length: 26 }, (_, i) => (
            <circle key={i} className="bubble" cx={540 + ((i * 53) % 520)} cy={900 + (i % 6) * 40} r={3 + (i % 4) * 3} fill="none" stroke="#dff8ff" strokeWidth="2" opacity="0" />
          ))}
        </svg>
        <div className="intro-flash pointer-events-none absolute inset-0 bg-white opacity-0" />
        <div className="intro-mask pointer-events-none absolute inset-0 opacity-0" style={{ boxShadow: 'inset 0 0 120px 60px rgba(2,10,16,0.85)', borderRadius: 28 }} />

        <div className="intro-copy absolute inset-x-0 top-[14vh] px-6 text-center">
          <h1 className="font-display text-5xl font-semibold tracking-tight text-[#0b3f63] md:text-7xl">Snorkel the Andaman Sea</h1>
          <p className="mx-auto mt-4 max-w-xl text-lg text-[#0f4a6e] md:text-xl">Float over a coral reef and meet the fish who live there.</p>
          {choice ? (
            <div className="mt-8 flex justify-center gap-3">
              <button className="focus-ring rounded-full bg-[#0b3f63] px-6 py-3 font-medium text-white" onClick={autoDive}>Dive in again</button>
              <button className="focus-ring rounded-full border border-[#0b3f63]/40 bg-white/60 px-6 py-3 font-medium text-[#0b3f63]" onClick={finish}>Skip</button>
            </div>
          ) : (
            <div className="mt-10 flex flex-col items-center text-[#0b3f63]">
              <span className="text-sm font-medium uppercase tracking-[0.2em]">Scroll to dive</span>
              <svg className="bob mt-2" width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v15m0 0-6-6m6 6 6-6" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </div>
          )}
        </div>

        {progress > 0.45 && progress < 0.99 && !unlocked && (
          <button className="glass focus-ring absolute bottom-10 left-1/2 -translate-x-1/2 rounded-full px-5 py-2.5 text-sm font-medium" onClick={() => sound.setMuted(false)}>
            Turn sound on
          </button>
        )}
        {holding && (
          <div className="absolute inset-0 grid place-items-center" role="status" aria-label="Loading the reef">
            <ProgressRing value={loadProgress} />
          </div>
        )}
      </div>
      <button className="glass focus-ring fixed right-5 top-5 z-20 rounded-full px-4 py-2 text-sm font-medium" onClick={finish}>
        Skip intro
      </button>
    </div>
  );
}

export function ProgressRing({ value }: { value: number }) {
  const r = 20, c = 2 * Math.PI * r;
  return (
    <svg width="56" height="56" viewBox="0 0 56 56">
      <circle cx="28" cy="28" r={r} stroke="rgba(255,255,255,0.2)" strokeWidth="4" fill="none" />
      <circle cx="28" cy="28" r={r} stroke="#bff6ff" strokeWidth="4" fill="none" strokeDasharray={c} strokeDashoffset={c * (1 - value)} strokeLinecap="round" transform="rotate(-90 28 28)" style={{ transition: 'stroke-dashoffset 0.2s' }} />
    </svg>
  );
}
