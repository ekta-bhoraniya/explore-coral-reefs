"""Placeholder fish photos (1200x900 WebP) until licensed Wikimedia / iNaturalist
photos are downloaded. Each placeholder is labelled so it is never mistaken
for a real photo. Overwrite public/photos/<species-id>-<n>.webp to upgrade."""
import json, os
from PIL import Image, ImageDraw, ImageFont, ImageFilter
species = json.load(open('src/data/species.json'))
os.makedirs('public/photos', exist_ok=True)
FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
labels = ['side view', 'in habitat', 'close-up']
tints = [((14, 70, 96), (40, 140, 160)), ((10, 50, 80), (30, 110, 120)), ((20, 60, 90), (70, 150, 170))]
for sp in species:
    for i, fn in enumerate(sp['photos']):
        path = f'public/photos/{fn}'
        if os.path.exists(path) and not os.path.exists(path + '.placeholder'):
            continue  # a real photo is already there
        a, b = tints[i % 3]
        im = Image.new('RGB', (1200, 900))
        d = ImageDraw.Draw(im)
        for y in range(900):
            k = y / 899
            d.line([(0, y), (1200, y)], fill=tuple(int(a[c] * k + b[c] * (1 - k)) for c in range(3)))
        d.ellipse((330, 330, 870, 570), fill=(255, 255, 255, 40), outline=(220, 245, 250), width=4)
        d.polygon([(860, 450), (980, 360), (980, 540)], outline=(220, 245, 250), width=4)
        d.ellipse((410, 420, 440, 450), fill=(220, 245, 250))
        f1 = ImageFont.truetype(FONT, 44); f2 = ImageFont.truetype(FONT, 28)
        d.text((600, 140), sp['commonName'], font=f1, anchor='mm', fill=(240, 252, 255))
        d.text((600, 720), f'Photo placeholder · {labels[i % 3]}', font=f2, anchor='mm', fill=(200, 235, 240))
        d.text((600, 770), 'replace with a CC0 / CC BY photo', font=f2, anchor='mm', fill=(170, 215, 225))
        im.save(path, quality=80)
        open(path + '.placeholder', 'w').close()
        print('wrote', path)
