export class PetActivities {
  constructor({names,play,onBusy,onIdle,onSound,onMotion=()=>{},catalog=[],random=Math.random}) {
    // UI/viewmodel clips reuse world idle names. Shorthands always mean world.
    this.names=new Map(names.map(n=>[n.split('/').pop(),n]));
    for(const n of names.filter(n=>n.includes('/world/')))this.names.set(n.split('/').pop(),n);
    for(const n of names)this.names.set(n,n);
    this.catalog=new Map(catalog.map(e=>[e.name,e]));this.onMotion=onMotion;
    this.play=play;this.onBusy=onBusy;this.onIdle=onIdle;this.onSound=onSound;this.random=random;this.sequence=null;
  }
  get busy(){return this.sequence!==null;}
  get kind(){return this.sequence?.kind??null;}
  get stage(){return this.sequence?.stages[this.sequence.index];}
  get locomotion(){return this.stage?.locomotion??false;}
  get resting(){return ['sit','lie','sleep','groom'].includes(this.kind)||this.stage?.rest;}
  start(kind,{automatic=false}={}) {
    const once=clip=>({clip,once:true}),loop=(clip,seconds)=>({clip,seconds,once:false});
    const rest=(clip,seconds)=>[once('chick_squat_start'),loop(clip,automatic?seconds:Infinity),once('chick_squat_stand')];
    let stages;
    switch(kind) {
      case 'sit':stages=rest('chick_squat_loop01',8+this.random()*6);break;
      case 'lie':stages=rest('chick_squat_loop02',10+this.random()*6);break;
      case 'sleep':stages=rest('chick_sleep_loop01',18+this.random()*12);break;
      // Visually audited: idle02 scratches/pecks the ground; trick10 cleans a wing.
      case 'preen':stages=[once('chick_trick10')];break;
      case 'peck':stages=[once('chick_idle01')];break;
      case 'chirp':stages=[{...loop('calm_idle',1.2),sound:true}];break;
      case 'groom':stages=rest('chick_squat_loop03',8.7);break;
      case 'run':stages=[{...loop('chick_run',4),locomotion:true}];break;
      case 'runflap':stages=[{...loop('chick_runflap',4),locomotion:true}];break;
      case 'hop':stages=[once('chick_hop'),once('chick_land')];break;
      case 'look':stages=[once('chick_idle03alt')];break;
      case 'trick': {
        const calm=automatic ? [1,3,8,9,10,13] : Array.from({length:13},(_,i)=>i+1);
        const number=calm[Math.floor(this.random()*calm.length)];
        stages=[once('chick_trick'+String(number).padStart(2,'0'))];break;
      }
      default:
        if(/^trick:(?:[1-9]|1[0-3])$/.test(kind))stages=[once('chick_trick'+String(Number(kind.split(':')[1])).padStart(2,'0'))];
        if(kind.startsWith('clip:')) {
          const entry=this.catalog.get(kind.slice(5));
          if(entry) {
            const staticPose=entry.pose||entry.name.endsWith('chick_0lr');
            const locomotion=/\/world\/chick_(walk|run|runflap|walk_swim|run_swim)$/.test(entry.name);
            const stage={clip:entry.name,once:!entry.loop&&!staticPose,seconds:staticPose||entry.rest&&!automatic?Infinity:8,rest:entry.rest||entry.pose,locomotion};
            stages=[stage];
            if(entry.rest&&!entry.name.endsWith('chick_squat_stand'))stages=[once('chick_squat_start'),stage,once('chick_squat_stand')];
          }
        }
    }
    if(!stages||stages.some(s=>!this.names.has(s.clip)))return false;
    this.sequence={kind,automatic,stages:stages.map(s=>({...s,clip:this.names.get(s.clip)})),index:0};
    this.onBusy({kind,busy:true,automatic});this.beginStage();return true;
  }
  beginStage() {
    const sequence=this.sequence;if(!sequence)return;
    const stage=sequence.stages[sequence.index];
    if(!stage){this.finish();return;}
    sequence.remaining=stage.seconds??Infinity;
    this.onMotion(!!stage.locomotion);
    this.play(stage.clip,stage.once);
    if(stage.sound)this.onSound();
  }
  finished(name) {
    if(!this.sequence)return;
    const stage=this.sequence.stages[this.sequence.index];
    if(stage.once&&stage.clip===name){this.sequence.index++;this.beginStage();}
  }
  tick(dt) {
    if(!this.sequence)return;
    const stage=this.sequence.stages[this.sequence.index];
    if(stage.once)return;
    this.sequence.remaining-=dt;
    if(this.sequence.remaining<=0){this.sequence.index++;this.beginStage();}
  }
  wake() {
    if(!this.sequence)return false;
    if(this.resting&&!this.catalog.get(this.kind?.slice(5))?.pose) {
      const stand=this.names.get('chick_squat_stand');
      if(this.sequence.stages[this.sequence.index].clip===stand)return true;
      this.sequence.stages=[{clip:stand,once:true}];this.sequence.index=0;this.beginStage();
    }else this.finish();
    return true;
  }
  finish() {
    const previous=this.sequence;this.sequence=null;
    this.onMotion(false);
    if(previous)this.onBusy({kind:previous.kind,busy:false,automatic:previous.automatic});
    this.onIdle();
  }
}
