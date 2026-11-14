"""Synthesised placeholder sound set (CC0, made in-house).

Stand-ins for the Freesound files listed in the build spec. Already
'muffled' (low-passed) as Step 8 asks. Replace files in public/audio/
with the same names to upgrade. Needs numpy + ffmpeg.
"""
import numpy as np, subprocess, wave, os
SR = 44100
rng = np.random.default_rng(3)
os.makedirs('public/audio', exist_ok=True)

def fft_lowpass(x, cutoff, slope=2):
    X = np.fft.rfft(x); f = np.fft.rfftfreq(len(x), 1 / SR)
    X *= 1 / (1 + (f / cutoff) ** (2 * slope))
    return np.fft.irfft(X, len(x))

def bandnoise(n, lo, hi):
    X = np.fft.rfft(rng.standard_normal(n)); f = np.fft.rfftfreq(n, 1 / SR)
    X[(f < lo) | (f > hi)] = 0
    return np.fft.irfft(X, n)

def norm(x, peak=0.5):
    return x / (np.max(np.abs(x)) + 1e-9) * peak

def seamless(x, fade):
    # crossfade the tail into the head so the loop has no seam
    n = len(x) - fade; out = x[:n].copy()
    w = np.linspace(0, 1, fade)
    out[:fade] = x[:fade] * w + x[n:] * (1 - w)
    return out

def write(name, x):
    x = np.clip(x, -1, 1)
    wav = f'.cache/{name}.wav'; os.makedirs('.cache', exist_ok=True)
    with wave.open(wav, 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((x * 32767).astype('<i2').tobytes())
    for ext, args in (('ogg', ['-c:a', 'libvorbis', '-q:a', '4']), ('mp3', ['-c:a', 'libmp3lame', '-b:a', '128k'])):
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', wav, *args, f'public/audio/{name}.{ext}'], check=True)
    print('wrote', name)

def env(n, a, r):
    e = np.ones(n); ai = int(a * SR); ri = int(r * SR)
    e[:ai] = np.linspace(0, 1, ai); e[-ri:] *= np.linspace(1, 0, ri) ** 2
    return e

# ambience: 60 s deep rumble + slow swell + faint crackle (shrimp), muffled
n = SR * 62
t = np.arange(n) / SR
rumble = bandnoise(n, 20, 400) * (0.7 + 0.3 * np.sin(2 * np.pi * t / 7.5))
crackle = (rng.random(n) > 0.9993) * rng.standard_normal(n)
crackle = fft_lowpass(crackle, 1500) * 0.6
amb = norm(rumble) * 0.8 + norm(crackle) * 0.15
amb = fft_lowpass(amb, 1500)
write('ambience', norm(seamless(amb, SR * 2), 0.35))

# snorkel breathing loop (inhale 1.6 s, pause, exhale 2.2 s, pause)
cyc = int(SR * 5.5); b = np.zeros(cyc)
def breath(dur, lo, hi, amp):
    m = int(dur * SR); x = bandnoise(m, lo, hi)
    return norm(x) * np.sin(np.linspace(0, np.pi, m)) ** 1.5 * amp
inh = breath(1.6, 300, 2200, 0.5); exh = breath(2.2, 200, 1500, 0.4)
b[int(0.2 * SR):int(0.2 * SR) + len(inh)] += inh
s = int(2.3 * SR); b[s:s + len(exh)] += exh
write('breathing', norm(fft_lowpass(b, 1500), 0.3))

# bubbles: sine chirps
def bubble_burst(seed, count, dur):
    r = np.random.default_rng(seed); m = int(dur * SR); x = np.zeros(m)
    for _ in range(count):
        st = r.integers(0, m - SR // 8); L = int(r.uniform(0.03, 0.09) * SR)
        f0 = r.uniform(300, 1200); tt = np.arange(L) / SR
        f = f0 * (1 + tt * r.uniform(3, 8))
        x[st:st + L] += np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tt * 40) * r.uniform(0.3, 1)
    return norm(fft_lowpass(x, 2200), 0.4)
for i in range(4):
    write(f'bubbles-{i + 1}', bubble_burst(10 + i, 6 + 4 * i, 1.2 + 0.3 * i))

# fin kick / swim whoosh
m = int(0.9 * SR); w = bandnoise(m, 80, 900) * np.sin(np.linspace(0, np.pi, m)) ** 2
write('fin-kick', norm(fft_lowpass(w, 1200), 0.45) + bubble_burst(99, 4, 0.9) * 0.4)

# surface splash (not muffled: it happens above water)
m = int(1.4 * SR); sp = bandnoise(m, 200, 9000) * env(m, 0.01, 1.2) * np.exp(-np.arange(m) / SR * 2.5)
write('splash', norm(sp, 0.55))

# UI tick + chime
m = int(0.08 * SR); tt = np.arange(m) / SR
write('tick', norm(np.sin(2 * np.pi * 1800 * tt) * np.exp(-tt * 70), 0.15))
m = int(1.6 * SR); tt = np.arange(m) / SR
ch = sum(np.sin(2 * np.pi * f * tt) * np.exp(-tt * d) * a for f, d, a in ((880, 2.5, 1), (1320, 3.5, .5), (1760, 5, .25)))
write('chime', norm(ch * env(m, 0.005, 0.5), 0.2))
