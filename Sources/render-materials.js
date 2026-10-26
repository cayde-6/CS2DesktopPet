import * as T from 'three';
import {configureFeathers} from './feathers.js';
import recoveredMaps from '../Assets/material-maps.json';

const textures=new T.TextureLoader();
const sharedMaps=new Map();
function mapsFor(name) {
  if(!sharedMaps.has(name)) {
    const source=recoveredMaps[name];
    if(!source)return Promise.resolve(null);
    sharedMaps.set(name,Promise.all([textures.loadAsync(source.orm),source.cloth?textures.loadAsync(source.cloth):null]).then(([orm,cloth])=>{
      for(const [kind,texture] of Object.entries({orm,cloth}))if(texture){texture.colorSpace=T.NoColorSpace;texture.flipY=false;texture.name='shared-source-'+name+'-'+kind;}
      return {orm,cloth};
    }));
  }
  return sharedMaps.get(name);
}

// Preserve the imported PBR maps. Cloth is a separate non-metallic reflection
// lobe; forcing the same roughness on feathers, feet and eyes loses that detail.
export async function prepareBirdMaterials(model) {
  const originals=new Map();
  model.traverse(mesh=>{if(mesh.isMesh)for(const m of Array.isArray(mesh.material)?mesh.material:[mesh.material])if(m&&!originals.has(m))originals.set(m,m.clone());});
  model.traverse(mesh=>{
    if(mesh.isSkinnedMesh)mesh.frustumCulled=false;
    for(const m of Array.isArray(mesh.material)?mesh.material:[mesh.material])if(m){m.metalness=0;m.metalnessMap=null;m.roughness=0.85;m.roughnessMap=null;m.aoMapIntensity=0.4;m.needsUpdate=true;}
  });
  configureFeathers(model);
  const moderns=new Map();
  for(const [legacy,original] of originals) {
    const recovered=await mapsFor(original.name);
    const material=new T.MeshPhysicalMaterial();
    T.MeshStandardMaterial.prototype.copy.call(material,original);
    material.defines={STANDARD:'',PHYSICAL:''};
    material.metalness=0;material.metalnessMap=null;
    material.roughness=original.roughnessMap?1:0.82;
    material.aoMapIntensity=0.35;
    if(recovered){material.roughnessMap=recovered.orm;material.roughness=1;material.aoMap=recovered.orm;material.aoMapIntensity=0.4;}
    const chick=material.name==='chick_yellow',fur=material.name==='chick_yellow_fur';
    if(chick||fur) {
      material.sheen=1;material.sheenColor.setRGB(0.55,0.55,0.48);material.sheenRoughness=0.9;
      material.sheenColorMap=recovered?.cloth??null;
      material.specularIntensity=fur?0.25:1;
    }
    if(fur) {
      material.transparent=false;material.opacity=1;material.alphaTest=0.2;
      material.alphaToCoverage=true;material.premultipliedAlpha=false;material.depthWrite=true;
    }
    material.onBeforeCompile=shader=>{
      shader.fragmentShader='layout(location = 1) out highp vec4 surfaceCoverage;\n'+shader.fragmentShader.replace('#include <opaque_fragment>','#include <opaque_fragment>\nsurfaceCoverage=vec4(1.0);');
      if(fur)shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_begin>',T.ShaderChunk.normal_fragment_begin.replace('normal *= faceDirection;','').replace('tbn[0] *= faceDirection;','').replace('tbn[1] *= faceDirection;',''))
        .replace('#include <alphatest_fragment>',`float sourceAlpha=diffuseColor.a;
          if(sourceAlpha<=1.0/255.0)discard;
          float sourceEdge=clamp((sourceAlpha-alphaTest)/max(fwidth(sourceAlpha),0.00001)+0.5,0.0,1.0);
          diffuseColor.a=mix(sourceAlpha,sourceEdge,min(1.0,length(fwidth(vMapUv))*4.0));`);
    };
    material.customProgramCacheKey=()=> 'cs2-physical-coverage-v2-'+(fur?'down':'body');
    material.needsUpdate=true;moderns.set(legacy,material);original.dispose();
  }
  model.traverse(mesh=>{
    if(!mesh.isMesh)return;
    mesh.userData.renderMaterials={legacy:mesh.material,modern:Array.isArray(mesh.material)?mesh.material.map(m=>moderns.get(m)):moderns.get(mesh.material)};
    mesh.material=mesh.userData.renderMaterials.modern;
  });
}

export function setBirdMaterialMode(model,modern) {
  model?.traverse(mesh=>{const pair=mesh.userData.renderMaterials;if(pair)mesh.material=modern?pair.modern:pair.legacy;});
}

export function disposeBirdMaterials(model) {
  const materials=new Set(),textures=new Set();
  model.traverse(mesh=>{
    mesh.geometry?.dispose();
    const pair=mesh.userData.renderMaterials;
    for(const group of pair?[pair.modern,pair.legacy]:[mesh.material])for(const material of Array.isArray(group)?group:[group])if(material)materials.add(material);
  });
  for(const material of materials){for(const value of Object.values(material))if(value?.isTexture&&!value.name.startsWith('shared-source-'))textures.add(value);material.dispose();}
  for(const texture of textures)texture.dispose();
}
