// Build-time content checks (run by the Vite plugin in vite.config.ts).
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { SpotsFileSchema, SpeciesFileSchema, CreditsFileSchema } from './schema';

function load(root: string, file: string) {
  return JSON.parse(readFileSync(join(root, 'src/data', file), 'utf8'));
}

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const globToRe = (g: string) => new RegExp('^' + g.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*') + '$');

export function validateContent(root: string): string[] {
  const problems: string[] = [];
  const parse = <T,>(name: string, schema: { safeParse: (v: unknown) => { success: boolean; data?: T; error?: { issues: { path: PropertyKey[]; message: string }[] } } }) => {
    const r = schema.safeParse(load(root, name));
    if (!r.success) r.error!.issues.forEach((i) => problems.push(`${name} ${i.path.join('.')}: ${i.message}`));
    return r.data;
  };
  const spots = parse('spots.json', SpotsFileSchema) as ReturnType<typeof SpotsFileSchema.parse> | undefined;
  const species = parse('species.json', SpeciesFileSchema) as ReturnType<typeof SpeciesFileSchema.parse> | undefined;
  const credits = parse('credits.json', CreditsFileSchema) as ReturnType<typeof CreditsFileSchema.parse> | undefined;
  if (!spots || !species || !credits) return problems;

  const pub = join(root, 'public');
  const speciesIds = new Set(species.map((s) => s.id));
  const spotIds = new Set(spots.spots.map((s) => s.id));
  if (!spotIds.has(spots.start)) problems.push(`spots.json start "${spots.start}" is not a spot`);
  for (const s of spots.spots) {
    if (!existsSync(join(pub, 'panos/4k', s.file + '.webp'))) problems.push(`spot ${s.id}: missing /panos/4k/${s.file}.webp`);
    if (!existsSync(join(pub, 'panos/preview', s.file + '.webp'))) problems.push(`spot ${s.id}: missing /panos/preview/${s.file}.webp`);
    s.links.forEach((l) => { if (!spotIds.has(l.to)) problems.push(`spot ${s.id}: link to unknown spot "${l.to}"`); });
    const swimmerCount = s.swimmers.reduce((n, w) => n + w.count, 0);
    if (swimmerCount > 8) problems.push(`spot ${s.id}: ${swimmerCount} swimmers (max 8)`);
    s.swimmers.forEach((w) => {
      const sp = species.find((x) => x.id === w.species);
      if (!sp) problems.push(`spot ${s.id}: unknown swimmer species "${w.species}"`);
      else if (!sp.model) problems.push(`spot ${s.id}: swimmer "${w.species}" has no model`);
    });
    s.residents.forEach((r) => { if (!speciesIds.has(r.species)) problems.push(`spot ${s.id}: unknown resident species "${r.species}"`); });
  }
  for (const sp of species) {
    sp.photos.forEach((p) => { if (!existsSync(join(pub, 'photos', p))) problems.push(`species ${sp.id}: missing /photos/${p}`); });
    if (sp.model && !existsSync(join(pub, 'models', sp.model.file))) problems.push(`species ${sp.id}: missing /models/${sp.model.file}`);
  }
  // No credit entry, no asset.
  const patterns = credits.map((c) => globToRe(c.asset));
  for (const dir of ['panos', 'models', 'photos', 'audio']) {
    for (const f of walk(join(pub, dir))) {
      if (f.endsWith('.placeholder') || f.endsWith('.gitkeep')) continue;
      const url = '/' + relative(pub, f).split('\\').join('/');
      if (!patterns.some((re) => re.test(url))) problems.push(`no credits.json entry for ${url}`);
    }
  }
  return problems;
}
