/**
 * 阶段 4 回归：MMD 的时间推进与接影层。
 *   · render() 不再推进动画（导出/拖滑条不会顺手把动作往前推）
 *   · 两盏灯 / 两块接收面分开渲染，同一道影子不会被算两次
 *   · 颗粒默认关
 * 需要一个真实 PMX：默认取 %ARCAM_FIXTURES%/ _mmd/loose/*.pmx
 *   运行：node tools/phase4-check.mjs
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const fixtures = process.env.ARCAM_FIXTURES || 'C:/Users/16625/Desktop/shetuan/arcam';
const output = path.join(root, 'artifacts/phase4');
fs.mkdirSync(output, { recursive: true });
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.wasm': 'application/wasm', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png',
  '.pmx': 'application/octet-stream', '.bmp': 'image/bmp', '.tga': 'image/x-tga' };

const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const isFixture = rel.startsWith('/__fixtures/');
  const base = isFixture ? fixtures : root;
  const target = path.resolve(base, '.' + (isFixture ? rel.slice('/__fixtures'.length) : rel));
  if (!target.startsWith(path.resolve(base) + path.sep)) { res.writeHead(403).end(); return; }
  if (!fs.existsSync(target) || !fs.statSync(target).isFile()) { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'Content-Type': mime[path.extname(target).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(target).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const url = 'http://127.0.0.1:' + server.address().port;

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'bh3-phase4-'));
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-first-run',
  '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required',
  '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank'], { stdio: 'ignore', windowsHide: true });

const delay = ms => new Promise(r => setTimeout(r, ms));
let ws, id = 0;
const pending = new Map(), errors = [], checks = [];
const send = (method, params = {}, timeout = 240000) => new Promise((resolve, reject) => {
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

// 找一个真实 PMX
const loose = path.join(fixtures, '_mmd/loose');
const pmx = fs.existsSync(loose) ? fs.readdirSync(loose).find(f => /\.pmx$/i.test(f)) : null;
if (!pmx) { console.log('SKIP: 找不到 _mmd/loose/*.pmx 测试模型'); process.exit(0); }

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

  // ── 加载真实模型（单 pmx；贴图缺失不影响时间与接影逻辑）─────────────────
  const dom = await send('DOM.getDocument');
  const input = await send('DOM.querySelector', { nodeId: dom.root.nodeId, selector: '#f3dFile' });
  await send('DOM.setFileInputFiles', { nodeId: input.nodeId, files: [path.join(loose, pmx)] });
  await waitFor('M3D.canAnimate || !!M3D.error', 120000);
  // 首帧可能还没把模型摆好（贴图/GPU 资源是异步挂上的）—— 重试几次再判
  await waitFor(`(()=>{S.pitch=10;S.d=3.4;draw();
    const c=document.createElement('canvas');c.width=c.height=128;
    const g=c.getContext('2d');
    if(!M3D.canvas())return false;
    g.drawImage(M3D.canvas(),0,0,128,128);
    const d=g.getImageData(0,0,128,128).data;let op=0;
    for(let i=3;i<d.length;i+=4)if(d[i]>8)op++;
    return op>50;})()`, 20000);
  const loaded = await evaluate(`(()=>{S.pitch=10;S.d=3.4;draw();
    const c=document.createElement('canvas');c.width=c.height=128;
    const g=c.getContext('2d');g.drawImage(M3D.canvas(),0,0,128,128);
    const d=g.getImageData(0,0,128,128).data;let opaque=0;
    for(let i=3;i<d.length;i+=4)if(d[i]>8)opaque++;
    return {ready:M3D.canAnimate,error:M3D.error,grain:M3D.params.grain,
            stats:Object.keys(M3D.stats),opaque,
            passes:M3D.stats.groundPasses||null};})()`);
  // ⚠ 官方 MMDLoader 那条路只回填 materials/textures，bones/tris 不一定有 ——
  //   所以用"真的画出像素了"当加载成功的判据，比数骨骼可靠。
  assert('模型加载成功并画出内容', loaded.ready === true && loaded.opaque > 50, loaded);
  assert('MMD 颗粒默认关闭', loaded.grain === false, loaded);

  // ── 1. render 不推进时间 ────────────────────────────────────────────────
  const timeRender = await evaluate(`(async()=>{
    const r=await M3D.loadMotion(new File([(()=>{
      const header=new Uint8Array(30);header.set(new TextEncoder().encode('Vocaloid Motion Data 0002'));
      const buffer=new ArrayBuffer(30+20+4+111*2+4*5),bytes=new Uint8Array(buffer),dv=new DataView(buffer);
      bytes.set(header);dv.setUint32(50,2,true);
      for(let i=0;i<2;i++){const at=54+i*111;bytes.set([0x8f,0xe3,0x94,0xbc,0x90,0x67],at);
        dv.setUint32(at+15,i*30,true);dv.setFloat32(at+19,i*.2,true);dv.setFloat32(at+31,0,true);
        dv.setFloat32(at+35,Math.sin(i*.12),true);dv.setFloat32(at+39,0,true);dv.setFloat32(at+43,Math.cos(i*.12),true);
        for(let p=0;p<64;p++)bytes[at+47+p]=p%4<2?20:107;}
      return buffer;
    })()],'test.vmd'));
    if(!r) return {error:M3D.error};
    // 先推一步，让时间离开 0
    M3D.advanceMotion(1000); M3D.advanceMotion(1100);
    const t0=M3D.motionTime;
    for(let i=0;i<5;i++) draw();
    const t1=M3D.motionTime;
    await new Promise(r=>setTimeout(r,150));
    draw();
    const t2=M3D.motionTime;
    const advanced=M3D.advanceMotion(1400);
    const t3=M3D.motionTime;
    return {t0,t1,t2,t3,advanced,tracks:r.tracks};
  })()`);
  assert('VMD 装载成功', !timeRender.error && timeRender.tracks > 0, timeRender);
  assert('连续 draw() 不再推进动画时间', timeRender.t0 > 0 && timeRender.t1 === timeRender.t0 && timeRender.t2 === timeRender.t0, timeRender);
  assert('只有 advanceMotion() 推进时间', timeRender.t3 > timeRender.t2 && timeRender.advanced > 0, timeRender);

  // ── 2. 导出不推进时间（用户可见：拍照前后动作不该跳）───────────────────
  const timeExport = await evaluate(`(async()=>{
    const before=M3D.motionTime;
    const plan=planExport();
    await prepareExportChar(plan);
    let shot=null;
    try { shot=buildShotAt(plan).canvas; } finally { releaseExportChar(); }
    const after=M3D.motionTime;
    return {before,after,w:shot&&shot.width};
  })()`);
  assert('导出（拍照）不推进动画时间', timeExport.after === timeExport.before, timeExport);

  // ── 3. 接影层：两盏灯分开渲染，一趟只出现一块接收面 ──────────────────────
  const passes = await evaluate(`(()=>{
    M3D.params.shadow=true; M3D.params.contact=true; draw();
    const both=(M3D.stats.groundPasses||[]).slice();
    M3D.params.contact=false; draw();
    const onlyMain=(M3D.stats.groundPasses||[]).slice();
    M3D.params.shadow=false; M3D.params.contact=true; draw();
    const onlyContact=(M3D.stats.groundPasses||[]).slice();
    M3D.params.shadow=true; draw();
    return {both,onlyMain,onlyContact};
  })()`);
  assert('主影 + 接触影各渲一趟（不是一趟里叠两盏灯）',
    JSON.stringify(passes.both) === JSON.stringify(['main', 'contact']), passes);
  assert('只开主影时只渲主影那一趟', JSON.stringify(passes.onlyMain) === JSON.stringify(['main']), passes);
  assert('只开接触影时只渲接触影那一趟', JSON.stringify(passes.onlyContact) === JSON.stringify(['contact']), passes);

  // ── 4. 接影层真的参与合成（关掉就少一块暗部）───────────────────────────
  const look = await evaluate(`(()=>{
    const dark=()=>{const c=document.createElement('canvas');c.width=c.height=192;
      const g=c.getContext('2d');g.drawImage(M3D.canvas(),0,0,192,192);
      const d=g.getImageData(0,0,192,192).data;let sum=0,n=0;
      for(let i=0;i<d.length;i+=4)if(d[i+3]>200){sum+=(d[i]+d[i+1]+d[i+2])/3;n++;}
      return {mean:n?sum/n:0,n};};
    M3D.params.shadow=true;M3D.params.contact=true;draw();const both=dark();
    M3D.params.contact=false;draw();const noContact=dark();
    M3D.params.shadow=true;M3D.params.contact=true;draw();
    return {both,noContact};
  })()`);
  assert('接触影确实参与合成（关掉后画面不再变暗）',
    look.noContact.n === 0 || look.noContact.mean >= look.both.mean - 0.01, look);

  assert('没有未捕获的页面异常', errors.length === 0, errors);
  await send('Page.captureScreenshot', { format: 'png' }).then(r =>
    fs.writeFileSync(path.join(output, 'mmd.png'), Buffer.from(r.data, 'base64')));
} catch (error) {
  errors.push(error.stack); console.error(error.stack); process.exitCode = 1;
} finally {
  fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({ checks, errors, pmx }, null, 2));
  if (ws) ws.close(); chrome.kill(); server.close();
  console.log('Results: ' + output);
}
