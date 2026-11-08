/**
 * 阶段 1 改动的最小回归（不依赖外部素材/模型）。
 * 只验证本轮**实际改过**的行为，别拿它替代完整回归。
 *   运行：node tools/phase1-check.mjs
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const output = path.join(root, 'artifacts/phase1');
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

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'bh3-phase1-'));
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

  // ── 1. 出厂「清晰」：颗粒关、景深 0、旧的隐藏效果已不存在 ────────────────
  assert('默认关闭颗粒（清晰出厂配置）', await evaluate('LIGHT_GRN === false'));
  assert('MMD 景深滑条默认 0', await evaluate("$('dof3d').value === '0'"));
  assert('仅导出启用的色调匹配已移除', await evaluate("typeof toneMatchedLayer === 'undefined' && typeof TONE_ON === 'undefined'"));
  assert('会出黑边的旧 alpha 柔化已移除', await evaluate("typeof LIGHT_SFT === 'undefined'"));
  assert('「柔化边缘」按钮不再出现在融合面板', await evaluate("!document.querySelector('[data-t=\"fusion.edge\"]')"));

  // ── 2. 导出与预览同一条路径（不再有出图专属处理）────────────────────────
  const shot = await evaluate(`(()=>{
    const r=composeShot(v); const R=frameRect();
    return {w:r.canvas.width,h:r.canvas.height,rw:Math.round(R.w),rh:Math.round(R.h)};
  })()`);
  assert('出图尺寸与取景框一致', shot.w === shot.rw && shot.h === shot.rh, shot);

  // ── 3. AI 重算固定读原图：连跑两次输入完全相同 ──────────────────────────
  const twice = await evaluate(`(async()=>{
    const c=document.createElement('canvas');c.width=200;c.height=260;
    const g=c.getContext('2d');g.fillStyle='#d47799';g.fillRect(20,10,160,240);
    setCharset(c); chBase=copyOf(c); chCanvas=copyOf(c);
    const origSig=chOrig.toDataURL();
    const seen=[]; const original=ARCAM_SEG.cut;
    ARCAM_SEG.cut=async canvas=>{seen.push(canvas.toDataURL());return {canvas,fg:.5,ms:1};};
    try { await $('cutAi').onclick(); await $('cutAi').onclick(); }
    finally { ARCAM_SEG.cut=original; }
    return {count:seen.length, same:seen[0]===seen[1], fromOrig:seen[0]===origSig};
  })()`);
  assert('连续两次 AI 抠图读的是同一份原图（不累积）', twice.count === 2 && twice.same && twice.fromOrig, twice);

  // ── 4. 原生保存失败必须如实报失败 ────────────────────────────────────────
  const save = await evaluate(`(async()=>{
    const blob=new Blob(['x'],{type:'image/jpeg'});
    window.ArcLog={saveChunk(){},saveEnd(){return null;}};
    const r=await saveAll([{name:'t.jpg',blob}],'t.zip',null);
    const note=$('saveNote')?$('saveNote').innerText:'';
    delete window.ArcLog;
    return {r,note};
  })()`);
  assert("原生写盘失败返回 'failed' 而不是 'download'", save.r === 'failed', save);
  assert('失败提示写明没有写成', /保存失败/.test(save.note), save.note);

  // ── 5. 3D 下不显示无效的「自由摆位」 ────────────────────────────────────
  const free = await evaluate(`(()=>{
    const before=$('mFree').style.display;
    use3D=true; syncModeRow();
    const in3d={display:$('mFree').style.display,disabled:$('mFree').disabled,mode:S.mode};
    use3D=false; syncModeRow();
    const out={display:$('mFree').style.display,disabled:$('mFree').disabled};
    return {before,in3d,out};
  })()`);
  assert('3D 模式隐藏并禁用「自由」摆位', free.in3d.display === 'none' && free.in3d.disabled === true && free.in3d.mode === 'ground', free);
  assert('退出 3D 后「自由」摆位恢复可用', free.out.display === '' && free.out.disabled === false, free);

  assert('没有未捕获的页面异常', errors.length === 0, errors);
  await send('Page.captureScreenshot', { format: 'png' }).then(r =>
    fs.writeFileSync(path.join(output, 'final.png'), Buffer.from(r.data, 'base64')));
} catch (error) {
  errors.push(error.stack); console.error(error.stack); process.exitCode = 1;
} finally {
  fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({ checks, errors }, null, 2));
  if (ws) ws.close(); chrome.kill(); server.close();
  console.log('Results: ' + output);
}
