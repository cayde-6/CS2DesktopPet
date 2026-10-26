"""Place actual captured window frames at their desktop coordinates for visual QA."""
from pathlib import Path
import json,sys
from PIL import Image,ImageDraw

label=sys.argv[1]
folder=Path('/tmp')/('cs2-pet-motion-'+label)
records=[json.loads(p.read_text())for p in sorted(folder.glob('*.json'))]
first=records[0]
selected=records[:12]
w,h=530,330
sheet=Image.new('RGB',(w*3,h*4),'white')
for number,r in enumerate(selected):
    canvas=Image.new('RGBA',(w,h),'white');draw=ImageDraw.Draw(canvas)
    for x in range(0,w,10):draw.line((x,25,x,h),fill=(225,228,232)if x%50 else(190,195,201))
    draw.text((8,8),f'{label}: {(r["time"]-first["time"])/1000:.2f}s',(20,20,20))
    image=Image.open(folder/r['file']).convert('RGBA').resize((round(r['width']),round(r['height'])),Image.Resampling.LANCZOS)
    x=round(r['x']-first['x']+30);y=30
    canvas.alpha_composite(image,(x,y))
    sheet.paste(canvas.convert('RGB'),((number%3)*w,(number//3)*h))
out=folder/'contact-sheet.jpg';sheet.save(out,quality=94);print(out)
