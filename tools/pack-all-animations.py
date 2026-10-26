"""Pack every chicken clip (not the player's arms), keeping original key values.
Deduplicate binary data and collapse exactly constant channels. Additive sleep
flinches are composed over the actual sleep pose instead of the bind pose.
Input is a VRF 20.1 export with tools/all-animation-clips.txt explicitly included.
"""
from pathlib import Path
import copy,json,struct,math,hashlib,re
import numpy as np
b=Path('tools/all-animations/export.glb').read_bytes();n=struct.unpack_from('<I',b,12)[0]
d=json.loads(b[20:20+n]);binary=b[28+n:]
metadata=json.loads(Path('tools/all-animation-metadata.json').read_text())
compatible={name.removesuffix('.vnmclip') for name,m in metadata.items() if m['skeleton']=='animation/skeletons/characters/chicken/chicken.vnmskel'}
source={a['name']:a for a in d['animations'] if a['name'] in compatible}
assert len(source)==104,len(source)

def values(index):
 a=d['accessors'][index];v=d['bufferViews'][a['bufferView']];o=v.get('byteOffset',0)+a.get('byteOffset',0)
 count=a['count']*{'SCALAR':1,'VEC3':3,'VEC4':4}[a['type']]
 return list(struct.unpack_from('<'+'f'*count,binary,o))

def first_pose(name):
 a=source[name];return {(c['target']['node'],c['target']['path']):values(a['samplers'][c['sampler']]['output'])[:{'translation':3,'scale':3,'rotation':4}[c['target']['path']]] for c in a['channels']}
sleep=first_pose('animation/anims/chicken/world/chick_sleep_loop01')
def multiply(a,b):
 x,y,z,w=a;X,Y,Z,W=b
 return [w*X+x*W+y*Z-z*Y,w*Y-x*Z+y*W+z*X,w*Z+x*Y-y*X+z*W,w*W-x*X-y*Y-z*Z]

def reduce_keys(times,vals,size,rotation):
 """Error-bounded key reduction: 0.01 mm / 0.006 degrees at source keys."""
 t=np.asarray(times);v=np.asarray(vals).reshape(-1,size)
 if len(t)<3:return times,vals
 keep={0,len(t)-1};pending=[(0,len(t)-1)]
 if rotation:v=v/np.linalg.norm(v,axis=1)[:,None]
 while pending:
  a,b=pending.pop()
  if b-a<2:continue
  f=((t[a+1:b]-t[a])/(t[b]-t[a]))[:,None]
  start=v[a];end=v[b]
  if rotation:
   dot=float(np.dot(start,end))
   if dot<0:end=-end;dot=-dot
   angle=math.acos(min(1,dot))
   predicted=(1-f)*start+f*end if angle<1e-5 else (np.sin((1-f)*angle)*start+np.sin(f*angle)*end)/math.sin(angle)
   predicted/=np.linalg.norm(predicted,axis=1)[:,None]
   err=np.minimum(np.linalg.norm(predicted-v[a+1:b],axis=1),np.linalg.norm(predicted+v[a+1:b],axis=1));tol=5e-5
  else:
   predicted=(1-f)*start+f*end;err=np.max(np.abs(predicted-v[a+1:b]),axis=1);tol=1e-5
  i=int(np.argmax(err))
  if err[i]>tol:
   mid=a+1+i;keep.add(mid);pending.extend([(a,mid),(mid,b)])
 ids=sorted(keep)
 # Preserve the original output values, including their original float encoding.
 return [times[i] for i in ids],[x for i in ids for x in vals[i*size:(i+1)*size]]

def pack(animations,target):
 nodes=copy.deepcopy(d['nodes'])
 for node in nodes:
  for key in ['mesh','skin']:node.pop(key,None)
 packed=bytearray();views=[];accessors=[];cache={}
 def accessor(vals,kind,is_time=False):
  raw=struct.pack('<'+'f'*len(vals),*vals);key=(kind,raw)
  if key in cache:return cache[key]
  packed.extend(b'\0'*((-len(packed))%4));offset=len(packed);packed.extend(raw)
  view=len(views);views.append({'buffer':0,'byteOffset':offset,'byteLength':len(raw)})
  a={'bufferView':view,'componentType':5126,'count':len(vals)//{'SCALAR':1,'VEC3':3,'VEC4':4}[kind],'type':kind}
  if is_time:a.update(min=[min(vals)],max=[max(vals)])
  index=len(accessors);accessors.append(a);cache[key]=index;return index
 result=[]
 for original in animations:
  a=copy.deepcopy(original);additive=a.get('extras',{}).get('additive',False)
  targets={c['sampler']:c['target'] for c in a['channels']}
  for i,s in enumerate(a['samplers']):
   times=values(s['input']);vals=values(s['output']);kind=d['accessors'][s['output']]['type'];size={'VEC3':3,'VEC4':4}[kind]
   t=targets[i];node=nodes[t['node']];path=t['path']
   if additive:
    bind=node.get(path,{'translation':[0,0,0],'rotation':[0,0,0,1],'scale':[1,1,1]}[path])
    base=sleep.get((t['node'],path),bind)
    for j in range(0,len(vals),size):
     v=vals[j:j+size]
     if path=='rotation':v=multiply(base,multiply([-bind[0],-bind[1],-bind[2],bind[3]],v))
     elif path=='translation':v=[v[k]-bind[k]+base[k] for k in range(size)]
     else:v=[v[k]*base[k]/bind[k] for k in range(size)]
     vals[j:j+size]=v
   # Exact equality only: animated values and interpolation remain unchanged.
   if all(vals[j:j+size]==vals[:size] for j in range(size,len(vals),size)):
    # Keep the last time as well so a completely static pose retains its duration.
    times=[times[0],times[-1]];vals=vals[:size]*2
   else:times,vals=reduce_keys(times,vals,size,path=='rotation')
   s['input']=accessor(times,'SCALAR',True);s['output']=accessor(vals,kind)
  if additive:a['extras']['additive_base']='chick_sleep_loop01:0'
  result.append(a)
 out={'asset':d['asset'],'scene':d.get('scene',0),'scenes':d['scenes'],'nodes':nodes,'animations':result,'accessors':accessors,'bufferViews':views,'buffers':[{'byteLength':len(packed)}]}
 encoded=json.dumps(out,separators=(',',':')).encode();encoded+=b' '*((-len(encoded))%4);packed.extend(b'\0'*((-len(packed))%4))
 data=struct.pack('<III',0x46546c67,2,28+len(encoded)+len(packed))+struct.pack('<II',len(encoded),0x4e4f534a)+encoded+struct.pack('<II',len(packed),0x004e4942)+packed
 Path('Assets/'+target+'.glb').write_bytes(data);print(target,len(result),round(len(data)/1048576,2),'MiB')

labels={
 'chick_idle01':'Pecking','chick_idle02':'Scratch and peck','chick_idle03':'Look around — 1','chick_idle03alt':'Look around — 2',
 'chick_idle04':'Behaviour — 4','chick_idle05':'Behaviour — 5','chick_idle06':'Behaviour — 6','chick_idle07':'Behaviour — 7',
 'chick_walk':'Walking','chick_start_walk':'Start walking','chick_run':'Running','chick_runflap':'Running with wings out','chick_hop':'Hop',
 'chick_fall_flap':'Flap while falling','chick_land':'Landing','chick_0lr':'Neutral stance',
 'chick_idle01_water':'Resting on water','chick_walk_swim':'Swimming','chick_run_swim':'Fast swimming','chick_land_water':'Water landing',
 'chick_sleep_loop01':'Sleeping','chick_squat_start':'Sit down','chick_squat_stand':'Stand up','chick_squat_loop01':'Sitting',
 'chick_squat_loop02':'Dozing','chick_squat_loop03':'Preening while sitting','chick_squat_loop04':'Pecking while sitting',
 'chick_feed01':'Feeding the chicken','chickbaby_feed02':'Feeding the chick',
 'chick_feed_to_sad01':'Sad chicken','chickbaby_feed_to_sad02':'Sad chick',
 'chick_reveal':'Reveal — 1','chick_reveal02':'Reveal — 2',
 'chickbaby_egg_hatch01':'Hatching — 1','chickbaby_egg_hatch01alt':'Hatching — 1, variation','chickbaby_egg_hatch02':'Hatching — 2',
 'chick_retirement01':'Farewell — 1','chick_retirement02':'Farewell — 2','chick_retirement02_baby':'Chick farewell',
}
entries=[]
for name,a in sorted(source.items()):
 leaf=name.split('/')[-1];library='behaviors' if '/world/' in name else 'poses' if '/snapshot/' in name else 'showcase' if '/ui/' in name else 'held'
 group='Behaviours'
 if library=='poses':
  match=re.search(r'(\d+)',leaf);label=('Character pose' if '_char' in leaf else 'Pose')+' '+str(int(match[1]))
  label+= ' — chick' if '_baby' in leaf else ' — adolescent' if '_adolescent' in leaf else ''
  group='Photo poses'
 elif library=='held':
  label=('Pick up chick' if 'baby' in leaf else 'Pick up chicken') if '_draw' in leaf else ('Chick in hands' if 'baby' in leaf else 'Chicken in hands')+' — '+leaf[-1]
  group='Held'
 elif library=='showcase':
  label=labels.get(leaf.removesuffix('_loop'))
  if '_shoulder_' in leaf:label='On shoulder — '+str(int(leaf[-2:]))
  assert label,leaf
  if leaf.endswith('_loop'):
   label=label.replace('Hatching','After hatching')
   label+=' — loop'
  group='Game scenes'
 else:
  label=labels.get(leaf)
  if '_trick' in leaf:
   label='Trick '+str(int(leaf[-2:]));group='Tricks'
   if leaf=='chick_trick10':label+=' — preening'
  elif '_react' in leaf:label='Reaction '+str(int(leaf[-2:]));group='Reactions'
  elif '_scared' in leaf:label='Startle '+str(int(leaf[-2:]));group='Reactions'
  elif '_flinch' in leaf:
   label='Sleep flinch '+str(int(re.search(r'flinch(\d+)',leaf)[1]));group='Rest'
   if 'non_additive' in leaf:label+=' — standalone version'
  elif re.fullmatch('chick_(45|90|135|180)[lr]?',leaf):
   angle=re.search(r'\d+',leaf)[0];label='Turn '+angle+'° '+('right' if leaf.endswith('r') else 'left');group='Movement'
  elif any(x in leaf for x in ['swim','water']):group='In water'
  elif any(x in leaf for x in ['squat','sleep']):group='Rest'
  elif any(x in leaf for x in ['walk','run','hop','fall','land','0lr']):group='Movement'
  assert label,leaf
 loop=bool(re.search(r'loop|chick_(walk|run|runflap|walk_swim|run_swim|fall_flap|idle\d+(alt|_water)?|scared\d+)$',leaf))
 entries.append({'name':name,'label':label,'group':group,'library':library,'loop':loop,'pose':library=='poses','rest':group=='Rest' and leaf not in ['chick_squat_start','chick_squat_stand']})
for library in ['behaviors','poses','showcase','held']:
 pack([source[e['name']] for e in entries if e['library']==library],library)
Path('Sources/animations.json').write_text(json.dumps(entries,ensure_ascii=False,indent=2)+'\n')
print('Catalog:',len(entries),'clips; 20 human-skeleton clips excluded.')
