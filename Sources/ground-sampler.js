import {Vector3} from 'three';

// The standing sole fixes the normal floor. Resting poses can tuck the legs
// beneath the body, so use a sparse sample of the visible coat for those poses.
export class GroundSampler {
  constructor(scene) {
    this.scene=scene;this.point=new Vector3();this.projected=new Vector3();this.standingY=0;this.meshes=[];
    scene.traverse(mesh=>{
      if(!mesh.isSkinnedMesh)return;
      const ids=Array.from(new Set(mesh.geometry.index.array));
      const stride=Math.max(1,Math.ceil(ids.length/600));
      this.meshes.push({mesh,ids:ids.filter((_,i)=>i%stride===0)});
    });
  }
  setStanding(soleSample) {
    this.standingY=Math.min(...soleSample.soles.flat().map(p=>p.y));
  }
  offset(camera,height,resting) {
    let groundY=this.standingY;
    if(resting) {
      this.scene.updateWorldMatrix(true,true);groundY=Infinity;
      for(const {mesh,ids} of this.meshes) {
        mesh.skeleton.update();
        for(const id of ids){mesh.getVertexPosition(id,this.point).applyMatrix4(mesh.matrixWorld);groundY=Math.min(groundY,this.point.y);}
      }
    }
    this.projected.set(0,groundY,0).project(camera);
    return (this.projected.y+1)*height/2;
  }
}
