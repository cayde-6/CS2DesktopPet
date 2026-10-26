import fs from 'node:fs';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';

// Load the real mesh/skin/animations in Node; textures are irrelevant to motion.
export async function loadForAnalysis(name) {
  const data=fs.readFileSync(`Assets/${name}.glb`);
  const length=data.readUInt32LE(12),doc=JSON.parse(data.subarray(20,20+length));
  for(const mesh of doc.meshes??[])for(const p of mesh.primitives)delete p.material;
  delete doc.materials;delete doc.images;delete doc.textures;
  const encoded=Buffer.from(JSON.stringify(doc));
  const padded=Buffer.concat([encoded,Buffer.alloc((4-encoded.length%4)%4,32)]);
  const rest=data.subarray(20+length),head=Buffer.alloc(20);
  head.writeUInt32LE(0x46546c67,0);head.writeUInt32LE(2,4);head.writeUInt32LE(20+padded.length+rest.length,8);head.writeUInt32LE(padded.length,12);head.writeUInt32LE(0x4e4f534a,16);
  const packed=Buffer.concat([head,padded,rest]);
  return new GLTFLoader().parseAsync(packed.buffer.slice(packed.byteOffset,packed.byteOffset+packed.byteLength),'');
}
