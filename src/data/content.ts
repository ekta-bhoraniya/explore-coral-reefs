import spotsJson from './spots.json';
import speciesJson from './species.json';
import creditsJson from './credits.json';
import { SpotsFileSchema, SpeciesFileSchema, CreditsFileSchema, type Spot, type Species } from './schema';

export const spotsFile = SpotsFileSchema.parse(spotsJson);
export const species = SpeciesFileSchema.parse(speciesJson);
export const credits = CreditsFileSchema.parse(creditsJson);

export type RuntimeSpot = Spot & { /** extra panorama rotation, used by ?devTwin */ yawOffset: number };

const params = new URLSearchParams(location.search);
export const flags = {
  devTwin: params.has('devTwin'),
  author: params.has('author'),
};

export const spots: RuntimeSpot[] = spotsFile.spots.map((s) => ({ ...s, yawOffset: 0 }));

if (flags.devTwin) {
  // A second virtual spot from the start image, rotated 180°, to build transitions with one panorama.
  const start = spots.find((s) => s.id === spotsFile.start)!;
  const twin: RuntimeSpot = { ...start, id: `${start.id}-twin`, title: `${start.title} (twin)`, yawOffset: 180, residents: [],
    links: [{ to: start.id, yaw: 180, pitch: -8 }] };
  start.links = [...start.links, { to: twin.id, yaw: 180, pitch: -8 }];
  spots.push(twin);
}

export const spotById = (id: string) => spots.find((s) => s.id === id);
export const speciesById = (id: string): Species | undefined => species.find((s) => s.id === id);
