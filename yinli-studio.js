(function(){
  'use strict';
  const $=id=>document.getElementById(id);
  const uid=prefix=>`${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`;
  const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
  const relationNames={family:'家人',friend:'朋友',lover:'恋人',self:'自己'};
  const state={mode:'visitor',recipient:null,project:null,db:null,urls:new Map(),selectedId:null,playing:false,time:0,lastTick:0,raf:0,audio:null,audioContext:null,analyser:null,freq:null,drag:null,saveTimer:0,timelineCollapsed:localStorage.getItem('yinli-timeline-collapsed')==='1'};
  let mediaLayer,timeline,inspector,uploadPanel,roleChip,publishDialog,viewerControls,viewerHideTimer,fullscreenExit;

  function toast(message){const node=$('toast');if(node){node.textContent=message;node.hidden=false;clearTimeout(state.toastTimer);state.toastTimer=setTimeout(()=>node.hidden=true,2800);}}
  function escapeHtml(value){return String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));}
  function formatTime(value){const safe=Math.max(0,Number(value)||0);return `${String(Math.floor(safe/60)).padStart(2,'0')}:${String(Math.floor(safe%60)).padStart(2,'0')}`;}
  function openDb(){return new Promise((resolve,reject)=>{const request=indexedDB.open('yinli-studio',1);request.onupgradeneeded=()=>{const db=request.result;if(!db.objectStoreNames.contains('projects'))db.createObjectStore('projects',{keyPath:'id'});if(!db.objectStoreNames.contains('assets'))db.createObjectStore('assets',{keyPath:'id'});if(!db.objectStoreNames.contains('published'))db.createObjectStore('published',{keyPath:'token'});};request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});}
  function request(store,mode,operation){return new Promise((resolve,reject)=>{const tx=state.db.transaction(store,mode),req=operation(tx.objectStore(store));req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
  const storage={
    putProject(project){project.updatedAt=new Date().toISOString();return request('projects','readwrite',store=>store.put(structuredClone(project))).then(()=>project);},
    getProject(id){return request('projects','readonly',store=>store.get(id));},
    allProjects(){return request('projects','readonly',store=>store.getAll());},
    putAsset(blob,meta={}){const asset={id:meta.id||uid('asset'),blob,name:meta.name||'',type:meta.type||blob.type,kind:meta.kind||'media',createdAt:new Date().toISOString()};return request('assets','readwrite',store=>store.put(asset)).then(()=>asset);},
    getAsset(id){return request('assets','readonly',store=>store.get(id));},
    async url(id){if(!id)return'';if(state.urls.has(id))return state.urls.get(id);const asset=await this.getAsset(id);if(!asset?.blob)return'';const url=URL.createObjectURL(asset.blob);state.urls.set(id,url);return url;},
    putPublished(record){return request('published','readwrite',store=>store.put(record));},
    getPublished(token){return request('published','readonly',store=>store.get(token));}
  };

  function createProject(title,recipient){return{id:uid('yinli'),title:title||'未命名音礼',description:'',recipient:recipient||'friend',status:'draft',mirrorId:null,totalDuration:60,musicAssetId:null,musicName:'',media:[],createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};}
  function scheduleSave(){clearTimeout(state.saveTimer);state.saveTimer=setTimeout(saveProject,220);}
  async function saveProject(){if(!state.project||!state.db)return;await storage.putProject(state.project);if(state.project.mirrorId)await window.YingjiApp?.attachYinliProject?.(projectSummary());}
  function projectSummary(){const p=state.project;return{id:p.id,title:p.title,description:p.description,recipient:p.recipient,status:p.status,mirrorId:p.mirrorId,coverAssetId:p.media[0]?.assetId||null,mediaCount:p.media.length,totalDuration:p.totalDuration};}

  function openEntry(kind,preferred){const dialog=$('yinli-entry-dialog'),creator=$('creator-entry'),receiver=$('receiver-entry');dialog.hidden=false;creator.hidden=kind!=='create';receiver.hidden=kind!=='open';if(kind==='create'){selectRecipient(preferred||state.recipient||'friend');setTimeout(()=>$('yinli-project-name').focus(),40);}else setTimeout(()=>$('yinli-gift-link').focus(),40);}
  function selectRecipient(value){state.recipient=value;document.querySelectorAll('#creator-entry [data-recipient]').forEach(button=>button.classList.toggle('selected',button.dataset.recipient===value));}
  function enterWorld(){const button=$('enter-world');if(button.hidden){toast('世界树仍在加载，请稍候');setTimeout(enterWorld,260);return false;}button.click();return true;}
  async function startCreator(){
    const button=document.querySelector('[data-yinli-start-create]');
    const title=$('yinli-project-name').value.trim()||`送给${relationNames[state.recipient]}的音礼`;
    if(button){button.disabled=true;button.textContent='正在展开新世界…';}
    pause();
    state.time=0;
    state.selectedId=null;
    state.drag=null;
    state.urls.forEach(url=>URL.revokeObjectURL(url));
    state.urls.clear();
    state.audio.removeAttribute('src');
    state.audio.load();
    mediaLayer?.replaceChildren();
    state.mode='creator';
    state.project=createProject(title,state.recipient);
    try{
      await window.YingjiApp?.createBlankYinliWorld?.(title);
      await storage.putProject(state.project);
      $('yinli-entry-dialog').hidden=true;
      document.body.classList.add('yinli-creator-mode');
      document.body.classList.remove('yinli-receiver-mode');
      window.dispatchEvent(new CustomEvent('yinli-role-change',{detail:{role:'creator'}}));
      document.body.dataset.recipient=state.recipient;
      activateStudio();
      enterWorld();
      toast('这是一个全新的空白世界。先悬挂第一段记忆，再上传影像与音乐');
    }finally{
      if(button){button.disabled=false;button.textContent='进入世界树开始创作';}
    }
  }

  function injectStudio(){
    mediaLayer=document.createElement('div');mediaLayer.id='yinli-media-layer';mediaLayer.className='yinli-media-layer';$('world-stage').append(mediaLayer);
    roleChip=document.createElement('div');roleChip.className='yinli-role-chip';roleChip.hidden=true;document.body.append(roleChip);
    // 镜内只负责影像；音乐从下方音乐轨添加。
    uploadPanel=document.createElement('div');uploadPanel.id='yinli-upload-panel';uploadPanel.className='yinli-upload-panel';uploadPanel.hidden=true;uploadPanel.innerHTML=`<button type="button" data-studio-upload="media">上传影像<span>图片 / 视频</span></button><input id="yinli-media-input" type="file" accept="image/*,video/*" multiple hidden><input id="yinli-music-input" type="file" accept="audio/*" hidden>`;
    $('memory-view').append(uploadPanel);
    timeline=document.createElement('section');timeline.id='yinli-timeline';timeline.className='yinli-timeline';timeline.hidden=true;timeline.innerHTML=`<button class="timeline-pull" type="button" data-studio-action="timeline-toggle" aria-expanded="true"><i></i><span>收起时间线</span></button><div class="timeline-toolbar"><button data-studio-action="play">播放</button><button data-studio-action="restart">重播</button><button data-studio-upload="music">＋ 音乐</button><button data-studio-action="add-text">＋ 字幕</button><button data-studio-action="save">保存</button><label class="timeline-total">总时长 <input id="yinli-total-duration" type="number" min="1" max="600" step="1" value="60" aria-label="作品总时长，秒"> 秒</label><span class="timeline-time">00:00 / 01:00</span><button class="timeline-publish" data-studio-action="publish">完成并生成链接</button></div><div class="timeline-ruler" role="slider" tabindex="0" aria-label="播放位置" aria-valuemin="0" aria-valuemax="60" aria-valuenow="0"></div><div class="timeline-tracks"></div><i class="timeline-playhead"></i>`;document.body.append(timeline);applyTimelineState();
    inspector=document.createElement('div');inspector.id='yinli-inspector';inspector.className='yinli-inspector';inspector.hidden=true;timeline.querySelector('.timeline-toolbar').after(inspector);
    publishDialog=document.createElement('section');publishDialog.id='yinli-publish-dialog';publishDialog.className='yinli-publish-dialog';publishDialog.hidden=true;document.body.append(publishDialog);
    viewerControls=document.createElement('div');viewerControls.id='yinli-viewer-controls';viewerControls.className='yinli-viewer-controls';viewerControls.hidden=true;viewerControls.innerHTML='<button type="button" class="viewer-play" data-studio-action="play" aria-label="播放回忆">播放</button><span class="viewer-current">00:00</span><input type="range" min="0" max="60" step="0.1" value="0" aria-label="回忆播放进度"><span class="viewer-duration">01:00</span>';document.body.append(viewerControls);
    fullscreenExit=document.createElement('button');fullscreenExit.type='button';fullscreenExit.className='yinli-fullscreen-exit';fullscreenExit.textContent='↙';fullscreenExit.title='退出全屏';fullscreenExit.setAttribute('aria-label','退出全屏');fullscreenExit.hidden=true;fullscreenExit.addEventListener('click',()=>document.exitFullscreen?.());document.body.append(fullscreenExit);
    bindStudioEvents();
  }

  function activateStudio(){if(!state.project)return;const receiver=state.mode==='receiver';roleChip.hidden=false;roleChip.innerHTML=receiver?`<b>收到一份音礼</b><span>${escapeHtml(state.project.title)}</span><button data-studio-action="save-gift-world">保存到我的世界</button>`:`<b>音礼创作</b><span>送给${relationNames[state.project.recipient]} · ${escapeHtml(state.project.title)}</span>`;timeline.hidden=receiver;viewerControls.hidden=!receiver||(!$('entry').hidden&&!$('entry').classList.contains('leaving'));document.body.classList.toggle('yinli-receiver-mode',receiver);document.body.classList.toggle('yinli-creator-mode',!receiver);renderStudio();}
  function activateMirror(mirrorId){if(!state.project)return;state.project.mirrorId=mirrorId;uploadPanel.hidden=state.mode!=='creator';scheduleSave();}

  async function uploadMedia(files){if(state.mode!=='creator'||!state.project)return;for(const file of files){const image=file.type.startsWith('image/'),video=file.type.startsWith('video/');if(!image&&!video){toast('请选择图片或视频文件');continue;}try{const meta=await readMedia(file,video);const asset=await storage.putAsset(file,{name:file.name,kind:video?'video':'image'});const offset=Math.min(state.project.totalDuration-1,state.project.media.reduce((max,item)=>Math.max(max,item.start+item.duration),0));state.project.media.push({id:uid('scene'),assetId:asset.id,type:video?'video':'image',name:file.name,start:Math.max(0,offset),duration:Math.min(video?meta.duration||12:8,state.project.totalDuration-Math.max(0,offset)),sourceDuration:video?meta.duration:undefined,x:50+(Math.random()-.5)*28,y:42+(Math.random()-.5)*20,w:video?31:24,ratio:meta.ratio||1.5,rotation:0,fadeIn:.7,fadeOut:.8,volume:1,text:'',textStart:0,textDuration:Math.min(5,video?meta.duration||5:5),particle:image,particleResponse:.68,particleDensity:.78});state.selectedId=state.project.media.at(-1).id;}catch(error){toast(`“${file.name}”读取失败：${error.message}`);}}await saveProject();renderStudio();animateUploadToTree();
    if(!$('memory-view').hidden)setTimeout(()=>document.querySelector('[data-action="back-world"]')?.click(),420);
  }

  function readMedia(file,isVideo){return new Promise((resolve,reject)=>{const url=URL.createObjectURL(file),node=document.createElement(isVideo?'video':'img');const done=()=>{const width=isVideo?node.videoWidth:node.naturalWidth,height=isVideo?node.videoHeight:node.naturalHeight,duration=isVideo?node.duration:0;URL.revokeObjectURL(url);resolve({ratio:width&&height?width/height:1.5,duration:Number.isFinite(duration)?duration:12});};node.addEventListener(isVideo?'loadedmetadata':'load',done,{once:true});node.addEventListener('error',()=>{URL.revokeObjectURL(url);reject(new Error('浏览器无法读取这个影像文件'));},{once:true});node.src=url;});}
  function animateUploadToTree(){const target=document.querySelector(`.yinli-media-item[data-id="${CSS.escape(state.selectedId)}"]`);if(!target)return;target.animate([{transform:'translate(-50%,70vh) scale(.35)',opacity:0},{transform:'translate(-50%,-50%) scale(1.08)',opacity:1,offset:.78},{transform:'translate(-50%,-50%) scale(1)',opacity:1}],{duration:1100,easing:'cubic-bezier(.2,.75,.2,1)'});}

  async function uploadMusic(file){if(!file||state.mode!=='creator')return;if(!file.type.startsWith('audio/')&&!/\.(mp3|wav|m4a|aac|ogg|webm)$/i.test(file.name)){toast('无法读取这种音乐格式');return;}const duration=await readAudioDuration(file).catch(()=>0);if(!duration){toast('浏览器无法读取这段音乐的时长');return;}const asset=await storage.putAsset(file,{name:file.name,kind:'music'});state.project.musicAssetId=asset.id;state.project.musicName=file.name;state.project.musicSourceDuration=duration;if(!state.project.durationCustomized)state.project.totalDuration=clamp(Math.ceil(duration),1,600);state.project.musicStart=0;state.project.musicDuration=Math.min(duration,state.project.totalDuration);pause();state.audio.src=await storage.url(asset.id);await ensureAudioGraph();await saveProject();renderStudio();toast('音乐已进入下方时间线');}
  function readAudioDuration(file){return new Promise((resolve,reject)=>{const url=URL.createObjectURL(file),probe=new Audio(url);probe.onloadedmetadata=()=>{const d=probe.duration;URL.revokeObjectURL(url);Number.isFinite(d)?resolve(d):reject();};probe.onerror=()=>{URL.revokeObjectURL(url);reject();};});}

  async function ensureAudioGraph(){if(state.audioContext)return state.audioContext;const Ctx=window.AudioContext||window.webkitAudioContext;if(!Ctx)return null;state.audioContext=new Ctx();state.analyser=state.audioContext.createAnalyser();state.analyser.fftSize=256;state.freq=new Uint8Array(state.analyser.frequencyBinCount);const source=state.audioContext.createMediaElementSource(state.audio);source.connect(state.analyser);state.analyser.connect(state.audioContext.destination);return state.audioContext;}
  function audioLevel(){if(!state.analyser||state.audio.paused)return 0;state.analyser.getByteFrequencyData(state.freq);let sum=0;for(let i=0;i<48;i++)sum+=state.freq[i];return sum/(48*255);}

  async function renderMedia(){if(!mediaLayer||!state.project)return;const keep=new Set();for(const item of state.project.media){keep.add(item.id);let node=mediaLayer.querySelector(`[data-id="${CSS.escape(item.id)}"]`);if(!node){node=document.createElement('div');node.className=`yinli-media-item ${item.type}`;node.dataset.id=item.id;const url=await storage.url(item.assetId);if(item.type==='video')node.innerHTML=`<video src="${url}" playsinline preload="metadata"></video><span class="media-memory-text"></span><i class="resize-handle"></i>`;else if(item.type==='image')node.innerHTML=`<img src="${url}" alt=""><canvas class="media-particle-canvas"></canvas><span class="media-memory-text"></span><i class="resize-handle"></i>`;else node.innerHTML=`<span class="media-memory-text"></span><i class="resize-handle"></i>`;mediaLayer.append(node);if(item.type==='image')node.querySelector('img').addEventListener('load',()=>prepareImageParticles(node));}updateMediaNode(node,item);}mediaLayer.querySelectorAll('.yinli-media-item').forEach(node=>{if(!keep.has(node.dataset.id))node.remove();});}
  function updateMediaNode(node,item){node.style.setProperty('--x',item.x);node.style.setProperty('--y',item.y);node.style.setProperty('--w',item.w);node.style.setProperty('--ratio',item.ratio||1.5);node.style.rotate=`${item.rotation||0}deg`;node.classList.toggle('active',item.id===state.selectedId);const text=node.querySelector('.media-memory-text');if(text){text.textContent=item.text||'';text.hidden=!item.text;}}
function prepareImageParticles(node){const image=node.querySelector('img'),canvas=node.querySelector('canvas');if(!image||!canvas||!image.naturalWidth)return;const sample=document.createElement('canvas'),width=180,height=Math.max(40,Math.round(width/image.naturalWidth*image.naturalHeight));sample.width=width;sample.height=height;const ctx=sample.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0,width,height);const pixels=ctx.getImageData(0,0,width,height).data,points=[];for(let y=0;y<height;y++)for(let x=0;x<width;x++){const index=(y*width+x)*4;if(pixels[index+3]>30)points.push({x:x/width,y:y/height,r:pixels[index],g:pixels[index+1],b:pixels[index+2],s:(x*17+y*29)%63/10});}node._particles=points;node.classList.add('particle-ready');updatePlayback();}

  // 所有媒体共用同一作品时轴；片段左右两端都能拖动，文字片段也在这里编辑。
  function renderTimeline(){
    if(!timeline||!state.project)return;
    const project=state.project,total=project.totalDuration||60,tracks=timeline.querySelector('.timeline-tracks');
    const clip=(type,id,name,start,duration,selected=false)=>`<div class="timeline-clip ${type}${selected?' selected':''}" data-id="${escapeHtml(id)}" data-track="${type}" style="--start:${start/total*100};--duration:${duration/total*100}" title="${escapeHtml(name)} · ${start.toFixed(1)}–${(start+duration).toFixed(1)} 秒"><i class="clip-resize clip-resize-left" data-edge="left"></i><span class="clip-title">${escapeHtml(name)}</span><span class="clip-time">${duration.toFixed(1)} 秒</span><i class="clip-resize clip-resize-right" data-edge="right"></i></div>`;
    const groups=[['music','音乐轨道'],['video','视频轨道'],['image','图片轨道'],['text','字幕轨道']];
    tracks.innerHTML=groups.map(([type,label])=>{
      let clips='';
      if(type==='music'&&project.musicAssetId){const start=Number(project.musicStart)||0,duration=Math.min(Number(project.musicDuration)||total,total-start);clips=clip('music','music',project.musicName||'主音乐',start,duration);}
      else if(type!=='music')clips=project.media.filter(item=>type==='text'?Boolean(item.text):item.type===type).map(item=>{
        const start=type==='text'?item.start+Number(item.textStart||0):item.start;
        const duration=type==='text'?Math.min(Number(item.textDuration)||3,item.duration):item.duration;
        return clip(type,item.id,type==='text'?item.text:item.name,start,duration,item.id===state.selectedId);
      }).join('');
      return `<div class="timeline-track"><span>${label}</span><div class="track-lane" data-track="${type}">${clips}</div></div>`;
    }).join('');
    timeline.querySelector('.timeline-time').textContent=`${formatTime(state.time)} / ${formatTime(total)}`;
    timeline.querySelector('#yinli-total-duration').value=total;
    timeline.querySelector('[data-studio-action="play"]').textContent=state.playing?'暂停':'播放';if(viewerControls){const control=viewerControls.querySelector('.viewer-play');control.textContent=state.playing?'暂停':'播放';control.setAttribute('aria-label',state.playing?'暂停回忆':'播放回忆');}
    const ruler=timeline.querySelector('.timeline-ruler');ruler.innerHTML=Array.from({length:5},(_,i)=>`<span style="left:${i*25}%">${formatTime(total*i/4)}</span>`).join('');
    ruler.setAttribute('aria-valuemax',String(total));ruler.setAttribute('aria-valuenow',String(Number(state.time.toFixed(1))));
    updatePlayhead();
  }
  function updatePlayhead(){if(!timeline||!state.project)return;const lane=timeline.querySelector('.track-lane');if(!lane)return;const host=timeline.getBoundingClientRect(),rect=lane.getBoundingClientRect();timeline.style.setProperty('--playhead-x',`${rect.left-host.left+state.time/state.project.totalDuration*rect.width}px`);}
  function applyTimelineState(){if(!timeline)return;timeline.classList.toggle('is-collapsed',state.timelineCollapsed);const toggle=timeline.querySelector('[data-studio-action="timeline-toggle"]');if(toggle){toggle.setAttribute('aria-expanded',String(!state.timelineCollapsed));toggle.querySelector('span').textContent=state.timelineCollapsed?'展开时间线':'收起时间线';}}
  function toggleTimeline(){state.timelineCollapsed=!state.timelineCollapsed;localStorage.setItem('yinli-timeline-collapsed',state.timelineCollapsed?'1':'0');applyTimelineState();if(!state.timelineCollapsed)requestAnimationFrame(renderTimeline);}

  function renderInspector(){if(!inspector||!state.project)return;const item=state.project.media.find(entry=>entry.id===state.selectedId);inspector.hidden=!item||state.mode!=='creator';if(!item)return;const response=Math.round((item.particleResponse??.68)*100),density=Math.round((item.particleDensity??.78)*100);inspector.innerHTML=`<span class="inline-asset-name">${item.type==='video'?'视频':item.type==='image'?'图片':'字幕'} · ${escapeHtml(item.name)}</span><label class="inspector-memory-text"><span>回忆文字</span><textarea data-item-field="text" rows="1" placeholder="写下播放时出现的文字">${escapeHtml(item.text||'')}</textarea></label>${item.type==='video'?`<label class="inspector-slider">视频音量<input data-item-field="volume" type="range" min="0" max="1" step="0.01" value="${item.volume??1}"></label>`:''}${item.type==='image'?`<label class="inspector-slider">音乐粒子<select data-item-field="particle"><option value="true" ${item.particle?'selected':''}>开启</option><option value="false" ${!item.particle?'selected':''}>关闭</option></select></label><label class="inspector-slider">音乐响应<input data-item-field="particleResponse" type="range" min="0" max="1" step="0.01" value="${item.particleResponse??.68}"><output>${response}%</output></label><label class="inspector-slider">粒子密度<input data-item-field="particleDensity" type="range" min="0.2" max="1" step="0.01" value="${item.particleDensity??.78}"><output>${density}%</output></label>`:''}<button class="inline-delete" data-studio-action="delete-item" aria-label="删除所选素材">删除</button>`;}
  function renderStudio(){activateMirrorIfAvailable();renderMedia();renderTimeline();renderInspector();}
  function activateMirrorIfAvailable(){if(!state.project||state.project.mirrorId)return;const mirror=window.YingjiApp?.currentMirror;if(mirror)state.project.mirrorId=mirror.id;}

  async function togglePlay(restart=false){if(!state.project)return;if(restart)state.time=0;if(state.playing){pause();return;}if(state.time>=state.project.totalDuration-.05)state.time=0;state.playing=true;state.lastTick=performance.now();if(state.project.musicAssetId){await ensureAudioGraph();if(state.audioContext?.state==='suspended')await state.audioContext.resume();}updatePlayback();tick();renderTimeline();}
  function pause(){state.playing=false;state.audio.pause();mediaLayer?.querySelectorAll('video').forEach(video=>video.pause());cancelAnimationFrame(state.raf);updatePlayback();renderTimeline();}
  function seek(value){state.time=clamp(Number(value)||0,0,state.project?.totalDuration||60);updatePlayback();renderTimeline();}
  function tick(){if(!state.playing)return;const now=performance.now();state.time+=Math.max(0,(now-state.lastTick)/1000);state.lastTick=now;if(state.time>=state.project.totalDuration){state.time=state.project.totalDuration;pause();updatePlayback();return;}updatePlayback();state.raf=requestAnimationFrame(tick);}
  function updatePlayback(){
    if(!state.project)return;
    const level=audioLevel();
    window.dispatchEvent(new CustomEvent('echo-playback',{detail:{position:state.time,duration:state.project.totalDuration,playing:state.playing}}));
    syncMusicPlayback();
    for(const item of state.project.media){
      const node=mediaLayer.querySelector(`[data-id="${CSS.escape(item.id)}"]`);if(!node)continue;
      const local=state.time-item.start,active=local>=0&&local<item.duration;
      let opacity=active?1:0;if(active&&state.playing&&item.fadeIn)opacity=Math.min(opacity,local/item.fadeIn);if(active&&state.playing&&item.fadeOut)opacity=Math.min(opacity,(item.duration-local)/item.fadeOut);
      node.style.opacity=opacity;node.style.pointerEvents=state.mode==='creator'?'auto':'none';
const energy=level*(item.particleResponse??.68),particlesActive=active&&item.type==='image'&&item.particle&&!!node._particles;
node.classList.toggle('particle-active',particlesActive);node.style.setProperty('--particle-opacity',particlesActive?'1':'0');node.style.scale='1';
      const video=node.querySelector('video');if(video){video.volume=item.volume??1;if(active&&state.playing){if(Math.abs(video.currentTime-local)>.3)video.currentTime=clamp(local,0,video.duration||local);video.play().catch(()=>{});}else video.pause();}
      const text=node.querySelector('.media-memory-text');if(text&&item.text){const show=local>=Number(item.textStart||0)&&local<Number(item.textStart||0)+Number(item.textDuration||3);text.style.opacity=show?1:0;}
      if(particlesActive)drawImageParticles(node,energy,item.particleDensity??.78);
    }
    const focusVideo=$('yinli-focus-video');if(focusVideo){const source=state.project.media.find(item=>item.type==='video'&&item.assetId);if(source){const local=clamp(state.time-source.start,0,source.sourceDuration||state.project.totalDuration);if(Math.abs(focusVideo.currentTime-local)>.3)focusVideo.currentTime=local;if(state.playing)focusVideo.play().catch(()=>{});else focusVideo.pause();}}
    timeline.querySelector('.timeline-time').textContent=`${formatTime(state.time)} / ${formatTime(state.project.totalDuration)}`;timeline.querySelector('.timeline-ruler').setAttribute('aria-valuenow',String(Number(state.time.toFixed(1))));updatePlayhead();
    if(viewerControls){viewerControls.querySelector('input').max=String(state.project.totalDuration);if(document.activeElement!==viewerControls.querySelector('input'))viewerControls.querySelector('input').value=String(state.time);viewerControls.querySelector('.viewer-current').textContent=formatTime(state.time);viewerControls.querySelector('.viewer-duration').textContent=formatTime(state.project.totalDuration);}
  }
  function syncMusicPlayback(){const p=state.project;if(!p?.musicAssetId)return;const start=Number(p.musicStart)||0,duration=Number(p.musicDuration)||p.totalDuration,local=state.time-start,active=local>=0&&local<duration;if(!active||!state.playing){if(!state.audio.paused)state.audio.pause();return;}if(Math.abs(state.audio.currentTime-local)>.22)state.audio.currentTime=local;if(state.audio.paused)state.audio.play().catch(()=>toast('音乐无法播放，请检查素材格式'));}
function drawImageParticles(node,energy,density){const canvas=node.querySelector('canvas'),image=node.querySelector('img'),points=node._particles;if(!canvas||!image||!points)return;const w=Math.max(1,Math.round(image.clientWidth)),h=Math.max(1,Math.round(image.clientHeight)),resized=canvas.width!==w||canvas.height!==h,now=performance.now();if(!resized&&now-(node._particleLastDraw||0)<50)return;node._particleLastDraw=now;if(resized){canvas.width=w;canvas.height=h;}const ctx=canvas.getContext('2d');ctx.clearRect(0,0,w,h);ctx.globalAlpha=.3;ctx.drawImage(image,0,0,w,h);ctx.globalAlpha=1;const scatter=state.playing&&!state.audio.paused?Math.min(5,energy*16):0,step=Math.max(1,Math.round(1/clamp(density,.35,1)));for(let i=0;i<points.length;i+=step){const p=points[i],x=p.x*w+Math.sin(p.s+state.time*1.7)*scatter,y=p.y*h+Math.cos(p.s*1.3+state.time)*scatter;ctx.fillStyle=`rgb(${p.r},${p.g},${p.b})`;ctx.fillRect(x,y,Math.max(1.2,w/180*.9),Math.max(1.2,w/180*.9));}}

  function addText(){if(!state.project)return;const item={id:uid('scene'),assetId:null,type:'text',name:'一段文字',start:state.time,duration:5,x:50,y:55,w:42,ratio:5,rotation:0,fadeIn:.5,fadeOut:.5,text:'写下这段回忆',textStart:0,textDuration:5};state.project.media.push(item);state.selectedId=item.id;renderStudio();scheduleSave();}
  function editSelected(field,value){const item=state.project.media.find(entry=>entry.id===state.selectedId);if(!item)return;if(['start','duration','w','fadeIn','fadeOut','volume','textStart','textDuration','particleResponse','particleDensity'].includes(field))value=Number(value)||0;if(field==='particle')value=value==='true';item[field]=value;if(field==='start')item.start=clamp(item.start,0,state.project.totalDuration-.1);if(field==='duration')item.duration=clamp(item.duration,.5,state.project.totalDuration-item.start);renderMedia();renderTimeline();scheduleSave();}

  function bindStudioEvents(){
    document.addEventListener('click',async event=>{
      const entry=event.target.closest('[data-yinli-entry]');if(entry){openEntry(entry.dataset.yinliEntry,entry.dataset.recipient);return;}
      if(event.target.closest('[data-yinli-close]')){$('yinli-entry-dialog').hidden=true;return;}
      const recipient=event.target.closest('#creator-entry [data-recipient]');if(recipient){selectRecipient(recipient.dataset.recipient);return;}
      if(event.target.closest('[data-yinli-start-create]')){startCreator();return;}
if(event.target.closest('[data-yinli-open-gift]')){openGift($('yinli-gift-link').value.trim());return;}
      const upload=event.target.closest('[data-studio-upload]');if(upload){$(upload.dataset.studioUpload==='media'?'yinli-media-input':'yinli-music-input').click();return;}
      const action=event.target.closest('[data-studio-action]')?.dataset.studioAction;if(state.mode==='receiver'&&['add-text','save','publish','delete-item'].includes(action))return;if(action==='timeline-toggle')toggleTimeline();if(action==='play')togglePlay();if(action==='restart')togglePlay(true);if(action==='add-text')addText();if(action==='save'){await saveProject();toast('音礼草稿已保存');}if(action==='publish')openPublish();if(action==='delete-item'){state.project.media=state.project.media.filter(item=>item.id!==state.selectedId);state.selectedId=null;renderStudio();scheduleSave();}
      if(action==='close-publish')publishDialog.hidden=true;if(action==='copy-link'){navigator.clipboard?.writeText($('yinli-share-link').value);toast('链接已复制');}if(action==='save-gift-world')saveGiftToWorld();
      const media=event.target.closest('.yinli-media-item');if(media&&state.mode==='creator'){state.selectedId=media.dataset.id;renderStudio();}
      const clip=event.target.closest('.timeline-clip[data-id]');if(clip&&state.mode==='creator'){state.selectedId=clip.dataset.id;renderStudio();}
    });
    $('yinli-media-input').addEventListener('change',event=>{uploadMedia([...event.target.files]).catch(error=>toast(error.message));event.target.value='';});
    $('yinli-music-input').addEventListener('change',event=>{uploadMusic(event.target.files[0]).catch(error=>toast(error.message));event.target.value='';});
    timeline.querySelector('#yinli-total-duration').addEventListener('change',event=>{
      const total=clamp(Math.round(Number(event.target.value)||60),1,600),project=state.project;if(!project)return;
      project.totalDuration=total;project.durationCustomized=true;project.musicStart=clamp(Number(project.musicStart)||0,0,total-.5);
      project.musicDuration=clamp(Number(project.musicDuration)||total,.5,Math.min(total-project.musicStart,Number(project.musicSourceDuration)||total));
      project.media.forEach(item=>{item.start=clamp(Number(item.start)||0,0,total-.5);item.duration=clamp(Number(item.duration)||1,.5,total-item.start);item.textStart=clamp(Number(item.textStart)||0,0,Math.max(0,item.duration-.5));item.textDuration=clamp(Number(item.textDuration)||1,.5,item.duration-item.textStart);});
      seek(Math.min(state.time,total));renderMedia();renderTimeline();scheduleSave();
    });
    timeline.querySelector('.timeline-ruler').addEventListener('keydown',event=>{if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();seek(state.time+(event.key==='ArrowRight'?1:-1));}});
    inspector.addEventListener('input',event=>{const field=event.target.dataset.itemField;if(field)editSelected(field,event.target.value);if(field==='particleResponse'||field==='particleDensity')event.target.parentElement.querySelector('output').textContent=`${Math.round(Number(event.target.value)*100)}%`;});
    viewerControls.querySelector('input').addEventListener('input',event=>seek(Number(event.target.value)));
    document.addEventListener('mousemove',event=>{if(document.fullscreenElement&&state.mode==='receiver'&&event.clientY>innerHeight-140)revealViewerControls();},{passive:true});
    document.addEventListener('fullscreenchange',()=>{fullscreenExit.hidden=!(document.fullscreenElement&&state.mode==='receiver');if(document.fullscreenElement&&state.mode==='receiver')revealViewerControls();else{clearTimeout(viewerHideTimer);viewerControls.classList.remove('is-visible');}});
    timeline.addEventListener('pointerdown',startTimelineDrag);mediaLayer.addEventListener('pointerdown',startMediaDrag);
    window.addEventListener('pointermove',continueDrag);window.addEventListener('pointerup',finishDrag);window.addEventListener('pointercancel',finishDrag);window.addEventListener('mouseup',finishDrag);window.addEventListener('resize',()=>requestAnimationFrame(renderTimeline));
    window.addEventListener('memory-opened',async event=>{if(event.detail?.yinliProjectId&&state.project?.id!==event.detail.yinliProjectId){const project=await storage.getProject(event.detail.yinliProjectId);if(project){state.project=project;state.mode=project.status==='received'?'receiver':'creator';await loadProjectAssets();}}if(state.mode==='creator'){activateMirror(event.detail?.mirrorId);activateStudio();}else if(state.mode==='receiver'){activateStudio();await showViewerMemory();}});
    window.addEventListener('memory-closed',()=>{uploadPanel.hidden=true;});
    window.addEventListener('yinli-home-play',async event=>{const project=await storage.getProject(event.detail?.projectId);if(!project){toast('这份音礼的本地素材已经缺失');return;}state.project=project;await loadProjectAssets();seek(0);togglePlay();});
    window.addEventListener('yinli-home-toggle',()=>togglePlay());
    window.addEventListener('yinli-home-stop',()=>{pause();seek(0);});
    window.addEventListener('yinli-return-landing',()=>{pause();mediaLayer?.replaceChildren();viewerControls.hidden=true;roleChip.hidden=true;state.mode=null;state.project=null;state.selectedId=null;document.body.classList.remove('yinli-creator-mode','yinli-receiver-mode');});
    window.addEventListener('yinli-world-entered',()=>{if(!state.mode){state.mode='library';document.body.classList.add('yinli-receiver-mode');document.body.classList.remove('yinli-creator-mode');window.dispatchEvent(new CustomEvent('yinli-role-change',{detail:{role:'receiver'}}));}if(state.mode==='receiver')viewerControls.hidden=false;if(state.project)roleChip.hidden=false;});
  }

  function startTimelineDrag(event){
    if(state.mode!=='creator')return;
    const clip=event.target.closest('.timeline-clip[data-id]');
    if(!clip){const ruler=event.target.closest('.timeline-ruler'),lane=event.target.closest('.track-lane');if(!ruler&&!lane)return;event.preventDefault();state.drag={kind:'timeline-seek',rect:(ruler||lane).getBoundingClientRect()};seek((event.clientX-state.drag.rect.left)/state.drag.rect.width*state.project.totalDuration);return;}
    const lane=clip.parentElement,type=clip.dataset.track,item=type==='music'?null:state.project.media.find(entry=>entry.id===clip.dataset.id);
    if(type!=='music'&&!item)return;
    event.preventDefault();if(item)state.selectedId=item.id;
    const start=type==='music'?Number(state.project.musicStart)||0:type==='text'?item.start+Number(item.textStart||0):item.start;
    const duration=type==='music'?Number(state.project.musicDuration)||state.project.totalDuration:type==='text'?Number(item.textDuration)||3:item.duration;
    state.drag={kind:'timeline-clip',type,item,edge:event.target.closest('.clip-resize')?.dataset.edge||'move',startX:event.clientX,start,duration,laneWidth:lane.getBoundingClientRect().width};renderInspector();
  }
  function startMediaDrag(event){const node=event.target.closest('.yinli-media-item');if(!node||state.mode!=='creator')return;const item=state.project.media.find(entry=>entry.id===node.dataset.id);if(!item)return;event.preventDefault();event.stopPropagation();state.selectedId=item.id;state.drag={kind:event.target.closest('.resize-handle')?'media-resize':'media-move',item,startX:event.clientX,startY:event.clientY,x:item.x,y:item.y,w:item.w,rect:$('world-stage').getBoundingClientRect()};renderStudio();}
  function continueDrag(event){
    const drag=state.drag;if(!drag)return;
    if(drag.kind==='timeline-seek'){seek((event.clientX-drag.rect.left)/drag.rect.width*state.project.totalDuration);return;}
    const dx=event.clientX-drag.startX,dy=event.clientY-drag.startY;
    if(drag.kind==='timeline-clip'){
      const delta=dx/drag.laneWidth*state.project.totalDuration;
      const lower=drag.type==='text'&&drag.item.type!=='text'?drag.item.start:0;
      const upper=drag.type==='text'&&drag.item.type!=='text'?Math.min(state.project.totalDuration,drag.item.start+drag.item.duration):state.project.totalDuration;
      const sourceLimit=drag.type==='music'?Number(state.project.musicSourceDuration)||Infinity:drag.type==='video'?Number(drag.item.sourceDuration)||Infinity:Infinity;
      let start=drag.start,duration=drag.duration;
      if(drag.edge==='move')start=clamp(drag.start+delta,lower,Math.max(lower,upper-duration));
      else if(drag.edge==='left'){const end=drag.start+drag.duration;start=clamp(drag.start+delta,Math.max(lower,end-sourceLimit),end-.5);duration=end-start;}
      else duration=clamp(drag.duration+delta,.5,Math.min(sourceLimit,upper-start));
      if(drag.type==='music'){state.project.musicStart=start;state.project.musicDuration=duration;}
      else if(drag.type==='text'&&drag.item.type!=='text'){drag.item.textStart=start-drag.item.start;drag.item.textDuration=duration;}
      else{drag.item.start=start;drag.item.duration=duration;if(drag.item.type==='text'){drag.item.textStart=0;drag.item.textDuration=duration;}}
      updatePlayback();renderTimeline();return;
    }
    if(drag.kind==='media-move'){drag.item.x=clamp(drag.x+dx/drag.rect.width*100,4,96);drag.item.y=clamp(drag.y+dy/drag.rect.height*100,6,94);}
    if(drag.kind==='media-resize')drag.item.w=clamp(drag.w+dx/drag.rect.width*100,8,80);
    renderMedia();renderTimeline();
  }
  function finishDrag(){if(!state.drag)return;state.drag=null;renderInspector();scheduleSave();}

  async function openPublish(){if(!state.project)return;if(!state.project.media.length&&!state.project.musicAssetId){toast('请先添加影像或音乐');return;}await saveProject();publishDialog.hidden=false;publishDialog.innerHTML=`<button class="dialog-close" data-studio-action="close-publish">×</button><small>PUBLISH YIN LI</small><h2>完成并送出这份音礼</h2><p>发布会保存当前编排的只读版本。使用本地服务器运行网站时，会生成可在该服务器访问的真实礼物链接。</p><button class="primary" id="yinli-do-publish">发布音礼</button>`;$('yinli-do-publish').addEventListener('click',publishProject,{once:true});}
  async function publishProject(){
    const button=$('yinli-do-publish');button.disabled=true;button.textContent='正在上传素材…';
    const random=new Uint8Array(12);crypto.getRandomValues(random);
    const token=[...random].map(value=>'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'[value%36]).join('');
    const snapshot=structuredClone(state.project);snapshot.status='published';snapshot.token=token;snapshot.publishedAt=new Date().toISOString();
    try{
      if(location.protocol==='file:'){
        await storage.putPublished({token,project:snapshot,createdAt:new Date().toISOString()});
        showPublished(`LOCAL:${token}`,token,true,'本机预览码只在当前浏览器可用。请通过已部署的网站发布，才能把链接发给别人。');
        return;
      }
      const health=await fetch('healthz',{cache:'no-store'}).catch(()=>null);
      if(!health?.ok||(await health.json().catch(()=>({}))).ok!==true){
        await storage.putPublished({token,project:snapshot,createdAt:new Date().toISOString()});
        showPublished(`LOCAL:${token}`,token,true,'当前是静态预览版：这个预览码仅在本浏览器可用，无法发给其他设备。跨设备收礼需要部署带存储的音礼服务。');
        return;
      }
      const assetIds=[snapshot.musicAssetId,...snapshot.media.map(item=>item.assetId)].filter(Boolean);
      for(const id of [...new Set(assetIds)]){
        const asset=await storage.getAsset(id);
        if(!asset?.blob)throw new Error('有素材未保存，请重新上传后再发布');
        const response=await fetch(`/api/gifts/${token}/assets/${encodeURIComponent(id)}`,{method:'POST',headers:{'Content-Type':asset.blob.type||'application/octet-stream','X-Asset-Name':encodeURIComponent(asset.name||id)},body:asset.blob});
        if(!response.ok)throw new Error((await response.json().catch(()=>({}))).error||'素材上传失败');
      }
      const response=await fetch(`/api/gifts/${token}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(snapshot)});
      if(!response.ok)throw new Error((await response.json().catch(()=>({}))).error||'作品发布失败');
      state.project.status='published';await saveProject();
      showPublished(`${location.origin}${location.pathname}?gift=${token}`,token,false);
    }catch(error){
      publishDialog.innerHTML=`<button class="dialog-close" data-studio-action="close-publish">×</button><small>PUBLISH FAILED</small><h2>音礼还没有发布</h2><p role="alert">${escapeHtml(error.message||'上传失败，请稍后重试')}</p><button class="primary" id="yinli-do-publish">重新尝试</button>`;
      $('yinli-do-publish').addEventListener('click',publishProject,{once:true});
    }
  }
  function showPublished(link,token,local,error=''){publishDialog.innerHTML=`<button class="dialog-close" data-studio-action="close-publish">×</button><small>${local?'LOCAL PREVIEW':'GIFT PUBLISHED'}</small><h2>${local?'已保存本机预览码':'音礼已经可以送出'}</h2><p>${local?escapeHtml(error):'接收者打开链接后会进入只读的音礼世界，并可以保存到自己的世界。'}</p><input id="yinli-share-link" readonly value="${escapeHtml(link)}"><div><button class="primary" data-studio-action="copy-link">复制${local?'预览码':'链接'}</button><button data-studio-action="close-publish">继续编辑</button></div>`;}

  async function giftCover(){
    const item=state.project?.media.find(media=>media.type==='image'&&media.assetId)||state.project?.media.find(media=>media.type==='video'&&media.assetId);
    if(!item)return '';
    const url=await storage.url(item.assetId);
    return new Promise(resolve=>{
      const media=document.createElement(item.type==='image'?'img':'video');
      const finish=()=>{try{const width=media.naturalWidth||media.videoWidth,height=media.naturalHeight||media.videoHeight;if(!width||!height){resolve('');return;}const scale=Math.min(1,360/Math.max(width,height));const canvas=document.createElement('canvas');canvas.width=Math.round(width*scale);canvas.height=Math.round(height*scale);canvas.getContext('2d').drawImage(media,0,0,canvas.width,canvas.height);resolve(canvas.toDataURL('image/jpeg',.76));}catch{resolve('');}};
      media.addEventListener(item.type==='image'?'load':'loadeddata',finish,{once:true});media.addEventListener('error',()=>resolve(''),{once:true});media.src=url;if(item.type==='video'){media.muted=true;media.preload='auto';}setTimeout(()=>resolve(''),5000);
    });
  }
  async function openGift(input){const status=$('yinli-open-status');status.textContent='正在读取这份音礼…';const token=(input.match(/[?&]gift=([A-Z0-9]+)/i)||input.match(/LOCAL:([A-Z0-9]+)/i)||input.match(/^([A-Z0-9]{6})$/i))?.[1]?.toUpperCase();if(!token){status.textContent='没有识别到有效的音礼链接或礼物码';return;}try{let project;if(/^LOCAL:/i.test(input)||!/^https?:/i.test(location.href)){project=(await storage.getPublished(token))?.project;}else{const response=await fetch(`/api/gifts/${token}`);if(!response.ok)throw new Error('这份音礼不存在或已经失效');project=await response.json();await importRemoteAssets(project,token);}if(!project)throw new Error('这份音礼只存在于发布者的本机浏览器');state.mode='receiver';state.project={...project,id:`${project.id}-receiver`,sourceProjectId:project.id,status:'received',mirrorId:null};await storage.putProject(state.project);$('yinli-entry-dialog').hidden=true;document.body.classList.add('yinli-receiver-mode');document.body.classList.remove('yinli-creator-mode');window.dispatchEvent(new CustomEvent('yinli-role-change',{detail:{role:'receiver'}}));await loadProjectAssets();state.project.coverData=await giftCover();window.YingjiApp?.previewYinliGift?.({...projectSummary(),coverData:state.project.coverData});activateStudio();enterWorld();startReceiverExperience();}catch(error){status.textContent=error.message;if(document.fullscreenElement)document.exitFullscreen?.().catch(()=>{});}}
  async function importRemoteAssets(project,token){const ids=[project.musicAssetId,...project.media.map(item=>item.assetId)].filter(Boolean);for(const id of [...new Set(ids)]){if(await storage.getAsset(id))continue;const response=await fetch(`/api/gifts/${token}/assets/${encodeURIComponent(id)}`);if(!response.ok)throw new Error('这份音礼缺少素材，暂时无法完整播放');const blob=await response.blob();await storage.putAsset(blob,{id,name:decodeURIComponent(response.headers.get('X-Asset-Name')||id),kind:'remote'});}}
  async function loadProjectAssets(){if(state.project.musicAssetId)state.audio.src=await storage.url(state.project.musicAssetId);await renderMedia();renderTimeline();}
  async function showViewerMemory(){if(state.mode!=='receiver'||!state.project)return;const item=state.project.media.find(media=>media.type==='image'&&media.assetId)||state.project.media.find(media=>media.type==='video'&&media.assetId);const image=$('memory-image'),mirror=$('focus-mirror');mirror.querySelector('#yinli-focus-video')?.remove();if(!item)return;const url=await storage.url(item.assetId);if(item.type==='image'){image.src=url;image.hidden=false;}else{image.hidden=true;const video=document.createElement('video');video.id='yinli-focus-video';video.src=url;video.muted=true;video.playsInline=true;video.preload='metadata';mirror.prepend(video);video.currentTime=Math.max(0,state.time-item.start);if(state.playing)video.play().catch(()=>{});} $('scan-status').textContent='正在观看音礼';}
function revealViewerControls(){viewerControls.classList.add('is-visible');clearTimeout(viewerHideTimer);viewerHideTimer=setTimeout(()=>viewerControls.classList.remove('is-visible'),1000);}
function startReceiverExperience(){window.YingjiApp?.showTutorial?.();const close=$('tutorial-panel').querySelector('[data-action="close-tutorial"]');close.addEventListener('click',()=>{if(state.mode==='receiver'&&!state.playing)togglePlay(true);},{once:true});}
  async function saveGiftToWorld(){if(state.project?.mirrorId){toast('这份音礼已保存在你的世界');return;}const id=await window.YingjiApp?.importYinliGift?.({...projectSummary(),coverData:state.project.coverData||await giftCover()});if(id){state.project.mirrorId=id;await saveProject();toast('这份音礼已经保存到你的世界');}}

  function applyProjectCovers(){if(!state.project?.mirrorId)return;const item=state.project.media[0];if(!item)return;storage.url(item.assetId).then(url=>{document.querySelectorAll(`[data-id="${CSS.escape(state.project.mirrorId)}"] .mirror-body`).forEach(holder=>{let img=holder.querySelector('img');if(!img){img=document.createElement('img');holder.prepend(img);}if(item.type==='image')img.src=url;else{const video=document.createElement('video');video.src=url;video.muted=true;video.currentTime=.1;video.addEventListener('loadeddata',()=>{const canvas=document.createElement('canvas');canvas.width=video.videoWidth||320;canvas.height=video.videoHeight||180;canvas.getContext('2d').drawImage(video,0,0,canvas.width,canvas.height);img.src=canvas.toDataURL('image/jpeg',.72);},{once:true});}});});}

  async function resumeLastProject(){const projects=await storage.allProjects();const draft=projects.sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt)))[0];return draft||null;}
  async function init(){state.db=await openDb();state.audio=new Audio();state.audio.preload='metadata';injectStudio();const params=new URLSearchParams(location.search);if(params.get('gift')){openEntry('open');$('yinli-gift-link').value=location.href;setTimeout(()=>openGift(location.href),100);}const observer=new MutationObserver(()=>{if(!$('enter-world').hidden)$('enter-world').textContent='进入我的世界 →';});observer.observe($('enter-world'),{attributes:true,attributeFilter:['hidden']});window.addEventListener('beforeunload',()=>{state.urls.forEach(url=>URL.revokeObjectURL(url));state.db?.close();});window.YinliStudio={state,storage,openGift,saveProject};setInterval(applyProjectCovers,1200);}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();

