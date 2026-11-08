/**
 * 阶段 2（ExportPlan）回归：出图尺寸由作品设置决定，细节来自原图。
 * 不依赖外部素材：现场合成一张 4000×3000、带 1px 竖条的高频图当"原图"。
 *   运行：node tools/phase2-check.mjs
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const output = path.join(root, 'artifacts/phase2');
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

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'bh3-phase2-'));
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

  // ── 造一张 4000×3000 的"原图"：竖向 1px 黑白相间的高频条纹 ────────────────
  const made = await evaluate(`(async()=>{
    const c=document.createElement('canvas');c.width=4000;c.height=3000;
    const g=c.getContext('2d');
    g.fillStyle='#808080';g.fillRect(0,0,4000,3000);
    // 中间一条 1px 黑白相间的带：一旦被降采样就会变成一片灰
    for(let x=1000;x<3000;x++){g.fillStyle=(x%2)?'#000':'#fff';g.fillRect(x,1400,1,200);}
    const blob=await new Promise(r=>c.toBlob(r,'image/png'));
    const u=URL.createObjectURL(blob);
    await loadScenePhoto(u);
    return {sw:scenePhoto.naturalWidth,sh:scenePhoto.naturalHeight,cw:cv.width,ch:cv.height};
  })()`);
  assert('原图保留全分辨率，编辑画布仍是代理尺寸', made.sw === 4000 && made.sh === 3000 && made.cw === 2560, made);

  // ── 1× 与自动：输出尺寸不同，但取景完全一致 ──────────────────────────────
  // ⚠ 输出是**取景框**那一块，不是整块画布（满幅以外都按画幅裁），
  //   所以 1× 输出 = frameRect 的尺寸，不是 cv 的尺寸。
  const sizes = await evaluate(`(()=>{
    EXPORT.sizeMode='x1'; syncOutRow(); const p1=planExport();
    const c1=buildShotAt(p1).canvas;
    const R1=frameRect();
    EXPORT.sizeMode='auto'; syncOutRow(); const p2=planExport();
    const c2=buildShotAt(p2).canvas;
    return {p1:{k:p1.scale,w:p1.width,h:p1.height},p2:{k:p2.scale,w:p2.width,h:p2.height},
            c1:{w:c1.width,h:c1.height},c2:{w:c2.width,h:c2.height},
            rect:{w:Math.round(R1.w),h:Math.round(R1.h)},
            preview:{w:cv.width,h:cv.height}};
  })()`);
  assert('1× 输出等于取景框尺寸', sizes.c1.w === sizes.rect.w && sizes.c1.h === sizes.rect.h, sizes);
  assert('自动模式按原图上限放大（>1×）', sizes.p2.k > 1.2 && sizes.c2.w > sizes.c1.w, sizes);
  assert('放大后与 1× 严格等比（同一构图）',
    Math.abs(sizes.c2.w - Math.round(sizes.c1.w * sizes.p2.k)) <= 2 &&
    Math.abs(sizes.c2.h - Math.round(sizes.c1.h * sizes.p2.k)) <= 2, sizes);
  assert('输出不超过原图分辨率（不无中生有）',
    sizes.c2.w <= Math.round(made.sw * (sizes.c1.w / sizes.preview.w)) + 2, sizes);

  // ── 2. 出图真的读原图，而不是把代理图放大 ───────────────────────────────
  // 用"看它到底画了哪个对象"来判，不用对比度：对比度会被双线性插值的锯齿骗过去，
  // 而"读的是 scenePhoto 还是 scenePhotoCanvas"是一个没有解释空间的事实。
  const detail = await evaluate(`(()=>{
    const proxy=$('scenePhotoCanvas');
    const seen=[];
    const orig=CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage=function(src,...rest){
      seen.push(src===scenePhoto?'original':(src===proxy?'proxy':'other'));
      return orig.call(this,src,...rest);
    };
    try{
      EXPORT.sizeMode='x1'; buildShotAt(planExport());
      const at1=seen.splice(0,seen.length);
      EXPORT.sizeMode='auto'; buildShotAt(planExport());
      const atAuto=seen.splice(0,seen.length);
      return {at1,atAuto,srcW:scenePhoto.naturalWidth,proxyW:proxy.width};
    } finally { CanvasRenderingContext2D.prototype.drawImage=orig; }
  })()`);
  assert('1× 出图读的是代理图', detail.at1.includes('proxy') && !detail.at1.includes('original'), detail);
  assert('放大出图读的是原图（细节来自原图）',
    detail.atAuto.includes('original') && detail.srcW > detail.proxyW, detail);

  const infoText = await evaluate(`(()=>{EXPORT.sizeMode='auto';syncOutRow();return $('outInfo').textContent;})()`);
  // 人物那一句有两种说法：能按原图重算时不说"放大"（见 syncOutRow 的 canHi）
  assert('照片模式下提示写明输出像素与人物处理方式',
    /输出/.test(infoText) && /\d+×\d+/.test(infoText) && /(人物放大|按原图重算)/.test(infoText), infoText);

  // ── 3. 出图后预览被还原并重绘 ────────────────────────────────────────────
  // ⚠ 不能靠"角落有没有像素"判断：#c 是**透明浮层**，角落本来就该是透明的。
  //   改尺寸会清空画布，所以要看"还原之后有没有重新 draw 一次"。
  const restored = await evaluate(`(()=>{
    const w0=cv.width,h0=cv.height;
    let draws=0; const original=draw;
    window.draw=function(){draws++;return original.apply(this,arguments);};
    try{ EXPORT.sizeMode='auto'; buildShotAt(planExport()); }
    finally{ window.draw=original; }
    return {w0,h0,now:[cv.width,cv.height],draws};
  })()`);
  assert('出图后画布尺寸还原', restored.now[0] === restored.w0 && restored.now[1] === restored.h0, restored);
  assert('还原后重绘了预览（不会留一块空白）', restored.draws >= 1, restored);

  // ── 4. 素材包：合成图与立绘层同尺寸、同裁切框 ────────────────────────────
  const pack = await evaluate(`(()=>{
    const c=document.createElement('canvas');c.width=600;c.height=1200;
    const g=c.getContext('2d');g.fillStyle='#d47799';g.fillRect(150,100,300,1000);
    setCharset(c);chBase=copyOf(c);chCanvas=copyOf(c);
    applyCharKind('full',true);
    const plan=planExport();let R=null,shot=null,char=null;
    withExportScale(plan.scale,()=>{R=frameRect();const r=composeShot(v);shot=r.canvas;
      if(chCanvas&&currentPlacement())char=buildCharCanvas().canvas;});
    return {shot:shot&&[shot.width,shot.height],char:char&&[char.width,char.height],
            rect:[Math.round(R.w),Math.round(R.h)],k:+plan.scale.toFixed(3)};
  })()`);
  assert('素材包的合成图与立绘层尺寸一致', pack.shot && pack.char &&
    pack.shot[0] === pack.char[0] && pack.shot[1] === pack.char[1], pack);
  assert('素材包的裁切框与输出尺寸一致', pack.rect[0] === pack.shot[0] && pack.rect[1] === pack.shot[1], pack);

  // ── 5. 实时相机没有更高分辨率可用 → 明确说明，不假装能放大 ───────────────
  const videoMode = await evaluate(`(()=>{
    scenePhoto=null;cv.width=720;cv.height=1280;
    EXPORT.sizeMode='auto';syncOutRow();
    const p=planExport();
    return {k:p.scale,video:p.video,info:$('outInfo').textContent};
  })()`);
  assert('实时相机下不做无意义的放大', videoMode.k === 1 && videoMode.video === true, videoMode);
  assert('实时相机下提示说明分辨率来源', /视频帧|video frame/i.test(videoMode.info), videoMode.info);

  // ── 6. 拍照保存失败要说清"没写成"并带上实际像素 ──────────────────────────
  // ⚠ 快门是 addEventListener 挂的，click() 不会等它 —— 要等回执出现。
  await evaluate(`(()=>{
    scenePhoto=null;cv.width=720;cv.height=1280;S.ready=true;
    $('saveNote').textContent='';
    window.ArcLog={saveChunk(){},saveEnd(){return null;}};
    $('shot').click();
  })()`);
  await waitFor("$('saveNote').innerText.length>0", 15000);
  const shot = await evaluate(`(()=>{const note=$('saveNote').innerText;delete window.ArcLog;return {note};})()`);
  assert('拍照失败提示写明没写成', /保存失败/.test(shot.note), shot.note);
  assert('拍照回执带实际输出像素', /\d+×\d+/.test(shot.note), shot.note);

  assert('没有未捕获的页面异常', errors.length === 0, errors);
} catch (error) {
  errors.push(error.stack); console.error(error.stack); process.exitCode = 1;
} finally {
  fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({ checks, errors }, null, 2));
  if (ws) ws.close(); chrome.kill(); server.close();
  console.log('Results: ' + output);
}
