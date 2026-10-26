import * as T from 'three';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';

export class StudioLighting {
  constructor(renderer,scene) {
    this.scene=scene;
    this.hemisphere=new T.HemisphereLight(0xf4f8ff,0x9b886c,1.8);scene.add(this.hemisphere);
    this.key=new T.DirectionalLight(0xfff4e4,2.4);this.key.position.set(-3,5,5);scene.add(this.key);
    this.fill=new T.DirectionalLight(0xe7efff,0.8);this.fill.position.set(3,2,-2);scene.add(this.fill);
    const room=new RoomEnvironment(),pmrem=new T.PMREMGenerator(renderer);
    this.environment=pmrem.fromScene(room,0.08);room.dispose();pmrem.dispose();
    this.apply('after',renderer);
  }
  apply(name,renderer) {
    const modern=name!=='before';
    this.scene.environment=modern?this.environment.texture:null;
    this.scene.environmentIntensity=0.95;
    this.scene.environmentRotation.y=0.35;
    this.hemisphere.color.set(modern?0xf5f6ff:0xf4f8ff);this.hemisphere.groundColor.set(modern?0x8c8980:0x9b886c);
    this.hemisphere.intensity=modern?0.25:1.8;
    this.key.color.set(modern?0xffffff:0xfff4e4);this.key.intensity=modern?0.5:2.4;
    this.fill.intensity=modern?0.15:0.8;
    renderer.toneMapping=modern?T.NeutralToneMapping:T.ACESFilmicToneMapping;
    renderer.toneMappingExposure=modern?1.25:1;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio*(modern?1:2),modern?2:4));
  }
}
