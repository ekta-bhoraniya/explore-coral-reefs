// Downloads the fish GLBs (Ethereal Engine open asset kit, curator states CC0),
// converts spec-gloss -> metal-rough and compresses them with meshopt.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, statSync, existsSync, rmSync } from 'node:fs';

const BASE = 'https://media.githubusercontent.com/media/ir-engine/ir-engine-assets-basic/HEAD/assets/';
const MODELS = {
  'clownfish': 'ocean/ClownFish.glb',
  'angelfish': 'ocean/AngelFish3.glb',
  'sea-turtle': 'low_poly/SeaTurtle.glb',
  'napoleon-wrasse': 'ocean/NapoleonWrassefish.glb',
  'tuskfish': 'ocean/Orangedottedtuskfish.glb',
  'octopus': 'ocean/Octopus.glb',
  'whitetip-shark': 'ocean/white-tip-shark.glb',
};
const only = process.argv.slice(2);
mkdirSync('.cache/models', { recursive: true });
mkdirSync('public/models', { recursive: true });
const cli = 'node_modules/.bin/gltf-transform';
for (const [id, path] of Object.entries(MODELS)) {
  if (only.length && !only.includes(id)) continue;
  const raw = `.cache/models/${id}.raw.glb`;
  if (!existsSync(raw)) {
    console.log('download', path);
    const res = await fetch(BASE + path);
    if (!res.ok) { console.warn('  failed', res.status); continue; }
    writeFileSync(raw, Buffer.from(await res.arrayBuffer()));
  }
  const step1 = `.cache/models/${id}.step1.glb`;
  const out = `public/models/${id}.glb`;
  execFileSync(cli, ['metalrough', raw, step1], { stdio: 'inherit' });
  execFileSync(cli, ['optimize', step1, out, '--compress', 'meshopt', '--texture-compress', 'webp',
    '--texture-size', '1024', '--simplify-ratio', '0.4'], { stdio: 'inherit' });
  rmSync(step1);
  console.log(`  ${out}: ${(statSync(out).size / 1e6).toFixed(2)} MB`);
}
