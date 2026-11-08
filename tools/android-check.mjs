import fs from 'node:fs';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const output=path.join(root,'artifacts/android');fs.mkdirSync(output,{recursive:true});
const serial=process.env.ARCAM_DEVICE||'emulator-5560';
const sdk=process.env.ANDROID_SDK_ROOT||'D:/app/apkbuild/android-sdk';
const adbPath=path.join(sdk,'platform-tools/adb.exe'),exec=promisify(execFile);
const adb=async(...args)=>(await exec(adbPath,['-s',serial,...args],{windowsHide:true,maxBuffer:8*1024*1024})).stdout.trim();
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const checks=[],errors=[],metrics=[];let ws,id=0;const pending=new Map();
function assert(name,value){checks.push({name,pass:!!value});console.log((value?'PASS ':'FAIL ')+name);if(!value)throw new Error(name);}
const send=(method,params={},ms=240000)=>new Promise((resolve,reject)=>{
  const request=++id,timer=setTimeout(()=>{pending.delete(request);reject(new Error('Timed out: '+method));},ms);
  pending.set(request,{resolve:value=>{clearTimeout(timer);resolve(value);},reject});ws.send(JSON.stringify({id:request,method,params}));
});
async function evaluate(expression){
  const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,userGesture:true});
  if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);
  return r.result?.value;
}
async function waitFor(expression,ms=60000){const end=Date.now()+ms;while(Date.now()<end){if(await evaluate(expression))return;await delay(300);}throw new Error('Wait failed: '+expression);}
async function screenshot(name){await delay(450);await adb('shell','screencap','-p','/sdcard/arcam-check.png');await adb('pull','/sdcard/arcam-check.png',path.join(output,name+'.png'));}
async function dump(){await adb('shell','uiautomator','dump','/sdcard/arcam-window.xml');return adb('shell','cat','/sdcard/arcam-window.xml');}
async function tapNode(xml,match){
  for(const node of xml.matchAll(/<node\b[^>]*>/g)){
    if(!match.test(node[0]))continue;
    const b=/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/.exec(node[0]);if(!b)continue;
    await adb('shell','input','tap',String(Math.round((+b[1]+ +b[3])/2)),String(Math.round((+b[2]+ +b[4])/2)));return true;
  }
  return false;
}
async function chooseFile(filename){
  await delay(600);let xml=await dump();
  if(await tapNode(xml,new RegExp('text="'+filename.replaceAll('.','\\.')+'"')))return;
  if(await tapNode(xml,/content-desc="Show roots"/)){await delay(300);xml=await dump();}
  if(await tapNode(xml,/text="Downloads"/)){await delay(300);xml=await dump();}
  if(!await tapNode(xml,new RegExp('text="'+filename.replaceAll('.','\\.')+'"'))){fs.writeFileSync(path.join(output,'file-picker.xml'),xml);await screenshot('file-picker');throw new Error('File picker could not select '+filename);}
}
try {
  let pid='';
  for(let attempt=0;attempt<100;attempt++){
    pid=await adb('shell','pidof','com.arcam.viewfinder').catch(()=>'');
    if(pid)break;await delay(300);
  }
  assert('Android app process is running',!!pid);
  await adb('forward','tcp:9887','localabstract:webview_devtools_remote_'+pid);
  let page;
  for(let attempt=0;attempt<100;attempt++){
    try{const tabs=await(await fetch('http://127.0.0.1:9887/json/list')).json();page=tabs.find(tab=>tab.url.includes('appassets.androidplatform.net'));}catch(error){}
    if(page)break;await delay(300);
  }
  if(!page)throw new Error('Android WebView debugging page did not become ready');
  ws=new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
  ws.addEventListener('message',event=>{const m=JSON.parse(event.data);
    if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(new Error(JSON.stringify(m.error))):p.resolve(m.result);}
    if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);
  });
  await send('Runtime.enable');await send('Page.enable');
  await waitFor("typeof ARCAM_SEG==='object' && typeof ArcNative.segment==='function'");
  assert('compiled Android ONNX bridge is exposed',await evaluate("typeof ArcNative.segment==='function'"));
  await evaluate('start()');await waitFor('S.ready');assert('Android camera permission and WebView camera work',await evaluate('v.videoWidth>0'));
  await evaluate('clearInterval(liveLightTimer);S.grid=false;S.body=false;hideKind()');
  const fixtures=process.env.ARCAM_FIXTURES;
  if(!fixtures)throw new Error('Set ARCAM_FIXTURES to the local test image/model directory');
  const qualityOnly=process.env.ARCAM_CHECK==='quality';
  await adb('push',path.join(fixtures,qualityOnly?'_city_indoor_0.jpg':'_city_overcast_0.jpg'),'/sdcard/Download/arcam-scene.jpg');
  if(!qualityOnly)await adb('push',path.join(fixtures,'_mmd/_probe_robin.zip'),'/sdcard/Download/arcam-model.zip');
  await evaluate("$('pickScenePhoto').click()");await chooseFile('arcam-scene.jpg');await waitFor('!!scenePhoto');
  assert('native file chooser imports a real scene photo',await evaluate('!!scenePhoto && !v.srcObject'));
  await screenshot('photo-import');
  if(qualityOnly){
    await evaluate("loadChar('../chars/立绘/00_半身1.jpg','pink-half',-1,true)");
    const result=await evaluate(`(()=>{
      applyCharKind('half',true);S.mode='free';S.sizePct=85;freeP.u=.5;freeP.v=.62;draw();
      const clean=document.createElement('canvas');clean.width=clean.height=128;const g=clean.getContext('2d');g.fillStyle='#282828';g.fillRect(0,0,128,128);
      return {w:chCanvas.width,h:chCanvas.height,light:{...LIGHT},noise:measureSceneNoise(clean,128,128,{sx:0,sy:0,sw:128,sh:128}),detail:$('sourceDetail').textContent};
    })()`);
    metrics.push({quality:result});
    assert('Android retains all effective pixels of the bundled half portrait',result.w===386&&result.h===857);
    assert('Android photo lighting updates immediately and stays finite',result.light.ok&&Number.isFinite(result.light.neutralRB)&&Number.isFinite(result.light.noise));
    assert('Android clean dark photos receive no synthetic noise',result.noise===0);
    assert('Android reports effective source resolution',result.detail.includes('386')&&result.detail.includes('857'));
    assert('Android half portraits hide foot shadow controls',await evaluate("$('tShd').style.display==='none' && $('shadowGain').parentElement.style.display==='none'"));
    await screenshot('pink-half-quality');
    const exported=await evaluate(`(async()=>{
      const shot=composeShot(v),blob=await new Promise(resolve=>shot.canvas.toBlob(resolve,'image/png'));
      return saveBlob(blob,'arcam-quality.png');
    })()`);
    assert('Android exports the corrected composite through the native file bridge',exported==='native');
    await adb('pull','/sdcard/Download/ARView/arcam-quality.png',path.join(output,'pink-half-export.png'));
    await evaluate("if(!document.documentElement.lang.startsWith('zh'))$('lang').click();if(!sheetOpen)$('sheetToggle').click();selectWorkspace('fusion');draw()");await screenshot('quality-controls');
    assert('Android fusion controls are visible on screen',await evaluate("$('sourceDetail').getBoundingClientRect().height>0 && $('sheet').getBoundingClientRect().height>100"));
  } else {
  await evaluate("window.__nativeEvents=0;window.addEventListener('arcam-native-segmentation',()=>window.__nativeEvents++);");
  for(const key of ['fast','anime','birefnet']){
    console.log('RUN native model '+key);
    const result=await evaluate(`(async()=>{
      const image=new Image();image.src='../chars/立绘/全身2.png';await image.decode();
      const c=document.createElement('canvas');c.width=image.width;c.height=image.height;c.getContext('2d').drawImage(image,0,0);
      const original=c.getContext('2d').getImageData(0,0,c.width,c.height).data;
      const before=window.__nativeEvents;const r=await ARCAM_SEG.cut(c,()=>{},${JSON.stringify(key)});
      const pixels=r.canvas.getContext('2d').getImageData(0,0,c.width,c.height).data;let leaks=0,opaque=0;
      for(let i=3;i<pixels.length;i+=4){if(original[i]===0&&pixels[i]!==0)leaks++;if(pixels[i]>200)opaque++;}
      chCanvas=r.canvas;chBase=r.canvas;applyCharKind('full',true);S.pitch=12;S.d=3.8;draw();
      return {key:${JSON.stringify(key)},ms:r.ms,fg:r.fg,leaks,opaque,native:window.__nativeEvents===before+1,wasmLoaded:typeof ort!=='undefined'};
    })()`);
    metrics.push(result);console.log(JSON.stringify(result));
    assert(key+' executes through Android ONNX, preserves transparency, and finds the character',result.native&&!result.wasmLoaded&&result.opaque>0&&result.leaks===0&&result.fg>.05&&result.fg<.85);
    await screenshot('native-'+key);
  }
  await evaluate("$('f3d').click()");await chooseFile('arcam-model.zip');await waitFor('M3D.canAnimate || !!M3D.error',90000);
  assert('Android imports PMX/ZIP and enables real physics',await evaluate('M3D.canAnimate && M3D.physicsReady'));
  await evaluate("M3D.playIdle();draw()");await delay(150);await evaluate('draw()');
  assert('Android MMD breathing animation advances',await evaluate('M3D.motionTime>0'));
  await evaluate("M3D.pauseMotion(true);draw()");await screenshot('native-mmd');
  await evaluate("M3D.setMaterialStyle('physical')");await waitFor('M3D.ready || !!M3D.error',90000);
  assert('Android physical material switch preserves textured model',await evaluate("M3D.ready && !M3D.error && M3D.materialInfo().some(m=>m.map)"));
  await evaluate('draw()');await screenshot('native-mmd-physical');
  await evaluate("(async()=>{await loadChar('../chars/立绘/全身2.png');applyCharKind('half',true);draw()})()");
  assert('Android half portrait uses upper-body framing',await evaluate("S.charKind==='half' && S.shot==='腰上' && !use3D"));
  await screenshot('native-half');
  const saved=await evaluate("saveBlob(new Blob(['arcam-native-export-ok'],{type:'text/plain'}),'arcam-native-check.txt')");
  assert('native export reports a successful public download',saved==='native');
  const content=await adb('shell','cat','/sdcard/Download/ARView/arcam-native-check.txt');
  assert('export actually exists outside the private app directory',content==='arcam-native-export-ok');
  }
  fs.writeFileSync(path.join(output,'meminfo.txt'),await adb('shell','dumpsys','meminfo','com.arcam.viewfinder'));
  assert('no uncaught JavaScript errors in the Android app',errors.length===0);
}catch(error){errors.push(error.stack);console.error(error.stack);process.exitCode=1;
  fs.writeFileSync(path.join(output,'logcat.txt'),await adb('logcat','-d','-t','400').catch(()=>''));
  await screenshot('failure').catch(()=>{});
}finally{
  fs.writeFileSync(path.join(output,'results.json'),JSON.stringify({device:serial,checks,metrics,errors},null,2));
  if(ws)ws.close();console.log('Results: '+output);
}
