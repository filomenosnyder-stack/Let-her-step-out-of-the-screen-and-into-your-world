package com.arcam.viewfinder

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.ColorMatrix
import android.graphics.ColorMatrixColorFilter
import android.graphics.DashPathEffect
import android.graphics.Paint
import android.graphics.Path
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sin
import kotlin.math.tan

/**
 * 「场景内容」的画法：透视地面网格、地平线、人体骨架、2D 立绘。
 *
 * 单独抽出来是为了让预览叠加层和导出用同一份代码：
 * 预览用 view 尺寸的 Projection，导出用 JPEG 尺寸的 Projection，
 * 只要 f_px 按各自的长边等比换算，画出来的东西就完全一致。
 */
class ScenePainter(
    val proj: Projection,
    var subjectHeight: Double = 1.65,
    var subjectDist: Double = 4.0,
    var subjectX: Double = 0.0,
    var pose: List<Poses.J> = Poses.STAND,
    var charBitmap: Bitmap? = null,
    /** 立绘中心（不是底边）——半身立绘没有"脚底"这个概念，锚在中心才通用 */
    var charU: Double = 0.0,
    var charV: Double = 0.0,
    var charH: Double = 0.0,
    /** 立绘下沿切在人物身上多高。>0.3 说明是半身，脚不在画面里，不画接触阴影 */
    var charBottomRatio: Double = 0.0,
) {
    /** 线宽/字号的基准单位。按画面短边算，预览和大图看起来比例一致。 */
    private val unit: Float = (min(proj.imgW, proj.imgH) / 360.0).toFloat().coerceAtLeast(1.2f)

    private val stroke = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE; strokeCap = Paint.Cap.ROUND; strokeJoin = Paint.Join.ROUND
    }
    private val dark = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE; strokeCap = Paint.Cap.ROUND; strokeJoin = Paint.Join.ROUND
        color = Color.argb(158, 0, 0, 0)
    }
    private val horizon = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE; strokeCap = Paint.Cap.ROUND
        color = Color.argb(190, 255, 120, 120); strokeWidth = unit * 1.6f
        pathEffect = DashPathEffect(floatArrayOf(unit * 9f, unit * 6f), 0f)
    }
    private val dot = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.FILL; color = Color.argb(242, 120, 255, 180)
    }
    private val text = Paint(Paint.ANTI_ALIAS_FLAG).apply { textSize = unit * 11f }
    private val path = Path()

    private val cyanBright = Color.argb(255, 120, 255, 255)
    private val cyanDim = Color.argb(230, 90, 225, 255)
    private val bodyCol = Color.argb(242, 255, 212, 121)
    private val limbCol = Color.argb(190, 255, 212, 121)

    fun paint(canvas: Canvas, grid: Boolean, figure: Boolean, horizonLine: Boolean) {
        if (grid) paintGrid(canvas)
        if (horizonLine) paintHorizon(canvas)
        // figure 由调用方决定：3D 模式必须画人体，导入过立绘也一样
        if (figure) paintFigure(canvas, pose) else if (charBitmap != null) paintChar(canvas)
    }

    private fun gridRange(): Pair<Double, Double> {
        val h = proj.camHeight
        return Pair(max(26.0, h * 8), max(6.0, h * 3.5))
    }

    private fun paintGrid(canvas: Canvas) {
        val (dMax, xMax) = gridRange()
        val xStep = if (xMax <= 8) 1.0 else if (xMax <= 20) 2.0 else 5.0

        val verticals = ArrayList<Path>(64)
        var x = -Math.round(xMax).toDouble()
        while (x <= Math.round(xMax)) {
            val p = Path()
            var pen = false
            var i = 0
            while (i <= 260) {
                val d = 0.3 + (i / 260.0) * dMax
                val q = proj.projectGround(x, d)
                if (q == null) pen = false
                else if (!pen) { p.moveTo(q.u.toFloat(), q.v.toFloat()); pen = true }
                else p.lineTo(q.u.toFloat(), q.v.toFloat())
                i++
            }
            verticals.add(p)
            x += xStep
        }

        val all = doubleArrayOf(1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 8.0, 10.0, 14.0, 20.0, 30.0, 45.0, 70.0, 100.0)
        val dLines = all.filter { it <= dMax }
        val majorD = dLines.getOrNull(min(4, dLines.size - 1))

        val horizontals = dLines.map { d ->
            val p = Path()
            var started = false
            var i = 0
            while (i <= 80) {
                val xv = -xMax * 1.2 + (i / 80.0) * xMax * 2.4
                val q = proj.projectGround(xv, d)
                if (q != null) {
                    if (!started) { p.moveTo(q.u.toFloat(), q.v.toFloat()); started = true }
                    else p.lineTo(q.u.toFloat(), q.v.toFloat())
                }
                i++
            }
            Pair(p, d == majorD)
        }

        // 先整批描黑边，再整批压亮线 —— 逐条画的话黑边会盖住相邻的亮线
        dark.strokeWidth = unit * 5f
        verticals.forEach { canvas.drawPath(it, dark) }
        horizontals.forEach { dark.strokeWidth = unit * if (it.second) 6f else 5f; canvas.drawPath(it.first, dark) }

        stroke.strokeWidth = unit * 2.2f
        stroke.color = cyanBright
        verticals.forEachIndexed { idx, p ->
            stroke.color = if (idx == (verticals.size - 1) / 2) cyanBright else cyanDim
            canvas.drawPath(p, stroke)
        }
        horizontals.forEach {
            stroke.strokeWidth = unit * if (it.second) 2.4f else 1.5f
            stroke.color = if (it.second) cyanBright else cyanDim
            canvas.drawPath(it.first, stroke)
        }

        // 距离标尺。远处几条线在画面里挨得极近，不滤的话会叠成一坨糊字
        text.style = Paint.Style.STROKE; text.strokeWidth = unit * 3.5f
        var lastLabelV = -1e9
        val minGap = unit * 15f
        for (d in dLines) {
            val q = proj.projectGround(-1.4, d) ?: continue
            if (q.v < 0 || q.v > proj.imgH) continue
            if (abs(q.v - lastLabelV) < minGap) continue
            lastLabelV = q.v
            val label = "${d.toInt()}m"
            val tx = (q.u + unit * 6f).toFloat()
            val ty = (q.v - unit * 5f).toFloat()
            text.color = Color.argb(200, 0, 0, 0)
            canvas.drawText(label, tx, ty, text)
            text.style = Paint.Style.FILL
            text.color = cyanBright
            canvas.drawText(label, tx, ty, text)
            text.style = Paint.Style.STROKE
        }
        text.style = Paint.Style.FILL
    }

    private fun paintHorizon(canvas: Canvas) {
        val f = proj.focalPx()
        val p = Math.toRadians(proj.pitchDeg)
        val r = Math.toRadians(proj.rollDeg)
        val tp = tan(p)
        fun pt(t: Double) = Pair(proj.imgW / 2 + f * (t * cos(r) + tp * sin(r)),
                                 proj.imgH / 2 + f * (t * sin(r) - tp * cos(r)))
        val a = pt(-12.0); val b = pt(12.0)
        canvas.drawLine(a.first.toFloat(), a.second.toFloat(),
                        b.first.toFloat(), b.second.toFloat(), horizon)
    }

    /** 按姿势表投影出 18 个关节，再连线 */
    private fun paintFigure(canvas: Canvas, pose: List<Poses.J>) {
        val hp = subjectHeight
        val p = pose.map { jt ->
            proj.project(subjectX + jt.x * hp,
                         jt.y * hp - proj.camHeight,
                         subjectDist + jt.z * hp)
        }
        if (p.size < 18 || p[7] == null || p[11] == null) return

        var i = 0
        while (i * 2 + 1 < Poses.BONES.size) {
            val a = Poses.BONES[i * 2]
            val b = Poses.BONES[i * 2 + 1]
            val pa = p[a]; val pb = p[b]
            if (pa != null && pb != null) {
                stroke.color = if (Poses.BONE_MAIN[i]) bodyCol else limbCol
                stroke.strokeWidth = unit * Poses.BONE_W[i]
                canvas.drawLine(pa.u.toFloat(), pa.v.toFloat(), pb.u.toFloat(), pb.v.toFloat(), stroke)
            }
            i++
        }

        // 头：用「下巴 → 头顶」这一段的长度当直径。头顶是个虚关节，按头心往上半个头高算
        val headJ = pose[11]
        val topP = proj.project(subjectX + headJ.x * hp,
                                (headJ.y + 0.0665) * hp - proj.camHeight,
                                subjectDist + headJ.z * hp)
        val head = p[11]
        if (head != null && topP != null) {
            val ry = abs(topP.v - head.v)
            if (ry > 1) {
                stroke.color = bodyCol; stroke.strokeWidth = unit * 3.5f
                canvas.drawOval((head.u - ry * 0.72).toFloat(), (head.v - ry).toFloat(),
                                (head.u + ry * 0.72).toFloat(), (head.v + ry).toFloat(), stroke)
            }
        }
        for (s in intArrayOf(0, 1)) {
            val q = p[s] ?: continue
            canvas.drawCircle(q.u.toFloat(), q.v.toFloat(), unit * 5.5f, dot)
        }
    }

    // ── 立绘融合 ──────────────────────────────────────────────────
    /** 亮度，1 = 原样。立绘是画出来的，明度往往比实景照片高，压一点才不跳 */
    var charBrightness = 1.0
    /** 饱和度，1 = 原样 */
    var charSaturation = 1.0
    /** 下沿柔化，占图高的比例。硬切边是最明显的假 */
    var charFeather = 0.10
    /** 脚下接触阴影 */
    var charShadow = true

    private val charPaint = Paint(Paint.FILTER_BITMAP_FLAG or Paint.ANTI_ALIAS_FLAG)
    private val fxPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    /**
     * 接触阴影。
     *
     * 不能用 BlurMaskFilter —— 硬件加速的 Canvas 不支持它，会被直接忽略，
     * 画出来是个硬边实心黑饼（实测就是这个问题）。改用 RadialGradient，
     * 硬件加速下正常，而且颜色衰减可以自己调。
     */
    private val shadowPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private var shadowShader: android.graphics.RadialGradient? = null
    private var shadowKey = ""
    /**
     * 自动配色的每通道增益和偏置，顺序是 [gR, gG, gB, bR, bG, bB]。
     * 由 Reinhard 色彩迁移算出来：把立绘各通道的均值和标准差对齐到背景。
     * 默认全 0/1，就是不动。
     */
    var charGain = floatArrayOf(1f, 1f, 1f, 0f, 0f, 0f)

    /**
     * 去边缘光晕。抠图残留的半透明灰边会把 alpha 抬到 0 以上，
     * 贴到照片上就是一圈发光的描边。把 alpha 抬个阈值推掉就干净了。
     * 0 = 不动，0.5 已经比较狠。
     */
    var charDefringe = 0.35

    private val charFilter: android.graphics.ColorFilter?
        get() {
            val g = charGain
            val neutral = g[0] == 1f && g[1] == 1f && g[2] == 1f &&
                          g[3] == 0f && g[4] == 0f && g[5] == 0f
            val noDefringe = charDefringe < 0.01
            if (neutral && charBrightness == 1.0 && charSaturation == 1.0 && noDefringe) return null
            val cm = ColorMatrix(floatArrayOf(
                g[0], 0f, 0f, 0f, g[3],
                0f, g[1], 0f, 0f, g[4],
                0f, 0f, g[2], 0f, g[5],
                0f, 0f, 0f, 1f, 0f))
            if (charSaturation != 1.0) {
                val sat = ColorMatrix().apply { setSaturation(charSaturation.toFloat()) }
                cm.postConcat(sat)
            }
            if (charBrightness != 1.0) {
                val b = ((charBrightness - 1.0) * 255.0).toFloat()
                cm.postConcat(ColorMatrix(floatArrayOf(
                    1f, 0f, 0f, 0f, b,
                    0f, 1f, 0f, 0f, b,
                    0f, 0f, 1f, 0f, b,
                    0f, 0f, 0f, 1f, 0f)))
            }
            if (!noDefringe) {
                val t = charDefringe.coerceIn(0.0, 0.9)
                val ka = (1.0 / (1.0 - t)).toFloat()
                val ba = (-t * 255.0 / (1.0 - t)).toFloat()
                cm.postConcat(ColorMatrix(floatArrayOf(
                    1f, 0f, 0f, 0f, 0f,
                    0f, 1f, 0f, 0f, 0f,
                    0f, 0f, 1f, 0f, 0f,
                    0f, 0f, 0f, ka, ba)))
            }
            return ColorMatrixColorFilter(cm)
        }

    /** 轮廓光位图（导入时预生成），垫在立绘底下 */
    var charRim: Bitmap? = null
    /** 轮廓光强度 0..1 */
    var charRimAlpha = 0.0
    /** 噪点强度 0..1，和背景的噪点对上 */
    var charNoise = 0.0
    /** 阴影横向偏移 -1..1，跟光照方向反着来 */
    var shadowShift = 0.0
    /** 立绘左右翻转。角色朝向经常需要翻个面 */
    var charFlipX = false
    /** 立绘自己的额外旋转（度），叠加在相机滚转之上 */
    var charExtraRot = 0.0

    private val charAngle: Float get() = (proj.rollDeg + charExtraRot).toFloat()

    private val rimPaint = Paint(Paint.FILTER_BITMAP_FLAG or Paint.ANTI_ALIAS_FLAG)
    private val noisePaint = Paint(Paint.ANTI_ALIAS_FLAG)

    private fun paintChar(canvas: Canvas) {
        val bmp = charBitmap ?: return
        if (charH < 2) return
        val w = charH * bmp.width / bmp.height
        val hw = (w / 2).toFloat()
        val hh = (charH / 2).toFloat()

        canvas.save()
        canvas.translate(charU.toFloat(), charV.toFloat())
        canvas.rotate(charAngle)
        if (charFlipX) canvas.scale(-1f, 1f)      // 绕图心左右翻

        // 接触阴影。半身立绘的切口悬在半空，给它加影子反而假，所以只在切口
        // 靠近画面底部（说明人确实站在地上）时才画。
        val cutIsLow = (charV + charH / 2) > proj.imgH * 0.72
        val wantShadow = charShadow && charH > 20 &&
                         (if (charBottomRatio < 0.30) true else cutIsLow)
        if (wantShadow) {
            val rx = (hw * 0.80f).coerceAtLeast(unit * 3f)
            val ry = (hw * 0.16f).coerceAtLeast(unit * 2f)
            val cx = (hw * shadowShift).toFloat()
            val key = "%.1f|%.1f|%.1f".format(rx, ry, cx)
            if (key != shadowKey) {
                shadowShader = android.graphics.RadialGradient(
                    cx, 0f, rx,
                    intArrayOf(Color.argb(88, 0, 0, 0),
                               Color.argb(58, 0, 0, 0),
                               Color.argb(22, 0, 0, 0),
                               Color.TRANSPARENT),
                    floatArrayOf(0f, 0.35f, 0.68f, 1f),
                    android.graphics.Shader.TileMode.CLAMP)
                shadowKey = key
            }
            // 压扁画圆 = 画椭圆，渐变跟着一起压
            val k = ry / rx
            canvas.save()
            canvas.scale(1f, k)
            shadowPaint.shader = shadowShader
            canvas.drawCircle(cx, hh / k, rx, shadowPaint)
            shadowPaint.shader = null
            canvas.restore()
        }

        // 轮廓光垫底，边缘会露出一圈
        val rim = charRim
        if (rim != null && charRimAlpha > 0.02 && rim.width > 0) {
            rimPaint.alpha = (charRimAlpha.coerceIn(0.0, 1.0) * 255).toInt()
            canvas.drawBitmap(rim, null,
                android.graphics.RectF(-hw - unit * 1.5f, -hh - unit * 1.5f,
                                       hw + unit * 1.5f, hh + unit * 1.5f), rimPaint)
        }

        val dst = android.graphics.RectF(-hw, -hh, hw, hh)
        val layer = canvas.saveLayer(dst, null)
        charPaint.colorFilter = charFilter
        canvas.drawBitmap(bmp, null, dst, charPaint)

        // 噪点：实拍照片都有 ISO 噪点，立绘干干净净贴上去很扎眼
        CharFx.noise(charNoise.toFloat())?.let { tile ->
            noisePaint.shader = android.graphics.BitmapShader(
                tile, android.graphics.Shader.TileMode.REPEAT, android.graphics.Shader.TileMode.REPEAT)
            noisePaint.xfermode = android.graphics.PorterDuffXfermode(
                android.graphics.PorterDuff.Mode.DST_ATOP)   // 只作用在立绘的不透明区域
            canvas.drawRect(dst, noisePaint)
            noisePaint.xfermode = null
            noisePaint.shader = null
        }

        // 下沿羽化：立绘底下糊掉一点，和地面接得住
        if (charFeather > 0.001) {
            val fh = (charH * charFeather).toFloat().coerceAtMost(hh * 1.6f)
            fxPaint.shader = android.graphics.LinearGradient(
                0f, hh - fh, 0f, hh,
                Color.BLACK, Color.TRANSPARENT,
                android.graphics.Shader.TileMode.CLAMP)
            fxPaint.xfermode = android.graphics.PorterDuffXfermode(android.graphics.PorterDuff.Mode.DST_IN)
            canvas.drawRect(-hw, hh - fh, hw, hh, fxPaint)
            fxPaint.xfermode = null
            fxPaint.shader = null
        }
        canvas.restoreToCount(layer)
        canvas.restore()
    }

    /** 反解这个立绘对应多高的人（图片底边落在地面上时才有意义） */
    fun charImpliedHeight(fillRatio: Double): Double? {
        val g = proj.unprojectGround(charU, charV + charH / 2) ?: return null
        return proj.heightFromChar(charH, fillRatio, g.second)
    }

    companion object {
        /**
         * 立绘落位。和 3D 人体走同一套透视：给定人物站在 (x, d)，尺寸由投影算出来，
         * 所以拖近了就大、拖远了就小。
         *
         * bottomRatio：立绘下沿切在人物身上的哪个高度（占身高比例）。
         *   0    = 脚底，全身立绘
         *   0.5  = 腰，半身立绘
         *   0.75 = 胸，胸像
         * 立绘覆盖人物身上 [bottomRatio, 1.0] 这一段。
         *
         * fill：图中人物占整张图高度的比例（带留白或半身裁切时调小）。
         * scale：手动微调倍数，默认 1。
         */
        fun buildPlacement(proj: Projection, x: Double, d: Double, subjectHeight: Double,
                           bottomRatio: Double, fill: Double, scale: Double): CharPlacement? {
            val yBottom = bottomRatio * subjectHeight
            val pb = proj.project(x, yBottom - proj.camHeight, d) ?: return null
            val pt = proj.project(x, subjectHeight - proj.camHeight, d) ?: return null
            val spanPx = hypot(pb.u - pt.u, pb.v - pt.v)
            if (spanPx < 2) return null
            val h = spanPx / fill.coerceAtLeast(0.05) * scale

            // 立绘底边贴在 pb 上、朝 pt 方向伸展。用单位向量推中心，这样有滚转也对
            val ux = (pt.u - pb.u) / spanPx
            val uy = (pt.v - pb.v) / spanPx
            return CharPlacement(pb.u + ux * h / 2, pb.v + uy * h / 2, h)
        }

        /**
         * 立绘底边（= 脚底 / 切口）在画面里的位置，拖动时用它反解地面落点。
         *
         * ⚠ 中心到底边的距离就是 **c.h / 2**，跟 fill / scale 无关。
         * buildPlacement 把中心放在 `pb + 单位向量 · h/2` 上，也就是让位图的
         * 下边缘正好压在 pb 上；fill 只描述"图里那个人占整张图多高"（顶上留白），
         * 不改变位图下边缘和中心的关系。drawCutGuide、renderMask 用的都是 h/2。
         *
         * 这里原来写的是 `c.h / (fill * scale)` —— fill=1 时恰好等于 c.h，所以默认值下
         * 永远测不出来；一旦把"图内人物占比"调离 100%，锚点每帧偏离真实下边缘一个
         * 固定量，dragChar 每个 MOVE 事件都拿它去反解地面 → 距离发散，
         * 两三帧内立绘就飞到贴脸巨物或者消失。
         */
        fun bottomEdge(proj: Projection, c: CharPlacement, subjectHeight: Double,
                       bottomRatio: Double, fill: Double, scale: Double): Projection.P? {
            if (c.h < 2) return null
            val span = c.h
            // 从中心沿「立绘朝上」的反方向退半个图高，就是底边。
            // 滚转决定这个方向有多斜。
            val ur = Math.toRadians(proj.rollDeg)
            val ux = sin(ur)
            val uy = -cos(ur)
            return Projection.P(c.u - ux * span / 2, c.v - uy * span / 2)
        }
    }
}

/** 2D 立绘在画面里的落位 */
data class CharPlacement(val u: Double, val v: Double, val h: Double)
