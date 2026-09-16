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

  global.ARCAM_CUT = {
    cutSolidBg, loadVision, aiCut, detectPose, drawPose,
    contentBounds, cropToCanvas,
    POSE_NAMES, POSE_BONES,
  };
})(typeof window !== 'undefined' ? window : globalThis);
