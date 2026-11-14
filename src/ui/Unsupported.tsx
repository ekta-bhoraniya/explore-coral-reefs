import { useState } from 'react';
import { spotsFile } from '../data/content';
import { asset } from '../asset';

/** No WebGL 2, or a phone: a friendly still of the reef instead. */
export function Unsupported({ reason }: { reason: 'webgl' | 'mobile' }) {
  const [copied, setCopied] = useState(false);
  const share = async () => {
    const url = location.origin + location.pathname;
    try {
      if (navigator.share) await navigator.share({ title: 'Snorkel the Andaman Sea', url });
      else { await navigator.clipboard.writeText(url); setCopied(true); }
    } catch { /* cancelled */ }
  };
  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden px-6 text-center">
      <img src={asset(`panos/4k/${spotsFile.spots[0].file}.webp`)} alt="" className="absolute inset-0 h-full w-full object-cover opacity-70" />
      <div className="glass relative max-w-md rounded-3xl p-8">
        <h1 className="font-display text-3xl font-semibold">Snorkel the Andaman Sea</h1>
        {reason === 'mobile' ? (
          <>
            <p className="mt-3 text-white/85">Best experienced on a desktop. Open this page on a computer to float over the reef.</p>
            <button className="focus-ring mt-6 rounded-full bg-white px-5 py-2.5 font-medium text-[#0b3f63]" onClick={share}>{copied ? 'Link copied' : 'Share the link'}</button>
          </>
        ) : (
          <p className="mt-3 text-white/85">Your browser doesn't support WebGL 2, which this reef needs. Try the latest Chrome, Edge, Firefox or Safari.</p>
        )}
      </div>
    </main>
  );
}
