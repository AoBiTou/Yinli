'use strict';

(() => {
  const $ = id => document.getElementById(id);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const uid = () => `memory-${Date.now()}-${Math.random().toString(16).slice(2, 7)}`;
  const worldUid = () => `world-${Date.now()}-${Math.random().toString(16).slice(2, 7)}`;
  const safeName = value => String(value || '').replace(/[<>:"/\\|?*]/g, '-').trim();
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));

  const seedMirrors = [];

  const state = {
    mirrors: seedMirrors.map(item => ({...item, photos:[...item.photos]})), current:null, photoIndex:0,
    zoom:1, panX:0, panY:0, placing:false, dragging:false, moved:false, dragStart:null,
    sceneYaw:0, scenePitch:0, targetYaw:0, targetPitch:0,
    audioUrl:null, audioContext:null, analyser:null, frequencyData:null, ambientStarted:false, ambientGain:null, chimeAt:0,
    particleSource:[], particleImage:'', toastTimer:0, db:null,
    pointerX:.5, pointerY:.5, treeParticles:[], canopyParticles:[], treePulseAt:0, lastTreeFrame:0,
    particleMode:'terrain', particleResponse:.68, particleDensity:.78,
    theme:localStorage.getItem('yingji-theme')||'day', language:localStorage.getItem('yingji-language')||'zh', weatherIndex:0,
    baseWind:.22, mediaRecorder:null, recordingChunks:[], homeMusic:false,
    worlds:[],currentWorldId:localStorage.getItem('yingji-current-world')||worldUid(),currentWorldName:'新的世界',archiveWorldId:null,
    dockedMirror:null,weatherAudio:null,weatherTimer:null,captureFrame:0,environmentParticles:[],animalT:0
  };

  const translations={
    zh:{entryTitle:'一段音乐，一段记忆',enterSite:'开始我的音乐回忆',soundHint:'请开启声音 · 风会带你找到记忆',chooseBranch:'选择一处枝桠',cancel:'取消',myMemories:'我的记忆',myWorldMemories:'我的世界记忆录',hangMemory:'悬挂一段记忆',camera:'相机',newWorld:'新建世界',saveWorld:'保存世界',returnMemory:'收回树上',nameYourWorld:'给新的世界取一个名字',worldName:'世界名称',createWorld:'开始新的世界',placeHint:'点击树的范围，悬挂一段记忆',openMemory:'开启回忆',weatherClear:'晴朗 · 微风',uploadPhoto:'上传图片',addMusic:'添加音乐',memoryState:'记忆状态',faded:'时间褪色',film:'胶片',archiveStyle:'档案',dream:'梦',particleMotion:'粒子波动',followMusic:'跟随音乐',musicResponse:'音乐响应',particleDensity:'粒子密度',title:'标题',date:'日期',description:'描述',rescan:'重新扫描',saveToTree:'存入世界树',tutorialTitle:'如何体验音礼',chooseAngle:'拖动场景选择拍摄角度',recordMemory:'录制回忆'},
    en:{entryTitle:'One song, one memory',enterSite:'Begin My Music Memories',soundHint:'Turn on sound · Follow the wind to a memory',chooseBranch:'Choose a branch',cancel:'Cancel',myMemories:'My Memories',myWorldMemories:'My Memory Worlds',hangMemory:'Hang a Memory',camera:'Camera',newWorld:'New World',saveWorld:'Save World',returnMemory:'Return to Tree',nameYourWorld:'Name your new world',worldName:'World name',createWorld:'Start New World',placeHint:'Choose any point within the tree',openMemory:'Open Memory',weatherClear:'Clear · Breeze',uploadPhoto:'Upload Photo',addMusic:'Add Music',memoryState:'Memory Tone',faded:'Faded',film:'Film',archiveStyle:'Archive',dream:'Dream',particleMotion:'Particle Motion',followMusic:'Follows Music',musicResponse:'Response',particleDensity:'Density',title:'Title',date:'Date',description:'Notes',rescan:'Rescan',saveToTree:'Save to Tree',tutorialTitle:'How to experience Yin Li',chooseAngle:'Drag the scene to choose an angle',recordMemory:'Record Memory'}
  };
  const weatherModes=[
    {zh:'晴朗 · 微风',en:'Clear · Breeze',type:'clear',wind:.22},
    {zh:'多风 · 4级',en:'Windy · Force 4',type:'wind',wind:.7},
    {zh:'小雨 · 阵风',en:'Light Rain',type:'rain',wind:.48},
    {zh:'薄雾 · 静风',en:'Mist · Still',type:'mist',wind:.1},
    {zh:'小雪 · 静谧',en:'Light Snow',type:'snow',wind:.18}
  ];

  const worldCamera = $('world-camera');
  const worldStage = $('world-stage');
  const mirrorLayer = $('mirror-layer');
  const fishlineLayer = $('fishline-layer');
  const treeCanvas = $('world-tree-canvas');
  const treeCtx = treeCanvas.getContext('2d', {alpha:true});
  const memoryView = $('memory-view');
  const focusMirror = $('focus-mirror');
  const memoryAudio = $('memory-audio');
  const particleCanvas = $('memory-particles');
  const particleCtx = particleCanvas.getContext('2d', {alpha:true});
  const windCanvas = $('wind-canvas');
  const windCtx = windCanvas.getContext('2d', {alpha:true});
  const environmentCanvas = $('environment-canvas');
  const environmentCtx = environmentCanvas.getContext('2d', {alpha:true});

  function showToast(message) {
    const toast = $('toast');
    clearTimeout(state.toastTimer);
    toast.textContent = message;
    toast.hidden = false;
    state.toastTimer = setTimeout(() => { toast.hidden = true; }, 2600);
  }

  function applyLanguage(){
    const copy=translations[state.language];
    document.documentElement.lang=state.language==='zh'?'zh-CN':'en';
    $$('[data-i18n]').forEach(node=>{const key=node.dataset.i18n;if(copy[key])node.textContent=copy[key];});
    $('language-toggle').textContent=state.language==='zh'?'EN':'中';
    updateWeatherLabel();updateArchiveCount();if(!$('archive-view').hidden)renderWorldGallery();
  }

  function applyTheme(){
    document.body.classList.toggle('night-mode',state.theme==='night');
    $('theme-toggle').setAttribute('aria-label',state.theme==='night'?'切换白天模式':'切换黑夜模式');
    window.WorldTree3D?.setTheme?.(state.theme);
    localStorage.setItem('yingji-theme',state.theme);
  }

  function updateWeatherLabel(){const mode=weatherModes[state.weatherIndex];$('weather-toggle').textContent=mode[state.language];document.body.dataset.weather=mode.type;state.baseWind=mode.wind;resetWind();resetEnvironment();updateWeatherAudio();}
function worldRole(world){if(world?.ownerRole==='creator'||world?.ownerRole==='receiver')return world.ownerRole;return(world?.mirrors||[]).some(mirror=>mirror.yinliStatus==='received')?'receiver':'creator';}
function updateArchiveCount(){const node=$('archive-count');if(!node)return;const count=state.worlds.filter(world=>worldRole(world)===(state.archiveRole||'creator')).length;node.innerHTML=`<b>${String(count).padStart(2,'0')}</b><small>${state.language==='zh'?`已保存 ${count} 个记忆世界`:`${count} memory worlds saved`}</small>`;}

  function downloadData(url,name){const link=document.createElement('a');link.href=url;link.download=name;link.click();}
  function drawSceneComposite(target){
    const source=window.WorldTree3D?.getCanvas?.();if(!source)return null;
    const rect=source.getBoundingClientRect();target.width=source.width;target.height=source.height;
    const ctx=target.getContext('2d'),sx=target.width/rect.width,sy=target.height/rect.height;
    ctx.clearRect(0,0,target.width,target.height);ctx.drawImage(source,0,0,target.width,target.height);
    if(environmentCanvas.width)ctx.drawImage(environmentCanvas,0,0,target.width,target.height);
    if(windCanvas.width)ctx.drawImage(windCanvas,0,0,target.width,target.height);
    state.mirrors.forEach(mirror=>{
      const node=mirror._node;if(!node||node.classList.contains('is-docked'))return;
      const box=node.getBoundingClientRect(),x=(box.left-rect.left)*sx,y=(box.top-rect.top)*sy,w=box.width*sx,h=box.height*sy;
      const anchor=mirror._captureAnchor||{x:box.left+box.width/2,y:box.top-80};
      const ax=(anchor.x-rect.left)*sx,ay=(anchor.y-rect.top)*sy;ctx.save();ctx.strokeStyle=state.theme==='night'?'rgba(238,244,242,.72)':'rgba(45,52,53,.58)';ctx.lineWidth=Math.max(1,sx*.75);ctx.beginPath();ctx.moveTo(ax,ay);ctx.quadraticCurveTo((ax+x+w*.5)/2+sx*3,(ay+y)/2,x+w*.5,y+3);ctx.stroke();
      ctx.translate(x+w/2,y+h/2);ctx.rotate(((mirror.rotation||0)+(mirror._angle||0)*57.3)*Math.PI/180);ctx.fillStyle=state.theme==='night'?'#10161a':'#e4e6e3';ctx.fillRect(-w/2,-h/2,w,h);
      const domImage=node.querySelector('img'),image=mirror._captureImage||(mirrorImage(mirror)?.startsWith('data:')?domImage:null);if(image?.complete&&image.naturalWidth){ctx.save();ctx.beginPath();ctx.rect(-w/2,-h/2,w,h);ctx.clip();ctx.drawImage(image,-w/2,-h/2,w,h);ctx.restore();}
      ctx.strokeStyle=state.theme==='night'?'rgba(255,255,255,.72)':'rgba(24,29,30,.54)';ctx.lineWidth=Math.max(1,sx);ctx.strokeRect(-w/2,-h/2,w,h);ctx.restore();
    });
    document.querySelectorAll('#yinli-media-layer .yinli-media-item').forEach(node=>{
      const opacity=Number(getComputedStyle(node).opacity);if(opacity<.02)return;
      const media=node.classList.contains('particle-active')?node.querySelector('canvas'):node.querySelector('img,video');
      if(!media||(media.tagName==='IMG'&&!media.complete)||(media.tagName==='VIDEO'&&media.readyState<2))return;
      const box=media.getBoundingClientRect();if(box.width<1||box.height<1)return;
      ctx.save();ctx.globalAlpha=opacity;try{ctx.drawImage(media,(box.left-rect.left)*sx,(box.top-rect.top)*sy,box.width*sx,box.height*sy);}catch{}ctx.restore();
    });
    return target;
  }
  function getCompositeCanvas(){return drawSceneComposite(document.createElement('canvas'));}
  function captureScene(type){const canvas=getCompositeCanvas();if(!canvas){showToast('场景相机暂时不可用');return;}const mime=type==='jpg'?'image/jpeg':'image/png';downloadData(canvas.toDataURL(mime,type==='jpg'?.92:undefined),`音记-场景-${Date.now()}.${type}`);showToast(`${type.toUpperCase()} 已保存，悬挂记忆已收入画面`);}

  function toggleRecording(){
    if(state.mediaRecorder?.state==='recording'){state.mediaRecorder.stop();return;}
    const canvas=getCompositeCanvas();if(!canvas?.captureStream||!window.MediaRecorder){showToast('当前浏览器不支持场景录制');return;}
    const stream=canvas.captureStream(30);state.recordingChunks=[];
    if(!memoryAudio.paused)try{const audioStream=memoryAudio.captureStream?.();audioStream?.getAudioTracks().forEach(track=>stream.addTrack(track));}catch{}
    const mime=MediaRecorder.isTypeSupported('video/webm;codecs=vp9')?'video/webm;codecs=vp9':'video/webm';
    state.mediaRecorder=new MediaRecorder(stream,{mimeType:mime});
    state.mediaRecorder.ondataavailable=event=>{if(event.data.size)state.recordingChunks.push(event.data);};
    state.mediaRecorder.onstop=()=>{cancelAnimationFrame(state.captureFrame);stream.getTracks().forEach(track=>track.stop());const blob=new Blob(state.recordingChunks,{type:'video/webm'});const url=URL.createObjectURL(blob);downloadData(url,`音记-回忆-${Date.now()}.webm`);setTimeout(()=>URL.revokeObjectURL(url),2000);$('record-scene').classList.remove('recording');$('record-scene').textContent=translations[state.language].recordMemory;showToast('回忆片段已保存，照片与环境已收入画面');};
    const compositeLoop=()=>{drawSceneComposite(canvas);if(state.mediaRecorder?.state==='recording')state.captureFrame=requestAnimationFrame(compositeLoop);};
    state.mediaRecorder.start(250);compositeLoop();$('record-scene').classList.add('recording');$('record-scene').textContent=state.language==='zh'?'停止并保存':'Stop & Save';showToast('正在录制完整场景，仍可旋转选择角度');
  }

  function updateCamera() {
    worldStage.style.setProperty('--zoom', state.zoom.toFixed(3));
    worldStage.style.setProperty('--pan-x', `${state.panX}px`);
    worldStage.style.setProperty('--pan-y', `${state.panY}px`);
    $('zoom-value').textContent = `${Math.round(state.zoom * 100)}%`;
    document.documentElement.style.setProperty('--scene-yaw', `${state.targetYaw * 16}px`);
    document.documentElement.style.setProperty('--scene-pitch', `${state.targetPitch * 16}px`);
    document.documentElement.style.setProperty('--forest-x', `${state.targetYaw * -18}px`);
    document.documentElement.style.setProperty('--forest-y', `${state.targetPitch * -12}px`);
  }

  function screenToWorld(clientX, clientY) {
    const rect = worldCamera.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const sx = (clientX - cx - state.panX) / state.zoom + rect.width / 2;
    const sy = (clientY - cy - state.panY) / state.zoom + rect.height / 2;
    return {x:clamp(sx/rect.width,.08,.92), y:clamp(sy/rect.height,.12,.88)};
  }

  const mirrorImage = mirror => mirror.photos?.[0] || '';

  const seedAnchors = [
    {x:.35,y:.19,hang:.14,z:-.18},{x:.23,y:.39,hang:.15,z:.17},{x:.51,y:.49,hang:.15,z:-.08},{x:.67,y:.25,hang:.14,z:.22}
  ];

  function prepareMirrorPhysics(mirror, index) {
    const preset = index < seedAnchors.length ? seedAnchors[index] : null;
    if (!Number.isFinite(mirror.anchorX)) {
      mirror.anchorX = preset?.x ?? clamp(mirror.x, .12, .88);
      mirror.anchorY = preset?.y ?? clamp(mirror.y - .14, .12, .72);
      mirror.hang = preset?.hang ?? .14;
      mirror.depth = preset?.z ?? (Math.random()-.5)*.34;
    }
    if (!Number.isFinite(mirror.depth)) mirror.depth = preset?.z ?? (Math.random()-.5)*.34;
    mirror._angle ??= (Math.random() - .5) * .08;
    mirror._velocity ??= 0;
  }

  function renderWorld() {
    mirrorLayer.replaceChildren();
    fishlineLayer.replaceChildren();
    state.mirrors.forEach((mirror, index) => {
      prepareMirrorPhysics(mirror, index);
      const captureSource=mirror.capturePhoto||(mirrorImage(mirror)?.startsWith('data:')?mirrorImage(mirror):'');if(captureSource){mirror._captureImage=new Image();mirror._captureImage.src=captureSource;}
      const button = document.createElement('div');
      button.tabIndex = 0;button.setAttribute('role','button');
      button.className = `memory-mirror${mirrorImage(mirror) ? '' : ' empty'}${mirror.echoProjectId ? ' echo-memory' : ''}${mirror.echoStatus === 'responded' ? ' echo-responded' : ''}${mirror.yinliProjectId ? ' yinli-memory' : ''}`;
      button.dataset.id = mirror.id;
      button.style.setProperty('--rotation', `${mirror.rotation || 0}deg`);
      button.style.setProperty('--delay', `${(index % 5) * .42}s`);
      button.style.setProperty('--tilt', `${index % 2 ? -3 : 3}deg`);
      button.style.scale = mirror.size || 1;
      button.setAttribute('aria-label', `打开记忆：${mirror.title || '未命名记忆'}`);
      button.innerHTML = `<span class="mirror-body">${mirrorImage(mirror) ? `<img src="${mirrorImage(mirror)}" alt="">` : ''}<i class="reflection"></i>${mirror.yinliProjectId?`<em class="mirror-echo-state">${mirror.yinliStatus==='received'?'收到的音礼':'音礼创作'}</em>`:''}</span><span class="mirror-label">${String(index + 1).padStart(2, '0')} · ${escapeHtml(mirror.title || '未命名记忆')}</span>`;
      button.addEventListener('mouseenter', () => {
        if(!document.body.classList.contains('yinli-creator-mode'))playChime();
        fishlineLayer.querySelector(`[data-mirror="${CSS.escape(mirror.id)}"]`)?.classList.add('active');
      });
      button.addEventListener('mouseleave', () => fishlineLayer.querySelector(`[data-mirror="${CSS.escape(mirror.id)}"]`)?.classList.remove('active'));
      button.addEventListener('click', event => { event.stopPropagation();if (!state.placing && !state.moved) openMemory(mirror.id); });
      button.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' ')openMemory(mirror.id);});
      mirrorLayer.append(button);
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('class', 'fishline'); path.setAttribute('data-mirror', mirror.id);
      fishlineLayer.append(path);
      mirror._node = button;
      mirror._line = path;
    });
    updateArchiveCount();
    updateHangingMirrors(performance.now(), 1);
  }

  async function dockMemory(id){
    const mirror=state.mirrors.find(item=>item.id===id);if(!mirror||(!mirror.musicSrc&&!mirror.audioBlob&&!mirror.echoProjectId&&!mirror.yinliProjectId)){showToast('这段记忆还没有音乐');return;}
    if(state.dockedMirror===mirror&&$('world-player').hidden===false){toggleDockedMemory();return;}
    retractDockedMemory(false);state.dockedMirror=mirror;const from=mirror._node?.getBoundingClientRect();mirror._node?.classList.add('is-docked');
    const player=$('world-player');$('world-player-image').src=mirrorImage(mirror)||'';$('world-player-title').textContent=mirror.title||'未命名记忆';$('world-player-subtitle').textContent=mirror.musicName||mirror.audioName||'悬挂的音乐记忆';player.hidden=false;requestAnimationFrame(()=>{player.classList.add('visible');if(from)animateMemoryFlight(mirrorImage(mirror),from,$('world-player-image').getBoundingClientRect());});
    if(mirror.yinliProjectId){state.homeMusic=true;window.dispatchEvent(new CustomEvent('yinli-home-play',{detail:{mirrorId:mirror.id,projectId:mirror.yinliProjectId}}));player.classList.add('playing');showToast(`正在播放整份音礼 · ${mirror.title}`);return;}
    if(mirror.echoProjectId){state.homeMusic=true;window.dispatchEvent(new CustomEvent('echo-home-play',{detail:{mirrorId:mirror.id,projectId:mirror.echoProjectId}}));player.classList.add('playing');showToast(`已从树上摘下 · ${mirror.title}`);return;}
    if(state.audioUrl){URL.revokeObjectURL(state.audioUrl);state.audioUrl=null;}memoryAudio.pause();
    if(mirror.audioBlob){state.audioUrl=URL.createObjectURL(mirror.audioBlob);memoryAudio.src=state.audioUrl;}else memoryAudio.src=mirror.musicSrc;
    state.homeMusic=true;ensureAudioContext();try{await memoryAudio.play();player.classList.add('playing');showToast(`已从树上摘下 · ${mirror.title}`);}catch{showToast('音乐暂时无法播放');}
  }
  function toggleDockedMemory(){if(!state.dockedMirror)return;if(state.dockedMirror.yinliProjectId){window.dispatchEvent(new CustomEvent('yinli-home-toggle'));return;}if(state.dockedMirror.echoProjectId){window.dispatchEvent(new CustomEvent('echo-home-toggle'));return;}if(memoryAudio.paused)memoryAudio.play().catch(()=>showToast('音乐暂时无法播放'));else memoryAudio.pause();}
  function animateMemoryFlight(src,from,to){if(!src||!from||!to)return;const image=document.createElement('img');image.className='memory-flight';image.src=src;Object.assign(image.style,{left:`${from.left}px`,top:`${from.top}px`,width:`${from.width}px`,height:`${from.height}px`});document.body.append(image);image.animate([{transform:'translate(0,0) rotate(0)',opacity:.9},{transform:`translate(${to.left-from.left}px,${to.top-from.top}px) rotate(-3deg)`,width:`${to.width}px`,height:`${to.height}px`,opacity:1}],{duration:760,easing:'cubic-bezier(.2,.75,.2,1)',fill:'forwards'}).onfinish=()=>image.remove();}
  function retractDockedMemory(animate=true){
    const mirror=state.dockedMirror;if(!mirror)return;const player=$('world-player');if(animate&&mirror._node)animateMemoryFlight(mirrorImage(mirror),$('world-player-image').getBoundingClientRect(),mirror._node.getBoundingClientRect());if(mirror.yinliProjectId)window.dispatchEvent(new CustomEvent('yinli-home-stop'));else if(mirror.echoProjectId)window.dispatchEvent(new CustomEvent('echo-home-stop'));else memoryAudio.pause();mirror._node?.classList.remove('is-docked');player.classList.remove('visible','playing');
    if(animate)setTimeout(()=>{player.hidden=true;},520);else player.hidden=true;state.dockedMirror=null;state.homeMusic=false;
  }

function renderWorldGallery(){
    $('world-gallery').hidden=false;
    $('archive-kicker').textContent='WORLD MEMORY ARCHIVE';document.querySelector('.archive-view h2').textContent=translations[state.language].myWorldMemories;
 const gallery=$('world-gallery');gallery.replaceChildren();
 let roleTabs=$('archive-role-tabs');if(!roleTabs){roleTabs=document.createElement('div');roleTabs.id='archive-role-tabs';roleTabs.className='archive-role-tabs';gallery.before(roleTabs);}roleTabs.innerHTML=state.language==='zh'?'<button type="button" data-archive-role="creator">我创作的</button><button type="button" data-archive-role="receiver">我收到的</button>':'<button type="button" data-archive-role="creator">Created by me</button><button type="button" data-archive-role="receiver">Received</button>';roleTabs.querySelectorAll('button').forEach(button=>{button.setAttribute('aria-selected',String(button.dataset.archiveRole===(state.archiveRole||'creator')));button.addEventListener('click',()=>{state.archiveRole=button.dataset.archiveRole;renderWorldGallery();});});
 state.worlds.sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt))).filter(world=>worldRole(world)===(state.archiveRole||'creator')).forEach((world,index)=>{
   const card=document.createElement('div');card.className='world-card';card.dataset.worldId=world.id;card.tabIndex=0;card.setAttribute('role','button');card.setAttribute('aria-label',`打开${world.name||'未命名世界'}`);
      const images=(world.mirrors||[]).map(mirror=>mirrorImage(mirror)).filter(Boolean).slice(0,4);
      card.innerHTML=`<span class="world-card-scene">${world.coverImage?`<img class="world-cover" src="${world.coverImage}" alt="${escapeHtml(world.name||'世界')}保存时的主场景截图">`:`<i class="mini-tree"></i>${images.map((src,i)=>`<img src="${src}" alt="" style="left:${20+i*19}%;top:${22+(i%2)*28}%">`).join('')}`}</span><small>WORLD / ${String(index+1).padStart(2,'0')}</small><b>${escapeHtml(world.name||'未命名世界')}</b><span>${world.mirrors?.length||0} ${state.language==='zh'?'段音乐记忆':'music memories'}</span><time>${String(world.updatedAt||'').slice(0,10)}</time>`;
   const remove=document.createElement('button');remove.type='button';remove.className='world-card-delete';remove.textContent=state.language==='zh'?'删除':'Delete';remove.setAttribute('aria-label',`${state.language==='zh'?'删除':'Delete '}${world.name||'未命名世界'}`);remove.addEventListener('click',async event=>{event.stopPropagation();if(remove.dataset.confirm!=='yes'){remove.dataset.confirm='yes';remove.textContent=state.language==='zh'?'确认删除':'Confirm';setTimeout(()=>{if(remove.isConnected&&!remove.disabled){remove.dataset.confirm='';remove.textContent=state.language==='zh'?'删除':'Delete';}},5000);return;}remove.disabled=true;const deleted=await deletePersistedWorld(world);if(!deleted){remove.disabled=false;remove.dataset.confirm='';remove.textContent=state.language==='zh'?'删除失败':'Failed';showToast('删除失败，请检查浏览器的本地存储权限');return;}state.worlds=state.worlds.filter(item=>item.id!==world.id);if(!state.worlds.length)localStorage.setItem('yingji-worlds-cleared','1');if(state.currentWorldId===world.id){window.dispatchEvent(new Event('yinli-return-landing'));const next=state.worlds.find(item=>worldRole(item)===(state.archiveRole||'creator'));if(next)await loadWorld(next.id);else{retractDockedMemory(false);state.currentWorldId=worldUid();state.currentWorldName='新的世界';state.mirrors=[];state.current=null;localStorage.removeItem('yingji-current-world');renderWorld();}}renderWorldGallery();showToast('世界已删除');});card.append(remove);card.addEventListener('click',event=>{if(!event.target.closest('.world-card-delete'))openArchiveWorld(world.id);});card.addEventListener('keydown',event=>{if(event.target===card&&(event.key==='Enter'||event.key===' ')){event.preventDefault();openArchiveWorld(world.id);}});gallery.append(card);
    });
    if((state.archiveRole||'creator')==='creator'&&!document.body.classList.contains('yinli-receiver-mode')){const create=document.createElement('button');create.type='button';create.className='world-card world-card-new';create.innerHTML=`<i>＋</i><b>${state.language==='zh'?'新建一个世界':'Create a New World'}</b>`;create.addEventListener('click',()=>openNewWorldPanel());gallery.append(create);}
    updateArchiveCount();
  }

  async function openArchiveWorld(id){
    if(id!==state.currentWorldId)await loadWorld(id);state.archiveWorldId=id;$('archive-view').hidden=true;renderWorld();
  }

  function beginPlacement() {
    state.placing=true; state.moved=false; worldCamera.classList.add('placing'); $('place-hint').hidden=false;
    window.WorldTree3D?.setEnabled?.(false);
    showToast('在世界树上选择一处位置');
  }

  function cancelPlacement() {
    state.placing=false; worldCamera.classList.remove('placing'); $('place-hint').hidden=true;
    window.WorldTree3D?.setEnabled?.(true);
  }

  function plantMirror(clientX, clientY) {
    const point=screenToWorld(clientX,clientY);
    const treeAnchor=window.WorldTree3D?.findNearestAnchor?.(point.x,point.y);
    const mirror={id:uid(),x:point.x,y:point.y,anchorX:point.x,anchorY:clamp(point.y-.14,.11,.72),treeAnchor,hang:.14,rotation:Math.round((Math.random()-.5)*10),size:.88+Math.random()*.22,title:'未命名记忆',date:new Date().toISOString().slice(0,10),description:'',photos:[],scanStyle:'faded',saved:false};
    state.mirrors.push(mirror);state.treePulseAt=performance.now();cancelPlacement();renderWorld();playChime(true);
    setTimeout(() => openMemory(mirror.id), 360);
  }

  async function openMemory(id) {
    const mirror=state.mirrors.find(item=>item.id===id); if(!mirror)return;
    const viewer=document.body.classList.contains('yinli-receiver-mode');
    state.current=mirror; state.photoIndex=0;
    if(state.audioUrl)URL.revokeObjectURL(state.audioUrl); state.audioUrl=null;
    retractDockedMemory(false);memoryAudio.pause();state.homeMusic=false;memoryAudio.removeAttribute('src');
    if(mirror.audioBlob){state.audioUrl=URL.createObjectURL(mirror.audioBlob);memoryAudio.src=state.audioUrl;}
    else if(mirror.musicSrc)memoryAudio.src=mirror.musicSrc;
    $('memory-title').value=mirror.title||''; $('memory-date').value=mirror.date||''; $('memory-description').value=mirror.description||'';
    $('memory-caption-title').textContent=mirror.title||'未命名记忆'; $('memory-caption-date').textContent=mirror.date||'';
    $('memory-index').textContent=String(state.mirrors.indexOf(mirror)+1).padStart(2,'0');
    $('photo-file-name').textContent=mirror.photos?.length?`${mirror.photos.length} 张记忆照片`:'JPG / PNG / WEBP';
    $('audio-file-name').textContent=mirror.musicName||mirror.audioName||'MP3 / WAV / M4A';
    $$('.memory-states button').forEach(button=>button.classList.toggle('active',button.dataset.scan===(mirror.scanStyle||'faded')));
    updateMemoryImage(); $('memory-editor').classList.remove('collapsed');document.body.classList.add('memory-open');memoryView.classList.toggle('viewer-memory',viewer);memoryView.hidden=false;
    requestAnimationFrame(()=>memoryView.classList.add('active'));window.dispatchEvent(new CustomEvent('memory-opened',{detail:{mirrorId:mirror.id,echoProjectId:mirror.echoProjectId||null,yinliProjectId:mirror.yinliProjectId||null}})); playChime(true);
  }

  function updateMemoryImage() {
    const mirror=state.current;if(!mirror)return;const photos=mirror.photos||[];const image=$('memory-image');
    if(photos.length){state.photoIndex%=photos.length;image.src=photos[state.photoIndex];image.hidden=false;$('scan-status').textContent=mirror.saved?'MEMORY STORED':'等待保存';$('photo-cycle').hidden=photos.length<2;$('photo-cycle').textContent=`${String(state.photoIndex+1).padStart(2,'0')} / ${String(photos.length).padStart(2,'0')}`;prepareParticles(photos[state.photoIndex]);}
    else{image.removeAttribute('src');image.hidden=true;$('scan-status').textContent='等待记忆';$('photo-cycle').hidden=true;state.particleSource=[];}
  }

  function closeMemory() {
    memoryAudio.pause();window.dispatchEvent(new CustomEvent('memory-closed'));memoryView.classList.remove('active','viewer-memory');document.body.classList.remove('memory-open');focusMirror.classList.remove('playing','scanning');
    setTimeout(()=>{memoryView.hidden=true;},620);
  }

  function fileToDataURL(file) {return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=reject;reader.readAsDataURL(file);});}
  function loadImage(src) {return new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=reject;image.src=src;});}

  async function processPhoto(src, style='faded') {
    const image=await loadImage(src);const maxSide=1100;const ratio=Math.min(1,maxSide/Math.max(image.naturalWidth,image.naturalHeight));
    const width=Math.max(1,Math.round(image.naturalWidth*ratio)),height=Math.max(1,Math.round(image.naturalHeight*ratio));
    const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d');
    const filters={faded:'grayscale(.15) sepia(.3) saturate(.68) contrast(.94) brightness(.96)',film:'sepia(.12) saturate(.8) contrast(1.08) brightness(.94)',archive:'grayscale(.86) sepia(.12) contrast(1.18) brightness(.9)',dream:'saturate(.65) contrast(.9) brightness(1.03) blur(.7px)'};
    ctx.filter=filters[style]||filters.faded;ctx.drawImage(image,0,0,width,height);ctx.filter='none';
    const data=ctx.getImageData(0,0,width,height);
    for(let i=0;i<data.data.length;i+=4){const grain=(Math.random()-.5)*14;data.data[i]=clamp(data.data[i]+grain+2,0,255);data.data[i+1]=clamp(data.data[i+1]+grain,0,255);data.data[i+2]=clamp(data.data[i+2]+grain-2,0,255);}
    ctx.putImageData(data,0,0);const vignette=ctx.createRadialGradient(width*.5,height*.44,Math.min(width,height)*.12,width*.5,height*.5,Math.max(width,height)*.72);
    vignette.addColorStop(0,'rgba(255,245,225,.035)');vignette.addColorStop(.62,'rgba(0,0,0,0)');vignette.addColorStop(1,'rgba(0,0,0,.38)');ctx.fillStyle=vignette;ctx.fillRect(0,0,width,height);
    ctx.globalAlpha=.07;ctx.fillStyle='#fff';for(let y=0;y<height;y+=5)ctx.fillRect(0,y,width,1);
    return canvas.toDataURL('image/jpeg',.88);
  }

  async function scanFiles(files) {
    if(!state.current||!files.length)return;focusMirror.classList.remove('scanning');void focusMirror.offsetWidth;focusMirror.classList.add('scanning');$('scan-status').textContent='SCANNING MEMORY';$('photo-file-name').textContent=`正在扫描 ${files.length} 张照片`;
    try{const originals=await Promise.all(files.map(fileToDataURL));state.current.originalPhotos=originals;const processed=[];for(const original of originals)processed.push(await processPhoto(original,state.current.scanStyle||'faded'));await wait(900);state.current.photos=processed;state.photoIndex=0;$('scan-status').textContent='MEMORY STORED';$('photo-file-name').textContent=`${processed.length} 张记忆照片`;updateMemoryImage();showToast('扫描完成，照片已留下时间的纹理');}
    catch(error){console.error(error);showToast('照片读取失败，请更换文件');}finally{setTimeout(()=>focusMirror.classList.remove('scanning'),2600);}
  }

  async function rescanCurrent() {
    const mirror=state.current;if(!mirror?.originalPhotos?.length){showToast('请先上传一张照片，再选择记忆状态');return;}
    focusMirror.classList.remove('scanning');void focusMirror.offsetWidth;focusMirror.classList.add('scanning');$('scan-status').textContent='RE-SCANNING';
    try{mirror.photos=await Promise.all(mirror.originalPhotos.map(src=>processPhoto(src,mirror.scanStyle)));state.photoIndex=0;updateMemoryImage();showToast('记忆质感已重新生成');}finally{setTimeout(()=>focusMirror.classList.remove('scanning'),2600);}
  }

  function syncEditor(){if(!state.current)return;state.current.title=$('memory-title').value.trim()||'未命名记忆';state.current.date=$('memory-date').value;state.current.description=$('memory-description').value.trim();$('memory-caption-title').textContent=state.current.title;$('memory-caption-date').textContent=state.current.date;}

  function openDatabase(){if(!('indexedDB'in window))return Promise.resolve(null);return new Promise(resolve=>{const request=indexedDB.open('jingmai-world',3);request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains('mirrors'))request.result.createObjectStore('mirrors',{keyPath:'id'});if(!request.result.objectStoreNames.contains('worlds'))request.result.createObjectStore('worlds',{keyPath:'id'});if(!request.result.objectStoreNames.contains('echoProjects'))request.result.createObjectStore('echoProjects',{keyPath:'id'});if(!request.result.objectStoreNames.contains('echoAssets'))request.result.createObjectStore('echoAssets',{keyPath:'id'});};request.onsuccess=()=>{request.result.onversionchange=()=>request.result.close();resolve(request.result);};request.onerror=()=>resolve(null);});}
  function mirrorRecord(mirror){const record={};Object.entries(mirror).forEach(([key,value])=>{if(!key.startsWith('_'))record[key]=value;});return record;}
  function persistMirror(mirror){if(!state.db)return Promise.resolve();return new Promise(resolve=>{const tx=state.db.transaction('mirrors','readwrite');tx.objectStore('mirrors').put(mirrorRecord(mirror));tx.oncomplete=resolve;tx.onerror=resolve;});}
  function readPersistedMirrors(){if(!state.db)return Promise.resolve([]);return new Promise(resolve=>{const request=state.db.transaction('mirrors','readonly').objectStore('mirrors').getAll();request.onsuccess=()=>resolve(request.result||[]);request.onerror=()=>resolve([]);});}

function makeWorldRecord(){const previous=state.worlds.find(world=>world.id===state.currentWorldId);return{id:state.currentWorldId,name:state.currentWorldName,ownerRole:previous?worldRole(previous):(document.body.classList.contains('yinli-receiver-mode')?'receiver':'creator'),coverImage:previous?.coverImage||'',createdAt:previous?.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString(),mirrors:state.mirrors.map(mirrorRecord)};}
  function persistWorldRecord(record){if(!state.db)return Promise.resolve();return new Promise(resolve=>{const tx=state.db.transaction('worlds','readwrite');tx.objectStore('worlds').put(record);tx.oncomplete=resolve;tx.onerror=resolve;});}
  function deletePersistedWorld(world){if(!state.db)return Promise.resolve(false);const remaining=new Set(state.worlds.filter(item=>item.id!==world.id).flatMap(item=>(item.mirrors||[]).map(mirror=>mirror.id)));const orphanIds=(world.mirrors||[]).map(mirror=>mirror.id).filter(id=>id&&!remaining.has(id));return new Promise(resolve=>{try{const tx=state.db.transaction(['worlds','mirrors'],'readwrite');tx.objectStore('worlds').delete(world.id);for(const id of orphanIds)tx.objectStore('mirrors').delete(id);tx.oncomplete=()=>resolve(true);tx.onerror=()=>resolve(false);tx.onabort=()=>resolve(false);}catch{resolve(false);}});}
  function readPersistedWorlds(){if(!state.db||!state.db.objectStoreNames.contains('worlds'))return Promise.resolve([]);return new Promise(resolve=>{const request=state.db.transaction('worlds','readonly').objectStore('worlds').getAll();request.onsuccess=()=>resolve(request.result||[]);request.onerror=()=>resolve([]);});}
  function captureWorldCover(){const scene=getCompositeCanvas();if(!scene)return '';const cover=document.createElement('canvas'),scale=Math.min(1,640/scene.width);cover.width=Math.max(1,Math.round(scene.width*scale));cover.height=Math.max(1,Math.round(scene.height*scale));cover.getContext('2d').drawImage(scene,0,0,cover.width,cover.height);try{return cover.toDataURL('image/jpeg',.78);}catch{return '';}}
  async function saveWorld(quiet=false,capture=false){const record=makeWorldRecord(),index=state.worlds.findIndex(world=>world.id===record.id);if(!quiet||capture)record.coverImage=captureWorldCover()||record.coverImage;if(index>=0)state.worlds[index]=record;else state.worlds.push(record);await persistWorldRecord(record);localStorage.setItem('yingji-current-world',record.id);if(!quiet)showToast(`“${record.name}”已保存到我的世界记忆录`);return record;}
  function hydrateMirror(item){const seed=seedMirrors.find(entry=>entry.id===item.id);return{...item,capturePhoto:item.capturePhoto||seed?.capturePhoto,photos:[...(item.photos||[])]};}
  async function loadWorld(id){const world=state.worlds.find(item=>item.id===id);if(!world)return;retractDockedMemory(false);state.currentWorldId=world.id;state.currentWorldName=world.name;state.mirrors=(world.mirrors||[]).map(hydrateMirror);localStorage.setItem('yingji-current-world',id);renderWorld();}
  async function createBlankYinliWorld(name='新的音礼世界'){
    if(state.previewWorldBackup)restorePreviewWorld();
    if(state.mirrors.length||state.worlds.some(world=>world.id===state.currentWorldId))await saveWorld(true);
    retractDockedMemory(false);
    if (!memoryView.hidden) closeMemory();
    state.currentWorldId=worldUid();
    state.currentWorldName=String(name||'新的音礼世界').trim()||'新的音礼世界';
    state.mirrors=[];
    state.current=null;
    state.photoIndex=0;
    state.homeMusic=false;
    memoryAudio.pause();
    localStorage.setItem('yingji-current-world',state.currentWorldId);
    await saveWorld(true);
    $('archive-view').hidden=true;
    renderWorld();
    return state.currentWorldId;
  }
  function openNewWorldPanel(){$('world-name-input').value=state.language==='zh'?'我的音乐世界':'My Music World';$('world-name-panel').hidden=false;setTimeout(()=>$('world-name-input').select(),30);}
  async function confirmNewWorld(){const name=$('world-name-input').value.trim()||(state.language==='zh'?'未命名世界':'Untitled World');await saveWorld(true);state.currentWorldId=worldUid();state.currentWorldName=name;state.mirrors=[];state.current=null;localStorage.setItem('yingji-current-world',state.currentWorldId);$('world-name-panel').hidden=true;await saveWorld(true);$('archive-view').hidden=true;renderWorld();showToast(`“${name}”已经展开，开始悬挂第一段记忆吧`);}

  async function saveMemory(){if(!state.current)return;syncEditor();state.current.saved=true;await persistMirror(state.current);await saveWorld(true);state.treePulseAt=performance.now();renderWorld();closeMemory();document.body.classList.add('tree-growing');setTimeout(()=>document.body.classList.remove('tree-growing'),1800);showToast('新的枝条正在生长');}

  async function attachEchoProject(project){
    const mirror=state.mirrors.find(item=>item.id===project.mirrorId)||state.current;if(!mirror)return null;
    mirror.echoProjectId=project.id;mirror.echoStatus=project.status;mirror.mode='echo';mirror.title=project.title||mirror.title;mirror.description=project.description||mirror.description;mirror.saved=true;
    project.mirrorId=mirror.id;await persistMirror(mirror);await saveWorld(true);state.treePulseAt=performance.now();renderWorld();
    return mirror.id;
  }

  async function attachYinliProject(project){
    const mirror=state.mirrors.find(item=>item.id===project.mirrorId)||state.current;if(!mirror)return null;
    mirror.yinliProjectId=project.id;mirror.yinliStatus=project.status;mirror.recipient=project.recipient;mirror.mode='yinli';mirror.title=project.title||mirror.title;mirror.description=project.description||mirror.description;mirror.saved=true;
    project.mirrorId=mirror.id;await persistMirror(mirror);state.treePulseAt=performance.now();renderWorld();await new Promise(requestAnimationFrame);await saveWorld(true,true);return mirror.id;
  }

  async function importYinliGift(project){
    if(state.previewWorldBackup){
      state.previewWorldBackup=null;
      state.currentWorldId=worldUid();
      state.currentWorldName=project.title||'收到的音礼';
      state.mirrors=[];
      state.current=null;
    }
    const index=state.mirrors.length,angle=index*1.37;
    const mirror={id:uid(),x:.5+Math.sin(angle)*.26,y:.36+Math.cos(angle)*.15,anchorX:.5+Math.sin(angle)*.26,anchorY:.22+Math.cos(angle)*.12,hang:.14,rotation:0,size:.96,title:project.title||'收到的音礼',date:new Date().toISOString().slice(0,10),description:project.description||'一份被保存到世界树的音礼。',photos:project.coverData?[project.coverData]:[],scanStyle:'faded',saved:true,mode:'yinli',yinliProjectId:project.id,yinliStatus:'received',recipient:project.recipient};
    state.mirrors.push(mirror);await persistMirror(mirror);renderWorld();await new Promise(requestAnimationFrame);await saveWorld(true,true);return mirror.id;
  }
  function previewYinliGift(project){
    if(state.previewWorldBackup)restorePreviewWorld();
    state.previewWorldBackup={id:state.currentWorldId,name:state.currentWorldName,mirrors:state.mirrors,current:state.current};
    state.currentWorldId=`preview-${project.id}`;
    state.currentWorldName=project.title||'收到的音礼';
    state.mirrors=[{id:`preview-mirror-${project.id}`,x:.43,y:.37,anchorX:.43,anchorY:.23,hang:.14,rotation:0,size:1,title:project.title||'收到的音礼',date:new Date().toISOString().slice(0,10),description:project.description||'',photos:project.coverData?[project.coverData]:[],saved:true,mode:'yinli',yinliProjectId:project.id,yinliStatus:'received',recipient:project.recipient}];
    state.current=null;renderWorld();
  }
  function restorePreviewWorld(){
    const backup=state.previewWorldBackup;if(!backup)return;
    state.currentWorldId=backup.id;state.currentWorldName=backup.name;state.mirrors=backup.mirrors;state.current=backup.current;state.previewWorldBackup=null;renderWorld();
  }

  function exportWorld(){const payload={project:'镜·脉 / 世界树',version:1,savedAt:new Date().toISOString(),mirrors:state.mirrors.map(item=>{const mirror=mirrorRecord(item);delete mirror.audioBlob;delete mirror.originalPhotos;mirror.audioName=mirror.audioName||mirror.musicName||'';return mirror;})};const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=`${safeName('镜脉-我的世界树')}-${new Date().toISOString().slice(0,10)}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);showToast('你的世界树已保存');}

  function ensureAudioContext(){if(state.audioContext){if(state.audioContext.state==='suspended')state.audioContext.resume();return state.audioContext;}const AudioCtx=window.AudioContext||window.webkitAudioContext;if(!AudioCtx)return null;const ctx=new AudioCtx();const analyser=ctx.createAnalyser();analyser.fftSize=256;analyser.smoothingTimeConstant=.82;const source=ctx.createMediaElementSource(memoryAudio);source.connect(analyser);analyser.connect(ctx.destination);state.audioContext=ctx;state.analyser=analyser;state.frequencyData=new Uint8Array(analyser.frequencyBinCount);return ctx;}

  function isCreatorExperience(){return document.body.classList.contains('yinli-creator-mode');}
  function isViewerExperience(){return document.body.classList.contains('yinli-receiver-mode');}
  function startAmbientWind(){if(isCreatorExperience())return;if(state.ambientStarted){state.ambientGain?.gain.setTargetAtTime(.013,state.audioContext.currentTime,.08);updateWeatherAudio();return;}const ctx=ensureAudioContext();if(!ctx)return;const length=ctx.sampleRate*3;const buffer=ctx.createBuffer(1,length,ctx.sampleRate);const channel=buffer.getChannelData(0);let last=0;for(let i=0;i<length;i+=1){const white=Math.random()*2-1;last=last*.985+white*.015;channel[i]=last*.9;}const source=ctx.createBufferSource();const filter=ctx.createBiquadFilter();const gain=ctx.createGain();filter.type='bandpass';filter.frequency.value=520;filter.Q.value=.34;gain.gain.value=.013;source.buffer=buffer;source.loop=true;source.connect(filter).connect(gain).connect(ctx.destination);source.start();state.ambientGain=gain;state.ambientStarted=true;scheduleWindChime();updateWeatherAudio();}

  function playWindChime(){if(isCreatorExperience())return;const ctx=ensureAudioContext();if(!ctx||!memoryAudio.paused)return;const base=[523.25,659.25,783.99,987.77][Math.floor(Math.random()*4)];[0,.11,.29].forEach((delay,index)=>{const oscillator=ctx.createOscillator();const gain=ctx.createGain();const filter=ctx.createBiquadFilter();oscillator.type='sine';oscillator.frequency.value=base*(index===2?1.5:index===1?1.25:1);filter.type='lowpass';filter.frequency.value=2400;gain.gain.setValueAtTime(.0001,ctx.currentTime+delay);gain.gain.exponentialRampToValueAtTime(.008/(index+1),ctx.currentTime+delay+.03);gain.gain.exponentialRampToValueAtTime(.0001,ctx.currentTime+delay+3.2);oscillator.connect(filter).connect(gain).connect(ctx.destination);oscillator.start(ctx.currentTime+delay);oscillator.stop(ctx.currentTime+delay+3.3);});}
  function scheduleWindChime(){setTimeout(()=>{if(state.ambientStarted)playWindChime();scheduleWindChime();},1700+Math.random()*2700);}

  function playChime(force=false){if(isCreatorExperience())return;const now=performance.now();if(!force&&now-state.chimeAt<650)return;state.chimeAt=now;const ctx=ensureAudioContext();if(!ctx)return;[0,.07,.14].forEach((delay,index)=>{const oscillator=ctx.createOscillator();const gain=ctx.createGain();oscillator.type='sine';oscillator.frequency.value=[740,1110,1480][index]*(.96+Math.random()*.08);gain.gain.setValueAtTime(.0001,ctx.currentTime+delay);gain.gain.exponentialRampToValueAtTime(.025/(index+1),ctx.currentTime+delay+.025);gain.gain.exponentialRampToValueAtTime(.0001,ctx.currentTime+delay+1.8);oscillator.connect(gain).connect(ctx.destination);oscillator.start(ctx.currentTime+delay);oscillator.stop(ctx.currentTime+delay+1.9);});}

  async function toggleMemoryAudio(){if(!state.current||(!state.current.musicSrc&&!state.current.audioBlob)){showToast('请先为这段记忆添加音乐');return;}ensureAudioContext();if(memoryAudio.paused){try{await memoryAudio.play();}catch{showToast('音乐暂时无法播放');}}else memoryAudio.pause();}

  async function prepareParticles(src){if(!src||src===state.particleImage)return;state.particleImage=src;try{const image=await loadImage(src);const canvas=document.createElement('canvas');const width=96,height=Math.max(112,Math.round(width*image.naturalHeight/image.naturalWidth));canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0,width,height);const pixels=ctx.getImageData(0,0,width,height).data;const particles=[];for(let y=1;y<height;y+=3){for(let x=1;x<width;x+=3){const i=(y*width+x)*4;if(pixels[i+3]<25)continue;const luminance=(pixels[i]+pixels[i+1]+pixels[i+2])/3;if(luminance<12&&Math.random()>.2)continue;particles.push({x:x/width,y:y/height,r:pixels[i],g:pixels[i+1],b:pixels[i+2],seed:Math.random()*Math.PI*2,size:.55+Math.random()*1.25});}}state.particleSource=particles;}catch{state.particleSource=Array.from({length:800},(_,i)=>({x:(i%32)/31,y:Math.floor(i/32)/24,r:205,g:209,b:205,seed:Math.random()*6.28,size:.6+Math.random()}));}}

  function resizeCanvas(canvas,ctx){const rect=canvas.getBoundingClientRect();const dpr=Math.min(window.devicePixelRatio||1,2);const width=Math.max(1,Math.round(rect.width*dpr)),height=Math.max(1,Math.round(rect.height*dpr));if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;ctx.setTransform(dpr,0,0,dpr,0,0);}return rect;}

  const treeCurves = [
    [[.505,1.05],[.475,.88],[.535,.69],[.50,.49],.030,0],
    [[.50,.60],[.43,.50],[.31,.44],[.18,.31],.013,1],
    [[.49,.55],[.40,.40],[.34,.29],[.27,.15],.011,1],
    [[.50,.50],[.55,.38],[.60,.25],[.61,.10],.012,1],
    [[.51,.63],[.62,.54],[.72,.46],[.84,.34],.014,1],
    [[.50,.70],[.39,.66],[.28,.61],[.14,.54],.012,1],
    [[.50,.49],[.44,.34],[.46,.22],[.43,.08],.009,2],
    [[.42,.43],[.34,.39],[.27,.33],[.21,.24],.007,2],
    [[.35,.37],[.27,.34],[.19,.34],[.11,.29],.005,3],
    [[.34,.30],[.30,.22],[.31,.14],[.25,.08],.004,3],
    [[.55,.39],[.65,.32],[.73,.27],[.82,.18],.008,2],
    [[.62,.51],[.71,.50],[.80,.48],[.91,.41],.007,2],
    [[.66,.47],[.70,.39],[.75,.34],[.77,.25],.005,3],
    [[.72,.45],[.80,.43],[.88,.45],[.95,.40],.004,3],
    [[.39,.62],[.31,.57],[.23,.53],[.16,.45],.006,2],
    [[.56,.68],[.65,.64],[.75,.61],[.86,.54],.007,2],
    [[.48,.79],[.42,.74],[.35,.71],[.26,.66],.006,2],
    [[.52,.78],[.60,.75],[.69,.71],[.78,.65],.006,2]
  ];

  function seededRandom(seed) {
    let value = seed >>> 0;
    return () => ((value = Math.imul(1664525, value) + 1013904223 >>> 0) / 4294967296);
  }

  function cubicPoint(curve, t) {
    const [p0,p1,p2,p3] = curve;
    const u=1-t, a=u*u*u, b=3*u*u*t, c=3*u*t*t, d=t*t*t;
    return {x:a*p0[0]+b*p1[0]+c*p2[0]+d*p3[0], y:a*p0[1]+b*p1[1]+c*p2[1]+d*p3[1]};
  }

  function buildTreeParticles() {
    const random=seededRandom(731947);
    state.treeParticles=[];
    treeCurves.forEach((curve,branchIndex)=>{
      const width=curve[4], depth=curve[5];
      const count=Math.round(150 + width*23500);
      for(let i=0;i<count;i+=1){
        const t=Math.pow(random(), depth ? .88 : 1.15);
        const p=cubicPoint(curve,t);
        const before=cubicPoint(curve,Math.max(0,t-.012));
        const after=cubicPoint(curve,Math.min(1,t+.012));
        const dx=after.x-before.x,dy=after.y-before.y,length=Math.hypot(dx,dy)||1;
        const spread=width*(1-t*.66)*(random()-.5)*1.7;
        const nx=-dy/length,ny=dx/length;
        const warm=random()>.91;
        state.treeParticles.push({x:p.x+nx*spread,y:p.y+ny*spread,z:((branchIndex%5)-2)*.095+(random()-.5)*.16,t,depth,branchIndex,seed:random()*6.28,size:.35+random()*1.15,color:warm?'warm':random()>.63?'blue':'white'});
      }
    });
    state.canopyParticles=Array.from({length:1150},()=>{
      const angle=random()*Math.PI*2;
      const radius=Math.pow(random(),.62);
      return {x:.5+Math.cos(angle)*radius*(.42+random()*.06),y:.33+Math.sin(angle)*radius*(.22+random()*.08),z:(random()-.5)*1.05,seed:random()*6.28,size:.25+random()*1.15,color:random()>.9?'warm':random()>.58?'blue':'white'};
    }).filter(p=>p.y>.06&&p.y<.68&&p.x>.06&&p.x<.94);
  }

  function projectScene(x,y,z=0) {
    const cosY=Math.cos(state.sceneYaw),sinY=Math.sin(state.sceneYaw);
    const cosP=Math.cos(state.scenePitch),sinP=Math.sin(state.scenePitch);
    const px=x-.5,py=y-.62;
    const rx=px*cosY+z*sinY;
    const rz=-px*sinY+z*cosY;
    const ry=py*cosP-rz*sinP;
    const depth=py*sinP+rz*cosP;
    const scale=clamp(1/(1+depth*.55),.58,1.72);
    return {x:.5+rx*scale,y:.62+ry*scale,scale,depth};
  }

  function updateHangingMirrors(time, step=1) {
    state.mirrors.forEach((mirror,index)=>{
      if(!mirror._node||!mirror._line)return;
      const proximity=clamp(1-Math.hypot(state.pointerX-mirror.anchorX,state.pointerY-mirror.anchorY)/.34,0,1);
      const windForce=state.baseWind;
      const wind=Math.sin(time*(.00048+windForce*.00034)+index*1.73)*(.00012+windForce*.0005)+(state.pointerX-.5)*.00042*proximity;
      mirror._velocity+=(-mirror._angle*.006+wind-mirror._velocity*.045)*step;
      mirror._angle=clamp(mirror._angle+mirror._velocity*step,-.18,.18);
      const threeAnchor=window.WorldTree3D?.projectAnchor?.(mirror.treeAnchor ?? index);
      const sourceX=threeAnchor?.visible?threeAnchor.x:mirror.anchorX;
      const sourceY=threeAnchor?.visible?threeAnchor.y:mirror.anchorY;
      const hang=window.WorldTree3D?.active ? .085 : mirror.hang;
      const endX=sourceX+Math.sin(mirror._angle)*hang;
      const endY=sourceY+Math.cos(mirror._angle)*hang;
      mirror.x=endX;mirror.y=endY;
      const anchor=threeAnchor?.visible?{...threeAnchor,scale:clamp(1.15-threeAnchor.depth*.35,.72,1.14)}:projectScene(mirror.anchorX,mirror.anchorY,mirror.depth||0);
      const end=threeAnchor?.visible?{x:endX,y:endY,depth:threeAnchor.depth,scale:anchor.scale}:projectScene(endX,endY,mirror.depth||0);
      mirror._node.style.left=`${end.x*100}%`;
      mirror._node.style.top=`${end.y*100}%`;
      mirror._node.style.scale=(mirror.size||1)*end.scale;
      mirror._node.style.zIndex=String(Math.round(20-end.depth*10));
      mirror._node.style.transform=`translate(-50%,-50%) rotate(${(mirror.rotation||0)+mirror._angle*57.3}deg)`;
      const viewport=worldCamera.getBoundingClientRect();mirror._captureAnchor={x:viewport.left+anchor.x*viewport.width,y:viewport.top+anchor.y*viewport.height};
      const ax=anchor.x*1600,ay=anchor.y*1000,ex=end.x*1600,ey=(end.y-.045*end.scale)*1000;
      mirror._line.setAttribute('d',`M ${ax} ${ay} Q ${(ax+ex)/2+Math.sin(time*.0008+index)*5} ${(ay+ey)/2} ${ex} ${ey}`);
    });
  }

  function drawGrowthBranch(ctx, rect, mirror, time, energy) {
    const side=mirror.anchorX<.5?-1:1;
    const start={x:.5,y:.62};
    const control={x:.5+side*Math.abs(mirror.anchorX-.5)*.45,y:(.62+mirror.anchorY)/2+.03};
    const end={x:mirror.anchorX,y:mirror.anchorY};
    const count=90;
    for(let i=0;i<count;i+=1){
      const t=i/(count-1),u=1-t;
      const rawX=u*u*start.x+2*u*t*control.x+t*t*end.x;
      const rawY=u*u*start.y+2*u*t*control.y+t*t*end.y;
      const projected=projectScene(rawX,rawY,(mirror.depth||0)*t);
      const x=projected.x*rect.width,y=projected.y*rect.height;
      const pulse=Math.max(0,1-Math.abs(((time*.00012+i*.007)%1)-t)*16);
      ctx.fillStyle=`rgba(${i%11===0?'229,196,139':'190,211,219'},${.08+pulse*(.24+energy*.24)})`;
      ctx.beginPath();ctx.arc(x,y,.45+pulse*.8,0,Math.PI*2);ctx.fill();
    }
  }

  function animateWorldTree(time) {
    if(window.WorldTree3D?.active){
      const delta=state.lastTreeFrame?clamp((time-state.lastTreeFrame)/16.67,.3,2):1;
      state.lastTreeFrame=time;
      // 世界树只受天气与视角影响；音乐只驱动照片自身的粒子。
      window.WorldTree3D.setAudioLevel(0);
      window.WorldTree3D.setWindLevel(state.baseWind);
      updateHangingMirrors(time,delta);
      requestAnimationFrame(animateWorldTree);return;
    }
    const rect=resizeCanvas(treeCanvas,treeCtx);
    treeCtx.clearRect(0,0,rect.width,rect.height);
    const delta=state.lastTreeFrame?clamp((time-state.lastTreeFrame)/16.67,.3,2):1;
    state.lastTreeFrame=time;
    state.sceneYaw+=(state.targetYaw-state.sceneYaw)*.085;
    state.scenePitch+=(state.targetPitch-state.scenePitch)*.085;
    const pulseAge=time-state.treePulseAt;
    const growthEnergy=pulseAge>0&&pulseAge<2400?1-pulseAge/2400:0;
    const musicEnergy=0;
    const breath=.92+Math.sin(time*.00075)*.08;
    treeCtx.globalCompositeOperation='screen';
    state.mirrors.forEach(mirror=>drawGrowthBranch(treeCtx,rect,mirror,time,growthEnergy));
    state.treeParticles.forEach(p=>{
      const sway=(1-p.y)*Math.sin(time*.00048+p.seed+p.depth*.8)*(1.4+p.depth*.45);
      const flow=.5+.5*Math.sin(time*.0013-p.t*15+p.seed);
      const travelling=Math.max(0,1-Math.abs(((time*.000055+p.branchIndex*.071)%1)-p.t)*20);
      const projected=projectScene(p.x+sway/rect.width,p.y+Math.cos(time*.00042+p.seed)*(1-p.y)*.8/rect.height,p.z);
      const x=projected.x*rect.width,y=projected.y*rect.height;
      const color=p.color==='warm'?'230,198,145':p.color==='blue'?'166,205,222':'221,226,221';
      const alpha=(.16+flow*.17+travelling*.33+growthEnergy*travelling*.25+musicEnergy*.16)*breath*clamp(1.15-projected.depth*.22,.62,1.35);
      treeCtx.fillStyle=`rgba(${color},${alpha})`;
      treeCtx.beginPath();treeCtx.arc(x,y,(p.size+travelling*.65+musicEnergy*.45)*projected.scale,0,Math.PI*2);treeCtx.fill();
    });
    state.canopyParticles.forEach(p=>{
      const drift=Math.sin(time*.00035+p.seed)*3.2*(1-p.y);
      const flicker=.15+.22*(.5+.5*Math.sin(time*.0011+p.seed));
      const color=p.color==='warm'?'224,192,137':p.color==='blue'?'155,196,216':'218,224,221';
      const projected=projectScene(p.x+drift/rect.width,p.y+Math.cos(time*.00027+p.seed)*1.8/rect.height,p.z);
      treeCtx.fillStyle=`rgba(${color},${(flicker+musicEnergy*.12)*clamp(1.1-projected.depth*.2,.5,1.3)})`;
      treeCtx.beginPath();treeCtx.arc(projected.x*rect.width,projected.y*rect.height,p.size*projected.scale,0,Math.PI*2);treeCtx.fill();
    });
    treeCtx.globalCompositeOperation='source-over';
    updateHangingMirrors(time,delta);
    requestAnimationFrame(animateWorldTree);
  }

  function animateMemoryParticles(time) {
    const rect=resizeCanvas(particleCanvas,particleCtx);
    particleCtx.clearRect(0,0,rect.width,rect.height);
    if(!memoryView.hidden&&state.particleSource.length){
      let bass=.06,mid=.04,high=.03;
      if(!memoryAudio.paused&&state.analyser){
        state.analyser.getByteFrequencyData(state.frequencyData);
        const average=(from,to)=>{let total=0;for(let i=from;i<to;i+=1)total+=state.frequencyData[i]||0;return total/Math.max(1,to-from)/255;};
        bass=average(0,12);mid=average(12,46);high=average(46,96);
      }
      const playing=!memoryAudio.paused;
      const response=state.particleResponse*(playing?1:.12);
      const count=Math.max(1,Math.floor(state.particleSource.length*state.particleDensity));
      const stride=state.particleSource.length/count;
      particleCtx.globalCompositeOperation='screen';
      for(let drawIndex=0;drawIndex<count;drawIndex+=1){
        const index=Math.min(state.particleSource.length-1,Math.floor(drawIndex*stride));
        const particle=state.particleSource[index];
        const baseX=particle.x*rect.width,baseY=particle.y*rect.height;
        const cx=rect.width*.5,cy=rect.height*.5;
        let x=baseX,y=baseY;
        const wave=Math.sin(time*.0021+particle.seed+particle.y*8);
        const flutter=Math.cos(time*.0015+particle.seed*1.7+particle.x*11);
        if(state.particleMode==='terrain'){
          x+=wave*bass*42*response+flutter*high*18*response;
          y+=flutter*mid*32*response+Math.sin(time*.001+index*.014)*high*15*response;
        }else if(state.particleMode==='orb'){
          const dx=baseX-cx,dy=baseY-cy;
          const radius=Math.hypot(dx,dy)*(1+bass*.24*response);
          const angle=Math.atan2(dy,dx)+wave*(.08+high*.22)*response;
          x=cx+Math.cos(angle)*radius;y=cy+Math.sin(angle)*radius;
        }else if(state.particleMode==='veil'){
          x+=Math.sin(particle.y*17+time*.0018+particle.seed)*mid*58*response;
          y+=Math.cos(particle.x*10+time*.0011)*bass*25*response;
        }else if(state.particleMode==='breath'){
          const scale=1+Math.sin(time*.002+particle.seed*.08)*bass*.3*response;
          x=cx+(baseX-cx)*scale;y=cy+(baseY-cy)*scale;
        }else if(state.particleMode==='spectrum'){
          const band=Math.min((state.frequencyData?.length||1)-1,Math.floor(particle.x*(state.frequencyData?.length||1)));
          const amplitude=playing?(state.frequencyData?.[band]||0)/255:(.04+.03*wave);
          x=Math.round(baseX/8)*8+wave*1.4;
          y=baseY-amplitude*(42+70*(1-particle.y))*response;
        }
        const alpha=playing?.36+(bass+mid)*.34:.12;
        particleCtx.fillStyle=`rgba(${particle.r},${particle.g},${particle.b},${alpha})`;
        particleCtx.beginPath();particleCtx.arc(x,y,particle.size+(playing?bass*1.6:0),0,Math.PI*2);particleCtx.fill();
      }
      particleCtx.globalCompositeOperation='source-over';
    }
    requestAnimationFrame(animateMemoryParticles);
  }

  const wind={stars:[],motes:[],rain:[],snow:[]};
  function resetWind(){resizeCanvas(windCanvas,windCtx);const rect=windCanvas.getBoundingClientRect();wind.stars=Array.from({length:Math.round(rect.width*rect.height/5200)},()=>({x:Math.random()*rect.width,y:Math.random()*rect.height,r:.25+Math.random()*.8,a:.08+Math.random()*.35,p:Math.random()*6.28}));wind.motes=Array.from({length:90},()=>({x:Math.random()*rect.width,y:Math.random()*rect.height,vx:.1+Math.random()*.3,vy:-.03+Math.random()*.06,len:16+Math.random()*48,a:.025+Math.random()*.065}));wind.rain=Array.from({length:150},()=>({x:Math.random()*rect.width,y:Math.random()*rect.height,len:8+Math.random()*15,speed:2+Math.random()*3}));wind.snow=Array.from({length:140},()=>({x:Math.random()*rect.width,y:Math.random()*rect.height,r:.5+Math.random()*1.5,speed:.25+Math.random()*.7,p:Math.random()*6.28}));}
  function resetEnvironment(){resizeCanvas(environmentCanvas,environmentCtx);const rect=environmentCanvas.getBoundingClientRect();state.environmentParticles=Array.from({length:210},()=>({x:.15+Math.random()*.7,y:.74+Math.random()*.2,r:.35+Math.random()*1.25,p:Math.random()*6.28}));state.wildlife={ground:[],sky:[],nextGround:performance.now()+2500+Math.random()*5000,nextSky:performance.now()+4000+Math.random()*7000};}
  // 狐狸/绵羊与候鸟分别按随机间隔出现，每次数量、队列和速度都不同。
  function drawWildlife(ctx,time,width,base,ink){
    const life=state.wildlife;if(!life)return;
    if(time>life.nextGround){const count=2+Math.floor(Math.random()*4),fox=Math.random()>.55,speed=.018+Math.random()*.014;life.ground.push({born:time,count,fox,speed,offset:Math.random()*20});life.nextGround=time+13500+Math.random()*19000;}
    if(time>life.nextSky){life.sky.push({born:time,count:3+Math.floor(Math.random()*6),speed:.035+Math.random()*.025,height:.18+Math.random()*.16,direction:Math.random()>.5?1:-1});life.nextSky=time+11000+Math.random()*18000;}
    ctx.save();ctx.strokeStyle=`rgba(${ink},.5)`;ctx.fillStyle=`rgba(${ink},.3)`;ctx.lineWidth=1;
    life.ground=life.ground.filter(group=>time-group.born<(width+240)/group.speed);
    for(const group of life.ground)for(let i=0;i<group.count;i++){
      const x=-45+(time-group.born)*group.speed-i*(34+group.offset),y=base-9+(i%2)*5,step=Math.sin(time*.008+i)*3;
      if(x<-40||x>width+40)continue;
      ctx.save();ctx.translate(x,y);ctx.scale(.82+(i%3)*.12,.82+(i%3)*.12);
      ctx.beginPath();ctx.ellipse(0,0,group.fox?13:12,group.fox?5:7,0,0,Math.PI*2);ctx.stroke();
      if(group.fox){ctx.beginPath();ctx.moveTo(-11,0);ctx.quadraticCurveTo(-25,-10,-24,4);ctx.quadraticCurveTo(-17,7,-11,3);ctx.stroke();ctx.beginPath();ctx.moveTo(10,-2);ctx.lineTo(17,-9);ctx.lineTo(19,1);ctx.closePath();ctx.stroke();}
      else{ctx.beginPath();for(let k=0;k<5;k++){const a=k*Math.PI/4;ctx.arc(-7+k*4,-5-Math.sin(a)*2,3,Math.PI,0);}ctx.stroke();ctx.beginPath();ctx.ellipse(15,-2,5,4,0,0,Math.PI*2);ctx.stroke();}
      ctx.beginPath();ctx.moveTo(-7,5);ctx.lineTo(-9+step,12);ctx.moveTo(7,5);ctx.lineTo(9-step,12);ctx.stroke();ctx.restore();
    }
    life.sky=life.sky.filter(group=>time-group.born<(width+300)/group.speed);
    for(const group of life.sky)for(let i=0;i<group.count;i++){
      const row=Math.floor((i+1)/2),side=i%2?1:-1;
      const travel=-90+(time-group.born)*group.speed-row*24;
      const x=group.direction===1?travel:width-travel,y=group.height*environmentCanvas.clientHeight+side*row*13+Math.sin(time*.004+i)*3;
      if(x<-25||x>width+25)continue;
      ctx.beginPath();ctx.moveTo(x-8,y-3);ctx.quadraticCurveTo(x-3,y-7,x,y);ctx.quadraticCurveTo(x+4,y-7,x+9,y-3);ctx.stroke();
    }
    ctx.restore();
  }
  function stopWeatherAudio(){clearInterval(state.weatherTimer);state.weatherTimer=null;if(state.weatherAudio){try{state.weatherAudio.source.stop();}catch{}state.weatherAudio.gain.gain.setTargetAtTime(.0001,state.audioContext?.currentTime||0,.06);state.weatherAudio=null;}}
  function updateWeatherAudio(){
    stopWeatherAudio();if(!state.ambientStarted||isCreatorExperience())return;const type=weatherModes[state.weatherIndex].type;if(type!=='rain'&&type!=='snow')return;const ctx=ensureAudioContext();if(!ctx)return;
    const length=ctx.sampleRate*2,buffer=ctx.createBuffer(1,length,ctx.sampleRate),data=buffer.getChannelData(0);let low=0;for(let i=0;i<length;i+=1){const white=Math.random()*2-1;low=low*.92+white*.08;data[i]=type==='rain'?(white*.42+low*.58):low*.38;}
    const source=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),gain=ctx.createGain();source.buffer=buffer;source.loop=true;filter.type=type==='rain'?'bandpass':'highpass';filter.frequency.value=type==='rain'?1280:3600;filter.Q.value=type==='rain'?.42:.15;gain.gain.value=type==='rain'?.022:.006;source.connect(filter).connect(gain).connect(ctx.destination);source.start();state.weatherAudio={source,gain};
    if(type==='snow')state.weatherTimer=setInterval(()=>{const osc=ctx.createOscillator(),g=ctx.createGain();osc.frequency.value=1450+Math.random()*1700;g.gain.setValueAtTime(.0001,ctx.currentTime);g.gain.exponentialRampToValueAtTime(.003,ctx.currentTime+.01);g.gain.exponentialRampToValueAtTime(.0001,ctx.currentTime+.28);osc.connect(g).connect(ctx.destination);osc.start();osc.stop(ctx.currentTime+.3);},900+Math.random()*700);
  }
  function animateEnvironment(time){
    const rect=resizeCanvas(environmentCanvas,environmentCtx),ctx=environmentCtx;ctx.clearRect(0,0,rect.width,rect.height);const type=weatherModes[state.weatherIndex].type,night=state.theme==='night',ink=night?'215,229,233':'45,57,58',base=rect.height*.78;
    ctx.save();ctx.lineWidth=1.05;ctx.strokeStyle=`rgba(${ink},${type==='clear'?.34:.46})`;ctx.fillStyle=`rgba(${ink},.3)`;
    // 所有天气共用轻量粒子地面，移除旧的密集波线与交叉山脊。
    ctx.globalAlpha=1;state.environmentParticles.forEach((p,i)=>{const drift=type==='wind'?Math.sin(time*.0015+p.p)*8:Math.sin(time*.0005+p.p)*2;ctx.fillStyle=`rgba(${ink},${.14+.18*(.5+.5*Math.sin(time*.001+p.p))})`;ctx.beginPath();ctx.arc(p.x*rect.width+drift,p.y*rect.height,p.r,0,Math.PI*2);ctx.fill();});
    drawWildlife(ctx,time,rect.width,base,ink);
    ctx.restore();requestAnimationFrame(animateEnvironment);
  }
  function animateWind(time){
    const rect=resizeCanvas(windCanvas,windCtx);windCtx.clearRect(0,0,rect.width,rect.height);
    const night=state.theme==='night',force=state.baseWind,color=night?'205,222,229':'75,93,97';
    if(night)wind.stars.forEach(star=>{windCtx.fillStyle=`rgba(226,232,234,${star.a*(.7+.3*Math.sin(time*.0007+star.p))})`;windCtx.beginPath();windCtx.arc(star.x,star.y,star.r,0,Math.PI*2);windCtx.fill();});
    wind.motes.forEach(mote=>{mote.x+=mote.vx*(.6+force*3)+Math.sin(time*.00035+mote.y*.008)*(.08+force*.22);mote.y+=mote.vy;if(mote.x>rect.width+70){mote.x=-70;mote.y=Math.random()*rect.height;}const length=mote.len*(.6+force*1.8);const gradient=windCtx.createLinearGradient(mote.x,mote.y,mote.x+length,mote.y-3);gradient.addColorStop(0,`rgba(${color},0)`);gradient.addColorStop(.62,`rgba(${color},${mote.a*(.5+force)})`);gradient.addColorStop(1,`rgba(${color},0)`);windCtx.strokeStyle=gradient;windCtx.lineWidth=.55;windCtx.beginPath();windCtx.moveTo(mote.x,mote.y);windCtx.quadraticCurveTo(mote.x+length*.5,mote.y+Math.sin(time*.001+mote.x)*3,mote.x+length,mote.y-3);windCtx.stroke();});
    if(weatherModes[state.weatherIndex].type==='rain')wind.rain.forEach(drop=>{drop.x+=force*1.2;drop.y+=drop.speed;if(drop.y>rect.height+20){drop.y=-20;drop.x=Math.random()*rect.width;}windCtx.strokeStyle=`rgba(${color},${night?.16:.1})`;windCtx.beginPath();windCtx.moveTo(drop.x,drop.y);windCtx.lineTo(drop.x+force*5,drop.y+drop.len);windCtx.stroke();});
    if(weatherModes[state.weatherIndex].type==='snow')wind.snow.forEach(flake=>{flake.x+=Math.sin(time*.001+flake.p)*.3+force*.16;flake.y+=flake.speed;if(flake.y>rect.height+5){flake.y=-5;flake.x=Math.random()*rect.width;}windCtx.fillStyle=`rgba(${color},${night?.48:.34})`;windCtx.beginPath();windCtx.arc(flake.x,flake.y,flake.r,0,Math.PI*2);windCtx.fill();});
    requestAnimationFrame(animateWind);
  }

  function handleAction(action){
    if(!isCreatorExperience()&&['plant','new-world','save-world','save-memory','rescan','close-editor','play-memory'].includes(action))return;
    if(action==='home'){state.zoom=1;state.targetYaw=0;state.targetPitch=0;updateCamera();}
if(action==='archive'){state.archiveRole=document.body.classList.contains('yinli-receiver-mode')?'receiver':'creator';$('archive-view').hidden=false;renderWorldGallery();if(!state.previewWorldBackup&&(state.mirrors.length||state.worlds.some(world=>world.id===state.currentWorldId)))saveWorld(true,!state.worlds.find(world=>world.id===state.currentWorldId)?.coverImage).then(()=>renderWorldGallery());}
    if(action==='close-archive')$('archive-view').hidden=true;
    if(action==='plant')beginPlacement();if(action==='cancel-place')cancelPlacement();if(action==='back-world')closeMemory();
    if(action==='close-editor')$('memory-editor').classList.toggle('collapsed');
    if(action==='rescan')rescanCurrent();if(action==='save-memory')saveMemory();
    if(action==='theme'){state.theme=state.theme==='day'?'night':'day';applyTheme();}
    if(action==='language'){state.language=state.language==='zh'?'en':'zh';localStorage.setItem('yingji-language',state.language);applyLanguage();}
    if(action==='weather'){state.weatherIndex=(state.weatherIndex+1)%weatherModes.length;updateWeatherLabel();}
    if(action==='toggle-docked')toggleDockedMemory();if(action==='retract-memory')retractDockedMemory();
    if(action==='new-world')openNewWorldPanel();if(action==='save-world')saveWorld();if(action==='close-world-panel')$('world-name-panel').hidden=true;if(action==='confirm-new-world')confirmNewWorld();
    if(action==='tutorial')$('tutorial-panel').hidden=false;if(action==='close-tutorial')$('tutorial-panel').hidden=true;
    if(action==='camera-panel'&&!isCreatorExperience())$('capture-panel').hidden=false;if(action==='close-camera-panel')$('capture-panel').hidden=true;
    if(action==='capture-png')captureScene('png');if(action==='capture-jpg')captureScene('jpg');if(action==='record-scene')toggleRecording();
    if(action==='fullscreen'){if(!document.fullscreenElement)document.documentElement.requestFullscreen?.();else document.exitFullscreen?.();}
    if(action==='viewer-fullscreen'){document.documentElement.requestFullscreen?.().catch(()=>showToast('浏览器未允许全屏，可以继续正常观看'));$('tutorial-panel').querySelector('[data-action="close-tutorial"]')?.click();}
    if(action==='viewer-exit'){if(document.fullscreenElement)document.exitFullscreen?.();else returnToLanding();}
    if(action==='return-landing')returnToLanding();
  }

  function returnToLanding(){if(!memoryView.hidden)closeMemory();$('archive-view').hidden=true;$('capture-panel').hidden=true;$('tutorial-panel').hidden=true;retractDockedMemory(false);memoryAudio.pause();if(state.ambientGain&&state.audioContext)state.ambientGain.gain.setTargetAtTime(.0001,state.audioContext.currentTime,.08);stopWeatherAudio();restorePreviewWorld();window.dispatchEvent(new Event('yinli-return-landing'));const entry=$('entry');entry.hidden=false;entry.classList.remove('leaving');entry.querySelector('.landing-scroll')?.scrollTo(0,0);if(document.fullscreenElement)document.exitFullscreen?.();}

  function bindEvents(){
    document.addEventListener('click',event=>{const action=event.target.closest('[data-action]')?.dataset.action;if(action)handleAction(action);});
    window.addEventListener('echo-playback',event=>{const detail=event.detail||{},duration=Math.max(.01,Number(detail.duration)||0),position=Number(detail.position)||0;$('world-player-progress').style.width=`${clamp(position/duration,0,1)*100}%`;$('world-player-time').textContent=`${String(Math.floor(position/60)||0).padStart(2,'0')}:${String(Math.floor(position%60)||0).padStart(2,'0')}`;$('world-player').classList.toggle('playing',Boolean(detail.playing));});
    $('enter-world').addEventListener('click',()=>{startAmbientWind();playChime(true);$('entry').classList.add('leaving');window.dispatchEvent(new Event('yinli-world-entered'));setTimeout(()=>{$('entry').hidden=true;},1250);});
    window.addEventListener('yinli-role-change',event=>{const receiver=event.detail?.role==='receiver';if(state.ambientGain&&state.audioContext)state.ambientGain.gain.setTargetAtTime(receiver ? .013 : .0001,state.audioContext.currentTime,.08);if(receiver)updateWeatherAudio();else stopWeatherAudio();renderWorld();});
    document.addEventListener('pointermove',event=>{state.pointerX=event.clientX/innerWidth;state.pointerY=event.clientY/innerHeight;document.documentElement.style.setProperty('--mx',`${event.clientX}px`);document.documentElement.style.setProperty('--my',`${event.clientY}px`);if(state.placing){worldCamera.style.setProperty('--px',`${event.clientX}px`);worldCamera.style.setProperty('--py',`${event.clientY}px`);}const editor=event.target.closest('.memory-editor');if(editor){const rect=editor.getBoundingClientRect();editor.style.setProperty('--glass-x',`${event.clientX-rect.left}px`);editor.style.setProperty('--glass-y',`${event.clientY-rect.top}px`);}});
    worldCamera.addEventListener('wheel',event=>{if(state.placing||window.WorldTree3D?.active)return;event.preventDefault();state.zoom=clamp(state.zoom*Math.exp(-event.deltaY*.0012),.58,2.65);updateCamera();},{passive:false});
    worldCamera.addEventListener('pointerdown',event=>{if(event.button!==0||event.target.closest('.memory-mirror,.yinli-media-item,button,input,textarea,select,label,#yinli-inspector,#yinli-timeline')||window.WorldTree3D?.active)return;state.moved=false;if(state.placing)return;state.dragging=true;state.dragStart={x:event.clientX,y:event.clientY,yaw:state.targetYaw,pitch:state.targetPitch};worldCamera.setPointerCapture(event.pointerId);worldCamera.classList.add('dragging');});
    worldCamera.addEventListener('pointermove',event=>{if(window.WorldTree3D?.active||!state.dragging||!state.dragStart)return;const dx=event.clientX-state.dragStart.x,dy=event.clientY-state.dragStart.y;if(Math.hypot(dx,dy)>4)state.moved=true;state.targetYaw=clamp(state.dragStart.yaw+dx*.0032,-.82,.82);state.targetPitch=clamp(state.dragStart.pitch-dy*.0018,-.2,.2);updateCamera();});
    const endDrag=event=>{if(!state.dragging)return;state.dragging=false;state.dragStart=null;worldCamera.classList.remove('dragging');try{worldCamera.releasePointerCapture(event.pointerId);}catch{}setTimeout(()=>{state.moved=false;},0);};
    worldCamera.addEventListener('pointerup',event=>{if(state.placing&&!event.target.closest('.ui-layer'))plantMirror(event.clientX,event.clientY);else endDrag(event);});worldCamera.addEventListener('pointercancel',endDrag);worldCamera.addEventListener('dblclick',()=>{if(window.WorldTree3D?.active)window.WorldTree3D.reset();else{state.zoom=1;state.targetYaw=0;state.targetPitch=0;updateCamera();}});
    $('photo-input').addEventListener('change',event=>{const files=[...event.target.files].filter(file=>file.type.startsWith('image/'));scanFiles(files);event.target.value='';});
    $('memory-audio-input').addEventListener('change',event=>{const file=event.target.files[0];if(!file||!state.current)return;if(state.audioUrl)URL.revokeObjectURL(state.audioUrl);state.current.audioBlob=file;state.current.audioName=file.name;state.current.musicName=file.name.replace(/\.[^.]+$/,'');state.current.musicSrc='';state.audioUrl=URL.createObjectURL(file);memoryAudio.src=state.audioUrl;$('audio-file-name').textContent=file.name;showToast('音乐已进入这面镜子');event.target.value='';});
    ['memory-title','memory-date','memory-description'].forEach(id=>$(id).addEventListener('input',syncEditor));
    $$('.memory-states button').forEach(button=>button.addEventListener('click',()=>{if(!state.current)return;state.current.scanStyle=button.dataset.scan;$$('.memory-states button').forEach(item=>item.classList.toggle('active',item===button));if(state.current.originalPhotos?.length)rescanCurrent();}));
    $$('.particle-modes button').forEach(button=>button.addEventListener('click',()=>{state.particleMode=button.dataset.particleMode;$$('.particle-modes button').forEach(item=>item.classList.toggle('active',item===button));}));
    $('particle-response').addEventListener('input',event=>{state.particleResponse=Number(event.target.value)/100;$('particle-response-value').textContent=`${event.target.value}%`;});
    $('particle-density').addEventListener('input',event=>{state.particleDensity=Number(event.target.value)/100;$('particle-density-value').textContent=`${event.target.value}%`;});
    $('photo-cycle').addEventListener('click',()=>{if(!state.current?.photos?.length)return;state.photoIndex=(state.photoIndex+1)%state.current.photos.length;updateMemoryImage();playChime();});
    focusMirror.addEventListener('click',event=>{if(isViewerExperience()||event.target.closest('button'))return;$('memory-editor').classList.remove('collapsed');});
    memoryAudio.addEventListener('play',()=>{if(!state.homeMusic)focusMirror.classList.add('playing');$('world-player').classList.toggle('playing',state.homeMusic);});const stopPlaying=()=>{focusMirror.classList.remove('playing');$('world-player').classList.remove('playing');};memoryAudio.addEventListener('pause',stopPlaying);memoryAudio.addEventListener('ended',()=>{if(state.dockedMirror){memoryAudio.currentTime=0;$('world-player').classList.remove('playing');}else state.homeMusic=false;stopPlaying();});
    memoryAudio.addEventListener('timeupdate',()=>{const ratio=memoryAudio.duration?memoryAudio.currentTime/memoryAudio.duration:0;$('world-player-progress').style.width=`${ratio*100}%`;const fmt=value=>`${String(Math.floor(value/60)||0).padStart(2,'0')}:${String(Math.floor(value%60)||0).padStart(2,'0')}`;$('world-player-time').textContent=fmt(memoryAudio.currentTime||0);});
    document.addEventListener('fullscreenchange',()=>document.body.classList.toggle('fullscreen-clean',Boolean(document.fullscreenElement)));window.addEventListener('resize',()=>{resetWind();resetEnvironment();});
    window.addEventListener('keydown',event=>{if(event.key==='Escape'&&state.placing)cancelPlacement();else if(event.key==='Escape'&&!$('world-name-panel').hidden)$('world-name-panel').hidden=true;else if(event.key==='Escape'&&!$('tutorial-panel').hidden)$('tutorial-panel').hidden=true;else if(event.key==='Escape'&&!$('capture-panel').hidden)$('capture-panel').hidden=true;else if(event.key==='Escape'&&!$('archive-view').hidden)$('archive-view').hidden=true;else if(event.key==='Escape'&&!memoryView.hidden)closeMemory();});
  }

  async function init(){state.db=await openDatabase();state.worlds=await readPersistedWorlds();if(state.worlds.length){const active=state.worlds.find(world=>world.id===state.currentWorldId)||state.worlds[0];state.currentWorldId=active.id;state.currentWorldName=active.name;state.mirrors=(active.mirrors||[]).map(hydrateMirror);}else if(localStorage.getItem('yingji-worlds-cleared')==='1'){state.currentWorldId=worldUid();state.currentWorldName='新的世界';state.mirrors=[];localStorage.removeItem('yingji-current-world');}else{const persisted=await readPersistedMirrors();persisted.forEach(saved=>{const index=state.mirrors.findIndex(item=>item.id===saved.id);if(index>=0)state.mirrors[index]=hydrateMirror({...state.mirrors[index],...saved});else state.mirrors.push(hydrateMirror(saved));});if(state.mirrors.length)await saveWorld(true);}buildTreeParticles();updateCamera();renderWorld();bindEvents();applyTheme();applyLanguage();resetWind();resetEnvironment();requestAnimationFrame(animateWind);requestAnimationFrame(animateEnvironment);requestAnimationFrame(animateWorldTree);requestAnimationFrame(animateMemoryParticles);window.YingjiApp={captureComposite:getCompositeCanvas,attachEchoProject,attachYinliProject,importYinliGift,previewYinliGift,createBlankYinliWorld,showTutorial(){ $('tutorial-panel').hidden=false; },get worlds(){return state.worlds;},get currentWorld(){return state.currentWorldId;},get currentMirror(){return state.current;},get mirrorCount(){return state.mirrors.length;}};if(!new URLSearchParams(location.search).has('gift'))$('tutorial-panel').hidden=false;}
  init();
})();

