"""Compose full-clip WebKit captures from --audit-actions into local review sheets.
Run the app with --qa-bird=chick --audit-actions --render-exit first.
Requires Pillow. Captures and review sheets contain game imagery and stay local.
"""
import json
from pathlib import Path
from PIL import Image, ImageDraw

root = Path(__file__).resolve().parent.parent
folder = Path('/tmp/cs2-pet-actions-audit')
catalog = json.loads((root / 'Sources/animations.json').read_text())
frames = {}
for path in folder.glob('*.json'):
    info = json.loads(path.read_text())
    frames.setdefault(info['clip'], []).append((info['fraction'], path.with_suffix('.png')))

for group in dict.fromkeys(entry['group'] for entry in catalog):
    entries = [entry for entry in catalog if entry['group'] == group]
    for page in range((len(entries) + 4) // 5):
        batch = entries[page * 5:(page + 1) * 5]
        sheet = Image.new('RGB', (1800, 190 * len(batch)), '#f2f3f5')
        draw = ImageDraw.Draw(sheet)
        for row, entry in enumerate(batch):
            samples = sorted(frames[entry['name']])
            assert len(samples) == 10, (entry['name'], len(samples))
            for column, (fraction, path) in enumerate(samples):
                image = Image.open(path).convert('RGBA')
                image.thumbnail((175, 155))
                tile = Image.new('RGBA', image.size, 'white')
                tile.alpha_composite(image)
                x = column * 180
                y = row * 190
                sheet.paste(tile.convert('RGB'), (x, y))
                draw.text((x + 4, y + 156), f'{round(fraction * 100)}%', fill='black')
            draw.text((4, row * 190 + 172), entry['name'] + ' | ' + entry['label'], fill='black')
        target = folder / (group.lower().replace(' ', '-') + f'-{page}.jpg')
        sheet.save(target, quality=92)
        print(target)
