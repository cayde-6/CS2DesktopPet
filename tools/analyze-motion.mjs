import fs from 'node:fs';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';

const data=fs.readFileSync('Assets/chick.glb');
const length=data.readUInt32LE(12),doc=JSON.parse(data.subarray(20,20+length));
for(const mesh of doc.meshes)for(const p of mesh.primitives)delete p.material;
delete doc.materials;delete doc.images;delete doc.textures;
const encoded=Buffer.from(JSON.stringify(doc));const padded=Buffer.concat([encoded,Buffer.alloc((4-encoded.length%4)%4,32)]);
const rest=data.subarray(20+length),head=Buffer.alloc(20);
head.writeUInt32LE(0x46546c67,0);head.writeUInt32LE(2,4);head.writeUInt32LE(20+padded.length+rest.length,8);head.writeUInt32LE(padded.length,12);head.writeUInt32LE(0x4e4f534a,16);
const packed=Buffer.concat([head,padded,rest]);
const gltf=await new GLTFLoader().parseAsync(packed.buffer.slice(packed.byteOffset,packed.byteOffset+packed.byteLength),'');
const root=gltf.scene;
for(const clip of gltf.animations) {
  const mixer=new THREE.AnimationMixer(root);
  const original=clip.tracks.find(t=>t.name==='root_motion.position');
  if(original)console.log(clip.name,'duration',clip.duration,'locomotion',Array.from(original.values.slice(0,3)),Array.from(original.values.slice(-3)));
  clip.tracks=clip.tracks.filter(t=>t.name!=='root_motion.position');
  mixer.clipAction(clip).setLoop(THREE.LoopOnce,1).play();
  const samples=[];
  for(let i=0;i<=32;i++) {
    mixer.setTime(clip.duration*i/32);root.updateMatrixWorld(true);
    const pick=name=>root.getObjectByName(name)?.getWorldPosition(new THREE.Vector3()).toArray().map(x=>+x.toFixed(5));
    samples.push({t:+(clip.duration*i/32).toFixed(3),root:pick('root'),head:pick('head'),left:pick('ankle_L'),right:pick('ankle_R')});
  }
  console.log(JSON.stringify({name:clip.name,samples}));
  mixer.stopAllAction();mixer.uncacheRoot(root);
}
