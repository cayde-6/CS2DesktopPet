// Legacy 1.2.2 material, retained for real-frame comparison only.
// Production materials are prepared in render-materials.js.
import {ShaderChunk} from 'three';

// Keep Valve's feather vertices, skinning and normals intact. They are cutout
// feathers, not a shortened translucent shell around the opaque body.
export function configureFeathers(scene) {
  scene.traverse(mesh=>{
    if(!mesh.isMesh)return;
    const materials=Array.isArray(mesh.material)?mesh.material:[mesh.material];
    for(const material of materials) {
      if(material.name!=='chick_yellow_fur')continue;
      const source=material.userData?.vmat;
      material.opacity=1;
      material.transparent=false;
      material.alphaTest=source?.FloatParams?.g_flAlphaTestReference ?? 0.2;
      material.alphaToCoverage=true;
      material.premultipliedAlpha=true;
      material.depthWrite=true;
      material.depthTest=true;
      material.metalness=0;
      material.metalnessMap=null;
      material.roughness=0.85;
      material.roughnessMap=null;
      // A broad diffuse response represents light scattering through down.
      // It lowers the tiny dark/light contrasts between adjacent feather cards.
      material.userData.featherWrap={value:0.6};
      material.userData.featherSoftness={value:0.55};
      material.onBeforeCompile=shader=>{
        shader.uniforms.featherWrap=material.userData.featherWrap;
        shader.uniforms.featherSoftness=material.userData.featherSoftness;
        // The original material specifies F_DONT_FLIP_BACKFACE_NORMALS.
        shader.fragmentShader='uniform float featherWrap;\nuniform float featherSoftness;\n'+shader.fragmentShader.replace(
          '#include <normal_fragment_begin>',
          ShaderChunk.normal_fragment_begin.replace('normal *= faceDirection;','')
        ).replace('#include <lights_physical_pars_fragment>',
          ShaderChunk.lights_physical_pars_fragment.replace(
            'reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );',
            'reflectedLight.directDiffuse += mix( saturate( (dot( geometryNormal, directLight.direction ) + featherWrap) / (1.0 + featherWrap) ), 0.65, featherSoftness ) * directLight.color * BRDF_Lambert( material.diffuseColor );'
          )
        );
      };
      material.customProgramCacheKey=()=> 'source2-soft-down-original-detail-v3';
      material.needsUpdate=true;
    }
  });
}
