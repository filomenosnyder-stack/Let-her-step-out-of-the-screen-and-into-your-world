import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const fixtures=process.env.ARCAM_FIXTURES || 'C:/Users/16625/Desktop/shetuan/arcam';
const output=path.join(root,'artifacts/browser');fs.mkdirSync(output,{recursive:true});
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.wasm':'application/wasm','.json':'application/json','.jpg':'image/jpeg','.png':'image/png'};
const server=http.createServer((req,res)=>{
  if(req.url==='/__native-segment'&&req.method==='POST') {
    const process=spawn('python',[path.join(root,'tools/native-inference-check.py')],{windowsHide:true});
    let data='',error='';req.pipe(process.stdin);process.stdout.on('data',chunk=>data+=chunk);process.stderr.on('data',chunk=>error+=chunk);
    process.on('close',code=>{res.writeHead(code?500:200,{'Content-Type':'application/json'}).end(code?JSON.stringify({error}):data);});
    return;
  }
  const rel=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  const fixture=rel.startsWith('/__fixtures/'),base=fixture?fixtures:root;
  const target=path.resolve(base,'.'+(fixture?rel.slice('/__fixtures'.length):rel));
  if(!target.startsWith(path.resolve(base)+path.sep)){res.writeHead(403).end();return;}
  if(!fs.existsSync(target)||!fs.statSync(target).isFile()){res.writeHead(404).end();return;}
  res.writeHead(200,{'Content-Type':mime[path.extname(target)]||'application/octet-stream','Cache-Control':'no-store'});
  fs.createReadStream(target).pipe(res);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const url='http://127.0.0.1:'+server.address().port;
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'arcam-browser-check-'));
const chrome=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',[
  '--headless=new','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-first-run',
  '--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--autoplay-policy=no-user-gesture-required',
  '--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:'ignore',windowsHide:true});
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));let ws;
let id=0;const pending=new Map(),errors=[],logs=[],checks=[];
const send=(method,params={},timeout=180000)=>new Promise((resolve,reject)=>{
  const request=++id,timer=setTimeout(()=>{pending.delete(request);reject(new Error('Timeout: '+method));},timeout);
  pending.set(request,{resolve:value=>{clearTimeout(timer);resolve(value);},reject});ws.send(JSON.stringify({id:request,method,params}));
});
const evaluate=async expression=>{
  const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
  if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);
  return r.result?.value;
};
function assert(name,value){checks.push({name,pass:!!value});console.log((value?'PASS ':'FAIL ')+name);if(!value)throw new Error(name);}
async function screenshot(name){const r=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(output,name+'.png'),Buffer.from(r.data,'base64'));}
async function waitFor(expression,ms=30000){const end=Date.now()+ms;while(Date.now()<end){if(await evaluate(expression))return true;await delay(200);}throw new Error('Wait failed: '+expression);}
try {
  const devtools=path.join(profile,'DevToolsActivePort');for(let i=0;i<120&&!fs.existsSync(devtools);i++)await delay(100);
  const port=fs.readFileSync(devtools,'utf8').split('\n')[0];
  const tabs=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();
  ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
  ws.addEventListener('message',event=>{
    const m=JSON.parse(event.data);
    if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(new Error(JSON.stringify(m.error))):p.resolve(m.result);}
    if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);
    if(m.method==='Runtime.consoleAPICalled'&&['error','warning'].includes(m.params.type))logs.push(m.params.args.map(a=>a.value||a.description).join(' '));
  });
  await send('Runtime.enable');await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride',{width:430,height:932,deviceScaleFactor:1,mobile:true});
  await send('Page.navigate',{url:url+'/phone/index.html?lang=zh'});
  await waitFor("document.readyState==='complete' && typeof ARCAM_SEG==='object'");
  assert('start screen offers concise camera and photo choices',await evaluate("$('gateNote').innerText.length<110 && $('gateBtn').textContent==='打开相机' && $('gatePhoto').textContent==='导入照片'"));
  await evaluate("$('lang').click()");
  assert('new controls and start screen switch to English',await evaluate("document.documentElement.lang==='en' && $('gateBtn').textContent==='Open camera' && $('blendMix').labels[0].textContent==='2D blend strength' && $('segModel').options[2].textContent==='BiRefNet · Android only'"));
  await evaluate("$('lang').click()");
  assert('half portrait help describes its actual free placement',await evaluate("$('kind').querySelector('.kdTip').textContent.includes('自由移动') && !$('kind').querySelector('.kdTip').textContent.includes('贴下')"));
  await evaluate("start()");await waitFor('S.ready');
  assert('page and simulated camera ready',await evaluate('S.ready && v.videoWidth>0'));
  await evaluate("clearInterval(liveLightTimer); S.grid=false;S.body=false;hideKind();");
  // ★ 夹具目录里不一定有 _city_*.jpg（本机就缺）。缺了**现场合成一张**，
  //   让这套回归在任何机器上都能跑完 —— 用真图更好，但没有真图不该等于"跑不了"。
  await evaluate(`window.__ensureScene = async (name, opts) => {
    try { await loadScenePhoto('/__fixtures/' + name); return 'fixture'; } catch (e) {}
    const c = document.createElement('canvas'); c.width = 1600; c.height = 1200;
    const g = c.getContext('2d');
    const o = opts || {};
    const grd = g.createLinearGradient(0, 0, 0, 1200);
    grd.addColorStop(0, o.dark ? '#2a2f38' : '#cfd8e3');
    grd.addColorStop(1, o.dark ? '#14171c' : '#8a949f');
    g.fillStyle = grd; g.fillRect(0, 0, 1600, 1200);
    // 一点低频结构，免得测光/测噪全是常数
    for (let i = 0; i < 24; i++) {
      g.fillStyle = 'rgba(' + (o.dark ? 90 : 200) + ',' + (o.dark ? 96 : 205) + ',' + (o.dark ? 110 : 210) + ',0.35)';
      g.fillRect((i * 137) % 1600, (i * 211) % 1200, 90 + (i % 5) * 40, 60 + (i % 7) * 30);
    }
    const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.9));
    await loadScenePhoto(URL.createObjectURL(blob));
    return 'generated';
  };`);
  await screenshot('initial-mobile');
  const sceneA = await evaluate("__ensureScene('_city_indoor_0.jpg', {dark:false})");
  console.log('scene fixture A: ' + sceneA);
  assert('photo editing works and stops camera capture',await evaluate("!!scenePhoto && !v.srcObject && !$('scenePhotoCanvas').hidden"));
  const detail=await evaluate(`(()=>{
    const c=document.createElement('canvas');c.width=1600;c.height=1800;const g=c.getContext('2d');
    g.fillStyle='#d47799';g.fillRect(10,10,1580,1780);g.clearRect(600,600,10,10);
    g.fillStyle='#fff';g.fillRect(799,10,1,1780);g.fillStyle='#aaccff';g.fillRect(5,100,1,30);
    setCharset(c);autoPrepareChar();
    const p=chCanvas.getContext('2d').getImageData(0,0,chCanvas.width,chCanvas.height).data;
    const at=(x,y)=>Array.from(p.slice((y*chCanvas.width+x)*4,(y*chCanvas.width+x)*4+4));
    return {w:chCanvas.width,h:chCanvas.height,line:at(799-5,100-10),hair:at(0,100-10),hole:at(600-5,600-10)};
  })()`);
  logs.push({sourceDetail:detail});
  assert('HD import retains one-pixel interior lines and fine transparent hair',detail.w===1585&&detail.h===1780&&detail.line.every(v=>v===255)&&detail.hair[3]===255&&detail.hole[3]===0);
  const noise=await evaluate(`(()=>{
    const c=document.createElement('canvas');c.width=c.height=192;const g=c.getContext('2d');g.fillStyle='rgb(40,40,40)';g.fillRect(0,0,192,192);
    const clean=measureRegion(c,192,192,0,0,192,192,32);
    const im=g.getImageData(0,0,192,192);let state=123456;
    for(let i=0;i<im.data.length;i+=4){state^=state<<13;state^=state>>>17;state^=state<<5;const v=40+Math.round(state/2147483648*5);im.data[i]=im.data[i+1]=im.data[i+2]=v;}
    g.putImageData(im,0,0);const noisy=measureRegion(c,192,192,0,0,192,192,32);
    g.fillStyle='#a65132';g.fillRect(0,0,192,192);const colored=measureRegion(c,192,192,0,0,192,192,32);
    return {clean:clean.noise,noisy:noisy.noise,coloredConfidence:colored.neutralConfidence};
  })()`);
  logs.push({measuredNoise:noise});
  assert('noise measurement separates clean dark scenes from equally dark noisy scenes',noise.clean<.01&&noise.noisy>1&&noise.noisy<=4);
  assert('colored walls alone do not determine the white balance',noise.coloredConfidence===0);
  const palette=await evaluate(`(()=>{
    // LIGHT_SFT（旧「柔化边缘」）已移除：它只模糊 alpha，会让透明像素带出黑边。
    const keep={chCanvas,chBase,LIGHT_BRI,LIGHT_SAT,LIGHT_GRN,LIGHT_MIX};
    try{
      const c=document.createElement('canvas');c.width=c.height=32;const g=c.getContext('2d');g.fillStyle='rgb(211,119,154)';g.fillRect(0,0,32,32);
      chCanvas=c;chBase=c;LIGHT_BRI=false;LIGHT_SAT=false;LIGHT_GRN=true;LIGHT_MIX=1;
      let pixel;withLight({...LIGHT,lum:.1,neutralRB:1,neutralConfidence:1,noise:0},()=>{litSig='';bakeLit();pixel=Array.from(litCv.getContext('2d').getImageData(15,15,1,1).data);});
      return pixel;
    }finally{chCanvas=keep.chCanvas;chBase=keep.chBase;LIGHT_BRI=keep.LIGHT_BRI;LIGHT_SAT=keep.LIGHT_SAT;LIGHT_GRN=keep.LIGHT_GRN;LIGHT_MIX=keep.LIGHT_MIX;litFor=null;litSig='';}
  })()`);
  assert('neutral illumination preserves a pink palette without adding dark-scene noise',palette[0]===211&&palette[1]===119&&palette[2]===154&&palette[3]===255);
  const edge=await evaluate(`(()=>{
    const c=document.createElement('canvas');c.width=c.height=40;const g=c.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,40,40);g.fillStyle='#da6688';g.fillRect(10,10,20,20);g.clearRect(18,18,4,4);
    const before=g.getImageData(0,0,40,40).data;CUT.cutSolidBg(c,{tol:32,feather:1});const after=g.getImageData(0,0,40,40).data;
    let leaks=0;for(let i=0;i<before.length;i+=4)if((before[i+3]===0||(before[i]===255&&before[i+1]===255&&before[i+2]===255))&&after[i+3]>0)leaks++;
    return {leaks,center:after[(15*40+15)*4+3]};
  })()`);
  assert('solid cutout never feathers removed backdrop or PNG holes into the image',edge.leaks===0&&edge.center===255);
  await evaluate("loadChar('../chars/立绘/00_半身1.jpg','pink-half',-1,true)");
  const pink=await evaluate(`(()=>{
    applyCharKind('half',true);S.mode='free';S.sizePct=85;freeP.u=.5;freeP.v=.62;draw();
    return {w:chCanvas.width,h:chCanvas.height,light:{...LIGHT}};
  })()`);
  logs.push({pinkSource:pink});await screenshot('pink-half-detail');
  await evaluate("$('sheet').classList.add('open');selectWorkspace('fusion')");
  await screenshot('fusion-ui');
  assert('four workspace tabs are available',await evaluate("document.querySelectorAll('[data-workspace-tab]').length===4 && !$('workspace-fusion').hidden"));
  await evaluate("document.querySelector('[data-workspace-tab=\"fusion\"]').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}))");
  assert('workspace tabs support keyboard navigation',await evaluate("document.querySelector('[data-workspace-tab=\"frame\"]').getAttribute('aria-selected')==='true' && !$('workspace-frame').hidden"));
  await evaluate("selectWorkspace('fusion')");
  await evaluate("$('blendMix').value=75;$('blendMix').dispatchEvent(new Event('input'));$('sheet').classList.remove('open')");
  assert('blend strength control updates the renderer',await evaluate('LIGHT_MIX===.75'));
  const race=await evaluate(`(async()=>{
    const original=ARCAM_SEG.cut;
    ARCAM_SEG.cut=async canvas=>{await new Promise(resolve=>setTimeout(resolve,120));return {canvas,fg:.5,ms:120};};
    try {
      const task=$('cutAi').onclick();
      await loadChar('../chars/立绘/全身2.png','new-selection',-1,true);
      const chosen=chCanvas;await task;return {preserved:chCanvas===chosen,busy:!!$('cutAi').dataset.busy};
    } finally {ARCAM_SEG.cut=original;}
  })()`);
  assert('a finished cutout cannot overwrite a newer image',race.preserved&&!race.busy);
  const field=await evaluate(`(()=>{
    const c=document.createElement('canvas');c.width=c.height=64;const g=c.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,64,32);g.fillStyle='#000';g.fillRect(0,32,64,32);
    return measureRegion(c,64,64,0,0,64,64,32);
  })()`);
  assert('local lighting tracks vertical contrast and dark ground',field.fieldY<0&&field.groundR<.01&&field.groundG<.01);
  // Check full and half placement independently, including the shadow guard.
  const kinds=await evaluate(`(async()=>{
    await loadChar('../chars/立绘/全身2.png','full',-1,true);applyCharKind('full',true);S.pitch=12;S.d=3.8;draw();
    const full={kind:S.charKind,mode:S.mode,shot:S.shot,placement:!!currentPlacement()};
    const half=document.createElement('canvas');half.width=chCanvas.width;half.height=Math.round(chCanvas.height*.47);
    half.getContext('2d').drawImage(chCanvas,0,0);chCanvas=half;chBase=half;applyCharKind('half',true);S.mode='ground';
    const test=document.createElement('canvas');test.width=test.height=256;drawContactShadow(test.getContext('2d'),{w:160,h:200});
    const alpha=test.getContext('2d').getImageData(0,0,256,256).data;let nonzero=0;for(let i=3;i<alpha.length;i+=4)if(alpha[i])nonzero++;
    S.mode='free';draw();return {full,half:{kind:S.charKind,shot:S.shot,shadowPixels:nonzero}};
  })()`);
  assert('full body uses ground placement',kinds.full.kind==='full'&&kinds.full.mode==='ground'&&kinds.full.shot==='全身');
  assert('half portrait never receives a foot shadow',kinds.half.kind==='half'&&kinds.half.shot==='腰上'&&kinds.half.shadowPixels===0);
  await screenshot('half-portrait');
  const alphaTest=await evaluate(`(async()=>{
    const source=document.createElement('canvas');source.width=source.height=32;
    const g=source.getContext('2d');g.fillStyle='#f08080';g.fillRect(8,8,16,16);
    const p=new Float32Array(1024).fill(1),rgb=g.getImageData(0,0,32,32).data;
    const refined=ARCAM_SEG.guidedAlpha(p,rgb,32,32);
    return {constant:Math.max(...refined)-Math.min(...refined),value:refined[500]};
  })()`);
  assert('guided alpha preserves constant interiors',alphaTest.constant<1e-5&&alphaTest.value>.99);
  const keys=process.env.ARCAM_MODELS==='none'?[]:(process.env.ARCAM_MODELS||'fast,anime,birefnet').split(',');
  for(const key of keys){
    if(key==='birefnet')await evaluate(`window.ArcNative={segment(id,key,image){fetch('/__native-segment',{method:'POST',body:JSON.stringify({id,key,image})}).then(r=>r.json()).then(detail=>window.dispatchEvent(new CustomEvent('arcam-native-segmentation',{detail})));}}`);
    const r=await evaluate(`(async()=>{
      const img=new Image();img.src='/__fixtures/_models/c3.jpg';await img.decode();
      const c=document.createElement('canvas');c.width=img.width;c.height=img.height;c.getContext('2d').drawImage(img,0,0);
      const r=await ARCAM_SEG.cut(c,()=>{},${JSON.stringify(key)});
      const pixels=r.canvas.getContext('2d').getImageData(0,0,c.width,c.height).data;let soft=0,fg=0;
      for(let i=3;i<pixels.length;i+=4){if(pixels[i]>8&&pixels[i]<247)soft++;if(pixels[i]>128)fg++;}
      chCanvas=r.canvas;chBase=r.canvas;applyCharKind('half',true);draw();
      return {ms:r.ms,fg:r.fg,soft:soft/(c.width*c.height),pixels:fg};
    })()`);
    assert(key+' inference produces a usable subject',r.fg>.1&&r.fg<.85&&r.pixels>0);
    assert(key+' preserves soft alpha',r.soft>0&&r.soft<.15);logs.push({key,...r});
    await screenshot('cutout-'+key);
    if(key==='fast') {
      const transparent=await evaluate(`(async()=>{
        const image=new Image();image.src='../chars/立绘/全身2.png';await image.decode();const c=document.createElement('canvas');c.width=image.width;c.height=image.height;c.getContext('2d').drawImage(image,0,0);
        const original=c.getContext('2d').getImageData(0,0,c.width,c.height).data;
        const result=await ARCAM_SEG.cut(c,()=>{},'fast'),pixels=result.canvas.getContext('2d').getImageData(0,0,c.width,c.height).data;let leaks=0,opaque=0;
        for(let i=3;i<pixels.length;i+=4){if(original[i]===0&&pixels[i]!==0)leaks++;if(pixels[i]>200)opaque++;}
        return {leaks,opaque};
      })()`);
      assert('existing PNG holes remain transparent after inference',transparent.leaks===0&&transparent.opaque>0);
    }
  }
  await evaluate('delete window.ArcNative');
  const dom=await send('DOM.getDocument');
  const input=await send('DOM.querySelector',{nodeId:dom.root.nodeId,selector:'#f3dFile'});
  // 优先用专门的探测包；没有就退回 _mmd/loose 下的第一个 pmx（本机就缺那个 zip）
  const probeZip=path.join(fixtures,'_mmd/_probe_robin.zip');
  const looseDir=path.join(fixtures,'_mmd/loose');
  const probeFile=fs.existsSync(probeZip)?probeZip
    :(fs.existsSync(looseDir)?(()=>{const f=fs.readdirSync(looseDir).find(x=>/\.pmx$/i.test(x));return f?path.join(looseDir,f):null;})():null);
  if(!probeFile){console.log('SKIP: 找不到 MMD 测试模型（_probe_robin.zip / _mmd/loose/*.pmx）');}
  else await send('DOM.setFileInputFiles',{nodeId:input.nodeId,files:[probeFile]});
  await waitFor('M3D.canAnimate || !!M3D.error',60000);
  const loaded=await evaluate(`(()=>{
    S.pitch=10;S.d=3.4;draw();return {ready:M3D.canAnimate,physics:M3D.physicsReady,bones:M3D.stats.bones,error:M3D.error};
  })()`);
  logs.push({loaded});console.log(JSON.stringify(loaded));
  assert('PMX loads with actual Ammo physics',loaded.ready&&loaded.physics&&loaded.bones>0);
  await screenshot('mmd-toon');
  const motion=await evaluate(`(async()=>{
    const header=new Uint8Array(30);header.set(new TextEncoder().encode('Vocaloid Motion Data 0002'));
    const buffer=new ArrayBuffer(30+20+4+111*2+4*5),bytes=new Uint8Array(buffer),dv=new DataView(buffer);bytes.set(header);dv.setUint32(50,2,true);
    for(let i=0;i<2;i++){const at=54+i*111;bytes.set([0x8f,0xe3,0x94,0xbc,0x90,0x67],at);dv.setUint32(at+15,i*30,true);dv.setFloat32(at+19,i*.2,true);
      dv.setFloat32(at+31,0,true);dv.setFloat32(at+35,Math.sin(i*.12),true);dv.setFloat32(at+39,0,true);dv.setFloat32(at+43,Math.cos(i*.12),true);
      for(let p=0;p<64;p++)bytes[at+47+p]=p%4<2?20:107;
    }
    const result=await M3D.loadMotion(new File([buffer],'test.vmd'));if(!result)return {error:M3D.error};
    // ★ 时间只由 advanceMotion 推进（render 不再自己算 dt）—— 这里用显式时间戳，
    //   顺带把"暂停时推进无效、恢复后第一帧不补算"一起测了。
    M3D.advanceMotion(1000);M3D.advanceMotion(1100);draw();const time=M3D.motionTime;
    M3D.pauseMotion(true);draw();const before=M3D.motionTime;
    M3D.advanceMotion(1200);draw();const after=M3D.motionTime;
    const kept=!!M3D.motionName;M3D.pauseMotion(false);M3D.advanceMotion(1300);M3D.advanceMotion(1400);draw();
    return {time,before,after,kept,resumed:M3D.motionTime,tracks:result.tracks};
  })()`);
  assert('VMD updates matching bones',motion.tracks>0&&motion.time>0);
  assert('pause preserves the loaded motion and exact time',motion.kept&&motion.before===motion.after);
  assert('VMD resumes after pause',motion.resumed>motion.after);
  await evaluate("M3D.clearMotion();M3D.playIdle();M3D.advanceMotion(1000);M3D.advanceMotion(1100);draw()");
  assert('built-in breathing animates without a VMD file',await evaluate("M3D.motionName==='自然呼吸' && M3D.motionTime>0"));
  await evaluate('M3D.pauseMotion(true)');
  const sceneB = await evaluate("__ensureScene('_city_overcast_0.jpg', {dark:true})");
  console.log('scene fixture B: ' + sceneB);
  const physical=await evaluate("M3D.setMaterialStyle('physical')");assert('physical materials can be selected',physical);
  await evaluate('renderPose3DRow();draw()');logs.push({materials:await evaluate('M3D.materialInfo()')});await screenshot('mmd-physical');
  const visibility=await evaluate(`(()=>{
    const c=document.createElement('canvas');c.width=c.height=256;const g=c.getContext('2d');g.drawImage(M3D.canvas(),0,0,256,256);const data=g.getImageData(0,0,256,256).data;let sum=0,n=0;
    for(let i=0;i<data.length;i+=4)if(data[i+3]>220){sum+=(data[i]+data[i+1]+data[i+2])/3;n++;}
    return {mean:sum/Math.max(1,n),n};
  })()`);
  logs.push({physicalVisibility:visibility});
  // ★ 模型没有贴图时（单 .pmx 没带贴图、或贴图全缺），"物理材质不能渲成黑块"这条**测不了** ——
  //   黑是因为没贴图，不是因为材质策略错了。这时候必须**跳过并说明**，
  //   而不是把门槛降低让它假通过（那等于把这条断言废掉）。
  const texInfo=await evaluate("({ok:M3D.stats.texOk||0,miss:M3D.stats.texMiss||0,hasTex:(M3D.stats.textures||0)>0})");
  if(!texInfo.hasTex||texInfo.ok===0){
    console.log('SKIP physical materials are textured (模型没有可用贴图: ok='+texInfo.ok+' miss='+texInfo.miss+')');
  } else {
    assert('physical materials are textured and do not render as a black silhouette',visibility.n>20&&visibility.mean>45);
  }
  const shot=await evaluate(`(()=>{
    const result=composeShot(v);const frozen=buildCharCanvas();
    const first=frozen.canvas.toDataURL();M3D.playIdle();draw();const second=buildCharCanvas().canvas.toDataURL();
    return {w:result.canvas.width,h:result.canvas.height,lw:frozen.canvas.width,lh:frozen.canvas.height,stable:first===second};
  })()`);
  assert('exported character layer freezes the captured frame',shot.stable&&shot.w===shot.lw&&shot.h===shot.lh);
  assert('no uncaught page errors',errors.length===0);
  await send('Emulation.setDeviceMetricsOverride',{width:932,height:430,deviceScaleFactor:1,mobile:true});
  await evaluate('draw()');await screenshot('landscape');
} catch(error){errors.push(error.stack);console.error(error.stack);process.exitCode=1;}
finally {
  fs.writeFileSync(path.join(output,'results.json'),JSON.stringify({checks,errors,logs},null,2));
  if(ws)ws.close();chrome.kill();server.close();
  console.log('Results: '+output);
}
