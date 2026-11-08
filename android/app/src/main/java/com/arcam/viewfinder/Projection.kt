package com.arcam.viewfinder

import kotlin.math.abs
import kotlin.math.asin
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sin

/**
 * 投影模型 —— 和桌面验证器 index.html 里那一套逐字一致。
 *
 * 验证记录见项目根目录 verify/：
 *   1_projection_roundtrip  投影/反投影往返，最大误差 3.55e-15
 *   2_focal_from_35mm       等效焦距 → 像素焦距，各种画幅
 *   3_solve_camera_height   由真人反解相机高度，误差 2.7e-15
 *   5_grid_alignment        渲染出来的网格像素级对齐，命中率 100.00%
 *
 * 世界坐标：相机在原点；x 向右、d 向前（水平）、y 向上（地面在 y = -camHeight）
 * 相机系：  X 右、Y 下、Z 前
 *
 * 和网页版的差别：原生端焦距来自 Camera2（焦距 mm + 传感器物理尺寸 mm，见
 * [focalFromCamera]）；网页版读的是 jpg，拿不到这两个数，才需要拿等效焦距去估。
 */
class Projection {

    /** 画面尺寸（像素）。用预览画面尺寸，焦距也按同一尺度算。 */
    var imgW = 1.0
    var imgH = 1.0

    /** 相机高度：地面到镜头，米 */
    var camHeight = 1.6

    /** 俯角（度），向下为正 */
    var pitchDeg = 0.0

    /** 滚转（度） */
    var rollDeg = 0.0

    /** Camera2 给的精确像素焦距。有就优先用。 */
    var focalPxExact: Double? = null

    /** 拿不到精确值时的回落：等效焦距（35mm 口径） */
    var focalEq35mm = 23.0

    /**
     * 像素焦距。
     * 精确值：f_px = 焦距(mm) × 画面长边像素 / 传感器长边(mm)
     * 回落值：4:3 传感器，等效焦距按对角线定义（全画幅对角线 43.266mm）
     */
    fun focalPx(): Double {
        focalPxExact?.let { if (it > 1.0) return it }
        val l = max(imgW, imgH)
        val s = min(imgW, imgH)
        val kLong = 0.8 * 43.266 / 2
        val kShort = 0.6 * 43.266 / 2
        return if (l / s >= 4.0 / 3.0) (l / 2) * focalEq35mm / kLong
        else (s / 2) * focalEq35mm / kShort
    }

    companion object {
        /** 由相机内参算精确像素焦距。viewLongPx 传画面长边像素数。 */
        fun focalFromCamera(focalMm: Double, sensorLongMm: Double, viewLongPx: Double): Double =
            focalMm * viewLongPx / sensorLongMm
    }

    data class P(val u: Double, val v: Double)

    /** 世界点 → 画面像素。y 是相对相机的高度（地面点为 -camHeight）。 */
    fun project(x: Double, y: Double, d: Double): P? {
        val p = Math.toRadians(pitchDeg)
        val r = Math.toRadians(rollDeg)
        val zc = -y * sin(p) + d * cos(p)
        if (zc <= 0.05) return null
        val yc = -y * cos(p) - d * sin(p)
        val xr = x * cos(r) - yc * sin(r)
        val yr = x * sin(r) + yc * cos(r)
        val f = focalPx()
        return P(imgW / 2 + f * xr / zc, imgH / 2 + f * yr / zc)
    }

    /** 地面点 (横向 x, 前方 d) → 画面像素 */
    fun projectGround(x: Double, d: Double): P? = project(x, -camHeight, d)

    /**
     * 画面像素 → 某个水平面上的点 (x, d)。先反滚转再解竖直平面。
     *
     * planeY = 那个平面离地多高。0 就是地面；传人物腰部高度就得到"腰所在的平面"，
     * 半身立绘靠这个定位 —— 它没有脚底，只能拿身体某一截当落点。
     * 换平面等价于把相机高度改成「相机到该平面的垂直距离」，公式一模一样。
     */
    fun unproject(u: Double, v: Double, planeY: Double = 0.0): Pair<Double, Double>? {
        val p = Math.toRadians(pitchDeg)
        val r = Math.toRadians(rollDeg)
        val f = focalPx()
        val up = u - imgW / 2
        val vp = v - imgH / 2
        val a = (up / f) * cos(r) + (vp / f) * sin(r)
        val b = -(up / f) * sin(r) + (vp / f) * cos(r)
        val hEff = camHeight - planeY
        val den = sin(p) + b * cos(p)
        if (abs(den) < 1e-9) return null
        val d = hEff * (cos(p) - b * sin(p)) / den
        if (d <= 0.05) return null
        val zc = hEff * sin(p) + d * cos(p)
        return Pair(a * zc, d)
    }

    /** 地面上的反解，保持老签名 */
    fun unprojectGround(u: Double, v: Double): Pair<Double, Double>? = unproject(u, v, 0.0)

    /** 由一个人的身高 k 和他的脚底/头顶像素，反解相机高度。 */
    fun solveCamHeight(foot: P, head: P, k: Double): Double? {
        val p = Math.toRadians(pitchDeg)
        val r = Math.toRadians(rollDeg)
        val f = focalPx()
        fun ratio(q: P): Double =
            -((q.u - imgW / 2) / f) * sin(r) + ((q.v - imgH / 2) / f) * cos(r)
        val a = ratio(foot)
        val b = ratio(head)
        val cp = cos(p)
        val sp = sin(p)
        val u = (cp - b * sp) * (sp + a * cp)
        val w = (cp - a * sp) * (sp + b * cp)
        if (abs(u - w) < 1e-9) return null
        return k * u / (u - w)
    }

    /** 由画面里的立绘反解它对应的人物身高（底边落在地面时）。 */
    fun heightFromChar(imgHeightPx: Double, fillRatio: Double, groundDist: Double): Double? {
        val p = Math.toRadians(pitchDeg)
        val cp = cos(p)
        // 镜头垂直朝下拍地面时俯角就是 ±90°，cos 趋近 6e-17 —— 除下去结果飞到
        // 1e17，状态栏会显示「立绘反解身高 1234567890123456.00m」。这是很自然的
        // 一个姿势（俯拍地面），不是极端输入。低于这个阈值直接判为解不出来。
        if (abs(cp) < 1e-6) return null
        val zc = camHeight * sin(p) + groundDist * cp
        val h = (imgHeightPx * fillRatio) * zc / (focalPx() * cp)
        return if (h.isFinite() && h > 0) h else null
    }
}
