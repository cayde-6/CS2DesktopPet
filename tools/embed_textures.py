"""Make exported GLBs self-contained for offline loading by the desktop app."""
from pathlib import Path
import base64,json,struct,zlib,binascii

def pixel_png(r,g,b):
    def chunk(t,d):return struct.pack('>I',len(d))+t+d+struct.pack('>I',binascii.crc32(t+d)&0xffffffff)
    return b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',1,1,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(bytes([0,r,g,b])))+chunk(b'IEND',b'')

for name in ('chick','chicken','chicken_silkie','chicken_polish'):
    path=Path('Assets')/(name+'.glb')
    data=path.read_bytes()
    length,kind=struct.unpack_from('<II',data,12)
    doc=json.loads(data[20:20+length])
    for image in doc.get('images',[]):
        if image.get('name')=='chick_yellow_fur_color_psd_e1db1d33.vtex':
            # Preserve the original feather opacity; VRF's PBR export strips this alpha.
            image['uri']='data:image/png;base64,'+base64.b64encode(Path('tools/fur-source.png').read_bytes()).decode()
            image.pop('bufferView',None)
        uri=image.get('uri','')
        if uri and not uri.startswith('data:'):
            texture=path.parent/uri
            if not texture.exists() and uri.startswith('default_metal_'):
                # VRF omits generated constant textures. AO=1, roughness=.8, metal=0.
                payload=pixel_png(255,204,0)
            else:payload=texture.read_bytes()
            image['uri']='data:image/png;base64,'+base64.b64encode(payload).decode()
    encoded=json.dumps(doc,separators=(',',':')).encode()
    encoded+=b' '*((-len(encoded))%4)
    rest=data[20+length:]
    output=struct.pack('<III',0x46546c67,2,20+len(encoded)+len(rest))+struct.pack('<II',len(encoded),kind)+encoded+rest
    path.write_bytes(output)
    print(name,round(len(output)/1048576,1),'MiB',len(doc.get('animations',[])),'animations')
