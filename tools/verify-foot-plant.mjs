import assert from 'node:assert/strict';
import * as T from 'three';
import {loadForAnalysis} from './model-for-analysis.mjs';
import {closeLoop} from '../Sources/motion.js';
import {FootPlant} from '../Sources/foot-plant.js';
import {SoleSampler} from '../Sources/sole-sampler.js';

for(const name of ['chick','chicken','chicken_silkie','chicken_polish']) {
  for(const direction of [-1,1]) {
    const g=await loadForAnalysis(name),pivot=new T.Group();pivot.add(g.scene);pivot.rotation.y=1.1*direction;
    let clip=g.animations.find(c=>/chick_walk$/.test(c.name)).clone();
    clip.tracks=clip.tracks.filter(t=>t.name!=='root_motion.position');clip=closeLoop(clip);
    const mixer=new T.AnimationMixer(g.scene);mixer.clipAction(clip).setEffectiveTimeScale(1.1).play();
    const sampler=new SoleSampler(g.scene);
    const plant=new FootPlant();let world=0,previous=null,previousSupport=null,maxSlip=0,frames=0,clamps=0;
    const pick=n=>{const p=g.scene.getObjectByName(n).getWorldPosition(new T.Vector3());return {x:p.x*300,y:p.y};};
    for(let i=0;i<360;i++) {
      mixer.update(1/60);pivot.updateMatrixWorld(true);
      const {feet,targets,soles}=sampler.sample(p=>p.x*300);
      const {dx,support,backwards,footX}=plant.step(feet,targets,direction,0.003,soles);
      assert(dx*direction>=0,'desktop must never move backwards within a stride');
      world+=dx;
      const position=world+footX;
      if(previousSupport===support){maxSlip=Math.max(maxSlip,Math.abs(position-previous));frames++;}
      previous=position;previousSupport=support;if(backwards)clamps++;
    }
    console.log(`${name} ${direction}: stance slip ${maxSlip.toFixed(4)} px over ${frames} planted frames; ${clamps} reversed increments suppressed`);
    assert(maxSlip<0.5,`${name}: planted foot visibly slides ${maxSlip} px`);
    assert(world*direction>200,`${name}: must still make forward progress`);
  }
}
