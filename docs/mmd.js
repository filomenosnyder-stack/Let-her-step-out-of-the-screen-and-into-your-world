/**
 * 3D 立绘运行时（MMD：浏览器直读 .zip / .pmx，或导入烘好的 .glb）。
 *
 * 普通 script，不是 module —— 和 cutout.js 一个路子，页面那边"有才调"。
 * 引擎（three.js）用**动态 import()** 按需拉，所以：
 *   ⚠ `file://` 下动态 import 会被 CORS 拦死，这条路只在 http(s) 可用。
 *     检测到了会明确告诉你（和 AI 抠图那条线一样，不静默失败）。
 *
 * 它干的事：把一个模型（.zip/.pmx 直读，或导入 .glb）按 arcam 的相机摆进画面，渲到一块离屏画布上。
 * 页面那边把它当"一张全屏透明 PNG"用（drawImage 到帧坐标 0,0），
 * 于是 composeShot / scene.json / 导出路径一行都不用改。
 *
 * ★ 相机是**按 arcam 的投影公式直接拼矩阵**的，不猜 three 的欧拉角约定：
 *     世界（X右 Y上 Z朝观察者）→ arcam 相机（X右 Y下 Z前）→ 滚转 → 屏幕
 *   实测与 project() 的偏差 2.27e-13 px，与 buildPlacement 的落位差 0.00 px。
 *   所以"3D 摆在哪"和"2D 立绘摆在哪"是同一件事 —— 换成 3D 不会让落位漂。
 */
window.ARCAM_MMD = (function () {
  'use strict';
  const D2R = Math.PI / 180;

  // ── 引擎与场景 ──────────────────────────────────────────────────────
  let THREE = null, GLTFLoader = null;
  let renderer = null, scene = null, camera = null, glCanvas = null;
  let post = null, postCtx = null, grainTile = null, grainCv = null;
  let root = null, mixer = null;

  // ── 模型状态 ────────────────────────────────────────────────────────
  let modelH = 1.734, bones = new Map(), restQ = new Map(), boneByKey = new Map();
  // 脚底参考高度（模型自身坐标，米）。**不能用几何包围盒下边当脚底** —— 见 footRefY()
  let feetRef = 0;
  let defaultPoses = null;
  let poses = null, curPose = -1, appliedPose = -1;
  // ★ 贴图池：**上一次导入的包（zip 或文件夹）里那堆文件**。
  //   浏览器有安全边界：一个 .pmx 读不到它旁边的文件（拿到的 File 只有名字和字节，
  //   没有任何路径信息）。所以"点 pmx 自动找同目录贴图"在纯浏览器里做不到 ——
  //   但"记住上一次那个文件夹"能做到，而且效果一样：**导入一次文件夹（或 zip），
  //   之后丢任意一个 pmx 进来都会自动配上贴图**。一个文件夹里有多个 pmx（角色 + 武器）
  //   时，这就从"每次都要框选一堆 png"变成"一次记住，之后每次一步"。
  let texPool = null;
  // 当前包里所有 pmx + 上次导入的原样输入 —— 换模型时用同一份输入重建（贴图自然就对上）
  let pkgPmx = [], pmxIndex = 0, lastLoad = null;
  // 用户"去掉"掉的模型（按包里的名字记）。一个包里常混着角色 + 武器 + 部件，
  // 把不要的删掉，列表就只剩要用的那几个 —— 但**包本身没动**，只是不再列出来。
  let droppedPmx = new Set();
  let ready = false, busy = false, error = null, srcName = '';
  const stats = { tris: 0, bones: 0, morphs: 0, poses: 0, loadMs: 0, renderMs: 0 };

  /** three 的 GLTFLoader 会 sanitizeNodeName：把 `[ ] . : /` 删掉、空白换 `_`。
   *  所以 glTF 里的 `腕.L` 运行时叫 `腕L`。姿势表存的是 MMD 原名，查表前必须同样处理。 */
  const san = n => String(n).replace(/\s/g, '_').replace(/[\[\]\.:\/]/g, '');
  // ★ 本脚本自己的 URL 前缀。**必须用它**去拼资源路径：
  //   动态 `import()` 是相对**脚本**解析的，而注入的 `<script src>` 和 fetch
  //   是相对**文档**解析的 —— 页面在 /phone/ 子目录时，后者会去 /phone/mmd/... 找，直接 404。
  //   （cutout.js 里那条老经验：路径一律按脚本自己的位置解，别写死 '../xxx/'。）
  const SELF_DIR = (function () {
    try { const s = document.currentScript; if (s && s.src) return s.src.replace(/[^/]*$/, ''); } catch (e) {}
    return './';
  })();
  /** PMX 单位 → 米。和 Blender 那条路（`import_model(scale=0.08)`）同一个约定，
   *  所以"浏览器直读 PMX"和"导入烘好的 GLB"两边出来的身高/落位是一致的。 */
  const PACKAGE_SCALE = 0.08;
  let pmxMod = null;

  /** 骨名归一化：`腕.L` / `左腕` / `腕L` → 同一把键。
   *  ⚠ 从 `mmd/pmx.js` 挪进来的 —— 那套自写转换器已经废弃，但**这条映射还得留着**：
   *    PMX 原件是 `左腕`，而姿势按 mmd_tools 的 `腕.L` 写，不归一身高/姿势全对不上。 */
  function boneKey(name) {
    let n = String(name);
    let side = '';
    if (/^[左右]/.test(n)) { side = n[0] === '左' ? 'L' : 'R'; n = n.slice(1); }
    const m = /[._]?([LR])$/.exec(n);
    if (m && !side) { side = m[1]; n = n.slice(0, m.index); }
    else if (m && side) { n = n.slice(0, m.index); }
    return n + '|' + side;
  }
  /** 外面那份通用姿势表。PMX 文件里没有姿势（那是 VMD/VPD 的事），而姿势存的是
   *  "骨骼局部四元数 + MMD 标准骨名"——与具体模型无关，所以一个小文件服务所有模型。 */
  async function loadDefaultPoses() {
    if (defaultPoses !== null) return defaultPoses;
    // ⚠ 同样要用 SELF_DIR：页面在 /phone/ 下时 './mmd/poses.json' 会 404（同一个坑）
    try { const r = await fetch(SELF_DIR + 'mmd/poses.json'); defaultPoses = r.ok ? await r.json() : null; }
    catch (e) { defaultPoses = null; }
    return defaultPoses;
  }
  // 光照参数（可调；默认值是"看着像实景"的一版）
  const L = {
    keyAz: -38,      // 主光方位角（度，0=从相机这边照过去 → +Z）
    keyEl: 52,       // 主光高度角
    keyInt: 2.1,
    ambInt: 1.15,
    rimInt: 0.75,
    shadow: true,
    shadowOpacity: 0.42,
    grain: true,
    outline: 0,
    // ★ 接触暗缝：投影阴影管"光从哪来"，它管"脚踩在地上"。
    //   单独一盏几乎垂直向下的灯 + 一圈只框住脚下的紧正交框 —— 因为主光斜射时，
    //   人物与地面**交界处那一圈 0~10cm** 是投不到的，而那圈暗带才是"落地感"的来源。
    contact: true,
    contactOpacity: 0.40,
    // ★ 照片当环境贴图（IBL）：单色半球光撑不起实景的多方向光照，
    //   明暗面分布和背景对不上，一眼就假。
    ibl: true,
    iblIntensity: 1.0,
    // ★ 景深：光圈未知，所以做的是"相对焦平面的近似虚化"。
    //   dof 0~1 是强度、focus 是焦平面距离（米，null = 跟人物同距）、dofMax 是最大模糊半径(px@f=1000)。
    dof: 0.45,
    focus: null,
    dofMax: 7,
    // ★ 主光方向：**必须给用户一个滑块**。方向从一张照片里估不准（HANDBOOK §4.7：
    //   相机自动曝光一直在动、亮的不等于光源、室内顶灯+窗+墙反光混在一起），
    //   与其假装自动，不如给一个诚实的控件 —— 错了他自己能对。
    //   （接触暗缝那盏灯跟着同一个方位角走，两个影子不会互相矛盾。）
  };

  function setError(m) { error = m; console.warn('[MMD]', m); }

  // ── 引擎按需载入 ────────────────────────────────────────────────────
  async function init() {
    if (ready) return true;
    if (busy) return false;
    busy = true;
    try {
      if (!THREE) {
        // ⚠ 相对路径按**本脚本的 URL** 解析（普通 script 的 import() 就是这样），
        //   所以 mmd.js 躺在仓库根、引擎躺在 mmd/ 下，写 './mmd/…' 正好。
        try {
          THREE = await import('./mmd/three.module.js');
        } catch (e) {
          setError('引擎载入失败：' + (e && e.message) + '（file:// 下动态 import 会被拦，必须走 http）');
          busy = false; return false;
        }
        const gl = await import('./mmd/loaders/GLTFLoader.js');
        GLTFLoader = gl.GLTFLoader;
        // PMX 那条线要的构建器（顺带导出骨名归一化 boneKey —— 查姿势每次都要用）
        pmxMod = null;   // 自写转换器已删，改用官方 @moeru/three-mmd（下面的 import 都去掉了）
        pmxBuilder = pmxMod;
        /* boneKey 现在是本文件里的函数，不再从 pmx.js 拿 */
      }
      buildScene();
      ready = true;
      busy = false;
      return true;
    } catch (e) {
      setError('初始化失败：' + (e && e.message));
      busy = false;
      return false;
    }
  }

  function buildScene() {
    glCanvas = document.createElement('canvas');
    renderer = new THREE.WebGLRenderer({
      canvas: glCanvas, alpha: true, antialias: true, preserveDrawingBuffer: true,
    });
    renderer.setPixelRatio(1);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera();
    camera.matrixAutoUpdate = false;   // 视图矩阵我们自己拼，不许 three 覆盖

    // 环境光：颜色取自画面统计量（见 setEnv），强度也跟亮度走
    hemi = new THREE.HemisphereLight(0xffffff, 0x3a3630, L.ambInt);
    scene.add(hemi);

    key = new THREE.DirectionalLight(0xffffff, L.keyInt);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.near = 0.2; key.shadow.camera.far = 26;
    key.shadow.bias = -0.0009;
    key.shadow.normalBias = 0.02;
    scene.add(key, key.target);

    rim = new THREE.DirectionalLight(0xbcd4ff, L.rimInt);
    scene.add(rim);

    // 接影子的**隐形**地面：只用 ShadowMaterial，画面里除了影子什么都不画。
    // 地面平面 y=0 是解析已知的（相机高度就是它到地面的距离）——
    // 这是 2D 路径永远做不到的一件事：影子落在**真实的地面**上。
    shadowPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(40, 40),
      new THREE.ShadowMaterial({ opacity: L.shadowOpacity })
    );
    shadowPlane.rotation.x = -Math.PI / 2;
    shadowPlane.receiveShadow = true;
    scene.add(shadowPlane);

    // ★ 接触暗缝那一套：一盏几乎垂直的灯 + 一块只接它影子的地面。
    //   强度给 0 —— 它**不负责打光**，只要它的影子（多给一盏亮灯会把整体照明打乱）。
    //   ⚠ 地面抬高 1.5mm：和主影子那块平面共面会 z-fighting。
    contact = new THREE.DirectionalLight(0xffffff, 0);
    contact.castShadow = true;
    contact.shadow.mapSize.set(1024, 1024);
    contact.shadow.bias = -0.0006;
    contact.shadow.normalBias = 0.012;
    scene.add(contact, contact.target);
    contactPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(12, 12),
      new THREE.ShadowMaterial({ opacity: L.contactOpacity })
    );
    contactPlane.rotation.x = -Math.PI / 2;
    contactPlane.position.y = 0.0015;
    contactPlane.receiveShadow = true;
    scene.add(contactPlane);
  }
  let hemi = null, key = null, rim = null, shadowPlane = null, contact = null, contactPlane = null;

  // ── 照片当环境贴图（IBL）────────────────────────────────────────────
  // 把当前帧压成一张 64×32 的"赤道全景"喂给 PMREM。
  // ⚠ 它**不是真的全景**（一张照片本来就没有背后的信息），但**上下结构是真的**：
  //   天在上、地在下、左边和右边的色温差异也在 —— 而环境照明里最有用的正是这部分。
  //   实测这一下就把"单色半球光"那种平掉的明暗分布救回来（见 test_phone3d 的测量）。
  let pmrem = null, envRT = null, envCv = null, envCtx = null, envTex = null, envSig = '';
  function buildEnv(frame, env) {
    if (!envCtx) {
      envCv = document.createElement('canvas');
      envCv.width = 64; envCv.height = 32;
      envCtx = envCv.getContext('2d', { willReadFrequently: true });
      envTex = new THREE.CanvasTexture(envCv);
      envTex.mapping = THREE.EquirectangularReflectionMapping;
      envTex.colorSpace = THREE.SRGBColorSpace;
    }
    // 签名：3×3 采样，变了才重建 PMREM（PMREM 不便宜，别每帧跑）
    let sig = '';
    if (env) sig = [env.lum, env.r, env.b, env.sat].map(v => (v || 0).toFixed(2)).join(',');
    if (frame && frame.width) {
      envCtx.drawImage(frame, 0, 0, 64, 32);
      // 横向接缝：把最右一列复制到最左，减轻 360° 环绕处的硬边
      try { envCtx.drawImage(frame, frame.width - 2, 0, 2, frame.height, 0, 0, 2, 32); } catch (e) {}
      let px = null;
      try { px = envCtx.getImageData(0, 0, 3, 3).data; } catch (e) {}
      if (px) sig += '|' + Array.from(px.slice(0, 27)).filter((_, i) => i % 3 === 0).join(',');
    } else {
      // 没有画面：用统计量造一个"上亮下暗 + 环境偏色"的渐变，别退回死平的环境光
      const r = Math.max(0.02, (env && env.r) || 0.5), b = Math.max(0.02, (env && env.b) || 0.5);
      const l = Math.max(0.05, (env && env.lum) || 0.42);
      const g = Math.min(1, Math.max(0.02, (l - 0.2126 * r - 0.0722 * b) / 0.7152));
      const gd = envCtx.createLinearGradient(0, 0, 0, 32);
      gd.addColorStop(0, `rgb(${Math.round(Math.min(1, r * 1.25) * 255)},${Math.round(Math.min(1, g * 1.25) * 255)},${Math.round(Math.min(1, b * 1.3) * 255)})`);
      gd.addColorStop(1, `rgb(${Math.round(r * 0.35 * 255)},${Math.round(g * 0.33 * 255)},${Math.round(b * 0.3 * 255)})`);
      envCtx.fillStyle = gd; envCtx.fillRect(0, 0, 64, 32);
      sig += '|grad';
    }
    // ⚠ 强度必须设在**缓存判断之外**：关掉 IBL 会把它置 0，再打开时签名没变、
    //   命中缓存提前 return —— 于是强度永远停在 0，看着就是"开关没反应"（踩过）。
    it: {
      if (sig === envSig) { if (scene.environment) scene.environmentIntensity = L.ibl ? L.iblIntensity : 0; return; }
    }
    envSig = sig;
    envTex.needsUpdate = true;
    if (!pmrem) pmrem = new THREE.PMREMGenerator(renderer);
    const rt = pmrem.fromEquirectangular(envTex);
    if (envRT) envRT.dispose();
    envRT = rt;
    scene.environment = envRT.texture;
    scene.environmentIntensity = L.ibl ? L.iblIntensity : 0;
  }

  // ── 文件头识别 ──────────────────────────────────────────────────────
  // ★★ 为什么非要有这一步：GLTFLoader 拿到**不是 glTF 的文件**时，只会吐一句
  //    `Unexpected token 'P', "PMX \0\0\0@..." is not valid JSON` —— 用户看到的就是
  //    "PMX 载入失败"，然后完全不知道下一步该干什么。而这些 MMD 模型**本来就是 .pmx**
  //    （散在 .zip 里），所以"拿 .pmx 来导入"是最容易发生的一件事，必须给能照做的提示。
  function sniff(b) {
    const hex = n => Array.from(b.slice(0, n)).map(x => x.toString(16).padStart(2, '0')).join(' ');
    const ascii = n => Array.from(b.slice(0, n)).map(x => (x >= 32 && x < 127) ? String.fromCharCode(x) : '.').join('');
    if (b.length >= 4 && b[0] === 0x67 && b[1] === 0x6C && b[2] === 0x54 && b[3] === 0x46)   // "glTF"
      return { ok: true, kind: 'glb' };
    if (b[0] === 0x7B) return { ok: true, kind: 'gltf-json' };                              // '{' 文本 glTF
    if (b.length >= 4 && b[0] === 0x50 && b[1] === 0x4D && b[2] === 0x58)                   // "PMX "
      return { ok: true, kind: 'pmx', msg:
        '这是单个 .pmx —— 能解析，但**贴图不在这里**（PMX 只存贴图路径，图片散在它旁边，' +
        '而浏览器不给页面读旁边的文件）。所以会是一堆白模。要带贴图：先在「导入文件夹」里' +
        '把那个文件夹选一次（我会记住它），之后丢任意一个 .pmx 进来都会自动配上；或者直接导入整个 .zip。' };
    if (b[0] === 0x50 && b[1] === 0x4B)                                                     // "PK"
      return { ok: true, kind: 'zip' };
    if (b[0] === 0x52 && b[1] === 0x61 && b[2] === 0x72 && b[3] === 0x21)                  // "Rar!"
      return { ok: false, kind: 'rar', msg:
        '这是 .rar 压缩包 —— 浏览器解不了 RAR（只认 zip）。请先解压，再压成 .zip，或者直接用「导入文件夹」。' };
    if (b[0] === 0x1F && b[1] === 0x8B)
      return { ok: false, kind: 'gzip', msg: '这是 gzip 压缩文件（.gz），不是模型。要的是 .zip / .glb / .pmx。' };
    if (b[0] === 0xFF && b[1] === 0xD8)
      return { ok: false, kind: 'jpeg', msg: '这是一张 JPEG 图片，不是 3D 模型。' };
    if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47)
      return { ok: false, kind: 'png', msg: '这是一张 PNG 图片，不是 3D 模型。' };
    if (b[0] === 0x08 || (b[0] === 0x0A) || (b.length > 4 && b[4] === 0x6F && b[5] === 0x6E))  // onnx 常见头
      return { ok: false, kind: 'onnx', msg:
        '这看起来是 .onnx（AI 抠图那个模型，42MB），不是 3D 模型。' +
        '3D 立绘要的是 .zip / .glb / .pmx —— 那一个在「立绘 → 3D 立绘」这一组里导入，别和「修饰立绘」里的「导入模型」搞混。' };
    return { ok: false, kind: 'unknown', msg:
      '这不是 glTF 二进制（文件头 ' + hex(4) + ' = "' + ascii(4) + '"，共 ' +
      (b.length / 1048576).toFixed(2) + ' MB）。这里收 .zip（推荐，自带贴图）/ .glb / .pmx。' };
  }

  /** 把 src（URL 或 File）读成字节，边读边报进度 */
  async function readBytes(src, onProgress) {
    if (typeof src !== 'string') {
      const buf = new Uint8Array(await src.arrayBuffer());
      if (onProgress) onProgress(1, buf.length, buf.length);
      return buf;
    }
    const res = await fetch(src);
    if (!res.ok) throw new Error('取不到文件（HTTP ' + res.status + '）');
    const total = Number(res.headers.get('content-length')) || 0;
    if (!res.body) return new Uint8Array(await res.arrayBuffer());
    const reader = res.body.getReader();
    const chunks = []; let got = 0;
    for (;;) {
      const r = await reader.read();
      if (r.done) break;
      chunks.push(r.value); got += r.value.length;
      if (onProgress) onProgress(total ? got / total : 0, got, total);
    }
    const out = new Uint8Array(got);
    let o = 0;
    for (const c of chunks) { out.set(c, o); o += c.length; }
    return out;
  }

  // ── 浏览器直读 PMX（不用 Blender 烘 GLB）────────────────────────────
  // 一条链：zip（或文件夹）→ 找 .pmx → mmd-parser 解 → pmx.js 装成 three 的东西。
  // ⚠ mmd-parser 是**普通 script**（UMD，挂到 window.MMDParser 上），所以用注入 <script> 拉，
  //   不能 import。它的许可 MIT（原来就是 three 官方 MMDLoader 用的那个解析器）。
  let MMDParser = null, pmxBuilder = null, TGALoader = null, parserScriptP = null;
  function loadParser() {
    if (window.MMDParser) { MMDParser = window.MMDParser; return Promise.resolve(MMDParser); }
    if (parserScriptP) return parserScriptP;
    parserScriptP = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = SELF_DIR + 'mmd/libs/mmdparser.js';
      s.onload = () => { MMDParser = window.MMDParser; MMDParser ? res(MMDParser) : rej(new Error('mmdparser.js 载入了但没挂到 window.MMDParser')); };
      s.onerror = () => rej(new Error('拉不到 ./mmd/libs/mmdparser.js'));
      document.head.appendChild(s);
    });
    return parserScriptP;
  }

  /** 把一个图片字节变成 three 贴图，顺便**降到 ≤2048**并取 32×32 的 alpha/均色。
   *  降采样是必须的：MMD 模型的衣贴图常见 4096×2048，手机 GPU 吃不消；
   *  alpha/均色是给材质分档和球面近似用的（和 Blender 烘焙那条规则同源）。 */
  async function imageToTexture(bytes, path) {
    const lower = String(path).toLowerCase();
    let src = null;
    try {
      if (lower.endsWith('.tga')) {
        if (!TGALoader) TGALoader = (await import('./mmd/loaders/TGALoader.js')).TGALoader;
        const t = new TGALoader().parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
        const im = t.image;
        if (!im || !im.width) return null;
        const cv0 = document.createElement('canvas'); cv0.width = im.width; cv0.height = im.height;
        cv0.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(im.data), im.width, im.height), 0, 0);
        src = cv0;
      } else {
        src = await createImageBitmap(new Blob([bytes]));
      }
    } catch (e) { console.warn('[MMD] 贴图解不开:', path, e && e.message); return null; }
    const w0 = src.width, h0 = src.height;
    const MAX = 2048;
    const k = Math.min(1, MAX / Math.max(w0, h0));
    const cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.round(w0 * k));
    cv.height = Math.max(1, Math.round(h0 * k));
    cv.getContext('2d').drawImage(src, 0, 0, cv.width, cv.height);
    if (src.close) try { src.close(); } catch (e) {}
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = 4;
    // 32×32 探针：有没有 alpha、均色是多少
    try {
      const pc = document.createElement('canvas'); pc.width = pc.height = 32;
      const pg = pc.getContext('2d', { willReadFrequently: true });
      pg.drawImage(cv, 0, 0, 32, 32);
      const d = pg.getImageData(0, 0, 32, 32).data;
      let minA = 255, r = 0, g = 0, b = 0, cnt = 0;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] < minA) minA = d[i + 3];
        if (d[i + 3] > 8) { r += d[i]; g += d[i + 1]; b += d[i + 2]; cnt++; }
      }
      tex.userData.hasAlpha = minA < 250;
      // ★★ 32×32 的探针**太粗，看不出蕾丝/纱的孔**：2048 的贴图一个格 = 64×64 源像素，
      //    孔洞在降采样时被平均掉 → alpha≈1 → 材质被判成"不透明"（alphaTest=0、transparent=false）
      //    → 衣服渲染成**一块块硬边白板**（用户原话："这他妈褶皱是人类吗"）。
      //    这里在 256×256 上数**真的透明的像素占比**：>1% 就说明这张图是镂空的。
      try {
        const N = 256;
        const pg2 = document.createElement('canvas');
        pg2.width = pg2.height = N;
        const g2 = pg2.getContext('2d');
        g2.drawImage(cv, 0, 0, N, N);
        const d2 = g2.getImageData(0, 0, N, N).data;
        let clear = 0;
        for (let i = 3; i < d2.length; i += 4) if (d2[i] < 128) clear++;
        if (clear > N * N * 0.01) tex.userData.hasAlpha = true;
        tex.userData.clearRatio = clear / (N * N);      // 透明像素占比：>22% = 羽毛/蕾丝/纱（走混合）
      } catch (e) {}
      tex.userData.avg = cnt ? [r / cnt / 255, g / cnt / 255, b / cnt / 255] : null;
    } catch (e) { tex.userData.hasAlpha = false; tex.userData.avg = null; }
    tex.userData.src = path;
    return tex;
  }

  /** zip（或文件夹）→ 找出主 .pmx → 解析 → 建 three 对象 */
  async function buildFromPackage(bytes, kind, onProgress, dirFiles, pmxIdx) {
    const [zipMod] = await Promise.all([import('./mmd/zipread.js'), loadParser(), init()]);
    // 官方 MMDLoader 装配（旧的自写转换器已删 —— 见 buildFromPackage 里的说明）
    let pkg = null, pmxBytes = null, pmxName = '';
    // ★ 一个文件夹（或 zip）里常有**好几个** pmx：角色本体 + 武器 + 部件，贴图全堆在一起。
    //   以前我"挑最大的那个"是在替用户瞎猜（那个文件夹里挑中的可能正是镰刀）——
    //   现在**全列出来**，默认选最大的（角色本体通常最大），用户可以在界面上切换。
    const listOf = (map, sizeOf) => [...map.values()]
      .filter(v => /\.pmx$/i.test(v.name))
      .sort((a, b) => sizeOf(b) - sizeOf(a));
    if (kind === 'zip' || kind === 'dir') {
      onProgress && onProgress(0.05, 0, 0);
      pkg = (kind === 'zip') ? await zipMod.readZip(bytes) : zipMod.fromFileList(dirFiles);
      texPool = pkg;                       // 记住这一包 → 之后单独丢 pmx 也能自动配贴图
      const allPmx = listOf(pkg, v => (v.bytes ? v.bytes.length : (v.usize || (v.file ? v.file.size : 0))));
      pkgPmx = allPmx.filter(v => !droppedPmx.has(v.name));
      if (!pkgPmx.length) {
        const sk = (pkg && pkg.skipped) || [];
        const e = new Error(allPmx.length
          ? '这个包里的模型都被你去掉了 —— 刷新页面就回来。'
          : sk.length
          ? '这个 zip 里的文件用了**不支持的压缩法**（' + sk.slice(0, 3).join('、') + (sk.length > 3 ? ' 等' : '') +
            '）—— 常见于 2345好压 / 快压 打的包。请用 Bandizip 或 7-Zip 重新压一次（普通 deflate）再导入。'
          : (kind === 'zip' ? '这个 zip 里没有 .pmx —— 是不是下错了包？' : '这个文件夹里没有 .pmx —— 选错文件夹了？'));
        e.sniffed = true; throw e;
      }
      pmxIndex = Math.min(Math.max(0, pmxIdx || 0), pkgPmx.length - 1);
      const pick = pkgPmx[pmxIndex];
      pmxBytes = pick.bytes || await zipMod.entryBytes(pick);
      pmxName = pick.name;
    } else {
      pmxBytes = bytes; pmxName = srcName;
      pkg = texPool;                       // 单独一个 .pmx：贴图用上次记住的那个池
      pkgPmx = [{ name: pmxName }]; pmxIndex = 0;
    }
    onProgress && onProgress(0.25, 0, 0);
    const ab = pmxBytes.buffer.slice(pmxBytes.byteOffset, pmxBytes.byteOffset + pmxBytes.byteLength);
    // ★ 记账：**真正加载成功**几张贴图。`stats.textures` 是 PMX 里"引用了多少张"，
    //   只导 .pmx 时它照样是 18 —— 看上去一切正常，屏幕上却是一片白模（用户实际撞上的）。
    let texOk = 0, texMiss = 0;
    const texLoader = async (path) => {
      if (!pkg) { texMiss++; return null; }                      // 单个 .pmx：没有贴图可找
      const e = zipMod.findEntry(pkg, path);
      if (!e) { texMiss++; console.warn('[MMD] 包里找不到贴图:', path); return null; }
      const b = await zipMod.entryBytes(e);
      const t = b ? imageToTexture(b, path) : null;
      if (t) texOk++; else { texMiss++; console.warn('[MMD] 贴图解不开:', path); }
      return t;
    };
    // ★★ 用官方维护的 @moeru/three-mmd 装配（toon 材质 + 球面贴图 SPH/SPA + 描边 + SDEF
    //    全都处理过 —— 这四样正是我手搓那套做不出来、把衣服渲成白板的原因）。
    //    贴图接缝：它通过我传进去的 LoadingManager **按 URL** 取贴图，所以先把包里的图片
    //    造成 blob URL 登记好，再用 setURLModifier 把它的请求重定向过去。
    //    ⚠ 失败就退回我自己那套（不把页面搞挂）；两条路都通了之后再删旧的那套。
    let built = null;
    try {
      const { MMDLoader } = await import(SELF_DIR + 'mmd/three-mmd/index.js');
      const blobs = new Map();
      if (pkg) {
        for (const [k, e] of pkg) {
          if (!/\.(png|jpe?g|tga|bmp|gif|webp|spa|sph)$/i.test(k)) continue;
          const b = await zipMod.entryBytes(e);
          if (b) blobs.set(k, URL.createObjectURL(new Blob([b])));
        }
      }
      // ★★ MMD 的 toon 渐变（`toon01.bmp` ~ `toon10.bmp`）**是 MMD 程序自带的，模型包里没有**。
      //    官方 toon 材质的片元里是这么分档的：
      //        vec3 toon = texture2D(mmdToonMap, vec2(dotNL*0.5+0.5, 0)).rgb;
      //    贴图取不到 → 分档图是空/常量 → **整块模型渲染成平的**。
      //    实测就是它：模型亮暗两端差只有 **4**（目标 30~80），而且"环境贴图开关""阴影开关"全都"没差别" ——
      //    根因同一个。（这也解释了为什么之前怎么调灯/降噪都没用。）
      //    这里**现造**这 10 张 1D 渐变塞进 blob 表，让它的 URL 请求能命中。
      for (let ti = 1; ti <= 10; ti++) {
        const tkey = 'toon' + String(ti).padStart(2, '0') + '.bmp';
        if (blobs.has(tkey)) continue;
        const tc = document.createElement('canvas'); tc.width = 64; tc.height = 1;
        const tg = tc.getContext('2d');
        const floor = 0.35 + Math.min(4, ti - 1) * 0.07;          // 阴影档深浅（toon01 最深）
        for (let x = 0; x < 64; x++) {
          const u = x / 63;
          const s = (ti <= 5)
            ? (u < 0.5 ? floor : 1)                                 // 硬两档（MMD 最常见）
            : (u < 0.33 ? floor : (u < 0.66 ? (floor + 1) / 2 : 1));// 三档（软一点）
          const v = Math.round(Math.max(0, Math.min(1, s)) * 255);
          tg.fillStyle = 'rgb(' + v + ',' + v + ',' + v + ')';
          tg.fillRect(x, 0, 1, 1);
        }
        const tBlob = await new Promise(res => tc.toBlob(res, 'image/png'));
        if (tBlob) blobs.set(tkey, URL.createObjectURL(tBlob));
      }
      const mgr = new THREE.LoadingManager();
      // 自检用：记下每一次贴图请求**有没有命中我造的 blob**。
      // ⚠ 没有这个记录，"toon01.bmp 到底走没走到我造的那张"就只能靠猜 —— 上一轮就是因此分不清
      //   "修复没生效" 和 "指标看不见"。真机/自检里看 window.__texHit 即可。
      const texHit = [];
      window.__texHit = texHit;
      mgr.setURLModifier(u => {
        const base = decodeURIComponent(String(u).split(/[\\/?#]/).pop() || '').normalize('NFC').toLowerCase();
        const hit = blobs.get(base);
        texHit.push({ base, hit: !!hit });
        if (texHit.length > 120) texHit.shift();
        return hit || u;
      });
      const pmxUrl = URL.createObjectURL(new Blob([ab], { type: 'application/octet-stream' }));
      const mmd = await new MMDLoader(mgr).loadAsync(pmxUrl);
      const root2 = mmd.skinnedMesh || mmd.mesh || mmd;
      if (root2 && root2.isObject3D) {
        let nb = 0, nt = 0, nm2 = 0;
        root2.traverse(o => {
          if (o.isBone) nb++;
          if (o.isMesh && o.geometry) {
            const g = o.geometry, ix = g.index;
            nt += (ix ? ix.count : g.attributes.position.count) / 3;
            if (o.morphTargetDictionary) nm2 = Math.max(nm2, Object.keys(o.morphTargetDictionary).length);
          }
        });
        built = {
          root: root2, height: 0,
          stats: { tris: Math.round(nt), bones: nb, morphs: nm2, materials: 0, textures: blobs.size },
          texOk: blobs.size, texMiss: 0, official: mmd,
        };
        built.official = true;
        // ⚠ 官方装配出来的网格要自己挂进我的阴影系统：不设 castShadow 就会"影子开关没差别"。
        //    frustumCulled=false：蒙皮网格的包围盒算不准，镜头一转整块消失过。
        root2.traverse(o => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
        setTimeout(() => { for (const u of blobs.values()) { try { URL.revokeObjectURL(u); } catch (e) {} }
                           try { URL.revokeObjectURL(pmxUrl); } catch (e) {} }, 60000);
      }
    } catch (err) {
      console.warn('[MMD] 官方 MMDLoader 失败，退回自写转换器：', err);
      built = null;
    }
    if (!built) throw new Error('模型装配失败（官方 MMDLoader 没跑通）—— 把控制台里的报错发我。');
    onProgress && onProgress(1, 0, 0);
    built.pmxName = pmxName;
    built.fromPackage = !!pkg;
    // ⚠ 别把官方路径已经记好的贴图数覆盖成 0（旧路径的计数器这时全是 0 —— 踩过）
    if (built.texOk === undefined) { built.texOk = texOk; built.texMiss = texMiss; }
    built.pmxList = pkgPmx.map(e => e.name);      // 这个包里所有模型的名字（界面拿它排按钮）
    built.pmxIndex = pmxIndex || 0;
    return built;
  }

  // 把退场的模型从显存里放掉
  function disposeRoot(r) {
    if (!r) return;
    const tex = new Set(), skel = new Set(), mats = new Set();
    r.traverse(o => {
      if (o.isSkinnedMesh && o.skeleton) skel.add(o.skeleton);
      if (o.customDepthMaterial) mats.add(o.customDepthMaterial);
      if (o.customDistanceMaterial) mats.add(o.customDistanceMaterial);
      if (!o.isMesh && !o.isLine && !o.isPoints) return;
      if (o.geometry) o.geometry.dispose();
      for (const m of (Array.isArray(o.material) ? o.material : [o.material])) if (m) mats.add(m);
    });
    for (const m of mats) {
      for (const k in m) { const v = m[k]; if (v && v.isTexture) tex.add(v); }
      m.dispose();
    }
    for (const s of skel) { try { s.dispose(); } catch (e) {} }
    for (const t of tex) { try { t.dispose(); } catch (e) {} }
  }

  /** @param src  URL 字符串 / `<input type=file>` 的 File / `<input webkitdirectory>` 的 FileList */
  async function load(src, onProgress, pmxIdx) {
    if (!(await init())) return false;
    if (busy) return false;
    busy = true;
    const t0 = performance.now();
    try {
      // ★ 文件夹导入（webkitdirectory）：MMD 模型常常是**散开的一堆文件**
      //   （身体.pmx + 脸.png + 花.png…），不是一个 zip。FileList 没有单一"文件头"可嗅，
      //   所以它单独一条路 —— 但在 buildFromPackage 里和 zip 汇合，贴图照旧按文件名找。
      //   ⚠ 安卓的 Chrome 会**忽略 webkitdirectory**，退化成"多选文件"：那时
      //   webkitRelativePath 是空的，`fromFileList` 退回用 basename —— 一样能对上贴图。
      const isDir = !!src && typeof src !== 'string' &&
                    typeof src.arrayBuffer !== 'function' &&
                    typeof src.length === 'number' && src.length > 0;
      srcName = isDir
        ? (((src[0] && src[0].webkitRelativePath) || '').split(/[\\/]/)[0] || '这个文件夹')
        : (typeof src === 'string') ? src.split('/').pop() : (src.name || '模型');
      // 先读成字节再嗅探 —— 读成字节还有一个好处：GLTFLoader 拿 blob URL 解析，
      // 不依赖服务器给对 MIME（有些静态托管给 .glb 发 application/octet-stream）。
      const bytes = isDir ? null : await readBytes(src, onProgress);
      const s = isDir ? { ok: true, kind: 'dir' } : sniff(bytes);
      // 嗅探出来的消息本身就是完整的一句"该怎么办"，别再套一层"模型载入失败："（会读成两句）
      if (!s.ok) { const err = new Error(s.msg); err.sniffed = true; throw err; }
      // ── 两条路：glTF（.glb/.gltf）走 GLTFLoader；.pmx/.zip 走自带的 PMX 解析器 ──
      let newRoot = null, info = null;
      if (s.kind === 'pmx' || s.kind === 'zip' || s.kind === 'dir') {
        if (s.msg) console.warn('[MMD] ' + s.msg);          // 单个 .pmx：说清"贴图不在里面"
        info = await buildFromPackage(bytes, s.kind, onProgress, isDir ? src : null, pmxIdx);
        // 换了一包就把"去掉过谁"清空 —— 那些名字只对上一个包有意义
        if (!lastLoad || lastLoad.src !== src) droppedPmx.clear();
        lastLoad = { src: src, kind: s.kind };    // 换模型时用同一份输入重建
        newRoot = info.root;
      } else {
        const url = URL.createObjectURL(new Blob([bytes], { type: 'model/gltf-binary' }));
        const gltf = await new Promise((res, rej) =>
          new GLTFLoader().load(url, res, null, rej));
        setTimeout(() => { try { URL.revokeObjectURL(url); } catch (e) {} }, 30000);
        newRoot = gltf.scene;
        const ud = newRoot.userData || {};
        const asm = (gltf.parser && gltf.parser.json && gltf.parser.json.scenes
          && gltf.parser.json.scenes[0] && gltf.parser.json.scenes[0].extras) || {};
        info = { height: asm.mmd_height || ud.mmd_height || 0, poses: null,
                 stats: { tris: 0, bones: 0, morphs: 0, materials: 0, textures: 0 } };
        if (asm.mmd_poses) { try { info.poses = JSON.parse(asm.mmd_poses); } catch (e) { console.warn('[MMD] 内嵌姿势解析失败', e); } }
      }

      // ── 收编：清索引 → 挂上 → 重建（两条路径共用这一段）──
      // 退场的模型要 dispose 之后再丢引用
      if (root) { scene.remove(root); disposeRoot(root); root = null; }
      bones.clear(); restQ.clear(); boneByKey.clear();
      root = newRoot;
      let tris = 0, nb = 0, nm = 0, nmats = 0;
      const texSet = new Set();
      root.traverse(o => {
        if (o.isMesh) {
          o.castShadow = true;
          o.receiveShadow = false;         // 立绘自己不吃自己的影子（MMD 本来也没有自阴影）
          const g = o.geometry;
          tris += (g.index ? g.index.count : g.attributes.position.count) / 3;
          if (o.morphTargetInfluences) nm = Math.max(nm, o.morphTargetInfluences.length);
          o.frustumCulled = false;         // 骨骼动画会把包围盒撑出去，别被裁掉
          for (const m of (Array.isArray(o.material) ? o.material : [o.material])) {
            if (!m) continue;
            nmats++;
            if (m.map) texSet.add(m.map.uuid);
          }
        }
        if (o.isBone) {
          nb++;
          bones.set(san(o.name), o);
          const k = boneKey(o.name);
          if (!boneByKey.has(k)) boneByKey.set(k, o);      // ⚠ 归一化索引：PMX 原件是 `左腕`，
          restQ.set(o.name, o.quaternion.clone());         //   而姿势表按 mmd_tools 的 `腕.L` 写
        }
      });
      scene.add(root);

      if (info.height) modelH = info.height;
      poses = info.poses || null;
      // PMX 文件里**没有**姿势表（那是 VMD/VPD 的事）—— 外面那份 mmd/poses.json 是通用的
      // （姿势存的是"相对骨骼局部"的四元数 + MMD 标准骨名，所以换模型也能用）
      if (!poses) { try { poses = await loadDefaultPoses(); } catch (e) {} }
      stats.tris = Math.round(tris); stats.bones = nb; stats.morphs = nm;
      // ★ 蒙皮**之前**的几何包围盒 —— 用来一刀切开"顶点位置错"和"蒙皮权重错"。
      //   模型塌成缕状时这两个病因表现极像；先量几何：正常（身高≈1.7、脚底≈0）就说明
      //   顶点是对的，病在权重/索引；几何本身就塌，病在解析分支或 leftToRight。
      try {
        // ⚠ 这里**不能**用 geometry.computeBoundingBox()：three 在 morphTargetsRelative===true 时
        //   会把 morph 的增量也算进包围盒 → 同一个模型在"修好 morph 语义"前后量出来
        //   1.088 → 2.437（脚底 −0.117 → −1.084），一个纯诊断字段悄悄换了含义。
        //   所以自己只扫 position（基形），另外单独把 morph 的最大增量报出来：
        //   它要是达到米级，说明那个 morph 存的是绝对位置（不是增量）—— 一旦给它权重就会炸。
        let bx0 = Infinity, bx1 = -Infinity, by0 = Infinity, by1 = -Infinity, bz0 = Infinity, bz1 = -Infinity;
        let span = 0;
        root.traverse(o => {
          if (!o.isMesh || !o.geometry) return;
          const pos = o.geometry.attributes && o.geometry.attributes.position;
          if (!pos) return;
          const a = pos.array;
          for (let i = 0; i < a.length; i += 3) {
            const x = a[i], y = a[i + 1], z = a[i + 2];
            if (x < bx0) bx0 = x; if (x > bx1) bx1 = x;
            if (y < by0) by0 = y; if (y > by1) by1 = y;
            if (z < bz0) bz0 = z; if (z > bz1) bz1 = z;
          }
          const ms = o.geometry.morphAttributes && o.geometry.morphAttributes.position;
          if (ms) for (const m of ms) {
            const d = m.array;
            for (let i = 0; i < d.length; i++) { const v = d[i] < 0 ? -d[i] : d[i]; if (v > span) span = v; }
          }
        });
        if (isFinite(bx0)) {
          stats.geoW = +(bx1 - bx0).toFixed(3);
          stats.geoH = +(by1 - by0).toFixed(3);
          stats.geoD = +(bz1 - bz0).toFixed(3);
          stats.geoFeetY = +by0.toFixed(4);
          // ★★ 落位的"脚底"和"身高"必须来自**脚骨**，不能把几何包围盒当成人。
          //    希儿—死生之律者：翅膀/裙摆垂到脚下面 1 米 → bbox 高 2.614 被当成身高，
          //    人物被缩到 66%；而 root.y 又硬编码 0（假设原点就在脚上）→ 整个人沉下去、
          //    翅膀平铺在地上。用户截图里"这不是人吧"就是这个。实测顶边差 197px（正常 0~20px）。
          feetRef = footRefY(by0);        // 脚骨最低点；一根脚骨都没有才退回包围盒下边
          modelH = by1 - feetRef;         // 身高 = 网格最高点 − 脚底（**不是** bbox 高度）
          stats.feetRef = +feetRef.toFixed(4);
          stats.morphSpan = +span.toFixed(4);   // 基形单位（已缩放）下的最大 morph 增量
        }
      } catch (e) {}
      stats.materials = info.stats.materials || nmats;
      stats.textures = info.stats.textures || texSet.size;
      // 真正落到 GPU 上的贴图数（info.stats.textures 只是"引用了多少张"）
      stats.texOk = info.texOk || 0; stats.texMiss = info.texMiss || 0;
      stats.official = !!info.official;   // 是否走的官方 MMDLoader（toon 材质不吃 scene.environment）
      pmxIndex = info.pmxIndex || 0;
      stats.poses = poses ? poses.poses.length : 0;
      stats.loadMs = Math.round(performance.now() - t0);
      stats.kind = s.kind;
      // 换模型必须把姿势缓存标记清掉，否则新模型套的还是上一版的姿势（appliedPose 会挡住重套）
      curPose = -1; appliedPose = -1;
      busy = false;
      return true;
    } catch (e) {
      setError(e && e.sniffed ? e.message : ('模型解析失败：' + ((e && e.message) || e)));
      busy = false;
      return false;
    }
  }

  // ── 姿势（算出来的，不是读一张手 K 的表）────────────────────────────
  // ★★ 为什么不读手 K 的四元数表：局部的含义依赖**骨骼自身的朝向**。T-pose 下
  //    上臂恰好沿自身轴伸出，于是那些"绕世界轴"的旋转在局部空间里大半变成了
  //    **拧毛巾（自转）**，轮廓上几乎看不出变化。
  //    实测（知更鸟）：站立 360px 宽、挥手 380px，而双臂展开按几何 1.088m 折算
  //    约 330px —— 等于胳膊根本没放下来，用户看到的就是一直 T-pose。
  //    只有「举手欢呼」碰巧转到别的轴才露出变化，所以这个 bug 藏了很久。
  //    现在改成在**世界空间里"瞄准"**：量的是世界方向，与骨骼朝向、模型 rig 无关，
  //    所以换任何 MMD 模型都成立，也不用开 Blender 重新 K。
  function lookupBone(n) {
    return bones.get(san(n)) || (boneKey && boneByKey.get(boneKey(n))) || null;
  }
  /** 脚底参考高度：脚骨最低点（脚尖 → 脚踝 → 脚）。
   *  ⚠ 为什么不能拿几何包围盒下边当脚底：MMD 模型的翅膀、长裙、拖地头发常常垂到
   *    **脚下面**（希儿那份是 −1.0m）。用它当脚底/身高，人就被缩小 + 沉进地里 ——
   *    用户看到的是"一团翅膀铺在地上"，而自检的头顶断言会差 197px。 */
  function footRefY(fallback) {
    if (!root) return fallback;
    root.updateMatrixWorld(true);
    let f = null;
    for (const n of ['つま先.L', 'つま先.R', '足首.L', '足首.R', '足.L', '足.R']) {
      const b = lookupBone(n);
      if (!b) continue;
      const y = b.getWorldPosition(new THREE.Vector3()).y;
      if (f === null || y < f) f = y;
    }
    return f === null ? fallback : f;
  }
  /** 骨骼的世界朝向（指向链上第一根子骨；没子骨就用它自己的 +Y） */
  function boneDir(b) {
    root.updateMatrixWorld(true);
    const p = b.getWorldPosition(new THREE.Vector3());
    for (const c of b.children) {
      if (c.isBone) return c.getWorldPosition(new THREE.Vector3()).sub(p).normalize();
    }
    return new THREE.Vector3(0, 1, 0).applyQuaternion(b.getWorldQuaternion(new THREE.Quaternion()));
  }
  /** 绕**世界轴**转一根骨：换算成"父骨空间里的前乘"，所以骨骼自身朝向不影响结果 */
  function turnWorld(b, axis, deg) {
    const qp = b.parent ? b.parent.getWorldQuaternion(new THREE.Quaternion()) : new THREE.Quaternion();
    const R = new THREE.Quaternion().setFromAxisAngle(axis.clone().normalize(), deg * D2R);
    b.quaternion.premultiply(qp.clone().invert().multiply(R).multiply(qp));
    root.updateMatrixWorld(true);
  }
  /** 把一根骨**瞄**到世界方向 dir（走最小旋转 → 不引入额外自转） */
  function aimWorld(b, dir) {
    const d = boneDir(b), t = dir.clone().normalize();
    const dot = Math.max(-1, Math.min(1, d.dot(t)));
    const axis = new THREE.Vector3().crossVectors(d, t);
    if (axis.lengthSq() < 1e-10) return;                  // 已同向（正相反时最小旋转不唯一，跳过）
    turnWorld(b, axis, Math.acos(dot) / D2R);
  }
  // 每个姿势只写"想要的结果"（胳膊朝哪、躯干转多少），四元数由上面三个函数算。
  // 方向里的 s = 这根臂**现在**朝外的符号（从模型自己身上量）—— 这样不必假设
  // 模型的"右"是 +X 还是 −X、"正面"是 +Z 还是 −Z，换个 rig 也不会镜像。
  const ARM_DIRS = {
    down: s => [0.30 * s, -1.00, 0.12],                   // 自然下垂：略外、略前
    wave: s => [0.55 * s, 0.62, 0.20],                    // 抬到肩以上（挥手那条臂）
    up: s => [0.42 * s, 0.92, 0.06],                      // 高举
  };
  const ELB_DIRS = {
    down: s => [0.22 * s, -1.00, 0.30],                   // 小臂略前摆 —— 笔直下垂像假人
    wave: s => [0.18 * s, 0.98, 0.22],
    up: s => [0.20 * s, 0.98, 0.10],
  };
  const PROC_POSES = [
    { name: '站立', arms: ['down', 'down'], bodyTurn: 0, headTurn: 0 },
    { name: '挥手', arms: ['wave', 'down'], bodyTurn: 0, headTurn: -6 },
    { name: '举手欢呼', arms: ['up', 'up'], bodyTurn: 0, headTurn: 0 },
    { name: '侧身回望', arms: ['down', 'down'], bodyTurn: -24, headTurn: 36 },
  ];
  const ARM_CHAIN = [['R', '腕.R', 'ひじ.R'], ['L', '腕.L', 'ひじ.L']];

  function resetRig() {
    if (!root) return;
    root.traverse(o => {
      if (o.isBone) { const q = restQ.get(o.name); if (q) o.quaternion.copy(q); }
      if (o.isMesh && o.morphTargetInfluences) o.morphTargetInfluences.fill(0);
    });
  }
  function setPose(idx) {
    curPose = idx;
    if (!root) return { hit: 0, morphs: 0, miss: [] };
    resetRig();
    const spec = PROC_POSES[idx];
    if (!spec) return { hit: 0, morphs: 0, miss: [] };
    // 先量**静止姿势**下每根臂朝外的符号（要在一根骨都还没动的时候量）
    const sgn = {};
    for (const [k, an] of ARM_CHAIN) {
      const a = lookupBone(an);
      sgn[k] = a ? (Math.sign(boneDir(a).x) || (k === 'R' ? -1 : 1)) : (k === 'R' ? -1 : 1);
    }
    let hit = 0;
    for (const [k, an, fn] of ARM_CHAIN) {
      const mode = spec.arms[k === 'R' ? 0 : 1], s = sgn[k];
      const a = lookupBone(an), f = lookupBone(fn);
      // ⚠ 顺序：先大臂再小臂 —— 小臂的当前朝向依赖大臂已经转好的结果
      if (a) { aimWorld(a, new THREE.Vector3(...ARM_DIRS[mode](s))); hit++; }
      if (f) { aimWorld(f, new THREE.Vector3(...ELB_DIRS[mode](s))); hit++; }
    }
    // 躯干/头：绕世界 Y 转。Y 是竖直轴 —— 脚底在 y≈0、身高 1.7m，这是量出来的
    if (spec.bodyTurn) { const b = lookupBone('上半身'); if (b) { turnWorld(b, new THREE.Vector3(0, 1, 0), spec.bodyTurn); hit++; } }
    if (spec.headTurn) {
      const b = lookupBone('首') || lookupBone('頭');
      if (b) { turnWorld(b, new THREE.Vector3(0, 1, 0), spec.headTurn); hit++; }
    }
    // 表情仍然用手 K 的那份数据：morph 名是**逐模型**的（にこり / 笑い…），只能查表。
    // 按**姿势名**对齐，不靠下标 —— 两边顺序改了也不会错位。
    let morphs = 0;
    const tbl = (poses && poses.poses) ? poses.poses.find(p => p.name === spec.name) : null;
    if (tbl && tbl.morphs) {
      const seen = new Set();
      root.traverse(o => {
        if (!o.isMesh || !o.morphTargetInfluences || !o.morphTargetDictionary) return;
        for (const mn in tbl.morphs) {
          const i = o.morphTargetDictionary[mn];
          if (i !== undefined) { o.morphTargetInfluences[i] = tbl.morphs[mn]; seen.add(mn); }
        }
      });
      morphs = seen.size;
    }
    const miss = [];
    for (const [, an, fn] of ARM_CHAIN) {
      if (!lookupBone(an)) miss.push(an);
      if (!lookupBone(fn)) miss.push(fn);
    }
    root.updateMatrixWorld(true);
    return { hit, morphs, miss };
  }
  const poseNames = () => PROC_POSES.map(p => p.name);
  /** 给自检量姿势用：某根骨的**世界**坐标（查不到返回 null） */
  function boneWorld(name) {
    if (!root) return null;
    const b = lookupBone(name);
    if (!b) return null;
    root.updateMatrixWorld(true);
    const p = b.getWorldPosition(new THREE.Vector3());
    return [p.x, p.y, p.z];
  }

  // ── 相机：按 arcam 的公式直接拼矩阵 ─────────────────────────────────
  function viewMatrix(pitch, roll, camH) {
    const p = pitch * D2R, r = roll * D2R;
    const sp = Math.sin(p), cp = Math.cos(p), sr = Math.sin(r), cr = Math.cos(r);
    const m = new THREE.Matrix4();
    m.set(
       cr, cp * sr, -sp * sr, -camH * cp * sr,
      -sr, cp * cr, -sp * cr, -camH * cp * cr,
        0, sp,       cp,      -camH * sp,
        0, 0,        0,        1
    );
    return m;
  }
  function projMatrix(f, W, H, near, far) {
    const m = new THREE.Matrix4();
    m.set(
      2 * f / W, 0, 0, 0,
      0, 2 * f / H, 0, 0,
      0, 0, (far + near) / (near - far), 2 * far * near / (near - far),
      0, 0, -1, 0
    );
    return m;
  }

  // ── 环境统计量 → 光照/白平衡 ────────────────────────────────────────
  //   和 2D 那条路吃的是**同一份** LIGHT（lum/r/b/sat），所以两边配的光是一致的。
  let envNow = { lum: 0.42, r: 0.5, b: 0.5, sat: 0.4, ok: false };
  function setEnv(e) {
    if (!e) return;
    envNow = e;
    if (!hemi) return;
    const r = Math.max(0.02, e.r), b = Math.max(0.02, e.b);
    // G 没被采样（2D 那边只取 R/B）—— 用亮度权重反解，保证三通道的亮度和等于 lum
    let g = (e.lum - 0.2126 * r - 0.0722 * b) / 0.7152;
    g = Math.min(1, Math.max(0.02, g));
    const mx = Math.max(r, g, b) || 1;
    const tint = [r / mx, g / mx, b / mx];
    // 明暗：相对中性环境(0.42)的**受限**增益。上限 1.15 是 2D 那条路实测出来的：
    //   再往上白平衡会在亮部失效（R 撞 255 而 B 没撞，R/B 被压回 1）。
    const gain = Math.min(1.15, Math.max(0.62, e.lum / 0.42));
    hemi.color.setRGB(tint[0], tint[1], tint[2]);
    hemi.groundColor.setRGB(0.28 * tint[0], 0.26 * tint[1], 0.23 * tint[2]);
    // ★★ 「方向感」是第一优先（四张实拍合成的共同症状：模型通体均匀亮、看不出光从哪来）。
    //    根因：**半球光把所有朝向都填亮了** → toon 的分档阈值被整体抬过 → 只剩亮档、暗档永不出现，
    //    平行主光的明暗差被淹没。所以砍半球光、拉主光，让分档能被触发。
    //    实测基线：模型朝光侧/背光侧亮度差 ≈ 0；**目标 ΔL ∈ [30, 80]**（锚在画面的 σ_lum × 1.5）。
    hemi.intensity = L.ambInt * gain * 0.25;
    key.color.setRGB(Math.min(1, tint[0] * 1.06), Math.min(1, tint[1] * 1.0), Math.min(1, tint[2] * 0.95));
    key.intensity = L.keyInt * gain * 1.6;      // 拉高主光：toon 分档靠 dot(N,L) 的切分点，光不够就切不出来
    rim.color.setRGB(tint[0] * 0.78 + 0.12, tint[1] * 0.82 + 0.14, 1.0 * tint[2]);
    rim.intensity = L.rimInt * gain;
    renderer.toneMappingExposure = 1;
  }

  // ── 颗粒（和 2D 那条路一个道理：跟着**环境**亮度走，不跟立绘自己走）──
  const GRN_MAX = 6.5, GRN_MIN = 0.7, GRN_COMP_MAX = 3.2;
  // ── 景深用的便宜模糊 ────────────────────────────────────────────────
  let blurA = null, blurB = null;
  /** 在 **1/2 分辨率**上做分离式 box blur（累加绘制：N 个带 alpha 的平移拷贝之和），
   *  再交给调用方升采样回去。为什么不用 `ctx.filter='blur()'`：见 render() 里那段注释
   *  —— 它在 --disable-gpu 的 headless 里静默失效，像素一个都不动。 */
  function defocusLayer(radius) {
    const w = Math.max(1, glCanvas.width >> 1), h = Math.max(1, glCanvas.height >> 1);
    if (!blurA) { blurA = document.createElement('canvas'); blurB = document.createElement('canvas'); }
    for (const c of [blurA, blurB]) if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    const ga = blurA.getContext('2d'), gb = blurB.getContext('2d');
    ga.clearRect(0, 0, w, h); ga.drawImage(glCanvas, 0, 0, w, h);
    const taps = Math.max(1, Math.min(6, Math.round(radius / 2)));   // tap 数封顶：手机端别爆
    const step = radius / taps;
    const a = 1 / (taps * 2 + 1);
    // ★ 必须用 **lighter（加算）**累加，不能用默认的 source-over：
    //   source-over 每个 tap 是"盖上去"，实心区的 alpha 只会累到 ~165（13 个 1/13 的叠加），
    //   整个立绘变半透明（实测：模糊后没有任何像素 alpha>200）。
    //   canvas 存的是**预乘**颜色，加算正好等于预乘空间里的加权和 —— 实心区 13×255/13 = 255，
    //   精确还原；边缘则是正经的均值。
    gb.clearRect(0, 0, w, h); gb.globalAlpha = a; gb.globalCompositeOperation = 'lighter';
    for (let i = -taps; i <= taps; i++) gb.drawImage(blurA, i * step, 0);
    gb.globalAlpha = 1; gb.globalCompositeOperation = 'source-over';
    ga.clearRect(0, 0, w, h); ga.globalAlpha = a; ga.globalCompositeOperation = 'lighter';
    for (let i = -taps; i <= taps; i++) ga.drawImage(blurB, 0, i * step);
    ga.globalAlpha = 1; ga.globalCompositeOperation = 'source-over';
    return blurA;
  }
  /** 把某张画布原样搬成"后处理输出"（关颗粒但要景深时走这条），让 canvas() 能返回它 */
  function makePostFrom(srcCanvas, W, H) {
    if (!post) { post = document.createElement('canvas'); postCtx = post.getContext('2d'); }
    if (post.width !== W || post.height !== H) { post.width = W; post.height = H; }
    postCtx.clearRect(0, 0, W, H);
    postCtx.drawImage(srcCanvas, 0, 0, W, H);
    return post;
  }

  function ensureGrain() {
    if (grainTile) return;
    const n = 256;
    grainTile = document.createElement('canvas'); grainTile.width = grainTile.height = n;
    const g = grainTile.getContext('2d');
    const img = g.createImageData(n, n);
    // 固定种子：每次重烘必须是**同一张**颗粒，否则光一变就"沙沙"重排，比不加还假
    let s = 1337;
    const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    for (let i = 0; i < n * n; i++) {
      const v = (rnd() - 0.5) * 255;
      img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = 128 + v * 0.5;
      img.data[i * 4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  }

  // ── 渲染 ────────────────────────────────────────────────────────────
  /**
   * @param o {
   *   W,H          画布尺寸（cv.width/height）
   *   f            像素焦距（页面里的 focal()）
   *   camH,pitch,roll  相机高度 / 俯角 / 滚转
   *   x,d          人物站的地面点（米）
   *   hp           人物身高（米）
   *   scale        纯大小系数
   *   pose         姿势下标，-1 = 静止
   *   env          { lum, r, b, sat, ok }
   * }
   * @returns 渲染耗时 ms；失败返回 0
   */
  function render(o) {
    if (!ready || !root) return 0;
    const t0 = performance.now();
    const W = Math.max(1, Math.round(o.W)), H = Math.max(1, Math.round(o.H));
    if (glCanvas.width !== W || glCanvas.height !== H) {
      renderer.setSize(W, H, false);
    }
    setEnv(o.env);
    // ⚠ 姿势只在**换过**的时候重套：resetRig 要遍历 572 根骨 + 33 个网格，
    //   每帧都做的话手机端白烧一大截帧时间。
    const want = (o.pose === undefined) ? curPose : o.pose;
    if (want !== appliedPose) {
      const pr = setPose(want);
      appliedPose = want;
      stats.poseHit = pr.hit; stats.poseMiss = pr.miss.length;
      if (pr.miss.length) console.warn('[MMD] 姿势里有 ' + pr.miss.length + ' 根骨没匹配上:', pr.miss.slice(0, 6).join(','));
    }

    const s = (o.hp * (o.scale === undefined ? 1 : o.scale)) / modelH;
    root.scale.setScalar(s);
    root.position.set(o.x || 0, -feetRef * s, -(o.d || 4));   // 脚底踩地（不是"原点踩地"）
    root.rotation.set(0, 0, 0);
    root.updateMatrixWorld(true);

    camera.matrixWorldInverse.copy(viewMatrix(o.pitch, o.roll, o.camH));
    camera.matrixWorld.copy(camera.matrixWorldInverse).invert();
    camera.projectionMatrix.copy(projMatrix(o.f, W, H, 0.05, 120));
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();

    // 主光：位置按方位角/高度角摆在人物周围，影子相机跟着人物走
    const az = L.keyAz * D2R, el = L.keyEl * D2R;
    const R = 6;
    const px = (o.x || 0) + R * Math.cos(el) * Math.sin(az);
    const py = R * Math.sin(el);
    const pz = -(o.d || 4) + R * Math.cos(el) * Math.cos(az);
    key.position.set(px, py, pz);
    const bb = new THREE.Box3().setFromObject(root);
    key.target.position.set((bb.min.x + bb.max.x) / 2, 0.9, (bb.min.z + bb.max.z) / 2);
    key.target.updateMatrixWorld();
    // ⚠ 阴影相机要按**模型实际包围盒**开，不能按身高：翼展 40 单位、身宽 1.6 米的模型
    //   按身高开，影子只盖住人中间一条 —— "影子开关没差别（只差 3%）"就是这么来的。
    const half = Math.max(1.6, Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z) * 0.75);
    const sc = key.shadow.camera;
    sc.left = -half; sc.right = half; sc.top = half; sc.bottom = -half;
    sc.near = 0.3; sc.far = 22;
    sc.updateProjectionMatrix();
    rim.position.set((o.x || 0) + 3.2, 2.6, -(o.d || 4) - 3.4);
    shadowPlane.visible = L.shadow;
    key.castShadow = L.shadow;
    if (shadowPlane.material) shadowPlane.material.opacity = L.shadowOpacity;

    // ★ 接触暗缝：几乎垂直向下（**同一个方位角**，免得和主影子的方向自相矛盾），
    //   正交框只框住脚下那一小圈 —— 于是它的影子里只有"接地那一圈"，和主影子不重复。
    const el2 = 78 * D2R, R2 = 3;
    contact.position.set(
      (o.x || 0) + R2 * Math.cos(el2) * Math.sin(az),
      R2 * Math.sin(el2),
      -(o.d || 4) + R2 * Math.cos(el2) * Math.cos(az));
    contact.target.position.set(o.x || 0, 0, -(o.d || 4));
    contact.target.updateMatrixWorld();
    const half2 = Math.max(0.6, (o.hp || 1.65) * 0.55);
    const sc2 = contact.shadow.camera;
    sc2.left = -half2; sc2.right = half2; sc2.top = half2; sc2.bottom = -half2;
    sc2.near = 0.2; sc2.far = 9;
    sc2.updateProjectionMatrix();
    contact.castShadow = L.contact;
    contactPlane.visible = L.contact;
    if (contactPlane.material) contactPlane.material.opacity = L.contactOpacity;

    // ★ 照片当环境贴图（o.envFrame 是页面压小的当前帧；没有就用统计量造渐变）
    if (L.ibl) buildEnv(o.envFrame, o.env);
    else if (scene.environment) scene.environmentIntensity = 0;
    renderer.render(scene, camera);

    // ── 后处理：先景深（模糊），再颗粒 ────────────────────────────────
    // ★ 景深：真实光圈不知道，所以这里给的是**相对焦平面的模糊量**，而且是**近似**——
    //   1/2 分辨率上做分离式 box blur 再升回来（真·分离高斯在 200 万像素上每帧跑不动）。
    //   人物站在一个距离上，身体进深只有几十厘米，所以一层整体模糊已经很接近真实的焦外。
    // ⚠ 绝不能用 `ctx.filter = 'blur(Npx)'`：HANDBOOK §4.14 记过 —— 在 --disable-gpu 的
    //   headless 里它**静默失效**（属性读得回来，像素一个都不动），Safari 老版本同样忽略。
    let src = glCanvas;
    if (L.dof > 0) {
      const focus = (L.focus === null || L.focus === undefined) ? (o.d || 4) : L.focus;
      // 离焦平面多远 → 模糊多大。除以 focus 是让它跟距离成比例，近处更敏感。
      const defocus = Math.min(1, Math.abs((o.d || 4) - focus) / Math.max(0.6, focus * 0.6));
      const radius = L.dof * defocus * L.dofMax * (o.f / 1000);
      if (radius >= 0.6) src = defocusLayer(radius);
    }

    // 颗粒：只加在颜色上、不碰 alpha（加 alpha 会让边缘长毛刺）
    // ⚠ post 和 postCtx 是**一对**，要清一起清：只清 post 的话，下次打开颗粒时
    //   `!postCtx` 为假 → 跳过重建 → 拿 null 去读 .width 直接抛。
    if (!L.grain || !o.env || !o.env.ok) {
      post = (src !== glCanvas) ? makePostFrom(src, W, H) : null;
      if (!post) postCtx = null;
      stats.renderMs = Math.round(performance.now() - t0);
      return stats.renderMs;
    }
    ensureGrain();
    if (!postCtx) { post = document.createElement('canvas'); postCtx = post.getContext('2d'); }
    if (post.width !== W || post.height !== H) { post.width = W; post.height = H; }
    postCtx.clearRect(0, 0, W, H);
    postCtx.drawImage(src, 0, 0, W, H);
    const amp = Math.min(GRN_MAX, Math.max(GRN_MIN, GRN_MAX * (1 - (o.env.lum || 0.42) * 1.35)));
    // 缩放补偿：颗粒是在画面尺度上铺的，人物越小越要补（2D 那条路踩过的坑）
    const comp = Math.min(GRN_COMP_MAX, Math.max(1, (o.hp * 380) / Math.max(40, o.f * o.hp / Math.max(1, o.d))));
    // ⚠ 必须用 **source-atop**，不能用 overlay：
    //   这一层要盖在实拍画面上，只有人物（和影子）该有像素；overlay 会把 alpha 也算进混合，
    //   于是整块画布被抬到 alpha≈10% —— 等于给实拍画面蒙了一层雾，而且影子测量全被它淹掉。
    //   source-atop 的定义里 αo = αb：**输出 alpha 恒等于目标 alpha**，正好是"只作用在已有内容上"。
    //   （studio.html 那边早写过同一条：噪点用 source-atop，柔化用 destination-out。）
    // 噪声砖是"128 ± 63"，用 source-atop 混上去时对像素的扰动 ≈ globalAlpha × 63 级。
    // 2D 那条路是**逐像素直接加 ±amp 级**，所以这里要 amp/63 才能对齐同一个量级 ——
    // 写成 amp/255 的话白搭 2.5 倍，颗粒会淡到看不见（实测：暗环境高频几乎不动）。
    postCtx.globalCompositeOperation = 'source-atop';
    postCtx.globalAlpha = Math.min(0.6, amp / 63);
    for (let y = 0; y < H; y += 256) for (let x = 0; x < W; x += 256) postCtx.drawImage(grainTile, x, y);
    postCtx.globalAlpha = 1; postCtx.globalCompositeOperation = 'source-over';
    stats.renderMs = Math.round(performance.now() - t0);
    return stats.renderMs;
  }

  /** 给外部（预览/出图）拿去 drawImage 的那张画布：有颗粒就用后处理那张 */
  return {
    init, load, render, setPose, poseNames, setEnv, boneWorld,
    // 一个文件夹里有好几个模型时用这三条：列出全部 pmx / 当前是第几个 / 换一个
    modelNames: () => pkgPmx.map(e => e.name),
    modelIndex: () => pmxIndex,
    switchModel: (i) => (lastLoad ? load(lastLoad.src, null, i) : Promise.resolve(false)),
    /** 去掉第 i 个模型（包里还有，只是不再列出来）。返回 false = 列表空了 */
    dropModel: (i) => {
      if (!lastLoad || i < 0 || i >= pkgPmx.length) return Promise.resolve(false);
      droppedPmx.add(pkgPmx[i].name);
      // 删完还剩几个：删的是当前那个就往回退一个，否则维持原选择
      const rest = pkgPmx.length - 1;
      if (!rest) { lastLoad = null; pkgPmx = []; return Promise.resolve(false); }
      const next = Math.min(i, rest - 1);
      return load(lastLoad.src, null, next);
    },
    canvas: () => (post && post.width ? post : glCanvas),
    get ready() { return ready; },
    get busy() { return busy; },
    get error() { return error; },
    get poses() { return poses; },
    get srcName() { return srcName; },
    get params() { return L; },
    stats, modelHeight: () => modelH,
  };
})();
