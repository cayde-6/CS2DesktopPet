import {Vector3} from 'three';

// Sample the actual skinned toe/sole vertices, including foot roll. Anchoring
// only the ankle bone would still let the visible toes slide during a step.
export class SoleSampler {
  constructor(scene) {
    this.scene=scene;this.point=new Vector3();
    scene.traverse(n=>{if(!this.mesh&&n.isSkinnedMesh)this.mesh=n;});
    this.feet=['foot_L','foot_R'].map(n=>scene.getObjectByName(n));
    this.targets=['ankle_L_IKTARGET','ankle_R_IKTARGET'].map(n=>scene.getObjectByName(n));
    const mesh=this.mesh,joints=mesh.geometry.attributes.skinIndex,weights=mesh.geometry.attributes.skinWeight;
    this.indices=['L','R'].map(side=>{
      const ids=[];
      for(const i of new Set(mesh.geometry.index.array)) {
        let weight=0;
        for(const getter of ['getX','getY','getZ','getW']) {
          const bone=mesh.skeleton.bones[joints[getter](i)]?.name;
          if(bone?.startsWith('foot_'+side))weight+=weights[getter](i);
        }
        if(weight>0.5)ids.push(i);
      }
      return ids;
    });
  }
  sample(projectX,projectY=null) {
    this.scene.updateWorldMatrix(true,true);this.mesh.skeleton.update();
    const point=this.point;
    const pick=bone=>{bone.getWorldPosition(point);return {x:projectX(point),y:point.y};};
    const feet=this.feet.map(pick),targets=this.targets.map(pick);
    const soles=this.indices.map(ids=>ids.map(index=>{
      this.mesh.getVertexPosition(index,point).applyMatrix4(this.mesh.matrixWorld);
      return {x:projectX(point),y:point.y,screenY:projectY?projectY(point):null};
    }));
    return {feet,targets,soles};
  }
}
