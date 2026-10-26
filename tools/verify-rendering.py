"""Verify original material channels and canonical real-WebKit review captures.
Requires tools/render-materials source extracts and --quality-compare captures
with --qa-bird=<bird> --quality-label=<bird> for all four birds.
"""
import json,base64,io
from pathlib import Path
from PIL import Image
import numpy as np
maps=json.loads(Path('Assets/material-maps.json').read_text())
meta=json.loads(Path('tools/render-materials/material-metadata.json').read_text());root=Path('tools/render-materials')
texels=0
for name,item in maps.items():
 image=Image.open(io.BytesIO(base64.b64decode(item['orm'].split(',')[1]))).convert('RGB');a=np.asarray(image);params=meta[name]['TextureParams']
 source_ao=Image.open(root/str(Path(params['g_tAmbientOcclusion']).with_suffix('.png'))).convert('RGB').getchannel('R').resize(image.size)
 assert np.array_equal(a[:,:,0],np.asarray(source_ao)),name+' AO channel'
 assert a[:,:,1].max()>0,name+' empty roughness'
 assert not np.any(a[:,:,2]),name+' false metalness'
 if meta[name]['IntParams'].get('F_ANISOTROPIC_GLOSS')==1:
  raw=np.asarray(Image.open(root/'raw'/str(Path(params['g_tAnisoGloss']).with_suffix('.png'))).convert('RGB').resize(image.size),dtype=float)/255
  rough=np.rint(np.sqrt(raw[:,:,0]*raw[:,:,1])*255).astype('uint8')
 else:rough=np.asarray(Image.open(root/'raw'/str(Path(params['g_tNormal']).with_suffix('.png'))).getchannel('B'))
 assert np.array_equal(a[:,:,1],rough),name+' roughness channel'
 texels+=a.shape[0]*a.shape[1]
for bird in ['chick','chicken','chicken_silkie','chicken_polish']:
 image=Image.open('/tmp/cs2-pet-quality-'+bird+'-after.png').convert('RGBA');pixels=np.asarray(image)
 assert (pixels[:,:,3]>250).sum()>pixels.shape[0]*pixels.shape[1]*.05,bird+' blank render'
 assert pixels[:10,:10,3].max()==0,bird+' lost desktop transparency'
 for label in ['before','after']:
  before=Image.open('/tmp/cs2-pet-quality-'+bird+'-'+label+'.png');assert before.size==image.size,'comparison resolution mismatch'
image=Image.open('/tmp/cs2-pet-quality-chick-after.png').convert('RGBA');pixels=np.asarray(image);h,w=pixels.shape[:2]
body=pixels[round(h*.543):round(h*.664),round(w*.414):round(w*.603),3]
assert body.min()==255,'fur has punched alpha holes into the opaque body'
print(f'{len(maps)} recovered material maps ({texels:,} texels) match original channels; all four WebKit renders are visible with transparent backgrounds; the chick body stays fully opaque.')
