from pathlib import Path
import json
from PIL import Image,ImageDraw
catalog=json.loads(Path('Sources/animations.json').read_text())
for group in ['world','snapshot','ui','held']:
 entries=[e for e in catalog if ('held' if '/viewmodel/' in e['name'] else e['name'].split('/')[3])==group]
 for page in range((len(entries)+23)//24):
  batch=entries[page*24:(page+1)*24];out=Image.new('RGB',(1080,230*((len(batch)+5)//6)),'#eeeeee');dr=ImageDraw.Draw(out)
  for i,e in enumerate(batch):
   label=e['name'].split('/')[-1];p=Path('/tmp/cs2-pet-actions-preview')/(group+'_'+label+'_65.png')
   im=Image.open(p).convert('RGBA');im.thumbnail((180,180));x=(i%6)*180;y=(i//6)*230
   bg=Image.new('RGBA',im.size,'white');bg.alpha_composite(im);out.paste(bg.convert('RGB'),(x,y))
   for row in range(3):dr.text((x+3,y+183+row*13),label[row*26:(row+1)*26],fill='black')
  out.save(f'/tmp/cs2-pet-{group}-{page}.jpg')
