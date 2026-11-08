// 把网页端同步进安卓壳的 assets。
//
//   node tools/sync_android_assets.mjs
//
// 白名单跟 tools/make_dist.mjs **同一套** —— 这里少一样东西，APK 里就少一样，
// 黑名单错法方向相反：白名单错在少传（打开就 404，一眼看得出来），
// 黑名单错在泄露（verify/ 全套自检打进去你根本不会发现）。
//
// ⚠ 跟 make_dist 有一处**故意不同**：这里**不做** `../` → `./` 的改写。
//   网页版是从仓库根起服务的，页面里写 `../cutout.js`；
//   壳里 assets 也按仓库原样镜像（web/phone/index.html + web/cutout.js），
//   从 /web/phone/ 往上跳一级正好落在 /web/cutout.js ✓ 改了反而断。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DEST = path.join(ROOT, 'android', 'app', 'src', 'main', 'assets', 'web');

/** 和 make_dist.mjs 保持一致。改一边必须改另一边。 */
const WHITELIST = [
  'phone/index.html',
  'cutout.js',
  'segmentation.js',
  // 3D 立绘运行时 + three.js。⚠ 和 make_dist 一样：**引擎随包，模型不随包**
  //   （MMD 模型禁止二次配布，用户自己导入 .glb）。
  //   必须同步进来：phone/index.html 里有 `<script src="../mmd.js">`，
  //   少了它，壳里点「3D 立绘」会报"引擎没载入"—— 那是个**误导**的提示（其实是文件没进包）。
  'mmd.js',
  'mmd',
  'chars/chars.js',
  'chars/立绘',
  // 动漫专用抠图模型 + onnxruntime-web。2026-09-20 补。
  // ⚠ 之前漏了这条：网页版有 anime/、APK 里没有 → 手机上点「AI 抠图」拉不到模型，
  //   表现就是卡住不动。cutout.js 现在按**脚本自己**的位置找 anime/（见 cutout.js 里 SEG），
  //   这里把 anime/ 放到 assets/web/anime/ 就是它的邻居 ✓
  // 54MB，APK 会大一截 —— 但手机端本来就要靠它出图，不能省。
  'anime',
];

const walk = (abs) => {
  const st = fs.statSync(abs);
  if (st.isFile()) return [abs];
  const out = [];
  for (const n of fs.readdirSync(abs)) out.push(...walk(path.join(abs, n)));
  return out;
};

let n = 0, bytes = 0;
const missing = [];

// 先清干净：删掉的东西不能留在包里的旧副本中
if (fs.existsSync(DEST)) fs.rmSync(DEST, { recursive: true, force: true });
fs.mkdirSync(DEST, { recursive: true });

for (const entry of WHITELIST) {
  const src = path.join(ROOT, ...entry.split('/'));
  if (!fs.existsSync(src)) { missing.push(entry); continue; }
  for (const f of walk(src)) {
    const rel = path.relative(ROOT, f).split(path.sep).join('/');
    const to = path.join(DEST, ...rel.split('/'));
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(f, to);
    n++; bytes += fs.statSync(f).size;
  }
}

if (missing.length) {
  console.error('✗ 白名单里列了但磁盘上没有：\n  ' + missing.join('\n  '));
  console.error('  不静默跳过 —— 跳过了你会以为打好了，实际 APK 里少文件。');
  process.exit(1);
}

// 少了这两样壳根本起不来，单独盯一下
for (const must of ['phone/index.html', 'cutout.js']) {
  if (!fs.existsSync(path.join(DEST, ...must.split('/')))) {
    console.error('✗ 关键文件没进去：' + must);
    process.exit(1);
  }
}

console.log(`assets/web/  ${n} 个文件，共 ${(bytes/1048576).toFixed(2)} MB`);
console.log('  → ' + DEST);
