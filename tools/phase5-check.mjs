/**
 * 阶段 5 回归：作品裁切与 UI 布局解耦（UI-03）。
 * 不变量：**面板开合、抽屉高度、窗口尺寸、系统字号、语言切换，都不许改出图裁切。**
 *   运行：node tools/phase5-check.mjs
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const output = path.join(root, 'artifacts/phase5');
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

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'bh3-phase5-'));
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-first-run',
  '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required',
  '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank'], { stdio: 'ignore', windowsHide: true });

const delay = ms => new Promise(r => setTimeout(r, ms));
let ws, id = 0;
const pending = new Map(), errors = [], checks = [];
const send = (method, params = {}, timeout = 120000) => new Promise((resolve, reject) => {
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

// 页面里取"当前裁切"的指纹
const cropSig = `(()=>{const R=frameRect();return [Math.round(R.x),Math.round(R.y),Math.round(R.w),Math.round(R.h)].join(',');})()`;

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

  // 铺一张 4:3 的背景照片，画布 = 2560×1920
  await evaluate(`(async()=>{
    const c=document.createElement('canvas');c.width=4000;c.height=3000;
    const g=c.getContext('2d');g.fillStyle='#7f8c8d';g.fillRect(0,0,4000,3000);
    const blob=await new Promise(r=>c.toBlob(r,'image/png'));
    await loadScenePhoto(URL.createObjectURL(blob));
  })()`);

  // ── 1. 换画幅会改裁切（这是唯一该改的用户操作）──────────────────────────
  const frames = await evaluate(`(()=>{
    const out={};
    for(const name of ['满幅','1:1','4:5','16:9','9:16','自由']){
      setFrame(name); resnap();
      const R=frameRect();
      out[name]={sig:[Math.round(R.x),Math.round(R.y),Math.round(R.w),Math.round(R.h)].join(','),
                 ar:+(R.w/R.h).toFixed(4),cropAr:S.cropAr};
    }
    return out;
  })()`);
  assert('1:1 画幅出图比例是 1', Math.abs(frames['1:1'].ar - 1) < 0.01, frames['1:1']);
  assert('4:5 画幅出图比例是 0.8', Math.abs(frames['4:5'].ar - 0.8) < 0.01, frames['4:5']);
  assert('16:9 画幅出图比例是 1.778', Math.abs(frames['16:9'].ar - 16 / 9) < 0.01, frames['16:9']);
  assert('满幅 = 整块画布', frames['满幅'].sig === '0,0,2560,1920', frames['满幅']);
  assert('各画幅的裁切互不相同（换画幅确实生效）',
    new Set(Object.values(frames).map(f => f.sig)).size === 6, frames);

  // ── 2. 面板开合 / 抽屉高度不改裁切 ───────────────────────────────────────
  for (const name of ['满幅', '1:1', '9:16', '自由']) {
    const r = await evaluate(`(()=>{
      setFrame(${JSON.stringify(name)}); resnap();
      const before=${cropSig};
      $('sheet').classList.add('open');
      const opened=${cropSig};
      $('sheet').classList.remove('open');
      const closed=${cropSig};
      // 抽屉三个状态也过一遍
      const el=$('sheet');
      el.dataset.state='half'; const half=${cropSig};
      el.dataset.state='full'; const full=${cropSig};
      delete el.dataset.state;
      return {before,opened,closed,half,full};
    })()`);
    assert(`「${name}」展开/收起面板不改裁切`,
      r.before === r.opened && r.before === r.closed && r.before === r.half && r.before === r.full, r);
  }

  // ── 3. 窗口尺寸变化不改裁切 ─────────────────────────────────────────────
  await evaluate("setFrame('4:5'); resnap();");
  const beforeResize = await evaluate(cropSig);
  await send('Emulation.setDeviceMetricsOverride', { width: 932, height: 430, deviceScaleFactor: 1, mobile: true });
  await delay(400);
  await evaluate('draw()');
  const afterResize = await evaluate(cropSig);
  assert('横屏（窗口尺寸变了）不改裁切', afterResize === beforeResize, { beforeResize, afterResize });
  await send('Emulation.setDeviceMetricsOverride', { width: 430, height: 932, deviceScaleFactor: 1, mobile: true });
  await delay(400);
  await evaluate('draw()');
  assert('转回竖屏也不改裁切', await evaluate(cropSig) === beforeResize);

  // ── 4. 语言切换、系统字号不改裁切 ───────────────────────────────────────
  const misc = await evaluate(`(()=>{
    const before=${cropSig};
    $('lang').click();
    const afterLang=${cropSig};
    document.documentElement.style.fontSize='22px';
    const afterFont=${cropSig};
    document.documentElement.style.fontSize='';
    $('lang').click();
    return {before,afterLang,afterFont};
  })()`);
  assert('切中英文不改裁切', misc.before === misc.afterLang, misc);
  assert('放大系统字号不改裁切', misc.before === misc.afterFont, misc);

  // ── 5. 贴边吸附仍然只用"看得见的那块" ───────────────────────────────────
  const snap = await evaluate(`(()=>{
    setFrame('满幅'); resnap();
    const R=frameRect(), V=viewRect(), S2=snapRect();
    const inside = S2.x>=V.x-1 && S2.y>=V.y-1 && S2.x+S2.w<=V.x+V.w+1 && S2.y+S2.h<=V.y+V.h+1;
    return {R:[R.x,R.y,Math.round(R.w),Math.round(R.h)],V:[V.x,V.y,Math.round(V.w),Math.round(V.h)],
            snap:[S2.x,S2.y,Math.round(S2.w),Math.round(S2.h)],inside};
  })()`);
  assert('满幅下可见区确实小于出图框（说明这个用例有意义）',
    snap.V[2] < snap.R[2] || snap.V[3] < snap.R[3], snap);
  assert('贴边吸附仍被限制在可见区内', snap.inside === true, snap);

  // ── 6. 出图尺寸跟着裁切走 ───────────────────────────────────────────────
  const shot = await evaluate(`(()=>{
    setFrame('1:1'); resnap();
    EXPORT.sizeMode='x1'; syncOutRow();
    const R=frameRect();
    const c=buildShotAt(planExport()).canvas;
    return {crop:[Math.round(R.w),Math.round(R.h)],out:[c.width,c.height]};
  })()`);
  assert('1× 出图尺寸 = 裁切尺寸（裁切是唯一决定因素）',
    shot.out[0] === shot.crop[0] && shot.out[1] === shot.crop[1], shot);

  // ── 7. 换画布尺寸（换照片）时才重算裁切 ─────────────────────────────────
  const recanvas = await evaluate(`(async()=>{
    setFrame('16:9'); resnap();
    const before=${cropSig};
    const c=document.createElement('canvas');c.width=3000;c.height=3000;
    const g=c.getContext('2d');g.fillStyle='#556';g.fillRect(0,0,3000,3000);
    const blob=await new Promise(r=>c.toBlob(r,'image/png'));
    await loadScenePhoto(URL.createObjectURL(blob));
    const after=${cropSig};
    const R=frameRect();
    return {before,after,ar:+(R.w/R.h).toFixed(3),canvas:[cv.width,cv.height]};
  })()`);
  assert('换照片（画布尺寸变了）后按同一画幅比例重算裁切',
    recanvas.after !== recanvas.before && Math.abs(recanvas.ar - 16 / 9) < 0.01, recanvas);

  assert('没有未捕获的页面异常', errors.length === 0, errors);
  await send('Page.captureScreenshot', { format: 'png' }).then(r =>
    fs.writeFileSync(path.join(output, 'layout.png'), Buffer.from(r.data, 'base64')));
} catch (error) {
  errors.push(error.stack); console.error(error.stack); process.exitCode = 1;
} finally {
  fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({ checks, errors }, null, 2));
  if (ws) ws.close(); chrome.kill(); server.close();
  console.log('Results: ' + output);
}
