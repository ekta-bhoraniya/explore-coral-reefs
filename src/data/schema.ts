import { z } from 'zod';

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'expected a #rrggbb colour');
const deg = z.number().min(-360).max(360);
const uv = z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)]);

export const SwimmerSchema = z.object({
  species: z.string(),
  count: z.number().int().min(1).max(8).default(1),
  path: z.enum(['loop', 'pass', 'hover']),
  yaw: deg,
  pitch: z.number().min(-89).max(89),
  distance: z.number().min(1).max(30),
  radius: z.number().min(0).max(20).default(1),
  speed: z.number().min(0).max(5).default(0.4),
});

export const SpotSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  title: z.string(),
  file: z.string(),
  initialYaw: deg,
  initialPitch: z.number().min(-75).max(60),
  links: z.array(z.object({
    to: z.string(), yaw: deg, pitch: z.number().min(-89).max(89), arriveYaw: deg.optional(),
  })).min(1),
  water: z.object({
    tint: hex,
    caustics: z.number().min(0).max(2),
    rays: z.number().min(0).max(2),
    particles: z.number().min(0).max(2),
    sunYaw: deg.default(0),
    wobble: z.number().min(0).max(0.01).default(0.002),
  }),
  grade: z.object({ exposure: z.number().min(0.3).max(2), saturation: z.number().min(0).max(2), tint: hex, hazeColor: hex }),
  swimmers: z.array(SwimmerSchema).max(8).default([]),
  residents: z.array(z.object({ species: z.string(), polygon: z.array(uv).min(3) })).default([]),
});

export const SpotsFileSchema = z.object({ start: z.string(), spots: z.array(SpotSchema).min(1) });

export const SpeciesSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  commonName: z.string(),
  scientificName: z.string(),
  description: z.string().min(20).max(400),
  lengthCm: z.object({ typical: z.number().positive().optional(), max: z.number().positive() }),
  weight: z.string().optional(),
  depthM: z.object({ min: z.number().min(0), max: z.number().positive() }),
  hidesIn: z.string(),
  photos: z.array(z.string()).length(3),
  model: z.object({
    file: z.string(),
    rotation: z.tuple([deg, deg, deg]).default([0, 0, 0]),
    /** Manual scale; omit to auto-normalise the model to 1 unit long. */
    scale: z.number().positive().optional(),
    /** Believable on-screen length in scene units (≈ metres). */
    displayLength: z.number().positive(),
    wiggle: z.object({ amp: z.number().min(0), freq: z.number().min(0) }),
    motion: z.enum(['swim', 'roll']).default('swim'),
  }).optional(),
  sources: z.array(z.string().url()).min(1),
  factStatus: z.enum(['draft', 'verified']),
});
export const SpeciesFileSchema = z.array(SpeciesSchema);

export const CreditSchema = z.object({
  group: z.enum(['Panoramas', '3D models', 'Photos', 'Fish facts', 'Sound', 'Code libraries']),
  asset: z.string(),
  title: z.string(),
  author: z.string(),
  source: z.string(),
  licence: z.string(),
  licenceUrl: z.string().url(),
  modified: z.string().optional(),
});
export const CreditsFileSchema = z.array(CreditSchema);

export type Spot = z.infer<typeof SpotSchema>;
export type SpotsFile = z.infer<typeof SpotsFileSchema>;
export type Swimmer = z.infer<typeof SwimmerSchema>;
export type Species = z.infer<typeof SpeciesSchema>;
export type Credit = z.infer<typeof CreditSchema>;
