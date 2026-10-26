"""Keep the original rig/animation data as a shared, texture-free GLB library."""
from pathlib import Path
import json,struct,copy,shutil,subprocess

data=Path('tools/behaviors/export.glb').read_bytes()
length=struct.unpack_from('<I',data,12)[0]
doc=json.loads(data[20:20+length]);binary=data[28+length:]
used=sorted({s[key] for a in doc['animations'] for s in a['samplers']for key in ['input','output']})
accessor_ids={old:new for new,old in enumerate(used)}
view_ids={};views=[];packed=bytearray();accessors=[]
for old in used:
    accessor=copy.deepcopy(doc['accessors'][old]);view_id=accessor['bufferView']
    if view_id not in view_ids:
        view=copy.deepcopy(doc['bufferViews'][view_id]);offset=view.get('byteOffset',0)
        packed.extend(b'\0'*((-len(packed))%4));view['byteOffset']=len(packed);view['buffer']=0
        packed.extend(binary[offset:offset+view['byteLength']]);view_ids[view_id]=len(views);views.append(view)
    accessor['bufferView']=view_ids[view_id];accessors.append(accessor)
for animation in doc['animations']:
    for sampler in animation['samplers']:
        for key in ['input','output']:sampler[key]=accessor_ids[sampler[key]]
for node in doc['nodes']:
    for key in ['mesh','skin']:node.pop(key,None)
for key in ['meshes','skins','materials','textures','images']:doc.pop(key,None)
doc.update(accessors=accessors,bufferViews=views,buffers=[{'byteLength':len(packed)}])
encoded=json.dumps(doc,separators=(',',':')).encode();encoded+=b' '*((-len(encoded))%4);packed.extend(b'\0'*((-len(packed))%4))
out=struct.pack('<III',0x46546c67,2,28+len(encoded)+len(packed))+struct.pack('<II',len(encoded),0x4e4f534a)+encoded+struct.pack('<II',len(packed),0x004e4942)+packed
Path('Assets/behaviors.glb').write_bytes(out)
for p in Path('tools/behaviors/sounds').rglob('*.mp3'):
    subprocess.run(['ffmpeg','-loglevel','error','-y','-i',str(p),'-ac','1','-ar','22050','Assets/Sounds/'+p.stem+'.wav'],check=True)
print(len(doc['animations']),'animation clips;',round(len(out)/1048576,1),'MiB;',len(list(Path('Assets/Sounds').glob('*.wav'))),'sounds')
