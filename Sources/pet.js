import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import {closeLoop,locomotionSpeed,calmIdle} from './motion.js';
import {prepareBirdMaterials,setBirdMaterialMode,disposeBirdMaterials} from './render-materials.js';
import {PetRenderer} from './pet-renderer.js';
import {StudioLighting} from './studio-lighting.js';
import {FootPlant} from './foot-plant.js';
import {SoleSampler} from './sole-sampler.js';
import {PetActivities} from './activities.js';
import {GroundSampler} from './ground-sampler.js';
import animationCatalog from './animations.json';

const report = (type, value) => window.webkit?.messageHandlers.pet.postMessage({type, value});
window.addEventListener('error', e => report('error', e.message));
window.addEventListener('unhandledrejection', e => report('error', String(e.reason)));
const scene = new THREE.Scene();
const renderer = new THREE.WebGLRenderer({alpha:true, antialias:true, powerPreference:'low-power'});
renderer.debug.onShaderError=(context,program,vertex,fragment)=>report('shader_error',{vertex:context.getShaderInfoLog(vertex),fragment:context.getShaderInfoLog(fragment)});
// Use physical display pixels; PetRenderer adds spatial samples and MSAA.
renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));
renderer.setSize(innerWidth, innerHeight);
const gl=renderer.getContext();
renderer.setClearColor(0, 0);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
document.body.append(renderer.domElement);
window.addEventListener('resize',()=>{renderer.setSize(innerWidth,innerHeight);syncGait();});
const camera = new THREE.OrthographicCamera(-1.35,1.35,1.35,-1.35,0.01,100);
camera.position.set(0,1.05,5);
camera.lookAt(0,0.95,0);
const lighting=new StudioLighting(renderer,scene);
const petRenderer=new PetRenderer(renderer);
report('renderer',{antialias:gl.getContextAttributes().antialias,samples:petRenderer.sample.samples,pixelRatio:renderer.getPixelRatio(),hdr:petRenderer.hdr,coverageAttachments:petRenderer.sample.textures.length,spatialSamples:4});
const pivot = new THREE.Group(); scene.add(pivot);
let model, mixer, actions={}, current, facing=1, moving=false, gaitMoving=false, paused=false, loaded=false;
let last=performance.now(), lastFrame=0, generation=0, naturalSpeed=0, travelSpeed=32;
let petBone,petStarted=-Infinity,appliedNod=0;
let beakBone,chirpStarted=-Infinity,appliedChirp=0,activities;
let fades=[],forcePose=false;
let cameraHalf=1.35,baseCameraHalf=1.35,targetCameraHalf=1.35,clipFraming={};
const modelHome=new THREE.Vector3();let clipOffsets={},rootReference,previousTravel=null;
const rootPaths=new Map(),travelDelta=new THREE.Vector3(),travelPoint=new THREE.Vector3(),travelOrigin=new THREE.Vector3();
function setCameraHalf(half){camera.left=-half;camera.right=half;camera.top=half;camera.bottom=-half;camera.updateProjectionMatrix();}
const footPlant=new FootPlant();let soles,plantState;
let groundSampler,lastFloorOffset=-Infinity;
let captureFrame=0,captureLimit=0,lastCapture=-Infinity,captureStationary=false;
window.petCapture=(count,stationary=false)=>{captureFrame=0;captureLimit=count;lastCapture=-Infinity;captureStationary=stationary;};
const nodAxis=new THREE.Vector3(0,0,1),nodQuaternion=new THREE.Quaternion();
const loader = new GLTFLoader();
const decode=base64=>Uint8Array.from(atob(base64),c=>c.charCodeAt(0)).buffer;
let previewing=false,actionRequest=0;
const libraries=new Map(),libraryWaiters=new Map(),installedLibraries=new Set(),clipSpeeds=new Map();
function requestLibrary(key) {
  if(libraries.has(key))return Promise.resolve(libraries.get(key));
  if(!libraryWaiters.has(key)) {
    let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});
    libraryWaiters.set(key,{promise,resolve,reject});report('library',key);
  }
  return libraryWaiters.get(key).promise;
}
window.loadActions=(base64,key='behaviors')=>{
  const parsing=loader.parseAsync(decode(base64),'').then(g=>{
    libraries.set(key,g.animations);libraryWaiters.get(key)?.resolve(g.animations);libraryWaiters.delete(key);
    return g.animations;
  }).catch(error=>{window.petLibraryFailed(key);report('error',String(error));});
  if(!libraryWaiters.has(key))libraryWaiters.set(key,{promise:parsing,resolve:()=>{},reject:()=>{}});
};
window.petLibraryFailed=key=>{libraryWaiters.get(key)?.reject(new Error('Failed to load '+key));libraryWaiters.delete(key);};
function installClips(clips) {
  for(const originalClip of clips) {
    if(actions[originalClip.name])continue;
    let clip=originalClip.clone();
    clipSpeeds.set(clip.name,locomotionSpeed(clip));
    clip.tracks=clip.tracks.filter(t=>t.name!=='root_motion.position');
    const rootTrack=clip.tracks.find(t=>t.name==='root.position');
    if(rootTrack&&rootReference&&clip.name.includes('/world/')) {
      const extent=axis=>{const v=Array.from(rootTrack.values).filter((_,i)=>i%3===axis);return Math.max(...v)-Math.min(...v);};
      if(Math.max(extent(0),extent(1))>0.25) {
        // A few older clips keep travel in the root bone instead of root_motion.
        // Send that travel to the desktop window; retain the original vertical jump.
        rootPaths.set(clip.name,rootTrack.clone().createInterpolant());
        for(let i=0;i<rootTrack.values.length;i+=3){rootTrack.values[i]=rootReference[0];rootTrack.values[i+1]=rootReference[1];}
      }
    }
    if(/chick_(walk|run|runflap|walk_swim|run_swim|idle0[123]|squat_loop0[1234]|sleep_loop01)$/.test(clip.name))clip=closeLoop(clip);
    // Snapshot resources contain a single static pose at time zero.
    clip.duration=Math.max(clip.duration,0.001);
    actions[clip.name]=mixer.clipAction(clip);
  }
}
function makeActivities() {
  return new PetActivities({names:Object.keys(actions),catalog:animationCatalog,play,
    onBusy:state=>report('activity',state),onIdle:routine,
    onMotion:active=>{footPlant.reset();report('action_motion',active);},
    onSound:()=>{chirpStarted=performance.now();report('sound','chirp');},
  });
}
function play(name, once=false) {
  if (!actions[name]) return false;
  const next=actions[name];
  if (current===next && !once) return true;
  const offset=clipOffsets[name]??new THREE.Vector3();
  const previousOffset=clipOffsets[current?.getClip().name]??new THREE.Vector3();
  if(offset.distanceToSquared(previousOffset)>0.0001) {
    // Poses authored on a player's shoulder use a different scene origin.
    // Blending those origins sends the bird out of its desktop frame.
    mixer.stopAllAction();current=null;fades=[];
  }
  next.reset().setEffectiveWeight(1).setLoop(once?THREE.LoopOnce:THREE.LoopRepeat,once?1:Infinity);
  next.clampWhenFinished=once; next.enabled=true; next.play();
  fades=fades.filter(f=>f.action!==next);
  if(current && current!==next){current.crossFadeTo(next,0.22,false);fades.push({action:current,remaining:0.24});}
  current=next;
  model.position.copy(modelHome).add(offset);forcePose=true;
  previousTravel=null;
  report('action_motion',!!activities?.locomotion||rootPaths.has(name));
  targetCameraHalf=clipFraming[name]??baseCameraHalf;
  return true;
}
function find(pattern) { return Object.keys(actions).find(n => pattern.test(n)); }
function routine() {
  if(activities?.busy)return;
  play(gaitMoving ? find(/chick_walk$|^walk$/i) : 'calm_idle');
}
function syncGait() {
  const walk=actions[find(/chick_walk$/)];
  if(!walk||!naturalSpeed||!model)return;
  const pixelsPerMetre=model.scale.x*innerWidth/(camera.right-camera.left)*Math.sin(1.1);
  // Preserve the original cadence. Move the desktop window at the matching speed.
  const cadence=1.1;
  travelSpeed=naturalSpeed*pixelsPerMetre*cadence;
  walk.setEffectiveTimeScale(cadence);
  report('gait',{cadence,pointsPerSecond:travelSpeed});
}
window.loadPet = async base64 => {
  const request=++generation;
  ++actionRequest;
  const [gltf,extraAnimations]=await Promise.all([loader.parseAsync(decode(base64),''),requestLibrary('behaviors')]);
  if(request!==generation)return;
  await prepareBirdMaterials(gltf.scene);
  if(request!==generation){disposeBirdMaterials(gltf.scene);return;}
  if(model){
    mixer?.stopAllAction(); mixer?.uncacheRoot(model); pivot.remove(model);
    disposeBirdMaterials(model);
  }
  model=gltf.scene;
  activities=null;fades=[];report('activity',{busy:false});
  pivot.add(model); model.updateMatrixWorld(true);
  const box=new THREE.Box3().setFromObject(model);
  const dimensions=box.getSize(new THREE.Vector3());
  const s=1.8/Math.max(dimensions.x,dimensions.y,dimensions.z); model.scale.multiplyScalar(s);
  model.position.set(-(box.max.x+box.min.x)*s/2,-box.min.y*s,-(box.max.z+box.min.z)*s/2);
  modelHome.copy(model.position);clipOffsets={};rootPaths.clear();
  rootReference=gltf.animations.find(c=>/\/world\/chick_walk$/.test(c.name))?.tracks.find(t=>t.name==='root.position')?.values.slice(0,3);
  petBone=model.getObjectByName('head');appliedNod=0;petStarted=-Infinity;
  beakBone=model.getObjectByName('beak');appliedChirp=0;chirpStarted=-Infinity;
  soles=new SoleSampler(model);footPlant.reset();
  groundSampler=new GroundSampler(model);lastFloorOffset=-Infinity;
  mixer=new THREE.AnimationMixer(model); actions={};current=null;installedLibraries.clear();clipSpeeds.clear();
  naturalSpeed=locomotionSpeed(gltf.animations.find(c=>/chick_walk$/.test(c.name)));
  installClips([...gltf.animations,...extraAnimations]);installedLibraries.add('behaviors');
  for(const [key,clips] of libraries){installClips(clips);installedLibraries.add(key);}
  // A quiet breathing pose is the default. The game's full idle/react clips
  // include crouching and startled movements, which are too strong for a click.
  const idle=gltf.animations.find(c=>/chick_idle01$/.test(c.name));
  actions.calm_idle=mixer.clipAction(calmIdle(idle));
  activities=makeActivities();
  mixer.addEventListener('finished',event=>{
    if(event.action!==current)return;
    if(activities.busy)activities.finished(event.action.getClip().name);else routine();
  });
  routine(); loaded=true;
  window.petQA(true);
  mixer.update(0);pivot.updateMatrixWorld(true);groundSampler.setStanding(soles.sample(p=>p.x));
  syncGait();
  report('loaded',{animations:Object.keys(actions),meshes:gltf.scene.children.length});
};
window.petState=(walk,direction,freeze)=>{
  moving=walk;facing=direction;paused=freeze;
};
window.petReact=kind=>{
  if(kind==='pet'){
    if(activities?.busy){activities.wake();return;}
    petStarted=performance.now();report('interaction',{kind,animation:'gentle_head_nod'});return;
  }
  window.petDo(kind==='feed'?'peck':'trick');
};
window.petDo=async(kind,automatic=false)=>{
  const request=++actionRequest;
  if(kind==='wake'){if(!activities?.wake())report('activity',{busy:false});return;}
  const entry=animationCatalog.find(e=>'clip:'+e.name===kind);
  if(entry&&!installedLibraries.has(entry.library)) {
    try {
      const clips=await requestLibrary(entry.library);
      if(request!==actionRequest)return;
      activities?.finish();installClips(clips);installedLibraries.add(entry.library);
      activities=makeActivities();window.petQA(true,clips.map(c=>c.name));
      if(request!==actionRequest)return;
    } catch(error){report('activity',{busy:false,error:String(error)});return;}
  }
  gaitMoving=false;footPlant.reset();
  if(!activities?.start(kind,{automatic}))report('activity',{busy:false,error:'Unavailable action '+kind});
};
window.petAnimation=name=>play(name,true);
window.petFurEnabled=value=>{model?.traverse(n=>{if(n.isMesh&&n.material?.name==='chick_yellow_fur')n.visible=value;});};
window.petDebug=()=>({loaded,animations:Object.keys(actions),current:current?.getClip().name,position:model?.position.toArray(),rotation:pivot.rotation.y});
let qualityPreview,qualityIndex=0;
const qualityProfiles=['before','after'];
function setRenderQuality(profile) {
  lighting.apply(profile,renderer);
  petRenderer.enabled=profile!=='before';setBirdMaterialMode(model,petRenderer.enabled);
}
function qualityFrame(label) {
  model.updateWorldMatrix(true,true);petRenderer.render(scene,camera);
  requestAnimationFrame(()=>report('quality_frame',label));
}
window.petQualityComparison=()=>{
  previewing=true;gaitMoving=false;footPlant.reset();mixer.stopAllAction();current=null;
  actions.calm_idle.reset().setEffectiveWeight(1).play();mixer.setTime(0);
  pivot.rotation.y=1.1;cameraHalf=baseCameraHalf;setCameraHalf(cameraHalf);
  qualityIndex=0;qualityPreview=qualityProfiles[qualityIndex];setRenderQuality(qualityPreview);qualityFrame(qualityPreview);
};
window.petNextQuality=()=>{
  if(++qualityIndex<qualityProfiles.length){qualityPreview=qualityProfiles[qualityIndex];setRenderQuality(qualityPreview);qualityFrame(qualityPreview);return;}
  qualityPreview=null;setRenderQuality('after');mixer.stopAllAction();current=null;routine();previewing=false;report('quality_done',true);
};
window.petPreviewActions=async({audit=false}={})=>{
  previewing=true;
  for(const key of ['poses','showcase','held']){installClips(await requestLibrary(key));installedLibraries.add(key);}
  activities=makeActivities();window.petQA(true);
  const names=animationCatalog.map(e=>e.name);
  const fractions=audit?Array.from({length:10},(_,i)=>i/10):[0.25,0.65];
  for(const name of names)for(const fraction of fractions) {
    mixer.stopAllAction();current=null;
    const action=actions[name];action.reset().setEffectiveWeight(1).play();
    model.position.copy(modelHome).add(clipOffsets[name]??new THREE.Vector3());
    mixer.setTime(action.getClip().duration*fraction);pivot.rotation.y=1.1;setCameraHalf(clipFraming[name]??baseCameraHalf);
    pivot.updateMatrixWorld(true);petRenderer.render(scene,camera);
    const category=name.includes('/viewmodel/')?'held':name.split('/')[3];
    report('preview',{audit,label:category+'_'+name.split('/').pop()+'_'+Math.round(fraction*100),clip:name,fraction,duration:action.getClip().duration,png:renderer.domElement.toDataURL('image/png')});
    await new Promise(requestAnimationFrame);
  }
  mixer.stopAllAction();current=null;gaitMoving=false;footPlant.reset();cameraHalf=baseCameraHalf;setCameraHalf(cameraHalf);routine();previewing=false;
  window.petQA(false);
  report('preview_done',true);
};
window.petQA=(fit=false,names=null)=>{
  const failures=[];let samples=0,maxExtent=0;
  if(fit)setCameraHalf(1.35);
  camera.updateMatrixWorld(true);
  const extents={};
  for(const [name,action] of Object.entries(actions)) {
    if(names&&!names.includes(name))continue;
    if(!fit)setCameraHalf(clipFraming[name]??baseCameraHalf);
    let clipExtent=0;
    mixer.stopAllAction();action.reset().play();
    model.position.copy(modelHome);
    if(fit&&!name.includes('/world/')&&name!=='calm_idle') {
      mixer.setTime(0);pivot.rotation.y=0;pivot.updateMatrixWorld(true);
      model.traverse(n=>{if(n.isSkinnedMesh)n.computeBoundingBox();});
      const box=new THREE.Box3().setFromObject(model),center=box.getCenter(new THREE.Vector3());
      clipOffsets[name]=new THREE.Vector3(-center.x,-box.min.y,-center.z);
    }
    model.position.add(clipOffsets[name]??new THREE.Vector3());
    for(let i=0;i<16;i++) {
      mixer.setTime(action.getClip().duration*i/16);model.updateMatrixWorld(true);
      model.traverse(n=>{if(n.isSkinnedMesh)n.computeBoundingBox();});
      for(const side of [-1.1,1.1]) {
        pivot.rotation.y=side;pivot.updateMatrixWorld(true);
        const box=new THREE.Box3().setFromObject(model);
        for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]) {
          const p=new THREE.Vector3(x,y,z).project(camera);
          maxExtent=Math.max(maxExtent,Math.abs(p.x),Math.abs(p.y));
          clipExtent=Math.max(clipExtent,Math.abs(p.x),Math.abs(p.y));
          if(Math.abs(p.x)>0.96||Math.abs(p.y)>0.96)failures.push({name,frame:i,x:p.x,y:p.y});
        }
        samples++;
      }
    }
    action.stop();
    extents[name]=1.35*Math.max(1,clipExtent/0.9);
  }
  if(fit){
    const ordinary=Object.entries(extents).filter(([name])=>/^(calm_idle|animation\/anims\/chicken\/world\/chick_(walk|idle0[123]|squat_(start|stand|loop0[134])|sleep_loop01))$/.test(name));
    if(ordinary.length)baseCameraHalf=Math.max(...ordinary.map(([,half])=>half));
    Object.assign(clipFraming,Object.fromEntries(Object.entries(extents).map(([name,half])=>[name,Math.max(half,baseCameraHalf)])));
  }
  cameraHalf=baseCameraHalf;targetCameraHalf=baseCameraHalf;setCameraHalf(cameraHalf);
  current=null;routine();
  if(!fit)report('qa',{samples,maxExtent,failures:failures.slice(0,12),failureCount:failures.length});
};
function frame(now) {
  requestAnimationFrame(frame);
  if(previewing)return;
  if(now-lastFrame<32)return;
  const dt=Math.min((now-last)/1000,0.07);last=now;lastFrame=now;
  // Source 2 exports forward along Z. Keep a three-quarter side view.
  const target=facing>0?1.1:-1.1;
  const delta=THREE.MathUtils.euclideanModulo(target-pivot.rotation.y+Math.PI,Math.PI*2)-Math.PI;
  pivot.rotation.y+=delta*Math.min(1,dt*9);
  const actionWalking=!!activities?.locomotion;
  const walk=loaded&&!paused&&(actionWalking||moving&&!activities?.busy)&&Math.abs(delta)<0.12;
  if(walk!==gaitMoving){gaitMoving=walk;footPlant.reset();routine();}
  if(walk)pivot.rotation.y=target;
  if(petBone&&appliedNod){petBone.quaternion.multiply(nodQuaternion.setFromAxisAngle(nodAxis,-appliedNod));appliedNod=0;}
  if(beakBone&&appliedChirp){beakBone.quaternion.multiply(nodQuaternion.setFromAxisAngle(nodAxis,-appliedChirp));appliedChirp=0;}
  const expanding=targetCameraHalf>cameraHalf+0.015;
  cameraHalf+=(targetCameraHalf-cameraHalf)*Math.min(1,dt*15);setCameraHalf(cameraHalf);
  if(!paused&&(!expanding||forcePose)){
    mixer?.update(expanding?0:dt);forcePose=false;
    if(!expanding)activities?.tick(dt);
    for(const fade of fades)fade.remaining-=dt;
    for(const fade of fades)if(fade.remaining<=0&&fade.action!==current)fade.action.stop();
    fades=fades.filter(f=>f.remaining>0);
  }
  const petTime=(now-petStarted)/700;
  if(petBone&&!paused&&petTime>=0&&petTime<1){
    appliedNod=0.12*Math.sin(Math.PI*petTime)**2;
    petBone.quaternion.multiply(nodQuaternion.setFromAxisAngle(nodAxis,appliedNod));
  }
  const chirpTime=(now-chirpStarted)/1000;
  if(beakBone&&!paused&&chirpTime>=0&&chirpTime<0.9){
    appliedChirp=0.22*Math.sin(chirpTime*14)**2*Math.sin(Math.PI*chirpTime/0.9);
    beakBone.quaternion.multiply(nodQuaternion.setFromAxisAngle(nodAxis,appliedChirp));
  }
  let step=0;
  // updateMatrixWorld also refreshes SkinnedMesh's attached bind inverse.
  // updateWorldMatrix alone leaves it stale after a clip framing offset changes.
  pivot.updateMatrixWorld(true);
  if(walk&&soles){
    const points=soles.sample(p=>(p.clone().project(camera).x+1)*innerWidth/2,p=>(p.clone().project(camera).y+1)*innerHeight/2);
    plantState=footPlant.step(points.feet,points.targets,facing,model.scale.x*0.003,points.soles);
    plantState.footY=footPlant.anchorIndices.reduce((sum,i)=>sum+points.soles[plantState.support][i].screenY,0)/footPlant.anchorIndices.length;
    step=plantState.dx;
    const running=actionWalking&&/\/world\/chick_run(flap)?$/.test(current?.getClip().name);
    plantState.grounded=Math.min(...points.soles.flat().map(p=>p.y))<=groundSampler.standingY+model.scale.x*0.004;
    if(actionWalking&&(/swim$/.test(current?.getClip().name)||running&&!plantState.grounded)) {
      step=(clipSpeeds.get(current.getClip().name)??0)*model.scale.x*innerWidth/(camera.right-camera.left)*Math.sin(1.1)*dt*facing;
    }
    plantState.dx=step;
  }else{plantState=null;}
  const path=current&&rootPaths.get(current.getClip().name);
  if(path&&!paused&&!expanding) {
    const position=Array.from(path.evaluate(current.time));
    if(previousTravel&&previousTravel.action===current&&current.time>=previousTravel.time) {
      travelDelta.set(position[0]-previousTravel.position[0],position[1]-previousTravel.position[1],0);
      const parent=model.getObjectByName('root').parent;parent.updateWorldMatrix(true,false);
      travelOrigin.set(0,0,0).applyMatrix4(parent.matrixWorld).project(camera);
      travelPoint.copy(travelDelta).applyMatrix4(parent.matrixWorld).project(camera);
      step+=(travelPoint.x-travelOrigin.x)*innerWidth/2;
    }
    previousTravel={action:current,time:current.time,position};
  }
  petRenderer.render(scene,camera);
  if(loaded&&groundSampler){
    const resting=activities?.resting;
    const running=actionWalking&&/\/world\/chick_run(flap)?$/.test(current?.getClip().name);
    const offset=walk&&plantState&&(!running||plantState.grounded)?plantState.footY:groundSampler.offset(camera,innerHeight,resting);
    if(Number.isFinite(offset)&&Math.abs(offset-lastFloorOffset)>0.2){lastFloorOffset=offset;report('floor',offset);}
  }
  if(walk||path)report('step',step);
  if((walk||captureStationary)&&captureFrame<captureLimit&&now-lastCapture>=100){
    lastCapture=now;
    report('capture',{frame:++captureFrame,png:renderer.domElement.toDataURL('image/png'),time:now,plant:plantState,activity:activities?.kind,clip:current?.getClip().name,clipTime:current?.time});
    if(captureFrame===captureLimit)report('capture_done',true);
  }
}
requestAnimationFrame(frame);
report('ready',true);
