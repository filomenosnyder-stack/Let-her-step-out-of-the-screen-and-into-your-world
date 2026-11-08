/**
 * 阶段 3 回归：抠图/裁切变成可重放参数；导出用原图重算高清立绘。
 *   运行：node tools/phase3-check.mjs
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const output = path.join(root, 'artifacts/phase3');
fs.mkdirSync(output, { recursive: true });
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.wasm': 'application/wasm', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png' };

const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const target = path.resolve(root, '.' + rel);
  if (!target.startsWith(path.resolve(root) + path.sep)) { res.writeHead(403).end(); return; }
  if (!fs.existsSync(target) || !fs.statSync(target).isFile()) { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'Content-Type': mime[path.extname(target)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(target).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const url = 'http://127.0.0.1:' + server.address().port;

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'bh3-phase3-'));
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-first-run',
  '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required',
  '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank'], { stdio: 'ignore', windowsHide: true });

const delay = ms => new Promise(r => setTimeout(r, ms));
let ws, id = 0;
const pending = new Map(), errors = [], checks = [];
const send = (method, params = {}, timeout = 180000) => new Promise((resolve, reject) => {
  const request = ++id;
  const timer = setTimeout(() => { pending.delete(request); reject(new Error('Timeout: ' + method)); }, timeout);
  pending.set(request, { resolve: v => { clearTimeout(timer); resolve(v); }, reject });
  ws.send(JSON.stringify({ id: request, method, params }));
});
const evaluate = async expression => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result?.value;
};
function assert(name, value, extra) {
  checks.push({ name, pass: !!value, extra });
  console.log((value ? 'PASS ' : 'FAIL ') + name + (value || extra === undefined ? '' : '  → ' + JSON.stringify(extra)));
  if (!value) throw new Error(name);
}
async function waitFor(expression, ms = 30000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await evaluate(expression)) return true; await delay(200); }
  throw new Error('Wait failed: ' + expression);
}

try {
  const devtools = path.join(profile, 'DevToolsActivePort');
  for (let i = 0; i < 120 && !fs.existsSync(devtools); i++) await delay(100);
  const port = fs.readFileSync(devtools, 'utf8').split('\n')[0];
  const tabs = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json();
  ws = new WebSocket(tabs.find(t => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); });
  ws.addEventListener('message', event => {
    const m = JSON.parse(event.data);
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result); }
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
  });
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 430, height: 932, deviceScaleFactor: 1, mobile: true });
  await send('Page.navigate', { url: url + '/phone/index.html?lang=zh' });
  await waitFor("document.readyState==='complete' && typeof ARCAM_SEG==='object'");
  await evaluate('start()'); await waitFor('S.ready');
  await evaluate("clearInterval(liveLightTimer); S.grid=false;S.body=false;hideKind();");

  // ── 造一张 2400×3600 的立绘：中间有人，四周留透明边 ──────────────────────
  const loaded = await evaluate(`(async()=>{
    const c=document.createElement('canvas');c.width=2400;c.height=3600;
    const g=c.getContext('2d');
    g.fillStyle='#d47799';g.fillRect(400,300,1600,3000);       // 主体
    g.fillStyle='#223344';g.fillRect(1000,900,400,400);        // 内部细节（眼睛）
    const blob=await new Promise(r=>c.toBlob(r,'image/png'));
    const f=new File([blob],'hi.png',{type:'image/png'});
    await loadChar(URL.createObjectURL(f),'hi.png',-1,true,f);
    return {orig:[chOrig.width,chOrig.height],canvas:[chCanvas.width,chCanvas.height],
            hasBlob:!!chSrc.blob,norm:chCropNorm?{x:+chCropNorm.x.toFixed(4),w:+chCropNorm.w.toFixed(4)}:null,
            cut:[chCut.width,chCut.height]};
  })()`);
  assert('导入保留原始 File 引用', loaded.hasBlob === true, loaded);
  assert('自动裁边把透明边去掉（画布小于原图）',
    loaded.canvas[0] < loaded.orig[0] && loaded.norm !== null, loaded);
  assert('抠图结果保持原图尺寸（裁切不再物理裁掉坐标）',
    loaded.cut[0] === loaded.orig[0] && loaded.cut[1] === loaded.orig[1], loaded);

  // ── 1. 可重放：从 chCut + chCropNorm 重算的结果必须和当前画布逐像素一致 ──
  const replay = await evaluate(`(()=>{
    const again=cropByNorm(chCut,chCropNorm);
    if(again.width!==chCanvas.width||again.height!==chCanvas.height)return {same:false,w:[again.width,chCanvas.width],h:[again.height,chCanvas.height]};
    const a=again.getContext('2d').getImageData(0,0,again.width,again.height).data;
    const b=chCanvas.getContext('2d').getImageData(0,0,chCanvas.width,chCanvas.height).data;
    let diff=0,max=0;
    for(let i=0;i<a.length;i++){const d=Math.abs(a[i]-b[i]);if(d){diff++;if(d>max)max=d;}}
    return {same:true,diff,max,total:a.length};
  })()`);
  assert('同一份「抠图 + 裁切」能重放出同一张图（逐像素一致）',
    replay.same && replay.diff === 0, replay);

  // ── 2. 连续两次「自动裁边」不会越裁越小 ─────────────────────────────────
  const twice = await evaluate(`(()=>{
    const first=[chCanvas.width,chCanvas.height];
    $('trimBtn').onclick();
    const second=[chCanvas.width,chCanvas.height];
    return {first,second};
  })()`);
  assert('连按「自动裁边」结果稳定（幂等）',
    twice.first[0] === twice.second[0] && twice.first[1] === twice.second[1], twice);

  // ── 3. 高清立绘：用原图重算，比工作副本宽 ────────────────────────────────
  const hi = await evaluate(`(async()=>{
    const target=Math.round(chCanvas.width*2);
    const canvas=await buildCharHi(target);
    if(!canvas)return {null:true};
    const workAspect=chCanvas.width/chCanvas.height;
    return {work:[chCanvas.width,chCanvas.height],hi:[canvas.width,canvas.height],
            aspectDiff:Math.abs(canvas.width/canvas.height-workAspect),
            target};
  })()`);
  assert('高清立绘按原图重算，宽于工作副本', !hi.null && hi.hi[0] > hi.work[0], hi);
  assert('高清立绘与工作副本宽高比一致（同一构图、同一裁切）', hi.aspectDiff < 0.002, hi);

  // ── 4. 导出真的用高清立绘，预览仍用工作副本 ──────────────────────────────
  // ⚠ 必须先有背景照片：实时相机没有更高分辨率可用，planExport 会给 1×，
  //   那时"高清立绘"本来就没有意义（人物不会被放大，也就不需要更多像素）。
  await evaluate(`(async()=>{
    const c=document.createElement('canvas');c.width=4000;c.height=3000;
    const g=c.getContext('2d');g.fillStyle='#8899aa';g.fillRect(0,0,4000,3000);
    const blob=await new Promise(r=>c.toBlob(r,'image/png'));
    await loadScenePhoto(URL.createObjectURL(blob));
  })()`);
  const src = await evaluate(`(async()=>{
    const orig=CanvasRenderingContext2D.prototype.drawImage;
    let maxW=0;
    CanvasRenderingContext2D.prototype.drawImage=function(s,...rest){
      if(s&&s.width&&s.width>maxW&&s!==cv&&s!==$('scenePhotoCanvas'))maxW=s.width;
      return orig.call(this,s,...rest);
    };
    try{
      const plan=planExport();
      await prepareExportChar(plan);
      const during=exportCharSrc?exportCharSrc.width:0;
      buildShotAt(plan);
      releaseExportChar();
      return {during,after:exportCharSrc,maxW,work:chCanvas.width};
    } finally { CanvasRenderingContext2D.prototype.drawImage=orig; }
  })()`);
  assert('导出期间换上高清立绘', src.during > src.work, src);
  assert('导出画的是高清立绘（不是工作副本放大）', src.maxW > src.work, src);
  assert('导出结束后借用状态被清掉', src.after === null, src);

  // ── 5. 没有原图可重算时静默回退，不报错 ──────────────────────────────────
  const fallback = await evaluate(`(async()=>{
    const keep={...chSrc};
    chSrc={blob:null,url:'',name:'',w:0,h:0};
    chHi=null;chHiKey='';
    try{
      const plan=planExport();
      await prepareExportChar(plan);
      const hi=exportCharSrc;
      const shot=buildShotAt(plan).canvas;
      releaseExportChar();
      return {hi:hi===null,shot:[shot.width,shot.height]};
    } finally { chSrc=keep; }
  })()`);
  assert('没有原始引用时静默回退到工作副本', fallback.hi === true && fallback.shot[0] > 0, fallback);

  // ── 6. 「还原原始素材」只重置抠图与裁切，不动摆位/构图 ────────────────────
  const reset = await evaluate(`(()=>{
    const before={mode:S.mode,frame:S.frame,pitch:+S.pitch.toFixed(2),d:+S.d.toFixed(2),
                  u:+freeP.u.toFixed(3),v:+freeP.v.toFixed(3)};
    $('chReset').onclick();
    const after={mode:S.mode,frame:S.frame,pitch:+S.pitch.toFixed(2),d:+S.d.toFixed(2),
                 u:+freeP.u.toFixed(3),v:+freeP.v.toFixed(3)};
    return {before,after,crop:chCropNorm,size:[chCanvas.width,chCanvas.height],orig:[chOrig.width,chOrig.height]};
  })()`);
  assert('还原原始素材后裁切被清掉、画布回到原图尺寸',
    reset.crop === null && reset.size[0] === reset.orig[0] && reset.size[1] === reset.orig[1], reset);
  assert('还原原始素材不动摆位与构图',
    JSON.stringify(reset.before) === JSON.stringify(reset.after), reset);

  assert('没有未捕获的页面异常', errors.length === 0, errors);
} catch (error) {
  errors.push(error.stack); console.error(error.stack); process.exitCode = 1;
} finally {
  fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({ checks, errors }, null, 2));
  if (ws) ws.close(); chrome.kill(); server.close();
  console.log('Results: ' + output);
}
