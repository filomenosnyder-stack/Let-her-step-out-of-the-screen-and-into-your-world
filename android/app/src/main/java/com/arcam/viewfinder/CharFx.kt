package com.arcam.viewfinder

import android.graphics.Bitmap
import android.graphics.BlurMaskFilter
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.ColorMatrix
import android.graphics.ColorMatrixColorFilter
import android.graphics.Paint
import android.graphics.PorterDuff
import android.graphics.PorterDuffXfermode
import android.graphics.Shader
import kotlin.math.min
import kotlin.random.Random

/**
 * 立绘的预处理。这几样都是导入时算一次、之后每次绘制直接用位图，
 * 不在每帧里做 —— 手机上逐帧做会掉帧。
 *
 * 为什么需要：
 *   · 抠图残留的光晕 —— PNG 边缘常带一圈半透明的灰白，贴到照片上就是发光的描边
 *   · 轮廓光 —— 环境光打在人物边缘产生的散射，二维立绘没有，缺了就显得"贴上去"
 *   · 噪点 —— 实拍照片有 ISO 噪点，立绘太干净，一块干净的色块贴在噪点背景上很显眼
 */
object CharFx {

    private const val MAX_EDGE = 1024

    /** 生成用的参考尺寸：太大没必要，缩到 1024 以内 */
    private fun refSize(w: Int, h: Int): Pair<Int, Int> {
        val k = min(MAX_EDGE.toDouble() / w, MAX_EDGE.toDouble() / h).coerceAtMost(1.0)
        return Pair((w * k).toInt().coerceAtLeast(1), (h * k).toInt().coerceAtLeast(1))
    }

    /**
     * 轮廓光位图：把立绘的 alpha 形状向外撑开几像素、填成纯色。
     * 画的时候垫在立绘底下，边缘就会露出一圈光。
     */
    fun makeRim(src: Bitmap, radiusPx: Int, color: Int): Bitmap? {
        val (w, h) = refSize(src.width, src.height)
        if (w < 2 || h < 2) return null
        val small = if (w != src.width || h != src.height)
            Bitmap.createScaledBitmap(src, w, h, true) else src

        val out = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
        val c = Canvas(out)
        val p = Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG)
        // 颜色全换成纯色，alpha 原样保留
        val cm = ColorMatrix(floatArrayOf(
            0f, 0f, 0f, 0f, Color.red(color).toFloat(),
            0f, 0f, 0f, 0f, Color.green(color).toFloat(),
            0f, 0f, 0f, 0f, Color.blue(color).toFloat(),
            0f, 0f, 0f, Color.alpha(color) / 255f, 0f))
        p.colorFilter = ColorMatrixColorFilter(cm)

        val r = radiusPx.coerceIn(1, 12)
        // 八个方向 + 圆心，够撑出一圈，比逐像素膨胀快得多
        val offs = intArrayOf(0, 0, r, 0, -r, 0, 0, r, 0, -r,
                              r, r, -r, -r, r, -r, -r, r)
        var i = 0
        while (i < offs.size) {
            c.drawBitmap(small, offs[i].toFloat(), offs[i + 1].toFloat(), p)
            i += 2
        }
        return out
    }

    /**
     * 噪点平铺图。用 BitmapShader 重复铺，不用生成整张。
     * strength 0..1，越大噪点越明显。
     */
    private var noiseTile: Bitmap? = null
    private var noiseStrength = -1f

    fun noise(strength: Float): Bitmap? {
        if (strength <= 0.001f) return null
        if (noiseTile != null && kotlin.math.abs(noiseStrength - strength) < 0.01f) return noiseTile
        val n = 256
        val px = IntArray(n * n)
        val rnd = Random(20260915)          // 固定种子，每次生成一样
        val amp = (strength.coerceIn(0f, 1f) * 90f).toInt().coerceAtLeast(1)
        for (i in px.indices) {
            val v = rnd.nextInt(-amp, amp + 1)
            val g = (128 + v).coerceIn(0, 255)
            px[i] = (0x40 shl 24) or (g shl 16) or (g shl 8) or g   // 半透明灰
        }
        val b = Bitmap.createBitmap(px, n, n, Bitmap.Config.ARGB_8888)
        noiseTile = b
        noiseStrength = strength
        return b
    }

    /**
     * 从立绘的 alpha 生成遮罩：白色 = 立绘覆盖的地方，黑色 = 背景。
     * 下游 ComfyUI 做 inpainting 直接吃这张。
     */
    /**
     * 导出遮罩。
     *
     * **人形区域不透明白色，其余全透明** —— 不再画黑底。
     * 原来出的是「黑底 + 白人形」的不透明 PNG：拖进 PS/ComfyUI 当蒙版会连那片黑
     * 一起遮住，叠在深色画面里也看不出边界。透明底才能直接当通道使。
     *
     * 颜色矩阵 RGB 三行恒定输出 255、alpha 行取原 alpha —— 于是"立绘不透明的地方
     * 就是不透明白色，立绘透明的地方就是全透明"。不要改成「白矩形 + DST_IN」那套，
     * 矩形边缘会漏出细白线。
     *
     * 变换矩阵由 OverlayView 按和 paintChar 完全相同的顺序算好传进来。
     */
    fun makeMask(src: Bitmap, w: Int, h: Int, m: android.graphics.Matrix): Bitmap {
        val out = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
        val c = Canvas(out)              // 不 drawColor，画布天生全透明
        val p = Paint(Paint.FILTER_BITMAP_FLAG or Paint.ANTI_ALIAS_FLAG)
        p.colorFilter = ColorMatrixColorFilter(ColorMatrix(floatArrayOf(
            0f, 0f, 0f, 0f, 255f,
            0f, 0f, 0f, 0f, 255f,
            0f, 0f, 0f, 0f, 255f,
            0f, 0f, 0f, 1f, 0f)))
        c.drawBitmap(src, m, p)
        return out
    }

    /**
     * 纯色底去背。取四个角的平均色当背景色，把接近它的像素变透明，
     * 边界留一段羽化避免锯齿。
     *
     * 白底、黑底的立绘素材很多，抠图没弄干净就直接导进来了 —— 贴到照片上就是
     * 一个白方块。四角颜色不一致（说明本来就不是纯色底）就返回 null，不做。
     */
    fun keyOutBackground(src: Bitmap, tolerance: Int, feather: Int): Bitmap? {
        val w = src.width; val h = src.height
        if (w < 4 || h < 4) return null
        val corners = arrayOf(0 to 0, w - 1 to 0, 0 to h - 1, w - 1 to h - 1)
        var sr = 0L; var sg = 0L; var sb = 0L
        for ((x, y) in corners) {
            val p = src.getPixel(x, y)
            sr += (p shr 16) and 0xFF; sg += (p shr 8) and 0xFF; sb += p and 0xFF
        }
        val br = (sr / 4).toInt(); val bg = (sg / 4).toInt(); val bb = (sb / 4).toInt()
        // 四角差别太大 = 不是纯色底，别乱抠
        for ((x, y) in corners) {
            if (colorDist(src.getPixel(x, y), br, bg, bb) > tolerance * 2) return null
        }

        val out = src.copy(Bitmap.Config.ARGB_8888, true)
        val px = IntArray(w * h)
        out.getPixels(px, 0, w, 0, 0, w, h)
        val soft = feather.coerceAtLeast(1)
        for (i in px.indices) {
            val p = px[i]
            val a0 = (p ushr 24) and 0xFF
            if (a0 == 0) continue
            val d = colorDist(p, br, bg, bb)
            val a = when {
                d <= tolerance -> 0
                d <= tolerance + soft -> (((d - tolerance).toDouble() / soft) * a0).toInt()
                else -> a0
            }
            px[i] = (a shl 24) or (p and 0x00FFFFFF)
        }
        out.setPixels(px, 0, w, 0, 0, w, h)
        return out
    }

    private fun colorDist(p: Int, r: Int, g: Int, b: Int): Int {
        val dr = ((p shr 16) and 0xFF) - r
        val dg = ((p shr 8) and 0xFF) - g
        val db = (p and 0xFF) - b
        return kotlin.math.sqrt((dr * dr + dg * dg + db * db).toDouble()).toInt()
    }

    /** 给模糊用：把一张图先缩小再放大，模拟景深 */
    fun blurByDownscale(src: Bitmap, factor: Int): Bitmap {
        if (factor <= 1) return src
        val w = (src.width / factor).coerceAtLeast(1)
        val h = (src.height / factor).coerceAtLeast(1)
        val small = Bitmap.createScaledBitmap(src, w, h, true)
        val back = Bitmap.createScaledBitmap(small, src.width, src.height, true)
        if (small != src) small.recycle()
        return back
    }
}
