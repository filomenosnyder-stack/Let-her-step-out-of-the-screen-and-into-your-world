/**
 * 读 zip（自己写，不引依赖）—— 因为 MMD 模型下载下来**就是 zip**，
 * 而页面必须一次拿到"pmx + 它旁边那些散贴图"，否则模型是一堆没贴图的白块。
 *
 * 支持：store(0) 和 deflate(8) 两种压缩；解压用浏览器自带的 `DecompressionStream('deflate-raw')`。
 *
 * ⚠ 最坑的一条：**zip 里的文件名编码**。国内模型包大多是在中文 Windows 上压的，
 *   没设 UTF-8 标志位（0x800），文件名是 **GBK** 字节。按 UTF-8 解就是一串乱码
 *   （`鐝傝幈濉旓紙...`），于是"按名字找贴图"全部落空、贴图一张都贴不上。
 *   所以：有 0x800 标志用 UTF-8，否则用 GBK 解。
 */

const SIG_EOCD = 0x06054b50, SIG_CEN = 0x02014b50, SIG_LOC = 0x04034b50;

/** 文件名解码：UTF-8 标志位优先，否则 GBK（浏览器支持不了 GBK 就退回 UTF-8，至少不抛） */
let gbkDecoder = null, gbkBroken = false;
function decodeName(bytes) {
  if (!gbkBroken) {
    try {
      if (!gbkDecoder) gbkDecoder = new TextDecoder('gbk');
      return gbkDecoder.decode(bytes);
    } catch (e) { gbkBroken = true; console.warn('[MMD] 这个浏览器没有 GBK 解码器，zip 里的中文名可能乱码', e); }
  }
  return new TextDecoder('utf-8').decode(bytes);
}

async function inflateRaw(bytes) {
  if (typeof DecompressionStream !== 'function') throw new Error('这个浏览器没有 DecompressionStream，读不了压缩过的 zip');
  const ds = new DecompressionStream('deflate-raw');
  const stream = new Blob([bytes]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * @param {ArrayBuffer|Uint8Array} buf 整个 zip 的字节
 * @returns {Promise<Map<string,{bytes:Uint8Array}>>} key = **basename 的小写形式**
 *          （模型包里的贴图都在同一层，按 basename 匹配足够，还免了 `dir\a.png` 与 `a.png` 的斜杠差异）
 */
export async function readZip(buf) {
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);

  // 从尾部往前找 EOCD（注释最长 64KB，所以最多回退 65557 字节）
  let eocd = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) {
    if (dv.getUint32(i, true) === SIG_EOCD) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('这不是一个 zip（找不到 EOCD）');
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);            // 中央目录偏移

  const out = new Map();
  const skipped = [];                               // 用了不支持的压缩法（LZMA/PPMd）而被跳过的条目
  for (let i = 0; i < count; i++) {
    if (dv.getUint32(p, true) !== SIG_CEN) break;
    const flag = dv.getUint16(p + 8, true);
    const method = dv.getUint16(p + 10, true);
    const csize = dv.getUint32(p + 20, true);
    const usize = dv.getUint32(p + 24, true);
    const nlen = dv.getUint16(p + 28, true);
    const elen = dv.getUint16(p + 30, true);
    const clen = dv.getUint16(p + 32, true);
    const lho = dv.getUint32(p + 42, true);
    const nameBytes = u8.subarray(p + 46, p + 46 + nlen);
    const name = (flag & 0x800) ? new TextDecoder('utf-8').decode(nameBytes) : decodeName(nameBytes);
    p += 46 + nlen + elen + clen;
    if (name.endsWith('/')) continue;               // 目录条目

    // 本地头：长度字段可能和中央目录不一致（有 data descriptor 的情况），以本地头为准跳过头部
    const lnlen = dv.getUint16(lho + 26, true);
    const lelen = dv.getUint16(lho + 28, true);
    const dataStart = lho + 30 + lnlen + lelen;
    let bytes = u8.subarray(dataStart, dataStart + csize);
    // ★ 这里**不解压**，只记下压缩数据的位置 —— 解压推迟到真正要用的时候（entryBytes）。
    //   以前每个条目都当场解开，于是"整个 zip + 全部解压结果"同时在内存里：
    //   一个 264MB 的模型包（贴图全是几 MB 的 png）在手机上直接爆内存 → 表现就是"导入失败"。
    const base = name.split(/[\\/]/).pop().toLowerCase();
    if (out.has(base)) continue;
    if (method === 0) out.set(base, { bytes, name, usize });
    else if (method === 8) out.set(base, { raw: bytes, method: 8, usize, name });
    else skipped.push(name + '（压缩法 ' + method + '）');   // LZMA(14)/PPMd(98)：2345好压、快压爱用
  }
  // ⚠ 被跳过的条目要**报出去**：否则"pmx 是 LZMA 压的"会被报成"这个 zip 里没有 .pmx"，
  //   把用户引到"是不是下错包了"这个完全错误的方向（信息全错比没信息更坏）。
  out.skipped = skipped;
  return out;
}

/** 按 basename 找条目；找不到再退回"名字里包含"的模糊匹配（有些包会多套一层目录或改后缀大小写）。
 *  ⚠ 必须 **NFC 归一化**：安卓/iOS 从文件选择器拿到的文件名可能是 NFD（分解形），
 *    而 PMX 里存的路径是 NFC —— 中文/日文贴图名对不上，表现就是**一堆白模**，
 *    而且只在手机上出现（本地测试怎么都复现不了）。 */
const normName = s => String(s).normalize('NFC');
export function findEntry(zip, path) {
  if (!path) return null;
  const base = normName(path).split(/[\\/]/).pop().toLowerCase();
  if (zip.has(base)) return zip.get(base);
  for (const [k, v] of zip) {
    const kk = normName(k).toLowerCase();
    if (kk === base || kk.endsWith('/' + base) || kk.split(/[\\/]/).pop() === base) return v;
  }
  return null;
}

/** 从 <input type=file webkitdirectory> 拿到的 FileList 造一个同样形状的"虚拟包" */
export function fromFileList(files) {
  const out = new Map();
  for (const f of files) {
    const rel = f.webkitRelativePath || f.name;
    const base = rel.split(/[\\/]/).pop().normalize('NFC').toLowerCase();
    out.set(base, { bytes: null, file: f, name: rel });
  }
  return out;
}

/** 统一取字节：zip 条目可能只有 raw（压缩数据，按需解压），目录导入的条目有 file */
export async function entryBytes(e) {
  if (!e) return null;
  if (e.bytes) return e.bytes;
  // ⚠ 按需解压、**不缓存**：缓存了就等于把"整包解压结果"又攒回内存（那就是当初爆掉的原因）。
  //   贴图解出来 → 立刻解码成 GPU 纹理 → 这份字节就该被回收。
  if (e.raw) return e.method === 8 ? await inflateRaw(e.raw) : e.raw;
  if (e.file) return new Uint8Array(await e.file.arrayBuffer());
  return null;
}
