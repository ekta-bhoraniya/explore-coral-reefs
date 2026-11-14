"""Procedural placeholder reef panoramas (equirectangular, 2:1).

These stand in for the Heron Bommie / Cinevva panoramas, which can't be
downloaded from the build workspace. Replace the files in public/panos/
(same spot ids) and nothing else needs to change.
Usage: python3 scripts/make-dev-pano.py [width]
"""
import sys, numpy as np
from PIL import Image, ImageFilter

W = int(sys.argv[1]) if len(sys.argv) > 1 else 4096
H = W // 2

def value_noise(x, y, seed, scale):
    rng = np.random.default_rng(seed)
    g = rng.random((257, 257)).astype(np.float32)
    g[256, :] = g[0, :]; g[:, 256] = g[:, 0]
    x = x / scale; y = y / scale
    xi = np.floor(x).astype(np.int64); yi = np.floor(y).astype(np.int64)
    xf = x - xi; yf = y - yi
    xf = xf * xf * (3 - 2 * xf); yf = yf * yf * (3 - 2 * yf)
    xi &= 255; yi &= 255
    a = g[yi, xi]; b = g[yi, xi + 1]; c = g[yi + 1, xi]; d = g[yi + 1, xi + 1]
    return (a * (1 - xf) + b * xf) * (1 - yf) + (c * (1 - xf) + d * xf) * yf

def fbm(x, y, seed, scale, oct=5):
    s = np.zeros_like(x); amp = 0.5; tot = 0
    for o in range(oct):
        s += amp * value_noise(x, y, seed + o * 17, scale / (2 ** o)); tot += amp; amp *= 0.5
    return s / tot

def hexc(h): return np.array([int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)], np.float32)

def make(spot, seed, depth, coral_cover, sun_yaw):
    u = (np.arange(W, dtype=np.float32) + 0.5) / W
    v = (np.arange(H, dtype=np.float32) + 0.5) / H
    U, V = np.meshgrid(u, v)
    lon = (U - 0.5) * 2 * np.pi           # yaw, 0 = image centre
    lat = (0.5 - V) * np.pi               # pitch, + = up
    dx = np.cos(lat) * np.sin(lon); dy = np.sin(lat); dz = -np.cos(lat) * np.cos(lon)

    deep = hexc('#0b3f63'); mid = hexc('#1d7aa0'); surf = hexc('#bfeff5')
    img = np.zeros((H, W, 3), np.float32)

    # --- water column / surface above ---
    t_up = np.clip(dy, 0, 1)
    water = deep[None, None] * (1 - t_up[..., None]) + mid[None, None] * t_up[..., None]
    # Snell's window: bright rippled disc overhead
    win = np.clip((dy - 0.55) / 0.35, 0, 1) ** 1.5
    px = dx / np.maximum(dy, 0.05); pz = dz / np.maximum(dy, 0.05)
    rip = fbm(px * 300 + 1000, pz * 300 + 1000, seed + 5, 60, 4)
    rip2 = np.abs(np.sin(rip * 18))
    sky = surf[None, None] * (0.75 + 0.35 * rip2[..., None])
    water = water * (1 - win[..., None]) + sky * win[..., None]
    # sun glow
    sx, sz = np.sin(np.radians(sun_yaw)), -np.cos(np.radians(sun_yaw))
    sun = np.clip(dx * sx * 0.5 + dz * sz * 0.5 + dy * 0.85, 0, 1) ** 12
    water += sun[..., None] * hexc('#fff6d8')[None, None] * 0.6
    img[:] = water

    # --- reef floor below ---
    below = dy < -0.02
    t = depth / np.maximum(-dy, 0.02)
    wx = dx * t * 40; wz = dz * t * 40           # world units in decimetres
    big = fbm(wx + 500, wz + 500, seed, 70, 4)
    det = fbm(wx, wz, seed + 1, 9, 5)
    hue = fbm(wx + 90, wz + 90, seed + 2, 45, 3)
    coral = np.clip((big - (1 - coral_cover) * 0.9) * 9 + (det - 0.5) * 2.5, 0, 1)
    sand = hexc('#cdbf8e')[None, None] * (0.6 + 0.35 * det[..., None])
    palette = [hexc(c) for c in ('#c2412d', '#e0782f', '#8f4a8a', '#d9a73a', '#5f7f3a', '#b5563f')]
    pidx = (np.clip((hue - 0.25) * 2, 0, 0.999) * len(palette)).astype(int)
    pal = np.stack(palette)[pidx]
    tex = fbm(wx * 3, wz * 3, seed + 3, 6, 3)
    branch = np.abs(np.sin(tex * 25 + det * 10))
    coralc = pal * (0.55 + 0.6 * branch[..., None]) * (0.7 + 0.5 * det[..., None])
    floor = sand * (1 - coral[..., None]) + coralc * coral[..., None]
    # caustics baked lightly
    ca = fbm(wx * 2 + 33, wz * 2, seed + 9, 14, 3)
    floor *= (0.9 + 0.3 * np.clip(1 - np.abs(ca - 0.5) * 8, 0, 1))[..., None]
    # shading by fake relief
    gy, gx = np.gradient(big)
    floor *= np.clip(0.9 + gx[..., None] * 60, 0.55, 1.2)
    # distance fog toward the horizon
    fog = 1 - np.exp(-t / 14.0)
    fogc = deep * 0.7 + mid * 0.3
    floor = floor * (1 - fog[..., None]) + fogc[None, None] * fog[..., None]
    # blue absorption (red fades first)
    absorb = np.exp(-np.array([0.10, 0.035, 0.015], np.float32)[None, None] * (t + depth)[..., None])
    floor = floor * (0.25 + 0.75 * absorb)
    blend = np.clip((-dy - 0.02) / 0.05, 0, 1)[..., None]
    img = img * (1 - blend * below[..., None]) + floor * blend * below[..., None]

    # light shafts
    ang = np.arctan2(dx, dz)
    shafts = fbm(np.cos(ang) * 400 + 10, np.sin(ang) * 400, seed + 11, 30, 3)
    shafts = np.clip((shafts - 0.55) * 4, 0, 1) * np.clip(1 - np.abs(dy) * 1.6, 0, 1)
    img += shafts[..., None] * hexc('#bff6ff')[None, None] * 0.12

    img = np.clip(img, 0, 1) ** (1 / 1.05)
    out = Image.fromarray((img * 255).astype(np.uint8))
    if spot == 'anemone-rock':
        paint_anemone(out)
    out.save(f'public/panos/4k/{spot}.webp', quality=85, method=4)
    out.resize((512, 256), Image.LANCZOS).filter(ImageFilter.GaussianBlur(2)).save(
        f'public/panos/preview/{spot}.webp', quality=70)
    print('wrote', spot)

def paint_anemone(im):
    """A stylised anemone with a resident clownfish below the start view.
    Its outline is residents[0].polygon in spots.json (UV 0.505-0.525, 0.668-0.684)."""
    from PIL import ImageDraw
    Wd, Hd = im.size
    layer = Image.new('RGBA', im.size, (0, 0, 0, 0)); d = ImageDraw.Draw(layer)
    r = np.random.default_rng(5)
    cx, cy = 0.5 * Wd, 0.69 * Hd; R = 0.035 * Wd
    for i in range(900):
        a = r.uniform(0, 2 * np.pi); rad = R * np.sqrt(r.uniform(0, 1))
        x0, y0 = cx + np.cos(a) * rad, cy + np.sin(a) * rad * 0.45
        L = r.uniform(0.004, 0.009) * Wd; ang = a + r.uniform(-0.6, 0.6) - np.pi / 2 * 0.3
        x1, y1 = x0 + np.cos(ang) * L * 0.4, y0 - abs(np.sin(ang)) * L
        c = (int(r.uniform(150, 200)), int(r.uniform(120, 160)), int(r.uniform(140, 190)), 235)
        d.line([(x0, y0), (x1, y1)], fill=c, width=max(2, Wd // 900))
        d.ellipse((x1 - 2, y1 - 2, x1 + 2, y1 + 2), fill=(225, 205, 220, 240))
    # clownfish, facing right
    fx, fy, fl = 0.515 * Wd, 0.676 * Hd, 0.016 * Wd
    d.ellipse((fx - fl / 2, fy - fl * 0.22, fx + fl / 2, fy + fl * 0.22), fill=(236, 110, 32, 255), outline=(20, 20, 20, 255), width=2)
    d.polygon([(fx - fl / 2 + 2, fy), (fx - fl * 0.75, fy - fl * 0.2), (fx - fl * 0.75, fy + fl * 0.2)], fill=(236, 110, 32, 255), outline=(20, 20, 20, 255))
    for k in (-0.22, 0.05, 0.3):
        x = fx + k * fl
        d.line([(x, fy - fl * 0.2), (x - fl * 0.03, fy + fl * 0.2)], fill=(250, 250, 250, 255), width=max(3, Wd // 700))
    d.ellipse((fx + fl * 0.32, fy - fl * 0.07, fx + fl * 0.38, fy - fl * 0.01), fill=(10, 10, 10, 255))
    layer = layer.filter(ImageFilter.GaussianBlur(Wd / 4096 * 1.2))
    im.paste(layer, (0, 0), layer)

SPOTS = [
    ('anemone-rock', 7, 2.2, 0.55, 30),
    ('sand-channel', 21, 2.6, 0.35, 60),
    ('reef-edge', 42, 3.2, 0.62, -20),
    ('staghorn-field', 77, 2.0, 0.75, 10),
]
only = sys.argv[2:]
for s in SPOTS:
    if not only or s[0] in only:
        make(*s)
