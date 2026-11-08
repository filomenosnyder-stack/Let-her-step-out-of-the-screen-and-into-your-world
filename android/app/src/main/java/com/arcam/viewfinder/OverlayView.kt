package com.arcam.viewfinder

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.DashPathEffect
import android.graphics.Paint
import android.view.MotionEvent
import android.view.View
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.sin

/**
 * 相机预览上的叠加层。
 *
 * 这个 View 的像素坐标系 = 预览画面的像素坐标系，靠两件事保证：
 *   ① 外层 AspectFrameLayout 把容器锁成预览流的宽高比
 *   ② PreviewView 用 FIT_CENTER 填满，不裁切
 * 少任何一条，投影算出来的位置就会整体偏移。
 */
@SuppressLint("ViewConstructor")
class OverlayView(ctx: Context) : View(ctx) {

    val proj = Projection()
    private var painter: ScenePainter? = null

    var subjectHeight = 1.65
    var subjectDist = 4.0
    var subjectX = 0.0
    var pose: List<Poses.J> = Poses.STAND

    /** 3D 已删，留个字段免得别处引用报错 */
    var mode3d = false
    var showGrid = true
    var showFigure = false
    var showHorizon = true

    // ── 2D 立绘 ───────────────────────────────────────────────────
    var charBitmap: Bitmap? = null
    /** 立绘下沿切在人物身上多高（占身高比例）。0 = 脚底（全身），0.5 = 腰（半身） */
    var charBottomRatio = 0.0
    /** 图中人物占整张图高度的比例 */
    var charFill = 1.0
    /** 手动微调倍数（贴地模式用） */
    var charScale = 1.0
    /** true = 自由摆放（半身立绘）；false = 贴地跟随透视（全身立绘） */
    var charFreeMode = false
    private var freePlacement: CharPlacement? = null
    private var charPlacement: CharPlacement? = null

    /**
     * 边框条吸附。0 = 不吸（自由摆放），1 = 上，2 = 下，3 = 左，4 = 右。
     *
     * 半身立绘悬在画面当间是最假的 —— 看不出它站在哪，也不知道凭什么那个大小。
     * 钉死在一条边上就没这问题：下边 = 贴着相机站着、被画幅从腰上切掉；
     * 左边 = 从画外探进来。这是最常见也最稳的融图构图。
     *
     * 吸附状态下它只能沿这条边滑、只能改大小，永远出不了这条边。
     */
    var edgeBar = 0
        private set

    /** 场景参数被改动后回调 */
    var onChanged: (() -> Unit)? = null

    private var dragging = false
    private var draggingChar = false
    private var lastX = 0f
    private var lastY = 0f

    private fun rebuildPainter() {
        painter = ScenePainter(
            proj = proj,
            subjectHeight = subjectHeight,
            subjectDist = subjectDist,
            subjectX = subjectX,
            pose = pose,
            charBitmap = charBitmap,
            charU = charPlacement?.u ?: 0.0,
            charV = charPlacement?.v ?: 0.0,
            charH = charPlacement?.h ?: 0.0,
            charBottomRatio = charBottomRatio,
        )
        painter?.let { stylePainter(it) }
    }

    /**
     * 把当前所有融合参数灌进一个 painter。
     *
     * 导出合成图那条路径必须调这个，**不要自己另配一份** —— 各写各的话，
     * 以后每加一个参数就会漏一个，症状是"预览里是对的，拍出来是另一个样子"
     * （倾斜、左右翻、自动配色、廓光、噪点、边缘推掉全都会丢）。
     */
    fun stylePainter(p: ScenePainter) {
        p.charBrightness = charBrightness
        p.charSaturation = charSaturation
        // 下沿柔化只对「切口」有意义。全身立绘的底边是脚，柔化会让鞋和地面糊成一片。
        p.charFeather = if (isCut) charFeather else 0.0
        p.charShadow = charShadow
        p.charGain = charGain
        p.charDefringe = charDefringe
        p.charRim = rimBitmap
        p.charRimAlpha = charRimAlpha
        p.charNoise = charNoise
        p.shadowShift = shadowShift
        p.charFlipX = charFlipX
        // 总角度 = 相机滚转 + 微调；吸附模式下总角度锁死为 0。
        // ScenePainter 只认它的两个输入，所以这里反过来把差值喂回去。
        // 用 p.proj 而不是 this.proj —— 导出时传进来的投影是另一份。
        p.charExtraRot = charAngleDeg() - p.proj.rollDeg
    }

    /**
     * 这张立绘的底边是「切口」还是「脚」。
     *   贴地模式 → 底边永远落在脚上，不是切口
     *   自由模式 → 看景别，全身景别（覆盖 95% 以上）就是脚，其余是切口
     * 切口才需要柔化，脚不能柔化。
     */
    private val isCut: Boolean
        get() = charFreeMode && shotCover < 0.95

    /**
     * 立绘自己的角度（度）。
     *   贴地模式：永远垂直，跟着地面的铅垂线走
     *   自由模式：相机滚转 + 手动微调
     *   吸附模式：锁 0。图上歪了，贴边那条边就露缝，整条边就白吸了
     */
    private fun charAngleDeg(): Double = when {
        edgeBar != 0 -> 0.0
        charFreeMode -> proj.rollDeg + charExtraRot
        // 贴地也要跟 roll 走。buildPlacement 把立绘沿 pb→pt 方向摆，那个方向
        // 在滚转时是**斜的**（地面铅垂线在画面里的投影）；画的时候却按 0° 画，
        // 脚就不在自己的落点上，roll=15°、图高 800px 时差 104px。
        // 而且"所见"和"所拖"用的不是同一条线。
        else -> proj.rollDeg
    }

    private fun charAngleRad(): Double = Math.toRadians(charAngleDeg())

    var charFlipX = false
        private set
    var charExtraRot = 0.0
        private set

    fun toggleFlip() {
        charFlipX = !charFlipX
        rebuildPainter(); invalidate()
    }

    fun applyCharRotation(deg: Double) {
        charExtraRot = deg.coerceIn(-45.0, 45.0)
        rebuildPainter(); invalidate()
    }

    /** 旋转在吸附模式下被锁死，UI 拿这个值去灰掉滑条 */
    val rotationLocked: Boolean get() = edgeBar != 0

    // 融合参数，改完调 syncPainter()
    var charBrightness = 1.0
    var charSaturation = 1.0
    var charFeather = 0.10
    var charShadow = true
    var charDefringe = 0.35
    var charRimAlpha = 0.0
    var charNoise = 0.0
    var shadowShift = 0.0
    /** [gR,gG,gB,bR,bG,bB]，自动配色算出来的 */
    var charGain = floatArrayOf(1f, 1f, 1f, 0f, 0f, 0f)

    private var rimBitmap: Bitmap? = null
    private var rimColor = 0xFFFFF2DC.toInt()   // 偏暖的白，接近日光散射
    private var rimRadius = 5

    fun syncPainter() {
        rebuildPainter()
        invalidate()
    }

    override fun onSizeChanged(w: Int, h: Int, ow: Int, oh: Int) {
        // 自由模式的落位是按旧画布存的像素值。画布一变（抽屉展开、转屏）就得等比缩，
        // 否则角色的位置和大小都对不上原来看到的。
        if (charFreeMode && ow > 8 && oh > 8 && (ow != w || oh != h)) {
            val kx = w.toDouble() / ow
            val ky = h.toDouble() / oh
            freePlacement?.let { freePlacement = CharPlacement(it.u * kx, it.v * ky, it.h * ky) }
        }
        proj.imgW = w.toDouble()
        proj.imgH = h.toDouble()
        recomputeFocal()          // ⚠ 必须在 imgW/imgH 改完之后
        rebuildChar()
        super.onSizeChanged(w, h, ow, oh)
    }

    // 内参原样留着。f_px 是「焦距 × 画面长边px / 传感器长边」，画面长边会随
    // 转屏/抽屉开合变 —— 只在 bind 时算一次的话，尺寸一变焦距就还停在旧值，
    // 整个投影等比缩放错位。看着不像坐标错，像"换了个长焦镜头"，极难自查。
    private var camFocalMm = 0.0
    private var camSensorLongMm = 0.0

    private fun recomputeFocal() {
        val viewLong = max(width, height).toDouble()
        proj.focalPxExact =
            if (camFocalMm > 0 && camSensorLongMm > 0 && viewLong > 1)
                Projection.focalFromCamera(camFocalMm, camSensorLongMm, viewLong)
            else null
    }

    /**
     * 相机内参到手后调用。
     * f_px = 焦距(mm) × 画面长边px / 传感器长边(mm)
     */
    fun applyCameraIntrinsics(focalMm: Double, sensorLongMm: Double) {
        camFocalMm = focalMm
        camSensorLongMm = sensorLongMm
        recomputeFocal()
        rebuildChar(); invalidate(); onChanged?.invoke()
    }

    // ── 2D 立绘 ───────────────────────────────────────────────────
    /**
     * 立绘落位。两种模式：
     *
     *   贴地（全身立绘）：位置由 (subjectX, subjectDist) 决定，尺寸按投影算，
     *                    拖近了大、拖远了小。
     *   自由（半身立绘）：位置和大小都直接存，随便拖随便缩。
     *
     * 半身立绘必须走自由 —— 它没有脚底，看不出远近，硬套透视只会把大小锁死。
     */
    private fun rebuildChar() {
        val bmp = charBitmap
        if (bmp == null) { charPlacement = null; rebuildPainter(); return }
        charPlacement = if (charFreeMode) {
            val base = freePlacement ?: ScenePainter.buildPlacement(
                proj, subjectX, subjectDist, subjectHeight, charBottomRatio, charFill, charScale)
                ?.also { freePlacement = it }
                ?: return
            // 吸附在每次重算之后兜一次底。拖、缩、转屏、改画布尺寸全走这条路，
            // 所以只要这里吸住了，就不可能从框条上跑掉。
            if (edgeBar != 0) snapToEdge(base, bmp).also { freePlacement = it } else base
        } else {
            ScenePainter.buildPlacement(
                proj, subjectX, subjectDist, subjectHeight, charBottomRatio, charFill, charScale)
        }
        rebuildPainter()
    }

    /**
     * 把落位摁到框条上。
     *
     * 垂直那条轴直接钉死（下边 = 图下沿贴画面下沿），沿边那条轴保留但夹在
     * 画面内 —— 图比画面还宽的时候夹出来的区间是反的，那种情况直接居中。
     */
    private fun snapToEdge(c: CharPlacement, bmp: Bitmap): CharPlacement {
        val h = c.h
        if (!(h > 0)) return c     // 别写成 h < 2 —— 那会让矮立绘整个溜出吸附
        val w = h * bmp.width / bmp.height
        val W = proj.imgW
        val H = proj.imgH
        fun clamp(v: Double, lo: Double, hi: Double) = if (hi < lo) (lo + hi) / 2 else v.coerceIn(lo, hi)
        return when (edgeBar) {
            1 -> CharPlacement(clamp(c.u, w / 2, W - w / 2), h / 2, h)              // 上
            2 -> CharPlacement(clamp(c.u, w / 2, W - w / 2), H - h / 2, h)          // 下
            3 -> CharPlacement(w / 2, clamp(c.v, h / 2, H - h / 2), h)              // 左
            4 -> CharPlacement(W - w / 2, clamp(c.v, h / 2, H - h / 2), h)          // 右
            else -> c
        }
    }

    /**
     * 换框条。切过去时保留当前大小，位置按比例带过去 ——
     * 从下边切到左边，原来在下边滑到 30% 处，切完就在左边 30% 处。
     */
    fun setEdgeBar(bar: Int) {
        val b = bar.coerceIn(0, 4)
        if (b == edgeBar) return
        val old = charPlacement
        val wasBar = edgeBar
        edgeBar = b
        if (b != 0) {
            charFreeMode = true                 // 吸附本来就属于「非贴地」那一轨
            val c = old ?: freePlacement
            if (c != null) {
                // 取「原来那条边」上的滑动比例，把它映射到新边。
                // 不能用新边的轴去读 —— 新边那条轴在旧状态下恰恰是钉死的：
                // 贴下边时 v ≡ H - h/2 恒定，贴左边时 u ≡ w/2 恒定。
                // 拿它当比例，结果永远是"切过去落在最下端"。
                val wasHorizontal = wasBar == 1 || wasBar == 2
                val along = (if (wasHorizontal) {
                    if (proj.imgW > 1) c.u / proj.imgW else 0.5
                } else {
                    if (proj.imgH > 1) c.v / proj.imgH else 0.5
                }).coerceIn(0.0, 1.0)
                val toHorizontal = b == 1 || b == 2
                freePlacement = if (toHorizontal) {
                    CharPlacement(along * proj.imgW, c.v, c.h)
                } else {
                    CharPlacement(c.u, along * proj.imgH, c.h)
                }
            }
        }
        rebuildChar(); invalidate(); onChanged?.invoke()
    }

    /** 切换贴地 / 自由。切到自由时把当前位置接过来，不跳 */
    fun applyCharFreeMode(free: Boolean) {
        if (free == charFreeMode) return
        val cur = charPlacement
        charFreeMode = free
        if (free) freePlacement = cur
        // 回贴地模式 = 有脚了，吸附就没有意义
        if (!free) edgeBar = 0
        rebuildChar(); invalidate(); onChanged?.invoke()
    }

    fun setCharacter(bmp: Bitmap?) {
        charBitmap = bmp
        freePlacement = null          // 换图就重新落位
        // 轮廓光是导入时算一次的，不在每帧里做
        rimBitmap = bmp?.let { CharFx.makeRim(it, rimRadius, rimColor) }
        rebuildChar()
        ensureVisible(bmp)
        invalidate(); onChanged?.invoke()
    }

    /**
     * 兜底。有时候立绘算出来的落位是空、或者跑到画面外，表现就是
     * 「提示已导入，画面上什么都没有」。这时候强制摆到画面正中，
     * 至少让用户看得见、能拖得动。
     */
    private fun ensureVisible(bmp: Bitmap?) {
        if (bmp == null || proj.imgW < 8 || proj.imgH < 8) return
        val c = charPlacement
        val bad = c == null || c.h < 8 || c.h.isNaN() || c.u.isNaN() || c.v.isNaN() ||
                  c.u < -c.h || c.u > proj.imgW + c.h || c.v < -c.h || c.v > proj.imgH + c.h
        if (!bad) return
        val h = proj.imgH * 0.45
        charFreeMode = true
        freePlacement = CharPlacement(proj.imgW / 2, proj.imgH / 2, h)
        rebuildChar()
        // 这里直接改了状态，必须告诉外面 —— 否则面板还显示「贴地·全身立绘」，
        // 自由模式专属的滑条（大小/框条/景别）保持隐藏，用户看着像是坏了。
        onFreeModeForced?.invoke()
    }

    /**
     * ensureVisible 兜底切到自由模式时回调。
     * 触发场景：贴地模式把手机仰到 pitch≈-75°，4m 内的地面点投影全部退化，
     * buildPlacement 返回 null，立绘会「提示已导入但画面上什么都没有」。
     */
    var onFreeModeForced: (() -> Unit)? = null

    /**
     * 换一张处理过的立绘，但**保持当前位置和大小**。
     * 去底、换图这种就地替换用它，不要用 setCharacter（那个会重新落位）。
     */
    fun replaceCharacter(bmp: Bitmap) {
        charBitmap = bmp
        rimBitmap = CharFx.makeRim(bmp, rimRadius, rimColor)
        rebuildChar()
        invalidate(); onChanged?.invoke()
    }

    fun hasTransparency(): Boolean {
        val b = charBitmap ?: return false
        var y = 0
        while (y < b.height) {
            var x = 0
            while (x < b.width) {
                if ((b.getPixel(x, y) ushr 24) < 250) return true
                x += max(1, b.width / 64)
            }
            y += max(1, b.height / 64)
        }
        return false
    }

    /** 重做轮廓光（改半径或颜色之后调） */
    fun rebuildRim() {
        val b = charBitmap ?: return
        rimBitmap = CharFx.makeRim(b, rimRadius, rimColor)
        rebuildPainter(); invalidate()
    }

    fun setRimRadius(r: Int) { rimRadius = r.coerceIn(1, 14); rebuildRim() }

    /**
     * 导出遮罩：人形区域不透明白色，其余全透明。
     *
     * ⚠ 必须走和 paintChar **同一套** 变换（缩放 + 旋转 + 左右翻），
     * 不能用一个轴对齐矩形去糊。倾斜 30° 时轴对齐遮罩和实际立绘最大错开
     * h·sin30°/2 = 0.25h（h=800 就是 200px）；翻转过的立绘遮罩还是镜像的，
     * 白色区域落到身子另一半上，下游 inpainting 会擦错地方。
     *
     * 缩放按两个方向各算各的。以前只用了 w/imgW 一个比例，
     * 出图长宽比和预览不一致时纵向就错。
     */
    fun renderMask(w: Int, h: Int): Bitmap? {
        val bmp = charBitmap ?: return null
        val c = charPlacement ?: return null
        val kx = w.toDouble() / proj.imgW.coerceAtLeast(1.0)
        val ky = h.toDouble() / proj.imgH.coerceAtLeast(1.0)
        // 位图原尺寸 → 目标尺寸。**必须用同一个比例**（取 ky，竖直方向）。
        //
        // 不能写成 sx=kx·c.h/bmp.h、sy=ky·c.h/bmp.h —— 那是各向异性缩放，
        // 而它前面紧挨着一个旋转，**旋转 + 非等比缩放 = 剪切**，立绘会被拉歪。
        // 物理上也讲不通：一个人在照片里变高多少，宽就跟着变多少，
        // 不存在"横向按 kx 缩、纵向按 ky 缩"。预览和拍摄同画幅时 kx≡ky，
        // 不同画幅时也该按 kx 去定位、按 ky 去缩放。
        val s = (ky * c.h / bmp.height).toFloat()
        // postX 的语义是"在当前变换之后再作用 X"，点变换顺序 = 书写顺序。
        // 所以这里是：图心移到原点 → 转 → 翻 → 缩 → 摆到目标位置。
        // 和 paintChar 的 translate/rotate/scale 顺序一致。
        val m = android.graphics.Matrix()
        m.postTranslate(-bmp.width / 2f, -bmp.height / 2f)
        m.postRotate(charAngleDeg().toFloat())
        if (charFlipX) m.postScale(-1f, 1f)
        m.postScale(s, s)
        m.postTranslate((c.u * kx).toFloat(), (c.v * ky).toFloat())
        return CharFx.makeMask(bmp, w, h, m)
    }

    /** 立绘下沿切在人物身上多高 */
    fun applyCharBottomRatio(r: Double) {
        charBottomRatio = r.coerceIn(0.0, 0.95)
        rebuildChar(); invalidate(); onChanged?.invoke()
    }

    /** 图中人物占整张图高度多少 */
    fun applyCharFill(f: Double) {
        charFill = f.coerceIn(0.1, 2.0)
        rebuildChar(); invalidate(); onChanged?.invoke()
    }

    /**
     * 改人物身高。
     *
     * 贴地模式下身高本来就走投影，自动就变；自由模式下没有地面参照，
     * 得手动按比例缩 —— 把身高从 1.65 改成 1.80，立绘就该大一圈。
     */
    fun applySubjectHeight(h: Double) {
        val old = subjectHeight
        subjectHeight = h.coerceIn(0.5, 2.5)
        if (charFreeMode && old > 0.1) {
            val c = freePlacement
            if (c != null) freePlacement = scaleAroundCut(c, c.h * (subjectHeight / old))
        }
        rebuildChar(); invalidate(); onChanged?.invoke()
    }

    /**
     * 立绘大小滑条。
     * 自由模式直接按「占画面高的百分比」定尺寸；贴地模式是投影算出来之后的倍数。
     */
    fun applyCharSize(v: Double) {
        if (charFreeMode) {
            val c = freePlacement ?: charPlacement ?: return
            freePlacement = scaleAroundCut(c, (v.coerceIn(0.05, 3.0)) * proj.imgH)
        } else {
            charScale = v.coerceIn(0.2, 6.0)
        }
        rebuildChar(); invalidate(); onChanged?.invoke()
    }

    /**
     * 改图高。**锚在图心** —— 两头一起长，位置看着不动。
     * 之前锚在切口（下边缘），调大时下边缘不动、整张往上长，
     * 盯人物看就像它在往上跑，每次调完都得重新摆一次。
     */
    private fun scaleAroundCut(c: CharPlacement, newH: Double): CharPlacement {
        val nh = newH.coerceIn(8.0, proj.imgH * 8)
        return CharPlacement(c.u, c.v, nh)
    }

    /** 自由模式下立绘当前占画面高的比例，用来回填滑条 */
    fun charSizeRatio(): Double {
        val c = charPlacement ?: return 0.4
        return if (proj.imgH > 1) c.h / proj.imgH else 0.4
    }

    /** 切口（立绘下边缘中点）在画面里的位置 */
    fun cutPoint(): Projection.P? {
        val c = charPlacement ?: return null
        val dr = charAngleRad()
        return Projection.P(c.u - sin(dr) * c.h / 2, c.v + cos(dr) * c.h / 2)
    }

    /**
     * 景别：这张立绘覆盖了人体的哪一段（从下边缘到头顶）。
     *   1.00 = 全身，0.72 = 膝上，0.47 = 腰上，0.28 = 胸上，0.20 = 头肩
     * 它不改变画面，只用来算一个尺度参照。
     */
    var shotCover = 1.0

    /**
     * 把这张图补全成全身之后，大概占画面多高。
     * 半身没有地面参照，只有换算回全身才知道尺度合不合理。
     */
    fun impliedFullBody(): Pair<Double, Double>? {
        val c = charPlacement ?: return null
        if (shotCover <= 0.05 || proj.imgH < 2) return null
        val full = c.h / shotCover
        return Pair(full, full / proj.imgH)
    }

    /** 立绘底边若落在地面上，反解它意味着多高的人 */
    fun charImpliedHeight(): Double? {
        val c = charPlacement ?: return null
        val g = proj.unprojectGround(c.u, c.v + c.h / 2) ?: return null
        return proj.heightFromChar(c.h, charFill * charScale, g.second)
    }

    fun charPlacementSafe(): CharPlacement? = charPlacement

    /** 把立绘对齐到当前人体位置 */
    fun alignCharToSubject() {
        rebuildChar(); invalidate(); onChanged?.invoke()
    }

    fun setPose(name: String) {
        pose = Poses.ALL.firstOrNull { it.first == name }?.second ?: Poses.STAND
        rebuildPainter(); invalidate(); onChanged?.invoke()
    }

    // ── 绘制 ──────────────────────────────────────────────────────
    override fun onDraw(canvas: Canvas) {
        painter?.paint(canvas, showGrid, showFigure, showHorizon)
        // 吸在边上的时候切口就压在画面边缘，画那条线纯属添乱
        if (charFreeMode && edgeBar == 0 && charBitmap != null) drawCutGuide(canvas)
        if (showThirds) drawThirds(canvas)
    }

    /** 三分法辅助线。摆半身立绘主要靠构图，不靠透视 */
    var showThirds = false

    private val thirdsPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        color = Color.argb(120, 255, 255, 255)
        strokeWidth = 1.2f * resources.displayMetrics.density
    }

    private fun drawThirds(canvas: Canvas) {
        val w = width.toFloat(); val h = height.toFloat()
        for (i in 1..2) {
            canvas.drawLine(w * i / 3f, 0f, w * i / 3f, h, thirdsPaint)
            canvas.drawLine(0f, h * i / 3f, w, h * i / 3f, thirdsPaint)
        }
        val r = 4f * resources.displayMetrics.density
        for (i in 1..2) for (j in 1..2) canvas.drawCircle(w * i / 3f, h * j / 3f, r, thirdsPaint)
    }

    /**
     * 切口提示线。半身立绘唯一确定的几何量就是这条线 ——
     * 它落在画面哪儿，决定了这个角色是"从画面外伸进来"还是"悬在半空"。
     */
    private val cutPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        color = Color.argb(215, 255, 90, 140)
        strokeWidth = 2.5f * resources.displayMetrics.density
        pathEffect = DashPathEffect(floatArrayOf(16f, 11f), 0f)
    }

    private fun drawCutGuide(canvas: Canvas) {
        val c = charPlacement ?: return
        val bmp = charBitmap ?: return
        val w = c.h * bmp.width / bmp.height
        val dr = charAngleRad()
        val ux = sin(dr); val uy = -cos(dr)        // 立绘朝上的方向
        val bx = c.u - ux * c.h / 2                // 下边缘中点
        val by = c.v - uy * c.h / 2
        val hx = -uy; val hy = ux                  // 沿切口方向
        canvas.drawLine((bx - hx * w / 2).toFloat(), (by - hy * w / 2).toFloat(),
                        (bx + hx * w / 2).toFloat(), (by + hy * w / 2).toFloat(), cutPaint)
    }

    // ── 触摸 ──────────────────────────────────────────────────────
    /** 双指捏合 = 改图高，锚在图心；3D 已删，这个手势只作用于立绘 */
    private val scaleDetector = android.view.ScaleGestureDetector(
        ctx,
        object : android.view.ScaleGestureDetector.SimpleOnScaleGestureListener() {
            override fun onScale(d: android.view.ScaleGestureDetector): Boolean {
                val c = charPlacement ?: return false
                if (charBitmap == null || c.h < 1) return false
                if (charFreeMode) {
                    freePlacement = scaleAroundCut(c, c.h * d.scaleFactor)
                } else {
                    subjectDist = (subjectDist / d.scaleFactor).coerceIn(0.4, 200.0)
                    painter?.subjectDist = subjectDist
                }
                rebuildChar()
                onChanged?.invoke(); invalidate()
                return true
            }
        })

    @SuppressLint("ClickableViewAccessibility")
    override fun onTouchEvent(event: MotionEvent): Boolean {
        scaleDetector.onTouchEvent(event)

        // ⚠ 手指增减必须先处理，而且要抢在 isInProgress 的提前 return 前面。
        // event.x 永远取 0 号手指的坐标；不处理这两个 action 的话：
        //   · 抬掉先按下的那根手指，剩下的手指一动，du 就等于两指间距 → 瞬移几百像素
        //   · 整个捏合期间被 isInProgress 吞掉事件，lastX 一直停在捏合前的值
        when (event.actionMasked) {
            MotionEvent.ACTION_POINTER_DOWN, MotionEvent.ACTION_POINTER_UP -> {
                val idx = event.actionIndex
                lastX = event.getX(idx); lastY = event.getY(idx)
                dragging = false
                draggingChar = false
                // 两根手指都离开之前不再接受拖动，免得抬指瞬间误判成拖
                if (event.actionMasked == MotionEvent.ACTION_POINTER_UP &&
                    event.pointerCount <= 2) {
                    // 还剩一根手指：把它当成新的起点，但先不拖，等下一个 MOVE 重锚
                    draggingChar = edgeBar != 0 ||
                        hitChar(lastX.toDouble(), lastY.toDouble())
                }
                return true
            }
        }

        if (scaleDetector.isInProgress) { dragging = false; return true }   // 双指时只缩放，不拖

        when (event.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                lastX = event.x; lastY = event.y
                // 吸附模式下不用瞄准 —— 立绘就只能沿那条边滑，拖画面哪儿都一样
                draggingChar = edgeBar != 0 || hitChar(event.x.toDouble(), event.y.toDouble())
                dragging = true
                return true
            }
            MotionEvent.ACTION_MOVE -> {
                // 捏合刚结束、或刚从多指回到单指：这一帧只重新锚定，不做位移
                if (!dragging) {
                    lastX = event.x; lastY = event.y
                    dragging = event.pointerCount == 1
                    return true
                }
                if (draggingChar) dragChar(event.x, event.y) else dragSubject(event.x, event.y)
                lastX = event.x; lastY = event.y
                onChanged?.invoke(); invalidate()
                return true
            }
            MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                dragging = false; draggingChar = false; return true
            }
        }
        return super.onTouchEvent(event)
    }

    /** 拖立绘。贴地模式拖的是地面落点，自由模式直接挪图 */
    private fun dragChar(x: Float, y: Float) {
        val c = charPlacement ?: return
        if (edgeBar != 0) {
            // 只吃沿边那一轴的分量，垂直分量丢掉 —— 拖不出去
            val du = x - lastX
            val dv = y - lastY
            freePlacement = if (edgeBar == 1 || edgeBar == 2) {
                c.copy(u = c.u + du)
            } else {
                c.copy(v = c.v + dv)
            }
            rebuildChar()
            return
        }
        if (charFreeMode) {
            freePlacement = c.copy(u = c.u + (x - lastX), v = c.v + (y - lastY))
            rebuildChar()
            return
        }
        val be = ScenePainter.bottomEdge(proj, c, subjectHeight, charBottomRatio, charFill, charScale)
            ?: return
        val nu = be.u + (x - lastX)
        val nv = be.v + (y - lastY)
        val g = proj.unproject(nu, nv, charBottomRatio * subjectHeight) ?: return
        subjectX = g.first.coerceIn(-200.0, 200.0)
        subjectDist = g.second.coerceIn(0.4, 200.0)
        painter?.subjectX = subjectX
        painter?.subjectDist = subjectDist
        rebuildChar()
    }

    /** 空处拖动 = 把落点挪到那块地面（贴地模式） */
    private fun dragSubject(x: Float, y: Float) {
        if (charFreeMode) return
        val g = proj.unprojectGround(x.toDouble(), y.toDouble()) ?: return
        subjectDist = g.second.coerceIn(0.4, 200.0)
        subjectX = g.first.coerceIn(-200.0, 200.0)
        painter?.subjectDist = subjectDist
        painter?.subjectX = subjectX
        rebuildChar()
    }

    private fun hitChar(u: Double, v: Double): Boolean {
        val bmp = charBitmap ?: return false
        val c = charPlacement ?: return false
        val w = c.h * bmp.width / bmp.height
        val rad = -charAngleRad()
        val dx = u - c.u; val dy = v - c.v
        val lx = dx * cos(rad) - dy * sin(rad)
        val ly = dx * sin(rad) + dy * cos(rad)
        return lx >= -w / 2 && lx <= w / 2 && ly >= -c.h / 2 && ly <= c.h / 2
    }
}
