import {Quaternion,AnimationUtils} from 'three';

export function calmIdle(source) {
  const clip=AnimationUtils.subclip(source,'calm_idle',0,6,30);
  const stretch=2.4/clip.duration;
  for(const track of clip.tracks)for(let i=0;i<track.times.length;i++)track.times[i]*=stretch;
  clip.duration=2.4;
  return closeLoop(clip);
}

// Source locomotion clips retain a small pose drift across the exported range.
// Distribute that residual through the cycle so every joint meets at the seam.
export function closeLoop(clip) {
  const result=clip.clone();
  const start=new Quaternion(),end=new Quaternion(),residual=new Quaternion(),q=new Quaternion(),correction=new Quaternion();
  for(const track of result.tracks) {
    if(track.times.length<2)continue;
    const firstTime=track.times[0],duration=track.times[track.times.length-1]-firstTime;
    if(duration<=0)continue;
    const count=track.getValueSize(),values=track.values,last=values.length-count;
    if(track.name.endsWith('.quaternion')) {
      start.fromArray(values,0);end.fromArray(values,last);
      residual.copy(end).invert().multiply(start).normalize();
      for(let i=0;i<track.times.length;i++) {
        const t=(track.times[i]-firstTime)/duration;
        correction.identity().slerp(residual,t);
        q.fromArray(values,i*4).multiply(correction).normalize().toArray(values,i*4);
      }
    } else if(track.name.endsWith('.position')||track.name.endsWith('.scale')) {
      const drift=Array.from({length:count},(_,k)=>values[last+k]-values[k]);
      for(let i=0;i<track.times.length;i++)for(let k=0;k<count;k++)values[i*count+k]-=drift[k]*(track.times[i]-firstTime)/duration;
    }
  }
  return result;
}

export function locomotionSpeed(clip) {
  if(!clip)return 0;
  const track=clip.tracks.find(t=>t.name==='root_motion.position');
  if(!track)return 0;
  const v=track.values,n=v.length;
  return Math.hypot(v[n-3]-v[0],v[n-1]-v[2])/clip.duration;
}
