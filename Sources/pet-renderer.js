import * as T from 'three';
import {FullScreenQuad} from 'three/addons/postprocessing/Pass.js';

const vertexShader=`varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.0,1.0);}`;
const jitter=[[-0.375,-0.125],[0.125,-0.375],[0.375,0.125],[-0.125,0.375]];

// Spatial sampling of the SAME animated pose. No history buffer, so walking
// feathers cannot leave temporal trails. Accumulate HDR premultiplied RGBA,
// then convert straight colour to display space and premultiply exactly once.
export class PetRenderer {
  constructor(renderer) {
    this.renderer=renderer;this.enabled=true;this.size=new T.Vector2();
    const type=renderer.extensions.has('EXT_color_buffer_float')?T.HalfFloatType:T.UnsignedByteType;
    this.sample=new T.WebGLRenderTarget(1,1,{type,count:2,samples:Math.min(4,renderer.capabilities.maxSamples),depthBuffer:true});
    this.accumulated=new T.WebGLRenderTarget(1,1,{type,depthBuffer:false});
    // A2C uses colour alpha as a sample mask; that same alpha must NOT be
    // multiplied into the resolved coverage again. The second attachment writes
    // one per covered sample, so fur cannot punch alpha holes in the opaque body.
    this.copy=new T.ShaderMaterial({uniforms:{source:{value:this.sample.textures[0]},coverage:{value:this.sample.textures[1]}},vertexShader,fragmentShader:'uniform sampler2D source;uniform sampler2D coverage;varying vec2 vUv;void main(){gl_FragColor=vec4(texture2D(source,vUv).rgb,texture2D(coverage,vUv).r)*0.25;}',transparent:true,blending:T.CustomBlending,blendSrc:T.OneFactor,blendDst:T.OneFactor,blendEquation:T.AddEquation,blendSrcAlpha:T.OneFactor,blendDstAlpha:T.OneFactor,blendEquationAlpha:T.AddEquation,depthTest:false,depthWrite:false,toneMapped:false});
    this.output=new T.ShaderMaterial({uniforms:{source:{value:this.accumulated.texture}},vertexShader,fragmentShader:`uniform sampler2D source;varying vec2 vUv;
      void main(){vec4 pixel=texture2D(source,vUv);gl_FragColor=vec4(pixel.a>0.00001?pixel.rgb/pixel.a:vec3(0.0),pixel.a);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      gl_FragColor.rgb*=gl_FragColor.a;}`,depthTest:false,depthWrite:false,blending:T.NoBlending,toneMapped:true});
    this.quad=new FullScreenQuad(this.copy);
    this.hdr=type===T.HalfFloatType;
  }
  render(scene,camera) {
    const r=this.renderer;
    if(!this.enabled){r.setRenderTarget(null);r.render(scene,camera);return;}
    r.getDrawingBufferSize(this.size);
    const width=this.size.x,height=this.size.y;
    if(width!==this.sample.width||height!==this.sample.height){this.sample.setSize(width,height);this.accumulated.setSize(width,height);}
    const autoClear=r.autoClear;r.autoClear=false;
    r.setRenderTarget(this.accumulated);r.clear();
    for(const [x,y] of jitter) {
      camera.setViewOffset(width,height,x,y,width,height);
      r.setRenderTarget(this.sample);r.clear();r.render(scene,camera);
      r.setRenderTarget(this.accumulated);this.quad.material=this.copy;this.quad.render(r);
    }
    camera.clearViewOffset();
    r.setRenderTarget(null);r.clear();this.quad.material=this.output;this.quad.render(r);
    r.autoClear=autoClear;
  }
}
