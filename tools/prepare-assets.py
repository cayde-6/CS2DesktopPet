"""Prepare private local assets from an existing CS2 install; never downloads games.
Requires the documented VRF 20.1 patch, .NET 10, Pillow, NumPy and ffmpeg.
The game resources produced by this tool must not be committed or redistributed.
"""
import argparse,json,os,shutil,struct,subprocess,sys
from pathlib import Path

root=Path(__file__).resolve().parent.parent
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--pak',required=True,type=Path,help='Your game/csgo/pak01_dir.vpk, with the numbered VPK files alongside it')
parser.add_argument('--vrf',required=True,type=Path,help='Patched Source2Viewer-CLI executable or Source2Viewer-CLI.dll')
args=parser.parse_args();pak=args.pak.expanduser().resolve();vrf=args.vrf.expanduser().resolve()
if not pak.is_file()or not vrf.is_file():parser.error('Both --pak and --vrf must point to existing files.')
if not shutil.which('ffmpeg'):parser.error('ffmpeg is required for the local sound conversion.')
import PIL,numpy # Fail before producing files if optional export dependencies are absent.
cli=['dotnet',str(vrf)]if vrf.suffix=='.dll'else[str(vrf)]
log=root/'tools/prepare-assets.log';assets=root/'Assets';assets.mkdir(exist_ok=True)
source=root/'tools/asset-source';source.mkdir(parents=True,exist_ok=True)
def run(command,env=None):
 with log.open('a')as output:
  result=subprocess.run([str(x)for x in command],cwd=root,env=env,stdout=output,stderr=subprocess.STDOUT)
 if result.returncode:raise RuntimeError('Export failed; see tools/prepare-assets.log')
def export(resource,destination,options=(),env=None):
 destination.parent.mkdir(parents=True,exist_ok=True)
 destination.unlink(missing_ok=True)
 run(cli+['-i',pak,'-f',resource,'-o',destination,'-d',*options],env)
 if not destination.exists():raise RuntimeError(f'Missing export: {resource}. Confirm the full numbered VPK set is present; see tools/prepare-assets.log.')
def texture(resource,directory,raw=False):
 directory.mkdir(parents=True,exist_ok=True)
 result=directory/str(Path(resource).with_suffix('.png'))
 result.unlink(missing_ok=True)
 run(cli+['-i',pak,'-f',resource+'_c','-o',directory,'-d',*(['--texture_decode_flags','None']if raw else[])])
 result=directory/str(Path(resource).with_suffix('.png'))
 if not result.is_file():raise RuntimeError(f'Texture missing: {resource}. See tools/prepare-assets.log')
 return result

try:
 print('1/5 Exporting the four models and their local textures…',flush=True)
 common=['--gltf_export_format','glb','--gltf_export_animations','--gltf_compose_additive']
 names=['chick_idle01','chick_idle02','chick_idle03','chick_walk','chick_runflap','chick_react01','chick_react02','chick_trick01']
 clips=','.join('animation/anims/chicken/world/'+n for n in names)
 for bird in ['chick','chicken','chicken_silkie','chicken_polish']:
  export('models/chicken/'+bird+'.vmdl_c',assets/(bird+'.glb'),common+['--gltf_export_materials','--gltf_textures_adapt','--gltf_export_extras','--gltf_animation_list',clips])
 fur=texture('materials/models/chicken/chick_yellow_fur_color_psd_e1db1d33.vtex',source)
 shutil.copy2(fur,root/'tools/fur-source.png');run([sys.executable,'tools/embed_textures.py'])
 print('2/5 Exporting and checking the shared animation library…',flush=True)
 target=root/'tools/all-animations/export.glb'
 env=os.environ.copy();env['CS2_PET_CLIPLIST']=str(root/'tools/all-animation-clips.txt')
 export('models/chicken/chick.vmdl_c',target,common,env)
 data=target.read_bytes();length=struct.unpack_from('<I',data,12)[0];doc=json.loads(data[20:20+length]);available={a['name']for a in doc.get('animations',[])}
 catalog=json.loads((root/'Sources/animations.json').read_text());missing=[e['name']for e in catalog if e['name']not in available]
 if missing:raise RuntimeError(f'{len(missing)} clips were not exported. Build VRF 20.1 with tools/vrf-all-clips.patch; see docs/ASSET_PREPARATION.md.')
 run([sys.executable,'tools/pack-all-animations.py'])
 print('3/5 Recovering original AO, roughness and cloth channels…',flush=True)
 materials=json.loads((root/'tools/render-materials/material-metadata.json').read_text());normal=root/'tools/render-materials';raw=normal/'raw'
 needed=set();raw_needed=set()
 for material in materials.values():
  params=material['TextureParams'];needed.update(params[k]for k in ['g_tNormal','g_tAmbientOcclusion'])
  raw_needed.add(params['g_tNormal'])
  if 'g_tAnisoGloss'in params:raw_needed.add(params['g_tAnisoGloss'])
  if material.get('IntParams',{}).get('F_CLOTH_SHADING')==1:needed.add(params['g_tMetalness'])
 for resource in sorted(needed):texture(resource,normal)
 for resource in sorted(raw_needed):texture(resource,raw,True)
 run([sys.executable,'tools/pack-material-maps.py'])
 print('4/5 Preparing twelve quiet game sounds…',flush=True)
 sounds=assets/'Sounds';sounds.mkdir(exist_ok=True)
 for prefix in ['chicken_chick','chicken_idle_hen']:
  for number in range(1,7):
   name=f'{prefix}_{number:02d}';resource='sounds/ambient/common/animal/'+name+'.vsnd_c'
   for stale in source.rglob(name+'.*'):
    if stale.suffix in ['.mp3','.wav']:stale.unlink()
   run(cli+['-i',pak,'-f',resource,'-o',source,'-d'])
   audio=next((p for p in source.rglob(name+'.*')if p.suffix in ['.mp3','.wav']),None)
   if audio is None:raise RuntimeError('Sound export missing: '+resource)
   run(['ffmpeg','-loglevel','error','-y','-i',audio,'-ac','1','-ar','22050',sounds/(name+'.wav')])
 print('5/5 Checking the local resource set…',flush=True)
 run(['node','tools/check-assets.mjs'])
 print('Local assets are ready. Run npm test and ./build.sh. Do not publish the generated game files.',flush=True)
except (RuntimeError,OSError)as error:
 print(str(error),file=sys.stderr);sys.exit(1)
