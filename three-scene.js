(function () {
  'use strict';
  const mount = document.getElementById('three-world');
  const data = window.FBX_TREE_DATA;
  if (!mount || !window.THREE || !data || !data.points?.length) return;
  const entryLoader=document.getElementById('entry-loader');
  const entryProgress=document.getElementById('entry-load-progress');
  const entryLabel=document.getElementById('entry-load-label');
  const enterButton=document.getElementById('enter-world');
  function showLoad(percent,label,complete=false){
    if(entryProgress)entryProgress.style.width=`${Math.max(0,Math.min(100,percent))}%`;
    if(entryLabel&&label)entryLabel.textContent=label;
    if(!complete)return;
    setTimeout(()=>{entryLoader?.classList.add('complete');if(enterButton){enterButton.hidden=false;enterButton.classList.add('revealed');}},900);
  }
  showLoad(8,'正在读取树的拓扑');

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xffffff);
  scene.fog = new THREE.FogExp2(0xffffff, 0.105);

  const camera = new THREE.PerspectiveCamera(38, 1, 0.05, 30);
  camera.position.set(0.08, 0.02, 3.05);
  const renderer = new THREE.WebGLRenderer({antialias:true, alpha:false, preserveDrawingBuffer:true, powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.setClearColor(0xffffff, 1);
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.domElement.setAttribute('aria-label','可旋转缩放的 FBX 粒子树');
  mount.appendChild(renderer.domElement);

  const controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = .055;
  controls.enablePan = false;
  controls.rotateSpeed = .42;
  controls.zoomSpeed = .68;
  controls.minDistance = 1.55;
  controls.maxDistance = 5.2;
  controls.minPolarAngle = Math.PI * .27;
  controls.maxPolarAngle = Math.PI * .73;
  controls.target.set(0, .02, 0);

  const treeGroup = new THREE.Group();
  treeGroup.scale.setScalar(1.6);
  treeGroup.rotation.y = -.08;
  scene.add(treeGroup);

  let pointsObject = null;
  let activePoints = data.points;
  let anchors = data.anchors || [];
  let audioLevel = 0;
  let targetAudio = 0;
  let windLevel = .22;
  let sourceMode = 'FBX topology cache';

  const vertexShader = `
    attribute float aSeed;
    attribute float aStructure;
    uniform float uTime;
    uniform float uAudio;
    uniform float uWind;
    uniform float uNight;
    uniform float uPixelRatio;
    varying float vDepth;
    varying float vWarm;
    varying float vRoot;
    void main(){
      vec3 p = position;
      float breath = sin(uTime * .42 + aSeed * 17.0 + p.y * 4.0) * .0028;
      vec3 radial = normalize(vec3(p.x + .0001, p.y * .2 + .04, p.z + .0001));
      float music = uAudio * (.008 + .018 * (1.0-aStructure));
      p += radial * (breath + music * sin(uTime * 2.1 + aSeed * 31.0));
      float windSway=(.0018 + max(0.0,p.y+.5) * .0032) * (1.0+uWind*5.0);
      p.x += sin(uTime * (.19+uWind*.12) + p.y * 7.0 + aSeed * 4.0) * windSway;
      p.z += cos(uTime * .16 + p.y * 5.0 + aSeed * 3.0) * windSway*.36;
      vec4 mv = modelViewMatrix * vec4(p,1.0);
      gl_Position = projectionMatrix * mv;
      vRoot = 1.0-smoothstep(-.22,.02,p.y);
      gl_PointSize = clamp((1.72 + aStructure * .46 + vRoot*.88 + sin(aSeed*40.0)*.16) * uPixelRatio * (3.0 / -mv.z), 1.0, 5.1);
      vDepth = clamp((-mv.z - 1.0) / 4.0, 0.0, 1.0);
      vWarm = step(.965,fract(aSeed*7.13));
    }
  `;
  const fragmentShader = `
    precision mediump float;
    varying float vDepth;
    varying float vWarm;
    varying float vRoot;
    uniform float uNight;
    void main(){
      vec2 q = gl_PointCoord-.5;
      float d = length(q);
      if(d>.5) discard;
      float soft = 1.0-smoothstep(.20,.5,d);
      vec3 cool = mix(vec3(.36,.40,.42),vec3(.62,.65,.64),1.0-vDepth);
      vec3 warm = vec3(.58,.51,.40);
      vec3 color = mix(cool,warm,vWarm*.33);
      color = mix(color,vec3(.29,.32,.33),vRoot*.24);
      color = mix(color,vec3(.78,.84,.86),uNight);
      gl_FragColor = vec4(color,.62 + soft*.35);
    }
  `;

  const uniforms = {
    uTime:{value:0}, uAudio:{value:0}, uWind:{value:.22}, uNight:{value:0}, uPixelRatio:{value:renderer.getPixelRatio()}
  };

  function installPoints(list) {
    activePoints = list.filter(p=>!(p[1]<.08&&p[0]>-.065&&p[0]<.025)).slice(0, 10000);
    const positions = new Float32Array(activePoints.length * 3);
    const seeds = new Float32Array(activePoints.length);
    const structure = new Float32Array(activePoints.length);
    activePoints.forEach((p,i) => {
      positions[i*3]=p[0]; positions[i*3+1]=p[1]; positions[i*3+2]=p[2];
      seeds[i]=p[3] == null ? (i*.61803398875)%1 : p[3];
      structure[i]=p[4] || 0;
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));
    geometry.setAttribute('aSeed',new THREE.BufferAttribute(seeds,1));
    geometry.setAttribute('aStructure',new THREE.BufferAttribute(structure,1));
    geometry.computeBoundingSphere();
    if (pointsObject) { treeGroup.remove(pointsObject); pointsObject.geometry.dispose(); }
    pointsObject = new THREE.Points(geometry,new THREE.ShaderMaterial({
      uniforms,vertexShader,fragmentShader,transparent:true,depthWrite:false,depthTest:true
    }));
    pointsObject.frustumCulled = false;
    treeGroup.add(pointsObject);
    mount.dataset.points = String(activePoints.length);
    mount.dataset.source = sourceMode;
  }
  installPoints(activePoints);

  const treePoints=data.points;
  function proceduralPoints(mode){
    const points=[];let seed=mode==='galaxy'?71:mode==='lake'?83:97;
    const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
    const add=(x,y,z,structure=0)=>points.push([x,y,z,random(),structure]);
    if(mode==='galaxy'){
      for(let i=0;i<9500;i++){const arm=i%4,r=.06+Math.pow(random(),.7)*.95,a=arm*Math.PI/2+r*5.7+(random()-.5)*(.08+r*.35);add(Math.cos(a)*r,(random()-.5)*(.08+r*.28),Math.sin(a)*r,random()>.93?1:0);}
      for(let i=0;i<500;i++){const a=random()*Math.PI*2,r=random()*.12;add(Math.cos(a)*r,(random()-.5)*.14,Math.sin(a)*r,1);}
    }else if(mode==='lake'){
      for(let i=0;i<3600;i++){const x=(random()-.5)*1.9,z=(random()-.5)*1.25;add(x,-.30+Math.sin(x*17+z*8)*.004,z,0);}
      for(let i=0;i<5000;i++){const x=(random()-.5)*2.1,z=(random()-.5)*1.15;const ridge=Math.max(0,.7-Math.abs(x+.46))*Math.max(0,.72-z)*.85+Math.max(0,.48-Math.abs(x-.55))*Math.max(0,.5-z)*.65;add(x,-.29+ridge+(random()-.5)*.025,z-.2,1);}
      for(let i=0;i<1400;i++){const a=random()*Math.PI*2,r=.08+random()*.85;add(Math.cos(a)*r,-.30+Math.sin(r*22)*.008,Math.sin(a)*r*.65,0);}
    }else{
      for(let i=0;i<3200;i++){const x=(random()-.5)*1.8,z=(random()-.5)*.85;add(x,-.46+(random()-.5)*.008,z,0);}
      for(let side of [-1,1])for(let house=0;house<8;house++){const cx=(house-3.5)*.22,cz=side*(.43+random()*.12),height=.23+random()*.34;for(let i=0;i<400;i++){const face=Math.floor(random()*4),u=(random()-.5)*.19,y=-.46+random()*height;add(cx+(face<2?u:(face===2?-.10:.10)),y,cz+(face>=2?u:(face===0?-.10:.10)),1);}for(let i=0;i<90;i++)add(cx+(random()-.5)*.22,-.46+height+Math.abs(random()-.5)*.12,cz+(random()-.5)*.22,1);}
    }
    return points;
  }
  function setScene(mode){const type=['tree','street','galaxy','lake'].includes(mode)?mode:'tree';if(mount.dataset.scene===type)return;sourceMode=type==='street'&&window.STREET_POINTS?.points?.length?'user FBX street':type==='tree'?'FBX topology cache':`procedural ${type}`;installPoints(type==='tree'?treePoints:type==='street'&&window.STREET_POINTS?.points?.length?window.STREET_POINTS.points:proceduralPoints(type));mount.dataset.scene=type;}

  function sampleLiveFBX(object) {
    object.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(object);
    const size = new THREE.Vector3(); box.getSize(size);
    const center = new THREE.Vector3(); box.getCenter(center);
    const voxel = new Map();
    const vertex = new THREE.Vector3();
    object.traverse(node => {
      const attr = node.geometry?.attributes?.position;
      if (!attr) return;
      const stride = Math.max(1,Math.floor(attr.count/72000));
      for(let i=0;i<attr.count;i+=stride){
        vertex.fromBufferAttribute(attr,i).applyMatrix4(node.matrixWorld);
        const x=(vertex.x-center.x)/size.y, y=(vertex.y-box.min.y)/size.y, z=(vertex.z-center.z)/size.y;
        const radial=Math.hypot(x,z), trunk=y<.66&&radial<.13+y*.23;
        const cell=trunk?.010:y<.78?.016:.023;
        const key=`${Math.round(x/cell)},${Math.round(y/cell)},${Math.round(z/cell)}`;
        const score=(trunk?4:0)+(1-y)*.7-radial*.12;
        if(!voxel.has(key)||score>voxel.get(key).score) voxel.set(key,{p:[x,y-.5,z,Math.random(),trunk?1:0],score,trunk});
      }
    });
    const trunk=[], crown=[];
    voxel.forEach(item=>(item.trunk?trunk:crown).push(item));
    trunk.sort((a,b)=>b.score-a.score); crown.sort((a,b)=>b.score-a.score);
    const chosen=trunk.slice(0,4200), remaining=10000-chosen.length;
    if(crown.length<=remaining) chosen.push(...crown);
    else for(let i=0;i<remaining;i++) chosen.push(crown[Math.floor(i*crown.length/remaining)]);
    const liveAnchors=[];
    [[-.3,-.07],[-.07,.18],[.18,.51]].forEach(([low,high])=>{
      const band=chosen.map(item=>item.p).filter(p=>p[1]>=low&&p[1]<high).sort((a,b)=>a[0]-b[0]);
      for(let i=0;i<6&&band.length;i+=1)liveAnchors.push(band[Math.floor((i+.5)*band.length/6)].slice(0,3));
    });
    anchors=liveAnchors.slice(0,18);
    sourceMode='live FBX';
    installPoints(chosen.map(item=>item.p));
    // The FBX object is intentionally never added to the scene; its mesh/material remain invisible.
    object.traverse(node=>{ if(node.isMesh){ node.visible=false; node.geometry?.dispose(); const mats=Array.isArray(node.material)?node.material:[node.material]; mats.forEach(m=>m?.dispose?.()); } });
  }

  if (location.protocol !== 'file:' && THREE.FBXLoader) {
    const manager=new THREE.LoadingManager();
    manager.setURLModifier(url=>/\.(?:tga|png|jpe?g|bmp)(?:$|\?)/i.test(url)?'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADElEQVR42mNk+M/wHwAF/gL+XWkQYQAAAABJRU5ErkJggg==':url);
    new THREE.FBXLoader(manager).load('./assets/models/AAA.FBX',object=>{showLoad(94,'正在生成粒子树');sampleLiveFBX(object);showLoad(100,'场景准备完成',true);},event=>{const ratio=event.total?event.loaded/event.total:0;showLoad(12+ratio*78,'正在载入大树模型');},()=>{mount.dataset.source=sourceMode;showLoad(100,'场景准备完成',true);});
  } else showLoad(100,'场景准备完成',true);

  function resize(){
    const rect=mount.getBoundingClientRect();
    renderer.setSize(Math.max(1,rect.width),Math.max(1,rect.height),false);
    camera.aspect=Math.max(1,rect.width)/Math.max(1,rect.height); camera.updateProjectionMatrix();
    uniforms.uPixelRatio.value=renderer.getPixelRatio();
  }
  const observer = new ResizeObserver(resize); observer.observe(mount); resize();

  function projectAnchor(index){
    if(!anchors.length) return null;
    const order=[10,13,0,15,8,3,14,5,11,17,1,9,6,16,4,12,7,2];
    const source=anchors[order[index%order.length]%anchors.length];
    const v=new THREE.Vector3(source[0],source[1],source[2]);
    treeGroup.updateMatrixWorld(true); v.applyMatrix4(treeGroup.matrixWorld).project(camera);
    return {x:(v.x+1)/2,y:(1-v.y)/2,depth:(v.z+1)/2,visible:v.z<1};
  }
  function findNearestAnchor(x,y){
    let best=0,distance=Infinity;
    anchors.forEach((_,index)=>{const point=projectAnchor(index);if(!point||!point.visible)return;const d=Math.hypot(point.x-x,point.y-y);if(d<distance){distance=d;best=index;}});
    return best;
  }
  function setAudioLevel(level){ targetAudio=Math.max(0,Math.min(1,Number(level)||0)); }
  function setWindLevel(level){windLevel=Math.max(0,Math.min(1.5,Number(level)||0));uniforms.uWind.value=windLevel;}
  function setTheme(theme){const night=theme==='night';uniforms.uNight.value=night?1:0;scene.background.set(night?0x05080b:0xffffff);scene.fog.color.set(night?0x05080b:0xffffff);renderer.setClearColor(night?0x05080b:0xffffff,1);}
  function gestureZoom(level){const targetDistance=controls.maxDistance-(controls.maxDistance-controls.minDistance)*Math.max(0,Math.min(1,level));const direction=camera.position.clone().sub(controls.target).normalize();camera.position.lerp(controls.target.clone().add(direction.multiplyScalar(targetDistance)),.16);controls.update();}
  function capture(type='image/png'){renderer.render(scene,camera);return renderer.domElement.toDataURL(type,type==='image/jpeg'?.92:undefined);}
  function getCameraState(){ return {distance:camera.position.distanceTo(controls.target),position:camera.position.toArray(),target:controls.target.toArray()}; }
  controls.addEventListener('change',()=>{
    const pct=Math.round(100*3.05/camera.position.distanceTo(controls.target));
    const label=document.getElementById('zoom-value'); if(label) label.textContent=`${pct}%`;
  });

  let prior=performance.now();
  function frame(now){
    const dt=Math.min(.05,(now-prior)/1000); prior=now;
    audioLevel += (targetAudio-audioLevel)*Math.min(1,dt*(targetAudio>audioLevel?7:2.6));
    targetAudio *= .975;
    uniforms.uTime.value=now/1000; uniforms.uAudio.value=audioLevel;
    controls.update(); renderer.render(scene,camera);
    window.dispatchEvent(new CustomEvent('worldtreeframe'));
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  document.documentElement.classList.add('three-ready');
  window.WorldTree3D={active:true,ready:true,setScene,setAudioLevel,setWindLevel,setTheme,gestureZoom,capture,getCanvas(){return renderer.domElement;},projectAnchor,findNearestAnchor,getCameraState,setEnabled(value){controls.enabled=Boolean(value);},get pointCount(){return activePoints.length;},get source(){return sourceMode;},reset(){camera.position.set(.08,.02,3.05);controls.target.set(0,.02,0);controls.update();}};
})();
