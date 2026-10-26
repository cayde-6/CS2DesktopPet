"""Compare packed keyframes against the pinned, original VRF export."""
import json,struct
from pathlib import Path
import numpy as np

def load(path):
 b=Path(path).read_bytes();n=struct.unpack_from('<I',b,12)[0];d=json.loads(b[20:20+n]);binary=b[28+n:]
 def read(index):
  a=d['accessors'][index];v=d['bufferViews'][a['bufferView']];size={'SCALAR':1,'VEC3':3,'VEC4':4}[a['type']]
  return np.frombuffer(binary,dtype='<f4',count=a['count']*size,offset=v.get('byteOffset',0)+a.get('byteOffset',0)).reshape(-1,size).astype('float64')
 return d,read
original,original_read=load('tools/all-animations/export.glb');byname={a['name']:a for a in original['animations']}
max_position=0;max_rotation=0;samples=0;count=0
for library in ['behaviors','poses','showcase','held']:
 packed,read=load('Assets/'+library+'.glb')
 for a in packed['animations']:
  if a.get('extras',{}).get('additive'):continue # These intentionally use sleep, rather than bind pose, as base.
  source=byname[a['name']];count+=1
  targets={(c['target']['node'],c['target']['path']):a['samplers'][c['sampler']] for c in a['channels']}
  for c in source['channels']:
   key=(c['target']['node'],c['target']['path']);s=source['samplers'][c['sampler']];p=targets[key]
   times=original_read(s['input'])[:,0];expected=original_read(s['output']);t=read(p['input'])[:,0];v=read(p['output'])
   assert abs(times[-1]-t[-1])<1e-6
   if len(t)==1 or t[-1]==t[0]:actual=np.tile(v[0],(len(times),1))
   else:
    lo=np.clip(np.searchsorted(t,times,side='right')-1,0,len(t)-2);hi=lo+1
    f=np.clip((times-t[lo])/(t[hi]-t[lo]),0,1)[:,None];left=v[lo];right=v[hi]
    if key[1]=='rotation':
     left=left/np.linalg.norm(left,axis=1)[:,None];right=right/np.linalg.norm(right,axis=1)[:,None]
     dot=np.sum(left*right,axis=1);right[dot<0]*=-1;angle=np.arccos(np.clip(abs(dot),0,1))[:,None]
     sine=np.sin(angle);denom=np.where(sine<1e-10,1,sine)
     actual=np.where(angle<1e-5,left*(1-f)+right*f,(left*np.sin(angle*(1-f))+right*np.sin(angle*f))/denom)
    else:actual=left*(1-f)+right*f
   if key[1]=='rotation':
    expected/=np.linalg.norm(expected,axis=1)[:,None];actual/=np.linalg.norm(actual,axis=1)[:,None]
    error=float(np.max(np.minimum(np.linalg.norm(expected-actual,axis=1),np.linalg.norm(expected+actual,axis=1))))
    max_rotation=max(max_rotation,error);assert error<5.2e-5,(a['name'],key,error)
   else:
    error=float(np.max(np.abs(actual-expected)));max_position=max(max_position,error)
    assert error<1.1e-5,(a['name'],key,error)
   samples+=len(times)
print(f'{count} unchanged-base clips, {samples:,} original key samples verified: max component error {max_position:.8f}, quaternion chord error {max_rotation:.8f}. Three additive clips intentionally rebased to sleep.')
