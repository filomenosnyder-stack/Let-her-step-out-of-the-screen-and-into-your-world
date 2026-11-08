import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const main=fs.readFileSync(path.join(root,'index.html'),'utf8');
const phone=main.replaceAll('src="./','src="../').replaceAll('"./mmd/','"../mmd/')
  .replaceAll("'./' + it.file","'../' + it.file")
  .replaceAll("'./' + LIB.characters[0].file","'../' + LIB.characters[0].file");
fs.writeFileSync(path.join(root,'phone/index.html'),phone);
fs.writeFileSync(path.join(root,'docs/index.html'),main);
fs.writeFileSync(path.join(root,'docs/phone/index.html'),phone);
// ⚠ 这份清单漏过文件：`mmd/zipread.js` 改了但没同步，Pages 上跑的还是旧版 ——
//   表现就是"本地好了、线上还是白模"。运行期会 import 的脚本都必须列在这里。
for(const file of ['cutout.js','segmentation.js','mmd.js','mmd/zipread.js',
  'mmd/three-mmd/ammo-physics.js','mmd/three-mmd/AMMO-LICENSE.md',
  'anime/models.json','anime/isnet-anime-fp32.onnx','anime/birefnet-lite.onnx']) {
  const src=path.join(root,file),dest=path.join(root,'docs',file);
  if(!fs.existsSync(src)) throw new Error('Missing asset: '+file);
  fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(src,dest);
}
console.log('Synced mobile and Pages assets.');
