"""Rebuild offline AO/roughness/cloth maps from original Valve texture channels.
Run VRF vtex decompilation first, using all-source-maps.txt. Decode normal/aniso
textures separately with --texture_decode_flags None into raw/. Auto decoding
otherwise treats anisotropic roughness as a normal map and changes its RG data.
default_metal is a constant nonmetal map and need not be downloaded.
"""
from pathlib import Path
from PIL import Image
import numpy as np
import json,base64,io
metadata=json.loads(Path('tools/render-materials/material-metadata.json').read_text())
root=Path('tools/render-materials');out=Path('Assets/material_maps');out.mkdir(exist_ok=True)
def path(resource):return root/str(Path(resource).with_suffix('.png'))
def url(image,destination):
 image.save(destination);return 'data:image/png;base64,'+base64.b64encode(destination.read_bytes()).decode()
result={}
for name,mat in metadata.items():
 params=mat['TextureParams'];normal=Image.open(path(params['g_tNormal'])).convert('RGBA');size=normal.size
 ao=Image.open(path(params['g_tAmbientOcclusion'])).convert('RGB').getchannel('R').resize(size)
 # VRF's lossless vtex PNG keeps Source's roughness in alpha after normal decode.
 if mat.get('IntParams',{}).get('F_ANISOTROPIC_GLOSS')==1:
  # Source stores the two directional roughnesses separately. Preserve their
  # geometric mean for the isotropic base lobe; never read the empty normal alpha.
  gloss=np.asarray(Image.open(root/'raw'/str(Path(params['g_tAnisoGloss']).with_suffix('.png'))).convert('RGB').resize(size),dtype=float)/255
  roughness=Image.fromarray(np.rint(np.sqrt(gloss[:,:,0]*gloss[:,:,1])*255).astype('uint8'))
 else:roughness=Image.open(root/'raw'/str(Path(params['g_tNormal']).with_suffix('.png'))).getchannel('B')
 orm=Image.merge('RGB',(ao,roughness,Image.new('L',size,0)))
 item={'orm':url(orm,out/(name+'-orm.png')),'roughnessRange':roughness.getextrema(),'aoRange':ao.getextrema(),'sourceNormal':params['g_tNormal'],'sourceAO':params['g_tAmbientOcclusion']}
 if mat.get('IntParams',{}).get('F_CLOTH_SHADING')==1:
  metal=Image.open(path(params['g_tMetalness'])).convert('RGB');a=np.asarray(metal,dtype=float)/255
  mask=Image.fromarray(np.rint(np.clip(a[:,:,2]*(1-a[:,:,1]),0,1)*255).astype('uint8')).convert('RGB')
  item['cloth']=url(mask,out/(name+'-cloth.png'));item['sourceCloth']=params['g_tMetalness']
 result[name]=item
 print(name,'roughness',item['roughnessRange'],'AO',item['aoRange'])
Path('Assets/material-maps.json').write_text(json.dumps(result,separators=(',',':'))+'\n')
