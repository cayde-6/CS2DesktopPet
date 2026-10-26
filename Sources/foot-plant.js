// Advance the world by the inverse movement of the planted foot, rather than
// assuming that a walking cycle has constant velocity within every step.
export class FootPlant {
  constructor(){this.reset();}
  reset(){this.previous=null;this.previousSoles=null;this.support=null;this.anchorIndices=null;}
  step(feet,targets,direction,tolerance,soles=null) {
    const ground=Math.min(targets[0].y,targets[1].y);
    const contacts=[0,1].filter(i=>targets[i].y<=ground+tolerance);
    const support=contacts.reduce((a,b)=>direction*feet[b].x>direction*feet[a].x?b:a);
    if(soles&&(support!==this.support||!this.anchorIndices)) {
      this.anchorIndices=soles[support].map((p,i)=>({i,y:p.y})).sort((a,b)=>a.y-b.y).slice(0,4).map(p=>p.i);
    }
    const anchor=points=>this.anchorIndices.reduce((sum,i)=>sum+points[support][i].x,0)/this.anchorIndices.length;
    const footX=soles?anchor(soles):feet[support].x;
    let dx=soles&&this.previousSoles?anchor(this.previousSoles)-footX:this.previous?this.previous[support].x-feet[support].x:0;
    const backwards=dx*direction<0;
    if(backwards)dx=0;
    this.previous=feet.map(p=>({...p}));this.previousSoles=soles;this.support=support;
    return {dx,support,footX,backwards};
  }
}
