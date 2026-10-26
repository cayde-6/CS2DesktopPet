import assert from 'node:assert/strict';
import {PetActivities} from '../Sources/activities.js';
import {loadForAnalysis} from './model-for-analysis.mjs';
import fs from 'node:fs';
import {AnimationMixer,Vector3} from 'three';
const catalog=JSON.parse(fs.readFileSync('Sources/animations.json'));

const model=await loadForAnalysis('chick'),extra=await loadForAnalysis('behaviors');
const libraries=[extra,...await Promise.all(['poses','showcase','held'].map(loadForAnalysis))];
const clips=[...model.animations,...libraries.flatMap(g=>g.animations)];
const metadata=JSON.parse(fs.readFileSync('tools/all-animation-metadata.json'));
const resources=fs.readFileSync('tools/all-animation-clips.txt','utf8').trim().split('\n');
assert(resources.every(n=>metadata[n]),'every resource must have its source skeleton audited');
const expected=resources.filter(n=>metadata[n].skeleton==='animation/skeletons/characters/chicken/chicken.vnmskel').map(n=>n.replace(/\.vnmclip$/,''));
assert.equal(catalog.length,104);assert.deepEqual(catalog.map(e=>e.name).sort(),expected.sort());
assert.deepEqual(libraries.flatMap(g=>g.animations.map(c=>c.name)).sort(),expected.sort());
const allModels=[model,...await Promise.all(['chicken','chicken_silkie','chicken_polish'].map(loadForAnalysis))];
for(const clip of libraries.flatMap(g=>g.animations)) {
  assert(clip.duration>=0&&Number.isFinite(clip.duration));
  assert(clip.duration>0||catalog.find(e=>e.name===clip.name)?.pose||clip.name.endsWith('chick_0lr'));
  for(const track of clip.tracks) {
    const node=track.name.slice(0,track.name.lastIndexOf('.'));
    for(const target of allModels)assert(target.scene.getObjectByName(node),`unbound joint ${node} in ${clip.name}`);
    assert(track.values.every(Number.isFinite),`invalid pose in ${clip.name}`);
  }
}
function harness() {
  const played=[],busy=[],sounds=[];
  const activities=new PetActivities({names:[...clips.map(c=>c.name),'calm_idle'],catalog,play:(name,once)=>played.push({name,once}),onBusy:s=>busy.push(s),onIdle:()=>played.push({name:'idle'}),onSound:()=>sounds.push('chirp'),random:()=>0});
  return {activities,played,busy,sounds};
}
{
  const {activities:a,played,busy}=harness();
  assert(a.start('sleep',{automatic:true}));
  assert(played.at(-1).name.endsWith('squat_start'));
  a.tick(60);assert(a.busy,'must wait for the sitting transition to finish');
  a.finished(played.at(-1).name);assert(played.at(-1).name.endsWith('sleep_loop01'));
  a.tick(17.9);assert(a.busy);a.tick(0.2);
  assert(played.at(-1).name.endsWith('squat_stand'));
  assert(a.busy,'must finish standing before allowing walking');
  a.finished(played.at(-1).name);assert(!a.busy);assert.equal(busy.at(-1).busy,false);
}
{
  const {activities:a,played}=harness();a.start('sit');a.finished(played.at(-1).name);a.tick(3600);
  assert(a.busy,'manual rest must remain until the user wakes it');
  a.wake();assert(played.at(-1).name.endsWith('squat_stand'));a.finished(played.at(-1).name);assert(!a.busy);
}
{
  const {activities:a,sounds}=harness();a.start('chirp');assert.equal(sounds.length,1);a.tick(1.3);assert(!a.busy);
  assert.equal(a.start('missing-action'),false);assert(!a.busy,'invalid actions cannot block the pet');
}
for(const kind of ['sit','lie','sleep','groom','preen','peck','chirp','trick','run','runflap','hop','look',...Array.from({length:13},(_,i)=>'trick:'+(i+1)),...catalog.map(e=>'clip:'+e.name)]) {
  const {activities:a}=harness();assert(a.start(kind),`missing animation required by ${kind}`);
}
// Regression for the visually audited Preen command: the beak approaches a wing
// above the ground. Ground scratching/pecking (the previous binding) fails this.
{
  const {activities:a,played}=harness();a.start('preen');
  const selected=clips.find(c=>c.name===played.at(-1).name);
  for(const bird of allModels) {
    const mixer=new AnimationMixer(bird.scene);
    const point=name=>bird.scene.getObjectByName(name).getWorldPosition(new Vector3());
    const baseline=clips.find(c=>c.name.endsWith('/world/chick_idle01'));
    mixer.clipAction(baseline).reset().play();mixer.setTime(0);bird.scene.updateMatrixWorld(true);
    const floor=point('foot_L').y,standing=point('beak');
    const wingDistance=()=>Math.min(...['wing_1_L','wing_1_R'].map(name=>point('beak').distanceTo(point(name))));
    const baselineWing=wingDistance();
    mixer.stopAllAction();mixer.clipAction(selected).reset().play();
    let minimumHeight=Infinity,minimumWing=Infinity;
    for(let i=0;i<120;i++) {
      mixer.setTime(selected.duration*i/120);bird.scene.updateMatrixWorld(true);
      minimumHeight=Math.min(minimumHeight,point('beak').y-floor);
      minimumWing=Math.min(minimumWing,wingDistance());
    }
    // Allow the finishing wing shake to dip the head, while excluding ground pecks.
    assert(minimumHeight>(standing.y-floor)*0.3,'Preen must not lower the beak to peck the ground');
    assert(minimumWing<baselineWing*0.65,'Preen must bring the beak towards the wing');
    mixer.stopAllAction();mixer.uncacheRoot(bird.scene);
  }
}
{
  const {activities:a,played}=harness();a.start('peck');
  assert(played.at(-1).name.includes('/world/'),'a viewmodel idle must not replace world pecking');
  a.start('run');assert(a.locomotion);a.tick(5);assert(!a.busy&&!a.locomotion);
  const pose=catalog.find(e=>e.pose);a.start('clip:'+pose.name);a.tick(10000);assert(a.busy);a.wake();assert(!a.busy);
  a.start('hop');a.finished(played.at(-1).name);assert(played.at(-1).name.endsWith('chick_land'));
  a.finished(played.at(-1).name);assert(!a.busy);
}
console.log(`Verified all 104 chicken-skeleton clips; 20 human clips excluded. Bindings on four birds, complete menu coverage, world/UI name collisions, run/hop completion, rest/wake and static poses.`);
