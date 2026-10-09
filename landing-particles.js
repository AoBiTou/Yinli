(function(){
  'use strict';
  const canvas=document.getElementById('landing-tree-particles');
  const source=window.FBX_TREE_DATA?.points;
  if(!canvas||!source?.length)return;
  const ctx=canvas.getContext('2d',{alpha:true});
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const bounds=source.reduce((box,p)=>({minX:Math.min(box.minX,p[0]),maxX:Math.max(box.maxX,p[0]),minY:Math.min(box.minY,p[1]),maxY:Math.max(box.maxY,p[1]),minZ:Math.min(box.minZ,p[2]),maxZ:Math.max(box.maxZ,p[2])}),{minX:Infinity,maxX:-Infinity,minY:Infinity,maxY:-Infinity,minZ:Infinity,maxZ:-Infinity});
  const centerX=(bounds.minX+bounds.maxX)/2,centerZ=(bounds.minZ+bounds.maxZ)/2;
  let width=1,height=1,dpr=1,visible=true,frame=0;
  function resize(){
    const rect=canvas.getBoundingClientRect();
    width=Math.max(1,rect.width);height=Math.max(1,rect.height);dpr=Math.min(devicePixelRatio||1,1.6);
    canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);
  }
  function draw(now=0){
    ctx.clearRect(0,0,width,height);
    const t=reduced?0:now*.001,angle=reduced?.12:Math.sin(t*.23)*.22+.08,cos=Math.cos(angle),sin=Math.sin(angle);
    const rangeX=Math.max(bounds.maxX-bounds.minX,bounds.maxZ-bounds.minZ),rangeY=bounds.maxY-bounds.minY;
    const scale=Math.min(width*.88/rangeX,height*.9/rangeY),rootY=height*.94;
    for(let i=0;i<source.length;i+=1){
      const p=source[i],x=p[0]-centerX,z=p[2]-centerZ,y=p[1]-bounds.minY;
      const rx=x*cos+z*sin,rz=-x*sin+z*cos,depth=1+rz*.38;
      const wind=reduced?0:Math.sin(t*1.05+p[3]*6.283+y*4)*(.45+y*1.35);
      const px=width*.5+rx*scale*depth+wind,py=rootY-y*scale*depth;
      const trunk=p[4]===1,r=(trunk?1.05:.72)*Math.max(.58,depth);
      const alpha=trunk?.7:.32+Math.max(0,rz)*.32;
      ctx.fillStyle=`rgba(31,47,52,${alpha})`;
      ctx.beginPath();ctx.arc(px,py,r,0,Math.PI*2);ctx.fill();
    }
    if(visible&&!reduced)frame=requestAnimationFrame(draw);
  }
  new ResizeObserver(()=>{resize();if(reduced)draw();}).observe(canvas);
  new IntersectionObserver(entries=>{visible=entries[0]?.isIntersecting!==false;if(visible&&!reduced){cancelAnimationFrame(frame);frame=requestAnimationFrame(draw);}else cancelAnimationFrame(frame);},{threshold:.02}).observe(canvas);
  resize();draw();
})();
