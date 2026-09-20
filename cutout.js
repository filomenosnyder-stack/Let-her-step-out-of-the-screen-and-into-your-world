/**
 * 抠图 + 姿态检测。普通 script，不是 module —— 这样 file:// 直接打开也能用。
 *
 * 分两层，因为代价差三个数量级：
 *   ① 纯色底抠图   0 字节依赖，几毫秒。平涂立绘（白底/纯色底）走这条
 *   ② AI 抠图/姿态 要下 12MB wasm + 模型，只有复杂背景才值得
 *
 * ⚠ 第 ② 层必须走动态 import()，而动态 import 在 file:// 下会被 CORS 拦死。
 *   所以那条路只在 http(s) 下可用 —— 检测到了会直接告诉你，不会静默失败。
 */
(function (global) {
  'use strict';

  // ── ① 纯色底抠图 ────────────────────────────────────────────────
  /**
   * 四角颜色一致（说明是平涂底）就从**边框往里**做 flood fill，
   * 把连通的底色刷成透明，再把 alpha 轻微羽化一下收边。
   *
   * 为什么从边框而不从四角点：四角那一个像素可能正好压在角色身上
   * （半身立绘很常见），从边框整圈开始才稳。
   *
   * @returns {number|null} 抠掉的像素占比（0~1）；不是纯色底返回 null
   */
  function cutSolidBg(canvas, opt) {
    const o = Object.assign({ tol: 32, feather: 1.2 }, opt || {});
    const w = canvas.width, h = canvas.height;
    if (!w || !h) return null;
    const g = canvas.getContext('2d');
    const im = g.getImageData(0, 0, w, h);
    const px = im.data;

    // 四角取样：四个角都不一个色，就不是纯色底，别硬做
    const cs = [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]].map(([x, y]) => {
      const i = (y * w + x) * 4;
      return [px[i], px[i + 1], px[i + 2]];
    });
    // 本来就已经是透明底的（PNG 素材多半是），四角 RGB 都是 0、看着像"纯黑底"，
    // 不拦的话会一本正经地报"抠掉 40%"，其实什么都没发生
    const alphas = [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]]
      .map(([x, y]) => px[(y * w + x) * 4 + 3]);
    if (alphas.every(a => a < 10)) return null;
    const avg = [0, 1, 2].map(c => (cs[0][c] + cs[1][c] + cs[2][c] + cs[3][c]) / 4);
    let dev = 0;
    for (const c of cs) for (let k = 0; k < 3; k++) dev = Math.max(dev, Math.abs(c[k] - avg[k]));
    if (dev > o.tol) return null;

    const lim = o.tol * 3;
    const near = i => Math.abs(px[i] - avg[0]) + Math.abs(px[i + 1] - avg[1]) + Math.abs(px[i + 2] - avg[2]) <= lim;

    // 从四条边往里泛洪。用定长 Int32Array 当栈，比 array.push 快得多。
    //
    // ⚠ seen（走到过）和 isBg（确实是底色）必须是**两个**数组：
    //   泛洪撞到人物边缘时那个像素也会被访问到，但它不是底色。
    //   混用一个数组的话，人物的最外一圈会被一起抠掉 —— 描边直接没了。
    const seen = new Uint8Array(w * h);
    const isBg = new Uint8Array(w * h);
    const stack = new Int32Array(w * h);
    let sp = 0;
    for (let x = 0; x < w; x++) { stack[sp++] = x; stack[sp++] = x + (h - 1) * w; }
    for (let y = 1; y < h - 1; y++) { stack[sp++] = y * w; stack[sp++] = y * w + w - 1; }
    let removed = 0;
    while (sp > 0) {
      const p = stack[--sp];
      if (seen[p]) continue;
      seen[p] = 1;
      if (!near(p * 4)) continue;        // 被挡住了，到此为止，但不算底色
      isBg[p] = 1;
      removed++;
      const x = p % w, y = (p / w) | 0;
      if (x > 0 && !seen[p - 1]) stack[sp++] = p - 1;
      if (x < w - 1 && !seen[p + 1]) stack[sp++] = p + 1;
      if (y > 0 && !seen[p - w]) stack[sp++] = p - w;
      if (y < h - 1 && !seen[p + w]) stack[sp++] = p + w;
    }
    if (!removed) return null;

    // alpha 先二值化，再 3×3 均值柔化一刀，免得边缘是锯齿
    const a = new Uint8Array(w * h);
    for (let p = 0; p < w * h; p++) a[p] = isBg[p] ? 0 : 255;
    if (o.feather > 0) {
      const r = Math.max(1, Math.round(o.feather));
      const t = new Uint8Array(w * h);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        let s = 0, n = 0;
        for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
          const xx = x + dx, yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          s += a[yy * w + xx]; n++;
        }
        t[y * w + x] = (s / n) | 0;
      }
      a.set(t);
    }
    for (let p = 0; p < w * h; p++) px[p * 4 + 3] = a[p];
    g.putImageData(im, 0, 0);
    return removed / (w * h);
  }

  // ── ② AI 那条线（懒加载）────────────────────────────────────────
  const VISION_DIR = 'vision';
  let _vision = null;

  /** 只在真的要用时才下那 12MB。下过一次就留着 */
  async function loadVision(onProgress) {
    if (_vision) return _vision;
    if (location.protocol === 'file:') {
      throw new Error('AI 抠图要在 http(s) 下跑（file:// 会拦掉动态 import）。'
                    + '在 arcam 目录跑 node serve.mjs，然后开 http://localhost:8080/studio.html');
    }
    onProgress && onProgress('加载推理引擎…');
    const m = await import(`./${VISION_DIR}/vision_bundle.mjs`);
    const fileset = await m.FilesetResolver.forVisionTasks(`./${VISION_DIR}/wasm`);
    _vision = { m, fileset, seg: null, pose: null };
    return _vision;
  }

  /** AI 抠图：selfie_segmenter 出人像概率图，直接写进 alpha */
  async function aiCut(canvas, onProgress) {
    const V = await loadVision(onProgress);
    if (!V.seg) {
      onProgress && onProgress('加载分割模型…');
      V.seg = await V.m.ImageSegmenter.createFromOptions(V.fileset, {
        baseOptions: { modelAssetPath: `./${VISION_DIR}/models/selfie_segmenter.tflite` },
        runningMode: 'IMAGE',
        // ⚠ 必须读 **category** mask。这个模型的 confidence mask 是空的
        //   （全长 0、维度却对得上，看着像"检测结果是没人"），
        //   读它会把整张图判成背景、alpha 全清 —— 表面还报"完成"。
        //   实测：confidence 全 0，category 是 0~255。
        outputConfidenceMasks: false,
        outputCategoryMask: true,
      });
    }
    onProgress && onProgress('正在分割…');
    const res = V.seg.segment(canvas);
    const cm = res.categoryMask;
    if (!cm) { res.close && res.close(); throw new Error('分割没有输出蒙版'); }
    const src = cm.getAsUint8Array();
    const mw = cm.width, mh = cm.height;

    // 类别值的量纲不确定（可能是 0/1，也可能被拉到 0~255），按实测最大值归一化
    let mx = 1;
    for (let i = 0; i < src.length; i++) if (src[i] > mx) mx = src[i];
    if (mx <= 1) { res.close && res.close(); throw new Error('蒙版是全空的，没检出前景'); }

    const w = canvas.width, h = canvas.height;
    const g = canvas.getContext('2d');
    const im = g.getImageData(0, 0, w, h);
    const px = im.data;
    let kept = 0;
    for (let y = 0; y < h; y++) {
      const sy = Math.min(mh - 1, (y * mh / h) | 0);
      for (let x = 0; x < w; x++) {
        const sx = Math.min(mw - 1, (x * mw / w) | 0);
        // ⚠ category mask 是**分类结果**（0/255），不是概率图。
        //   用宽斜坡（比如 0.35~0.65）会把大片像素糊成半透明，
        //   整张立绘看着发灰、像蒙了层雾。只留很窄一条过渡带消锯齿。
        const p = src[sy * mw + sx] / mx;
        const a = Math.max(0, Math.min(1, (p - 0.44) / 0.12));
        const i = (y * w + x) * 4;
        px[i + 3] = Math.round(px[i + 3] * a);
        if (a > 0.5) kept++;
      }
    }
    g.putImageData(im, 0, 0);
    res.close && res.close();
    return kept / (w * h);
  }

  /** MediaPipe Pose 的 33 个点，下标跟官方一致 */
  const POSE_NAMES = [
    '鼻', '左眼内', '左眼', '左眼外', '右眼内', '右眼', '右眼外', '左耳', '右耳',
    '嘴左', '嘴右', '左肩', '右肩', '左肘', '右肘', '左腕', '右腕',
    '左小指', '右小指', '左食指', '右食指', '左拇指', '右拇指',
    '左胯', '右胯', '左膝', '右膝', '左踝', '右踝', '左脚跟', '右脚跟',
    '左脚尖', '右脚尖',
  ];
  /** 画骨架用的连线，只挑看得懂的那些，全连上太乱 */
  const POSE_BONES = [
    [11, 12], [11, 23], [12, 24], [23, 24],                 // 躯干
    [11, 13], [13, 15], [12, 14], [14, 16],                 // 手臂
    [23, 25], [25, 27], [24, 26], [26, 28],                 // 腿
    [27, 29], [29, 31], [28, 30], [30, 32],                 // 脚
    [7, 11], [8, 12], [9, 10],                              // 肩线 / 嘴
    [2, 5], [2, 7], [5, 8],                                 // 眼耳
  ];

  /**
   * 姿态检测。返回归一化坐标的 33 个点（x,y ∈ 0~1）。
   *
   * ⚠ 这模型全是在**真人照片**上训的。喂二次元角色图，它不是偶尔飘，
   *   是稳定地错在同样的地方：裙摆/宽大衣服让胯和大腿根系统性偏上，
   *   侧身背面左右经常反。结果是当**起点**用的，不是当答案用的。
   */
  async function detectPose(canvas, onProgress) {
    const V = await loadVision(onProgress);
    if (!V.pose) {
      onProgress && onProgress('加载姿态模型…');
      V.pose = await V.m.PoseLandmarker.createFromOptions(V.fileset, {
        baseOptions: { modelAssetPath: `./${VISION_DIR}/models/pose_landmarker_lite.task` },
        runningMode: 'IMAGE',
        numPoses: 1,
      });
    }
    onProgress && onProgress('正在检测…');
    const res = V.pose.detect(canvas);
    const lm = res.landmarks && res.landmarks[0];
    if (!lm) return null;
    const out = lm.map(p => ({ x: p.x, y: p.y, z: p.z, v: p.visibility }));
    res.close && res.close();
    return out;
  }

  /** 把点画到一块 canvas 上（用来让用户核对检测结果） */
  function drawPose(g, pts, w, h) {
    if (!pts) return;
    const P = i => pts[i] && ({ x: pts[i].x * w, y: pts[i].y * h, v: pts[i].v });
    g.save();
    g.lineWidth = Math.max(2, Math.min(w, h) * 0.006);
    g.strokeStyle = 'rgba(80,230,255,.9)';
    g.lineCap = 'round';
    for (const [a, b] of POSE_BONES) {
      const p = P(a), q = P(b);
      if (!p || !q) continue;
      if ((p.v ?? 1) < 0.3 || (q.v ?? 1) < 0.3) continue;   // 看不见的点别连
      g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(q.x, q.y); g.stroke();
    }
    for (const p of pts) {
      if ((p.v ?? 1) < 0.3) continue;
      g.beginPath();
      g.arc(p.x * w, p.y * h, Math.max(2, Math.min(w, h) * 0.007), 0, Math.PI * 2);
      g.fillStyle = 'rgba(255,212,121,.95)';
      g.fill();
    }
    g.restore();
  }

  // ── ③ 裁边 ──────────────────────────────────────────────────────
  /**
   * 找非透明内容的包围盒。
   *
   * 为什么非要它：立绘四周常有大片透明边距（抠完底之后尤其明显），
   * 而 snapToEdge 用的是**整张图**的包围盒 —— 点「贴左」，贴上去的是那圈
   * 看不见的透明边，人物本体离框还差一大截，看着就像根本没吸住。
   * 把边距裁掉，贴边才是真的贴到人身上。
   */
  function contentBounds(canvas, alphaMin) {
    const th = alphaMin == null ? 8 : alphaMin;
    const w = canvas.width, h = canvas.height;
    const px = canvas.getContext('2d').getImageData(0, 0, w, h).data;
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++) {
      const row = y * w * 4;
      for (let x = 0; x < w; x++) {
        if (px[row + x * 4 + 3] >= th) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
      }
    }
    if (x1 < 0) return null;
    return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  }

  /** 按矩形裁一块出来。返回新画布和**实际**生效的矩形（夹进画布范围内之后） */
  function cropToCanvas(canvas, r) {
    const W = canvas.width, H = canvas.height;
    const x = Math.max(0, Math.min(W - 1, Math.round(r.x)));
    const y = Math.max(0, Math.min(H - 1, Math.round(r.y)));
    const w = Math.max(1, Math.min(W - x, Math.round(r.w)));
    const h = Math.max(1, Math.min(H - y, Math.round(r.h)));
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    c.getContext('2d').drawImage(canvas, -x, -y);
    return { canvas: c, rect: { x, y, w, h } };
  }

  // ── 动漫专用抠图：ISNet-anime + onnxruntime-web ──────────────────
  //
  // 为什么另起一套：原来那条 AI 抠图用的是 MediaPipe 的 **selfie_segmenter** ——
  // 那是**给真人自拍**训练的分割模型，拿来抠二次元立绘是错配（描边、发丝、平涂
  // 色块跟真人的统计特征不是一回事）。这一套用 rembg 生态里的 isnet-anime，
  // 是**在动漫数据上专门训的**。
  //
  // 体积：模型量化后 42MB + 运行时 12MB = 54MB。**只在用户真的点「AI 抠图」时才下**，
  // 平时走 cutSolidBg（毫秒级、零下载），抠不动才提示走这条。
  //
  // ⚠ 模型的输入形状**写死 1024×1024**（试过喂 512，直接报错），所以没法靠降分辨率
  //   提速。台式 CPU 上 7.2 秒，手机 WASM 单线程会明显更慢 —— 这是目前最大的问题。
  //   下一步要么上 WebGPU（多下 21MB 运行时，快 5~20 倍），要么换轻量模型。
  // 抠图模型的落地目录。**相对本脚本自己**解析，不写死 '../anime/'。
  //
  // 为什么不能写死：'../anime/' 只在「cutout.js 恰好躺在 URL 根目录下」这一种布局里对
  // （`..` 到了根就不再往上，于是 '../anime/' 归一成 '/anime/'）。换个布局就全 404：
  //   · GitHub Pages 项目站  /<仓库名>/cutout.js  → '../anime/' → '/anime/'      ✗ 跳出仓库
  //   · APK（WebViewAssetLoader） /assets/web/cutout.js → '/assets/anime/'        ✗
  // 而 anime/ 在**所有**布局里都是 cutout.js 的邻居（arcam/、dist/、dist/docs/、
  // android …/assets/web/），所以按脚本自己的 URL 解一次，四种布局全对 ——
  // 打包脚本也就不用再改写这里了（make_dist 只改 index.html 里的 ../）。
  // ⚠ 这条只在**普通 script** 下成立（cutout.js 就是普通 script）。
  //   哪天改成 type="module"，document.currentScript 会是 null，直接掉兜底值 → 又 404。
  const SEG = (function () {
    try {
      const s = document.currentScript && document.currentScript.src;
      if (s) return new URL('./anime/', s).href;
    } catch (e) {}
    return './anime/';   // 兜底：按文档相对（等于"站点根就在这一层"那种布局）
  })();
  const SEG_SZ = 1024;
  const SEG_MEAN = [0.485, 0.456, 0.406];
  const SEG_STD  = [0.229, 0.224, 0.225];
  let _segSess = null, _segLoading = null;

  function loadScriptOnce(src){
    return new Promise((res, rej) => {
      const old = document.querySelector('script[data-arcam="' + src + '"]');
      if (old) { old.dataset.done ? res() : (old.onload = res, old.onerror = rej); return; }
      const s = document.createElement('script');
      s.src = src; s.async = true; s.dataset.arcam = src;
      s.onload = () => { s.dataset.done = '1'; res(); };
      s.onerror = () => rej(new Error('加载失败: ' + src));
      document.head.appendChild(s);
    });
  }

  /** 带进度的取文件。onnxruntime 自己不会报进度，所以模型由我们自己抓成 ArrayBuffer 再喂它 */
  async function fetchBuf(url, onProgress){
    const r = await fetch(url);
    if (!r.ok) throw new Error(url + ' → HTTP ' + r.status);
    if (!r.body) return new Uint8Array(await r.arrayBuffer());

    // ★★ content-length 是**传输**长度，不是解压后的长度 —— 绝不能拿它来分配数组。
    //   GitHub Pages 对 .onnx 发 Content-Encoding: gzip：头部写 27MB，浏览器透明解压
    //   后实际吐出 44MB。按 27MB 分配再 set 到第 27MB 处就是
    //     RangeError: offset is out of bounds   at Uint8Array.set   at fetchBuf
    //   本地 serve.mjs 不压缩、长度正好 → **本地怎么测都是好的**，2026-09-20 上线才炸。
    //   所以：长度只当进度分母的**估计值**（超过就封顶，别让进度条跑到 100% 以上），
    //   内存分块收完再拼。
    const hint = +r.headers.get('content-length') || 0;
    const chunks = [];
    let got = 0;
    const reader = r.body.getReader();
    for (;;){
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value); got += value.length;
      if (onProgress) onProgress(hint > 0 ? Math.min(got / hint, 0.99) : 0);
    }
    // 拼成**长度恰好**的一块。onnxruntime 是直接按 byteLength 解析的，
    // 多一个字节都算坏文件；单块时也不能直接把 reader 给的 view 交出去。
    const buf = new Uint8Array(got);
    let off = 0;
    for (const c of chunks){ buf.set(c, off); off += c.length; }
    onProgress && onProgress(1);
    return buf;
  }

  /** 载入运行时 + 模型。幂等，重复调不会载第二遍。 */
  function loadAnimeSeg(onProgress){
    if (_segSess) return Promise.resolve(_segSess);
    if (_segLoading) return _segLoading;
    _segLoading = (async () => {
      onProgress && onProgress('载入运行时…', 0);
      await loadScriptOnce(SEG + 'ort.min.js');
      const ort = global.ort;
      if (!ort) throw new Error('onnxruntime 没挂上来');
      ort.env.wasm.wasmPaths = SEG;      // 末尾斜杠不能少
      // ⚠ 多线程要 COOP/COEP 跨源隔离头，GitHub Pages 给不了 → 只能单线程
      ort.env.wasm.numThreads = 1;
      ort.env.wasm.simd = true;
      onProgress && onProgress('下载模型 42MB…', 0);
      const buf = await fetchBuf(SEG + 'isnet-anime-q8.onnx',
        f => onProgress && onProgress('下载模型 42MB…', f));
      onProgress && onProgress('载入模型…', 0);
      _segSess = await ort.InferenceSession.create(buf, { executionProviders: ['wasm'] });
      return _segSess;
    })();
    _segLoading.catch(() => { _segLoading = null; });   // 失败要能重试
    return _segLoading;
  }

  /**
   * 去杂点：只留**最大的一块**连通域，再把里面的小洞补上。
   *
   * 为什么需要：模型判的是"哪个像素像主体"，它不管"这块东西连不连成一片"。
   * 于是海报上的标题、logo、水印、背景碎片 —— 全都会变成蒙版上**孤立的小块**
   * 跟着留下来（实测：鸣潮那两张海报，前景占到 74~75%，正常立绘只有 20~40%）。
   * 而角色永远是**最大的一整块**。所以按连通性筛一道，这些碎片自动掉光。
   *
   * 两步都是洪水填充，1024×1024 跑下来几十毫秒，可接受：
   *   ① 标连通域 → 留最大的那个
   *   ② 从边界往外填背景 → 没被填到的就是角色内部的洞，补上
   *      （不补的话：闭着的眼睛、衣服上的镂空会变成透明窟窿）
   *
   * ⚠ 8 连通（含对角）。用 4 连通的话，斜着的细线（发丝、描边）会被判成两块而丢掉。
   */
  function keepLargestBlob(mask, W, H){
    const N = W * H;
    const orig = new Uint8Array(mask);         // 留一份软值，最后要还回去（保住边缘过渡带）
    const on = new Uint8Array(N);
    for (let i = 0; i < N; i++) on[i] = mask[i] >= 128 ? 1 : 0;
    const lab = new Int32Array(N);
    const stack = new Int32Array(N);
    let best = 0, bestSize = 0, cur = 0;
    for (let p0 = 0; p0 < N; p0++){
      if (!on[p0] || lab[p0]) continue;
      cur++;
      let sp = 0, size = 0;
      stack[sp++] = p0; lab[p0] = cur;
      while (sp > 0){
        const q = stack[--sp];
        size++;
        const x = q % W, y = (q / W) | 0;
        for (let dy = -1; dy <= 1; dy++){
          const yy = y + dy; if (yy < 0 || yy >= H) continue;
          for (let dx = -1; dx <= 1; dx++){
            if (!dx && !dy) continue;
            const xx = x + dx; if (xx < 0 || xx >= W) continue;
            const r = yy * W + xx;
            if (on[r] && !lab[r]){ lab[r] = cur; stack[sp++] = r; }
          }
        }
      }
      if (size > bestSize){ bestSize = size; best = cur; }
    }
    if (!best) return 0;                       // 一个前景都没有
    let kept = 0;
    for (let i = 0; i < N; i++) if (lab[i] === best){ on[i] = 1; kept++; } else on[i] = 0;

    // 补洞：从四条边往里泛洪"外部背景"，泛不到的空隙就是角色内部的洞
    const out = new Uint8Array(N);
    let sp = 0;
    const push = i => { if (!out[i] && !on[i]){ out[i] = 1; stack[sp++] = i; } };
    for (let x = 0; x < W; x++){ push(x); push((H - 1) * W + x); }
    for (let y = 1; y < H - 1; y++){ push(y * W); push(y * W + W - 1); }
    while (sp > 0){
      const q = stack[--sp];
      const x = q % W, y = (q / W) | 0;
      if (x > 0) push(q - 1);
      if (x < W - 1) push(q + 1);
      if (y > 0) push(q - W);
      if (y < H - 1) push(q + W);
    }
    for (let i = 0; i < N; i++) if (!on[i] && !out[i]){ on[i] = 1; kept++; }   // 洞补成角色
    // ⚠ 保下来的像素**用回原来的软值**，不要统统写 255 ——
    //   写死 255 会把二值化的锯齿边暴露出来（那条窄过渡带就白留了）。
    for (let i = 0; i < N; i++) mask[i] = on[i] ? orig[i] : 0;
    return kept;
  }

  /** 原图 → 1024×1024 NCHW float32，ImageNet 归一化（跟 isnet 官方一致） */
  // ★★ 等比缩放 + 补边，**绝不拉伸**。
  //   原来写的是 drawImage(canvas, 0,0, 1024,1024) —— 直接拉成方的。
  //   一张 1080×1920 的竖图会被**横向压扁 1.78 倍**，等于喂模型一张畸变的图。
  //   实测（鸣潮那张海报）：
  //     拉伸     前景 58.3%，最左 22% 列（本该全是背景）被判成前景 **50.2%**
  //     等比补边  前景 45.7%，同上 **29.9%**  ← 误判接近腰斩
  //   补边颜色取**归一化后正好等于 0** 的灰：反解 mean*255 = (124,116,104)。
  //   用 #808080 也能跑，但它归一化后是 0.07 不是 0，模型会把这条边当成"某种东西"。
  //   顺序：先按长边缩放到 1024 以内，再居中贴到 1024 方图上。
  //   返回补边参数，后处理要按它把蒙版裁回图片区域。
  function segPreprocess(canvas, ort){
    const w = canvas.width, h = canvas.height;
    const s = SEG_SZ / Math.max(w, h);
    const nw = Math.max(1, Math.round(w * s)), nh = Math.max(1, Math.round(h * s));
    const ox = (SEG_SZ - nw) >> 1, oy = (SEG_SZ - nh) >> 1;
    // 先把图缩好放进一张临时画布 —— 补边时要从"图上"取边，不能从目标画布上取
    // （把 c 画到 c 自己身上虽然规范里能跑，但不干净，也不利于读懂）
    const tc = document.createElement('canvas');
    tc.width = nw; tc.height = nh;
    const tg = tc.getContext('2d');
    tg.imageSmoothingQuality = 'high';
    tg.drawImage(canvas, 0, 0, nw, nh);

    const c = document.createElement('canvas');
    c.width = c.height = SEG_SZ;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(tc, ox, oy);
    // ★★ 补边用**边缘延展**（把最外一圈像素往外拉），不要填灰。
    //   17 张评测集实测「外圈 5% 被判成前景」的中位数：
    //     拉伸 11.17%   填灰补边 11.17%   **边缘延展 4.01%**
    //   填灰在图片周围造出一圈人工边界，模型把它当成"某种东西"；
    //   延展出来的边跟图片自身的背景连成一片，模型自然归进背景。
    //   ⚠ 这一条是**踩了过拟合才拿到的**：先前我拿**一张**图得出结论说
    //     "等比补边比拉伸好"。17 张一跑，拉伸和填灰其实是**打平**的，
    //     真正起作用的是"补什么"而不是"补不补"。
    const ext = (sx, sy, sw, sh, dx, dy, dw, dh) => {
      if (dw > 0 && dh > 0) g.drawImage(tc, sx, sy, sw, sh, dx, dy, dw, dh);
    };
    ext(0, 0,       nw, 1,  ox, 0,            nw, oy);                    // 上
    ext(0, nh - 1,  nw, 1,  ox, oy + nh,      nw, SEG_SZ - oy - nh);      // 下
    ext(0, 0,       1,  nh, 0,  oy,           ox, nh);                    // 左
    ext(nw - 1, 0,  1,  nh, ox + nw, oy,      SEG_SZ - ox - nw, nh);      // 右
    // 四个角（从左上/右上/左下/右下角那一个像素拉出去）
    ext(0, 0,           1, 1, 0,  0,  ox, oy);
    ext(nw - 1, 0,      1, 1, ox + nw, 0, SEG_SZ - ox - nw, oy);
    ext(0, nh - 1,      1, 1, 0,  oy + nh, ox, SEG_SZ - oy - nh);
    ext(nw - 1, nh - 1, 1, 1, ox + nw, oy + nh, SEG_SZ - ox - nw, SEG_SZ - oy - nh);
    const d = g.getImageData(0, 0, SEG_SZ, SEG_SZ).data;
    const n = SEG_SZ * SEG_SZ, f = new Float32Array(n * 3);
    for (let i = 0, p = 0; i < n; i++, p += 4){
      f[i]         = (d[p]   / 255 - SEG_MEAN[0]) / SEG_STD[0];
      f[i + n]     = (d[p+1] / 255 - SEG_MEAN[1]) / SEG_STD[1];
      f[i + 2 * n] = (d[p+2] / 255 - SEG_MEAN[2]) / SEG_STD[2];
    }
    return { tensor: new ort.Tensor('float32', f, [1, 3, SEG_SZ, SEG_SZ]), ox, oy, nw, nh };
  }

  /**
   * 动漫抠图。返回 { canvas, fg } —— canvas 是**新的**带 alpha 的图，
   * fg 是前景占比（给调用方判断"是不是压根没认出人"用）。
   */
  async function animeCut(canvas, onProgress){
    const sess = await loadAnimeSeg(onProgress);   // 先确保运行时挂上来
    const ort = global.ort;
    onProgress && onProgress('推理中（慢是正常的）…', 1);
    const t0 = performance.now();
    const pre = segPreprocess(canvas, ort);
    const out = await sess.run({ img: pre.tensor });
    const first = out[Object.keys(out)[0]];
    const dims = first.dims;                       // [1,1,1024,1024]
    const MH = dims[dims.length - 2], MW = dims[dims.length - 1];
    const raw = first.data;
    // ★ 把蒙版裁回**图片区域**（去掉补边）。
    //   不裁的话，那条等比缩放留出来的补边会被当成"角色的一部分"一起抠出来 ——
    //   表现就是抠完四周挂着一圈色块。
    const W = pre.nw, H = pre.nh;
    const mask = new Float32Array(W * H);
    for (let y = 0; y < H; y++){
      const src = (y + pre.oy) * MW + pre.ox;
      const dst = y * W;
      for (let x = 0; x < W; x++) mask[dst + x] = raw[src + x];
    }

    // 蒙版 → 一张 1024 的灰度图 → 缩回原尺寸 → 当 alpha 用
    const mc = document.createElement('canvas');
    mc.width = W; mc.height = H;
    const mg = mc.getContext('2d');
    const mi = mg.createImageData(W, H);
    // ★★ 模型输出的是**软概率图**，不是非 0 即 1 的蒙版。
    //    直接把概率当 alpha 用，会同时出两个症状、而且看着互相矛盾：
    //      · 背景上残留的 0.1~0.4 → **看着没去干净**
    //      · 角色身上落在 0.5 附近的大片 → 半透明，**像被啃掉一块**
    //    所以要**二值化**，只留很窄一条过渡带消锯齿。
    //    窄带是抄 aiCut 那条的（那边注释里写了为什么不能用宽斜坡：
    //    宽斜坡会把大片像素糊成半透明，整张立绘发灰像蒙了层雾）。
    //    ⚠ 模型换了、量纲不同，这条带的中心值要重新定 —— isnet 的输出
    //      比 selfie_segmenter 的类别值柔和得多，中心取 0.5 附近。
    // ⚠ 这两个数是**下界保守 vs 上界保守**的取舍，没有一组对所有图都对：
    //   下界抬太高（原来 0.42）→ 模型在浅色头发、半透明衣料、跟背景对比低的
    //     地方输出的概率本来就偏低（0.3~0.4），会被一刀切成背景 → **角色被啃掉一块**
    //   下界压太低 → 背景上那些 0.2 上下的残留又回来了
    //   而带子（HI-LO）一宽，边缘就发灰像蒙了层雾（aiCut 那边的注释写过）
    // 实测原图被啃，所以下界从 0.42 压到 0.28，同时**收窄带子**保住边缘清晰度。
    const LO = 0.28, HI = 0.46;
    const abuf = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++){
      let a = (mask[i] - LO) / (HI - LO);
      a = a < 0 ? 0 : a > 1 ? 1 : a;
      abuf[i] = Math.round(a * 255);
    }
    // ★ 去杂点：标题、logo、水印、背景碎片在蒙版上都是孤立小块，角色是最大的一块。
    //   这一步之后那些东西全掉，角色内部的镂空（闭眼、衣料缝隙）会被补上。
    const fg = keepLargestBlob(abuf, W, H);
    for (let i = 0; i < W * H; i++){
      mi.data[i*4] = 255; mi.data[i*4+1] = 255; mi.data[i*4+2] = 255;
      mi.data[i*4+3] = abuf[i];
    }
    mg.putImageData(mi, 0, 0);

    // 蒙版缩回原尺寸。1024→原图是大幅下采样，imageSmoothingQuality 必须 high，
    // 否则边缘会出现锯齿（这一条在别的缩放路径上已经踩过）。
    const w = canvas.width, h = canvas.height;
    const small = document.createElement('canvas');
    small.width = w; small.height = h;
    const sg = small.getContext('2d', { willReadFrequently: true });
    sg.imageSmoothingQuality = 'high';
    sg.drawImage(mc, 0, 0, w, h);
    const sm = sg.getImageData(0, 0, w, h).data;

    const o = document.createElement('canvas'); o.width = w; o.height = h;
    const og = o.getContext('2d', { willReadFrequently: true });
    og.drawImage(canvas, 0, 0);
    const src = og.getImageData(0, 0, w, h);
    // ⚠ sm 本身已经是 .data 了（上面取的时候就已经 .data 过一道），别再点一次 .data
    for (let i = 0; i < w * h; i++) src.data[i*4+3] = sm[i*4+3];
    og.putImageData(src, 0, 0);

    return { canvas: o, fg: fg / (W * H), ms: Math.round(performance.now() - t0) };
  }

  global.ARCAM_CUT = {
    cutSolidBg, loadVision, aiCut, detectPose, drawPose,
    loadAnimeSeg, animeCut,
    contentBounds, cropToCanvas,
    POSE_NAMES, POSE_BONES,
  };
})(typeof window !== 'undefined' ? window : globalThis);
