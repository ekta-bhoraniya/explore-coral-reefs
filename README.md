# Reef Snorkel: 360° Panorama MVP (PRD A, v1)

Snorkel a shallow Andaman-style coral reef in the browser. Scroll the landing page to dive in, drag to look around, use the arrow keys or the glowing rings to swim between spots, and click a fish to learn about it.

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # static dist/, deployable to Vercel or Netlify
```

## Controls
| Input | Action |
| --- | --- |
| Drag / A, D | Look around |
| Wheel / pinch | Zoom (FOV 55–85°) |
| ↑ W, ←, →, ↓ S | Swim to the spot in that direction (↓ = back) |
| Click a glowing ring | Swim that way |
| Click a fish | Open its info card (Esc, × or click outside to close) |
| Tab / Enter | Cycle through visible fish and rings / activate |

Dev URL flags: `?devTwin=1` adds a second spot that reuses the start image, rotated 180°. `?author=1` lets you click points around a fish in the photo and copies the resident polygon JSON. `dev/models.html` renders every species model after normalisation, so you can check that its head points +X.

## Architecture
Three.js runs in plain TypeScript classes (`src/scene`), outside React. React (`src/ui`) only renders the HTML overlay. The two talk through `src/store.ts`, a small store plus event bus.

- `Viewer.ts` handles the renderer, camera, look controls, keys, progressive loading, picking, the accessibility button layer, quality tiers and the authoring tool.
- `PanoSphere.ts` + `shaders/pano.frag` draw the equirect sphere, with two texture slots for the swim crossfade plus caustics and surface shimmer.
- `WaterFX.ts` + `shaders/post.frag` add light shafts, marine snow and bubbles, then one post pass for wobble, swim blur, grade and the mask edge.
- `Transition.ts` runs the 1,000 ms swim (push, blur, crossfade with radial zoom, hold if the next spot isn't loaded yet).
- `Fish.ts` / `FishManager.ts` / `fishModels.ts` handle swimmers (loop, pass, hover paths, wiggle shader, matching the photo's grade, haze, caustics) and residents (polygons on the sphere).
- `audio/Sound.ts` plays sound with Howler. Nothing plays until the first click, and mute is remembered.

## Content is data
`src/data/spots.json`, `species.json` and `credits.json` are validated with zod on `npm run dev` and `npm run build`. A missing field, an unknown species, a missing image or model, or **any file in `public/` without a credits entry** fails the build.

To add a spot, drop `public/panos/{preview,4k,8k}/<id>.webp` and add an entry to `spots.json`. To add a species, add its model, 3 photos, a `species.json` entry and credits. No code changes are needed for either.

## Placeholder assets (replace before launch)
The build workspace couldn't reach Wikimedia, Cinevva, Freesound, iNaturalist or FishBase, so these are generated stand-ins. Each one is credited as a placeholder:

| Asset | Now | Replace with |
| --- | --- | --- |
| Panoramas (4 spots) | Procedural reef (`npm run assets:pano`) | Heron Bommie for dev, then 6–10 Cinevva spots. Keep the file names, or edit `spots.json` |
| Fish photos (3 × 8) | Labelled placeholder cards (`npm run assets:photos`) | CC0 / CC BY photos at `public/photos/<species>-<n>.webp`, plus credits |
| Sound | Synthesised and low-passed (`npm run assets:audio`) | Freesound CC0 / CC BY files with the same names |
| Fish facts | Written from general knowledge; every species is `factStatus: "draft"` | Check each fact against the linked FishBase / SeaLifeBase page, then set `verified` |
| Resident clownfish | Painted into `anemone-rock` | Redraw polygons with `?author=1` on the real panoramas |

The fish models are real: Microsoft Remix 3D models from the Ethereal Engine kit (`npm run assets:models`, curator states CC0; confirm before launch). Powder blue tang has no model yet, so it has a card but no swimmer.
