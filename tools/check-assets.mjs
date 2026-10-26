import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const models=['chick','chicken','chicken_silkie','chicken_polish','behaviors','showcase','poses','held'];
const required=[...models.map(n=>`Assets/${n}.glb`),'Assets/material-maps.json',...['chicken_chick','chicken_idle_hen'].flatMap(prefix=>Array.from({length:6},(_,i)=>`Assets/Sounds/${prefix}_${String(i+1).padStart(2,'0')}.wav`))];
const missing=required.filter(name=>!fs.existsSync(path.join(root,name)));
if(missing.length){console.error(`Local game assets are missing (${missing.length} files). They are intentionally not distributed.\nSee Assets/README.md and docs/ASSET_PREPARATION.md.\n\n${missing.join('\n')}`);process.exit(2);}
for(const name of models){const data=fs.readFileSync(path.join(root,`Assets/${name}.glb`));if(data.length<20||data.toString('ascii',0,4)!=='glTF'||data.readUInt32LE(4)!==2||data.readUInt32LE(8)!==data.length)throw Error(`Invalid GLB: ${name}`);}
const maps=JSON.parse(fs.readFileSync(path.join(root,'Assets/material-maps.json'),'utf8'));
for(const name of ['chick_yellow','chick_yellow_fur','chicken_catalan_tan','chicken_silkie_white','chicken_polish_brown'])if(!maps[name]?.orm?.startsWith('data:image/png;base64,'))throw Error(`Missing embedded material map: ${name}`);
console.log('Local models, animation libraries, material maps and sounds are ready.');
