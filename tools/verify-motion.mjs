import assert from 'node:assert/strict';
import * as THREE from 'three';
import {closeLoop,locomotionSpeed,calmIdle} from '../Sources/motion.js';
import {loadForAnalysis} from './model-for-analysis.mjs';

for(const name of ['chick','chicken','chicken_silkie','chicken_polish']) {
  const gltf=await loadForAnalysis(name),scene=gltf.scene;
  const source=gltf.animations.find(c=>/chick_walk$/.test(c.name));
  const speed=locomotionSpeed(source);
  assert(speed>0.1&&speed<0.5,'walking velocity must come from the actual asset');
  const loop=source.clone();loop.tracks=loop.tracks.filter(t=>t.name!=='root_motion.position');
  const closed=closeLoop(loop);
  for(const t of closed.tracks) {
    const size=t.getValueSize(),a=t.values.slice(0,size),b=t.values.slice(-size);
    if(t.name.endsWith('.quaternion')) {
      assert(new THREE.Quaternion().fromArray(a).angleTo(new THREE.Quaternion().fromArray(b))<0.001,`${name}: quaternion seam ${t.name}`);
    } else for(let k=0;k<size;k++)assert(Math.abs(a[k]-b[k])<1e-6,`${name}: value seam ${t.name}`);
  }
  function seam(clip) {
    const mixer=new THREE.AnimationMixer(scene);mixer.clipAction(clip).play();
    const pick=()=>['root','head','foot_L','foot_R'].map(n=>scene.getObjectByName(n).getWorldPosition(new THREE.Vector3()));
    mixer.setTime(clip.duration-0.0001);scene.updateMatrixWorld(true);const before=pick();
    mixer.setTime(clip.duration+0.0001);scene.updateMatrixWorld(true);const after=pick();
    mixer.stopAllAction();mixer.uncacheRoot(scene);
    return Math.max(...before.map((p,i)=>p.distanceTo(after[i])));
  }
  const before=seam(loop),after=seam(closed);
  assert(after<0.0005,`${name}: visible skeletal discontinuity at loop ${after}`);
  assert(after<before/10,`${name}: seam improvement must be substantial`);
  const idle=calmIdle(gltf.animations.find(c=>/chick_idle01$/.test(c.name)));
  assert(seam(idle)<0.0005,`${name}: calm idle must also be continuous`);
  console.log(`${name}: seam ${(before*1000).toFixed(2)} → ${(after*1000).toFixed(3)} mm; native gait ${speed.toFixed(3)} m/s; ${closed.tracks.length} joint tracks continuous`);
}
