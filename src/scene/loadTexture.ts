import * as THREE from 'three';

/** Fetches an image with progress and returns a GPU-ready texture, or null if the file isn't there. */
export async function loadPanoTexture(url: string, onProgress?: (p: number) => void, signal?: AbortSignal): Promise<THREE.Texture | null> {
  let res: Response;
  try { res = await fetch(url, { signal }); } catch { return null; }
  // dev servers answer missing files with index.html, so check the type too
  if (!res.ok || !(res.headers.get('content-type') ?? '').startsWith('image/')) return null;
  const total = Number(res.headers.get('content-length')) || 0;
  let blob: Blob;
  if (res.body && total && onProgress) {
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let got = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value); got += value.length;
      onProgress(Math.min(1, got / total));
    }
    blob = new Blob(chunks as BlobPart[], { type: res.headers.get('content-type') ?? 'image/webp' });
  } else {
    blob = await res.blob();
    onProgress?.(1);
  }
  const bitmap = await createImageBitmap(blob, { imageOrientation: 'flipY' });
  const tex = new THREE.Texture(bitmap);
  tex.flipY = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = false;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = THREE.RepeatWrapping;
  tex.needsUpdate = true;
  return tex;
}
