const http = require('http');
const fs = require('fs');
const path = require('path');
const { pipeline } = require('stream');
const { Transform } = require('stream');
const { exec } = require('child_process');

const root = __dirname;
const dataRoot = path.join(path.resolve(process.env.YINLI_DATA_DIR || path.join(root, '.yinli-data')), 'gifts');
const publicFiles = new Set(['index.html','styles.css','yinli.css','yinli-polish.css','app.js','yinli-studio.js','landing-particles.js','three-scene.js']);
const port = Number(process.env.PORT || 4173);
const maxAssetBytes = 200 * 1024 * 1024;
const maxGiftBytes = 500 * 1024 * 1024;
const allowedAssetTypes = /^(image\/(jpeg|png|webp|gif)|audio\/(mpeg|mp3|wav|wave|x-wav|mp4|m4a|ogg|webm)|video\/(mp4|webm|quicktime|ogg))$/i;
const mime = {
  '.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8',
  '.json':'application/json; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp',
  '.mp3':'audio/mpeg','.wav':'audio/wav','.m4a':'audio/mp4','.mp4':'video/mp4','.webm':'video/webm','.fbx':'application/octet-stream','.otf':'font/otf','.ttf':'font/ttf'
};

fs.mkdirSync(dataRoot,{recursive:true});
const safe=value=>/^[a-z0-9_-]{1,80}$/i.test(value||'')?value:null;
const send=(response,status,body,type='application/json; charset=utf-8')=>{response.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin'});response.end(body);};
const json=(response,status,value)=>send(response,status,JSON.stringify(value),mime['.json']);

function collect(request,limit){return new Promise((resolve,reject)=>{const chunks=[];let size=0;request.on('data',chunk=>{size+=chunk.length;if(size>limit){reject(new Error('请求内容过大'));request.destroy();return;}chunks.push(chunk);});request.on('end',()=>resolve(Buffer.concat(chunks)));request.on('error',reject);});}

async function api(request,response,url){
  const assetMatch=url.pathname.match(/^\/api\/gifts\/([A-Z0-9]{6,12})\/assets\/([a-z0-9_-]{1,80})$/i);
  const giftMatch=url.pathname.match(/^\/api\/gifts\/([A-Z0-9]{6,12})$/i);
  if(assetMatch){
    const token=safe(assetMatch[1]),assetId=safe(assetMatch[2]);
    if(!token||!assetId)return json(response,400,{error:'invalid id'});
    const giftDir=path.join(dataRoot,token),dir=path.join(giftDir,'assets'),file=path.join(dir,assetId);
    if(request.method==='POST'){
      const type=String(request.headers['content-type']||'').split(';')[0].trim();
      if(!allowedAssetTypes.test(type))return json(response,415,{error:'不支持的图片、音频或视频格式'});
      if(fs.existsSync(path.join(giftDir,'project.json'))||fs.existsSync(file))return json(response,409,{error:'这份礼物或素材已经发布，不能覆盖'});
      if(Number(request.headers['content-length'])>maxAssetBytes)return json(response,413,{error:'单个素材不能超过 200 MB'});
      fs.mkdirSync(dir,{recursive:true});
      const currentBytes=fs.readdirSync(dir).filter(name=>!name.endsWith('.json')).reduce((sum,name)=>sum+fs.statSync(path.join(dir,name)).size,0);
      if(currentBytes>=maxGiftBytes)return json(response,413,{error:'礼物素材总量不能超过 500 MB'});
      let bytes=0,failed=false;
      const limiter=new Transform({transform(chunk,encoding,callback){bytes+=chunk.length;callback(bytes>maxAssetBytes||currentBytes+bytes>maxGiftBytes?new Error('素材超出大小限制'):null,chunk);}});
      const output=fs.createWriteStream(file,{flags:'wx'});
      pipeline(request,limiter,output,error=>{
        if(error){failed=true;fs.rm(file,{force:true},()=>{});if(!response.headersSent)json(response,error.message==='素材超出大小限制'?413:500,{error:error.message==='素材超出大小限制'?'素材超出大小限制':'素材上传失败'});return;}
        if(failed)return;
        fs.writeFileSync(file+'.json',JSON.stringify({type,name:String(request.headers['x-asset-name']||assetId).slice(0,160)}));
        json(response,201,{ok:true,id:assetId});
      });
      return;
    }
    if(request.method==='GET'){
      if(!fs.existsSync(file))return json(response,404,{error:'asset not found'});
      let meta={};try{meta=JSON.parse(fs.readFileSync(file+'.json','utf8'));}catch{}
      response.writeHead(200,{'Content-Type':meta.type||'application/octet-stream','X-Asset-Name':meta.name||assetId,'Cache-Control':'public, max-age=31536000, immutable','X-Content-Type-Options':'nosniff'});
      fs.createReadStream(file).pipe(response);return;
    }
  }
  if(giftMatch){
    const token=safe(giftMatch[1]);if(!token)return json(response,400,{error:'invalid token'});
    const dir=path.join(dataRoot,token),file=path.join(dir,'project.json');
    if(request.method==='POST'){
      if(fs.existsSync(file))return json(response,409,{error:'这份礼物已经发布，不能覆盖'});
      try{
        const body=await collect(request,2*1024*1024),project=JSON.parse(body.toString('utf8'));
        if(!project||typeof project!=='object'||typeof project.id!=='string'||!Array.isArray(project.media)||project.media.length>100)return json(response,400,{error:'礼物数据格式无效'});
        const assetIds=[project.musicAssetId,...project.media.map(item=>item?.assetId)].filter(Boolean);
        if(assetIds.some(id=>!safe(id)||!fs.existsSync(path.join(dir,'assets',id))))return json(response,400,{error:'礼物缺少图片、音乐或视频素材'});
        fs.mkdirSync(dir,{recursive:true});
        fs.writeFileSync(file,JSON.stringify(project),{flag:'wx'});
        return json(response,201,{ok:true,token});
      }catch(error){return json(response,error.code==='EEXIST'?409:400,{error:error.code==='EEXIST'?'这份礼物已经发布，不能覆盖':error.message});}
    }
    if(request.method==='GET'){if(!fs.existsSync(file))return json(response,404,{error:'gift not found'});return send(response,200,fs.readFileSync(file),mime['.json']);}
  }
  return json(response,404,{error:'not found'});
}

const server=http.createServer(async(request,response)=>{
  const url=new URL(request.url,`http://${request.headers.host||'localhost'}`);
  if(url.pathname==='/healthz')return json(response,200,{ok:true});
  if(url.pathname.startsWith('/api/'))return api(request,response,url);
  const requested=url.pathname==='/'?'/index.html':url.pathname;
  const file=path.resolve(root,'.'+decodeURIComponent(requested));
  const relative=path.relative(root,file);
  if(relative.startsWith('..')||path.isAbsolute(relative))return send(response,403,'Forbidden','text/plain');
  if(!publicFiles.has(relative)&&!relative.startsWith('assets'+path.sep)&&!relative.startsWith('vendor'+path.sep))return send(response,404,'Not found','text/plain');
  fs.stat(file,(error,stat)=>{if(error||!stat.isFile())return send(response,404,'Not found','text/plain');response.writeHead(200,{'Content-Type':mime[path.extname(file).toLowerCase()]||'application/octet-stream'});fs.createReadStream(file).pipe(response);});
});

server.listen(port,'0.0.0.0',()=>{
  console.log(`音礼本地服务已启动：http://localhost:${port}`);
  console.log(`礼物数据目录：${dataRoot}`);
  if(process.env.OPEN_BROWSER==='1'&&process.platform==='win32')exec(`start "" "http://localhost:${port}"`);
});

