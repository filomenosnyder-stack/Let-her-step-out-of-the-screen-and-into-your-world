package com.arcam.viewfinder

import android.Manifest
import android.content.ContentValues
import android.content.Context
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Matrix
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.hardware.camera2.CameraCharacteristics
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.os.Handler
import android.os.Looper
import android.provider.MediaStore
import android.util.Log
import android.view.Gravity
import android.view.Surface
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.SeekBar
import android.widget.TextView
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.camera.camera2.interop.Camera2CameraInfo
import androidx.camera.core.AspectRatio
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageCapture
import androidx.camera.core.ImageCaptureException
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import java.io.File
import java.io.FileOutputStream
import java.io.OutputStream
import java.util.concurrent.Executors
import kotlin.math.abs
import kotlin.math.atan
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sqrt
import kotlin.math.tan

class MainActivity : AppCompatActivity(), SensorEventListener {

    // ── 相机 ──────────────────────────────────────────────────────
    private lateinit var previewView: PreviewView
    private lateinit var overlay: OverlayView
    private lateinit var aspectBox: AspectFrameLayout
    private var imageCapture: ImageCapture? = null
    private val cameraExec = Executors.newSingleThreadExecutor()

    private var focalMm = 0.0
    private var sensorLongMm = 0.0
    private var sensorShortMm = 0.0
    private var activeLongPx = 0
    private var activeW = 0
    private var activeH = 0
    private var intrinsicsOk = false
    private var previewW = 0
    private var previewH = 0
    private var previewUseCase: Preview? = null
    private var boundCamera: androidx.camera.core.Camera? = null

    // ── 传感器 ────────────────────────────────────────────────────
    private lateinit var sensorMgr: SensorManager
    private var rotSensor: Sensor? = null
    private var sensorTypeName = "无"
    private val orient = SensorOrientation()
    private var lastSensorAt = 0L
    private var sensorCount = 0

    // ── 界面 ──────────────────────────────────────────────────────
    private lateinit var diagText: TextView
    private lateinit var diagScroll: ScrollView
    private lateinit var statusText: TextView
    private lateinit var box2d: LinearLayout
    private lateinit var hint2d: TextView
    private val poseButtons = mutableListOf<Button>()
    private lateinit var rowCamH: SliderRow
    private lateinit var camNum: EditText
    private var syncingCam = false

    /** 相机高度两条路：滑条管手持范围，数字框管站高处 */
    private fun setCamHeight(v: Double, fromNum: Boolean) {
        overlay.proj.camHeight = v.coerceIn(0.2, 60.0)
        syncingCam = true
        rowCamH.set(overlay.proj.camHeight)
        // 用 Locale.US。逗号小数区会写成 "1,60"，而下面的 toDoubleOrNull() 只认
        // 点号 —— 用户在这个框里照着自己看到的格式输入会被静默忽略。
        if (!fromNum) camNum.setText(nf(".2", overlay.proj.camHeight))
        syncingCam = false
        overlay.syncPainter(); refreshStatus()
    }
    private lateinit var rowSubjH: SliderRow
    private lateinit var rowDist: SliderRow
    private lateinit var rowLat: SliderRow
    private lateinit var rowCharBottom: SliderRow
    private lateinit var rowCharSize: SliderRow
    private lateinit var boxFree: LinearLayout
    private lateinit var rowCharFill: SliderRow
    private lateinit var btnFitGround: Button
    private lateinit var btnFitFree: Button

    /** 「自由」= bar 0，其余四条对应画面四边 */
    private val EDGES = listOf("自由" to 0, "上" to 1, "下" to 2, "左" to 3, "右" to 4)
    private val edgeButtons = mutableListOf<Button>()
    private var edgeBar = 0
    private var charFree = false
    private lateinit var rowCharBright: SliderRow
    private lateinit var rowCharSat: SliderRow
    private lateinit var rowCharFeather: SliderRow
    private lateinit var rowRim: SliderRow
    private lateinit var rowNoise: SliderRow
    private lateinit var rowDefringe: SliderRow
    private lateinit var rowShadowShift: SliderRow
    private lateinit var rowCharRot: SliderRow
    private var diagOn = false

    /** 3D = 用人体尺子找机位；2D = 导入立绘看合不合适。两条线只是共用同一套投影。 */
    private var mode3d = true

    // ── 检测模式 ──────────────────────────────────────────────────
    private val rec = DiagRecorder()
    private lateinit var testScroll: ScrollView
    private lateinit var testTitle: TextView
    private val testButtons = mutableListOf<Button>()
    private val testStatus = mutableListOf<TextView>()
    private var testing = false

    private val ui = Handler(Looper.getMainLooper())

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        sensorMgr = getSystemService(Context.SENSOR_SERVICE) as SensorManager
        buildUi()
        ui.post(diagTick)
    }

    // ── 权限 ──────────────────────────────────────────────────────
    private val permLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        if (granted) startCamera()
        else toast("没有相机权限就没法工作")
    }

    // 从相册挑一张角色立绘
    private val pickImage = registerForActivityResult(
        ActivityResultContracts.GetContent()
    ) { uri ->
        if (uri == null) return@registerForActivityResult
        try {
            val bmp = decodeSampled(uri, 2048)
            if (bmp == null) { toast("读图失败"); return@registerForActivityResult }
            val argb = if (bmp.config == Bitmap.Config.ARGB_8888) bmp
                       else bmp.copy(Bitmap.Config.ARGB_8888, true)
            invalidateCharStats()
            overlay.setCharacter(argb)
            setMode(false)                       // 导入后自动切到 2D
            if (charFree) rowCharSize.set(overlay.charSizeRatio() * 100.0)
            refreshStatus()
            toast(if (hasTransparency(argb))
                "已导入 ${argb.width}×${argb.height}（透明底 ✓）"
            else
                "已导入 ${argb.width}×${argb.height} ⚠ 没有透明通道，会连底色一起贴上去")
        } catch (e: Exception) {
            Log.e(TAG, "导入立绘失败", e)
            toast("导入失败：" + e.message)
        }
    }

    /** 按需降采样，避免几千像素的大图直接 OOM */
    private fun decodeSampled(uri: android.net.Uri, maxDim: Int): Bitmap? {
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, bounds) }
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null
        var sample = 1
        while (max(bounds.outWidth, bounds.outHeight) / sample > maxDim) sample *= 2
        val opts = BitmapFactory.Options().apply {
            inSampleSize = sample
            inPreferredConfig = Bitmap.Config.ARGB_8888
        }
        return contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, opts) }
    }

    // ── 自动配色：Reinhard 色彩迁移，不用模型 ─────────────────────
    private class ChStats(val mean: DoubleArray, val std: DoubleArray)

    private var charStats: ChStats? = null

    /**
     * 给机器读的数字一律走这个 —— 固定 Locale.US。
     *
     * `"%.2f".format(x)` 是 String.format(默认 Locale, ...)，在德语/法语/俄语区
     * 小数点会变成逗号，scene.json 直接写出 `"focalPx": 1926,45` 这种非法 JSON，
     * 下游解析器要么报错要么截断到第一个逗号。这是交付物损坏，不是显示问题。
     */
    private fun nf(fmt: String, v: Double) = String.format(java.util.Locale.US, "%" + fmt + "f", v)

    /**
     * 换立绘必须清掉色彩统计。
     * 这个缓存原来是「为 null 才算」，换图后没人重置 → 「自动配色」拿上一张图的
     * 均值和方差去算增益，新图被染成错误色调，而且没有任何提示。
     */
    private fun invalidateCharStats() { charStats = null }

    /**
     * 统计一块区域里像素的 RGB 均值和标准差。
     * alphaOnly = true 时只算不透明像素（立绘）；skip 里的点会跳过（用来避开角色本身取背景）。
     */
    private fun statsOf(bmp: Bitmap, fx: Int, fy: Int, tx: Int, ty: Int,
                        alphaOnly: Boolean, skip: android.graphics.Rect?): ChStats? {
        val x0 = fx.coerceAtLeast(0); val y0 = fy.coerceAtLeast(0)
        val x1 = tx.coerceAtMost(bmp.width); val y1 = ty.coerceAtMost(bmp.height)
        if (x1 - x0 < 4 || y1 - y0 < 4) return null
        val stepX = max(1, (x1 - x0) / 96)
        val stepY = max(1, (y1 - y0) / 96)
        val s1 = DoubleArray(3); val s2 = DoubleArray(3); var n = 0
        var y = y0
        while (y < y1) {
            var x = x0
            while (x < x1) {
                if (skip == null || !skip.contains(x, y)) {
                    val p = bmp.getPixel(x, y)
                    if (!alphaOnly || (p ushr 24) > 128) {
                        for (ch in 0..2) {
                            val v = ((p shr (16 - ch * 8)) and 0xFF).toDouble()
                            s1[ch] += v; s2[ch] += v * v
                        }
                        n++
                    }
                }
                x += stepX
            }
            y += stepY
        }
        if (n < 20) return null
        val mean = DoubleArray(3) { s1[it] / n }
        val std = DoubleArray(3) { sqrt((s2[it] / n - mean[it] * mean[it]).coerceAtLeast(0.0)) }
        return ChStats(mean, std)
    }

    private fun autoMatchColor() {
        val c = overlay.charPlacementSafe() ?: return toast("先导入立绘")
        val bmp = overlay.charBitmap ?: return
        val frame = previewView.bitmap ?: return toast("取预览帧失败，稍后再试")
        val vw = overlay.width.toDouble().coerceAtLeast(1.0)
        val vh = overlay.height.toDouble().coerceAtLeast(1.0)
        val kx = frame.width / vw
        val ky = frame.height / vh

        val cs = charStats
            ?: statsOf(bmp, 0, 0, bmp.width, bmp.height, true, null)?.also { charStats = it }
            ?: return toast("立绘统计失败")

        val w = c.h * bmp.width / bmp.height
        val h = c.h
        val cx = c.u; val cy = c.v
        val padX = (w * 0.45).toInt() + 8
        val padY = (h * 0.15).toInt() + 8
        val inner = android.graphics.Rect(
            ((cx - w / 2) * kx).toInt(), ((cy - h / 2) * ky).toInt(),
            ((cx + w / 2) * kx).toInt(), ((cy + h / 2) * ky).toInt())
        val bs = statsOf(frame,
            ((cx - w / 2 - padX) * kx).toInt(), ((cy - h / 2 - padY) * ky).toInt(),
            ((cx + w / 2 + padX) * kx).toInt(), ((cy + h / 2 + padY) * ky).toInt(),
            false, inner) ?: return toast("角色周围取不到背景")

        val g = FloatArray(6)
        for (i in 0..2) {
            val gain = if (cs.std[i] < 1.0) 1.0
                       else (bs.std[i] / cs.std[i]).coerceIn(0.55, 1.8)
            g[i] = gain.toFloat()
            g[3 + i] = (bs.mean[i] - cs.mean[i] * gain).coerceIn(-100.0, 100.0).toFloat()
        }
        overlay.charGain = g
        overlay.syncPainter()
        toast("已对齐背景　增益 %.2f / %.2f / %.2f".format(g[0], g[1], g[2]))
    }

    // ── 参数持久化：下次打开还记得上次调好的融合参数 ──────────────
    private val prefs by lazy { getSharedPreferences("arcview", Context.MODE_PRIVATE) }

    private fun saveState() {
        prefs.edit()
            .putFloat("bright", overlay.charBrightness.toFloat())
            .putFloat("sat", overlay.charSaturation.toFloat())
            .putFloat("feather", overlay.charFeather.toFloat())
            .putFloat("defringe", overlay.charDefringe.toFloat())
            .putFloat("rim", overlay.charRimAlpha.toFloat())
            .putFloat("noise", overlay.charNoise.toFloat())
            .putFloat("shadowShift", overlay.shadowShift.toFloat())
            .putFloat("charRot", overlay.charExtraRot.toFloat())
            .putBoolean("shadow", overlay.charShadow)
            .putBoolean("flip", overlay.charFlipX)
            .putString("shot", currentShot)
            .putBoolean("free", charFree)
            .putInt("edge", edgeBar)
            .apply()
    }

    private fun loadState() {
        overlay.charBrightness = prefs.getFloat("bright", 1f).toDouble()
        overlay.charSaturation = prefs.getFloat("sat", 1f).toDouble()
        overlay.charFeather = prefs.getFloat("feather", 0.10f).toDouble()
        overlay.charDefringe = prefs.getFloat("defringe", 0.35f).toDouble()
        overlay.charRimAlpha = prefs.getFloat("rim", 0f).toDouble()
        overlay.charNoise = prefs.getFloat("noise", 0f).toDouble()
        overlay.shadowShift = prefs.getFloat("shadowShift", 0f).toDouble()
        overlay.charShadow = prefs.getBoolean("shadow", true)
        if (prefs.getBoolean("flip", false)) overlay.toggleFlip()
        overlay.applyCharRotation(prefs.getFloat("charRot", 0f).toDouble())
        rowCharBright.set(overlay.charBrightness * 100)
        rowCharSat.set(overlay.charSaturation * 100)
        rowCharFeather.set(overlay.charFeather * 100)
        rowDefringe.set(overlay.charDefringe * 100)
        rowRim.set(overlay.charRimAlpha * 100)
        rowNoise.set(overlay.charNoise * 100)
        rowShadowShift.set(overlay.shadowShift * 100)
        rowCharRot.set(overlay.charExtraRot)
        // 吸附状态得等 setCharFit 把 charFree 铺好之后再套，否则会被 applyCharFreeMode 清掉
        overlay.syncPainter()
    }

    /** 布局建完之后调。loadState 早于 UI 构建，框条只能在这儿恢复 */
    private fun restoreEdgeBar() {
        val e = prefs.getInt("edge", 0)
        if (e in 1..4 && charFree) {
            edgeBar = e
            overlay.setEdgeBar(e)
            paintEdgeButtons()
        }
    }

    private fun resetFusion() {
        overlay.charBrightness = 1.0
        overlay.charSaturation = 1.0
        overlay.charFeather = 0.10
        overlay.charDefringe = 0.35
        overlay.charRimAlpha = 0.0
        overlay.charNoise = 0.0
        overlay.shadowShift = 0.0
        overlay.charGain = floatArrayOf(1f, 1f, 1f, 0f, 0f, 0f)
        overlay.charShadow = true
        overlay.applyCharRotation(0.0)
        rowCharBright.set(100.0); rowCharSat.set(100.0); rowCharFeather.set(10.0)
        rowDefringe.set(35.0); rowRim.set(0.0); rowNoise.set(0.0)
        rowShadowShift.set(0.0); rowCharRot.set(0.0)
        overlay.syncPainter()
        saveState()
        toast("融合参数已重置")
    }

    /** 诊断和姿态检测收进这里，不占主界面 */
    private fun openDevMenu() {
        android.app.AlertDialog.Builder(this)
            .setTitle("开发者")
            .setItems(arrayOf("诊断面板", "姿态检测（生成报告）")) { _, which ->
                when (which) {
                    0 -> toggleDiag()
                    1 -> startTest()
                }
            }
            .setNegativeButton("关闭", null)
            .show()
    }

    /**
     * 导出遮罩：白色 = 角色占的地方，黑色 = 背景。
     * 下游在 ComfyUI 里做 inpainting 直接吃这张，不用再手动框。
     */
    private fun exportMask() {
        val c = overlay.charPlacementSafe() ?: return toast("先导入立绘")
        val frame = previewView.bitmap ?: return toast("取预览帧失败，稍后再试")
        val m = overlay.renderMask(frame.width, frame.height) ?: return toast("生成遮罩失败")
        val bmp = m.copy(Bitmap.Config.ARGB_8888, false)
        // 存成功才报成功。saveFile 内部失败时自己会 toast。
        if (saveBitmap(bmp, "mask_${System.currentTimeMillis()}.png", "image/png"))
            toast("遮罩已存到 Pictures/ArcView")
    }

    /**
     * 去纯色底。素材是白底/黑底的话，贴上去就是一个方块，
     * 这里按四角颜色抠掉。四角颜色不一致就说明不是纯色底，不动。
     */
    private fun keyOutBackground() {
        val b = overlay.charBitmap ?: return toast("先导入立绘")
        val out = CharFx.keyOutBackground(b, 46, 34)
            ?: return toast("四角颜色不一致，不像纯色底，没动它")
        invalidateCharStats()
        overlay.replaceCharacter(out)
        toast("已去底。位置大小不变")
    }

    private fun hasTransparency(bmp: Bitmap): Boolean {
        var y = 0
        while (y < bmp.height) {
            var x = 0
            while (x < bmp.width) {
                if (bmp.getPixel(x, y) ushr 24 < 250) return true
                x += max(1, bmp.width / 64)
            }
            y += max(1, bmp.height / 64)
        }
        return false
    }

    // ── 模式切换 ──────────────────────────────────────────────────
    /** 只剩 2D 了。3D 人体尺子那套删掉 —— 用不上，还占着一个模式位。 */
    private fun setMode(is3d: Boolean) {
        mode3d = false
        overlay.mode3d = false
        overlay.showFigure = false
        box2d.visibility = View.VISIBLE
        overlay.invalidate()
        refreshStatus()
    }

    /**
     * 贴地 / 自由。半身立绘必须走自由 —— 它没有脚底，看不出远近，
     * 硬套透视会把大小锁死，而实拍参照里半身立绘普遍比真人大小两三倍。
     */
    private fun setCharFit(free: Boolean) {
        charFree = free
        overlay.applyCharFreeMode(free)
        if (!free) edgeBar = 0
        paint(btnFitFree, free)
        paint(btnFitGround, !free)
        boxFree.visibility = if (free) View.VISIBLE else View.GONE
        rowCharBottom.view.visibility = if (free) View.GONE else View.VISIBLE
        paintEdgeButtons()
        if (free) rowCharSize.set(overlay.charSizeRatio() * 100.0)
        refreshStatus()
    }

    /** 框条。吸上去之后立绘就锁在这条边上，只能沿线滑、只能改大小 */
    private fun setEdgeBar(bar: Int) {
        if (!charFree) { toast("先切到「自由 · 半身立绘」"); return }
        edgeBar = bar
        overlay.setEdgeBar(bar)
        paintEdgeButtons()
        rowCharSize.set(overlay.charSizeRatio() * 100.0)
        refreshStatus()
    }

    private fun paintEdgeButtons() {
        edgeButtons.forEachIndexed { i, b -> paint(b, EDGES[i].second == edgeBar) }
    }

    /**
     * 景别。名字 → 覆盖了人体的哪一段（从下边缘到头顶）。
     * 半身立绘没有地面参照，只有换算回全身，才看得出尺度是不是大得离谱。
     */
    private val SHOTS = listOf(
        "全身" to 1.00,
        "膝上" to 0.72,
        "腰上" to 0.47,
        "胸上" to 0.28,
        "头肩" to 0.20,
    )
    private val shotButtons = mutableListOf<Button>()
    private lateinit var scaleRead: TextView
    private var currentShot = "全身"

    private fun setShot(name: String) {
        currentShot = name
        overlay.shotCover = SHOTS.firstOrNull { it.first == name }?.second ?: 1.0
        shotButtons.forEachIndexed { i, b -> paint(b, SHOTS[i].first == name) }
        refreshStatus()
    }

    /**
     * 构图提醒。全是算得出来的几何量，不跑模型 ——
     * 地平线位置、俯角、三分法、角色占比，偏了就提一句。
     * 主要治「拍的时候看不出问题，回来一看就有违和感」。
     */
    private fun compositionHints(): String? {
        val p = overlay.proj
        if (p.imgW < 8 || p.imgH < 8) return null
        val h = mutableListOf<String>()

        // 地平线压正中，画面最呆
        val hv = p.imgH / 2 - p.focalPx() * tan(Math.toRadians(p.pitchDeg))
        val hr = hv / p.imgH
        if (hr in 0.42..0.58) h.add("地平线在正中，抬一点或压一点")

        if (p.pitchDeg > 40) h.add("俯角 %.0f°，人物会被压扁".format(p.pitchDeg))
        if (p.pitchDeg < -35) h.add("仰角偏大，人物会被拉长")

        overlay.charPlacementSafe()?.let { c ->
            if (p.imgW < 2 || p.imgH < 2) return@let
            val xr = c.u / p.imgW
            val near = minOf(abs(xr - 1.0/3), abs(xr - 2.0/3), abs(xr - 0.5))
            if (near > 0.11) h.add("角色挪到三分线上更稳")
            val hr2 = c.h / p.imgH
            if (hr2 > 0.92) h.add("角色快顶满画面")
            if (hr2 < 0.10) h.add("角色偏小")

            // ── 三条跟立绘落位有关的 ──────────────────────────

            // ① 脚没踩在地上：全身景别时，图片下边缘就是脚。
            //    它跑到地平线以上，等于人浮在空中。
            if (overlay.shotCover >= 0.95) {
                val cutV = c.v + c.h / 2
                val horizonV = p.imgH / 2 - p.focalPx() * tan(Math.toRadians(p.pitchDeg))
                if (cutV < horizonV - p.imgH * 0.03) h.add("脚在地平线以上，浮空了")
            }

            // ② 大小和场景不成比例：反解这个人实际多高。
            //    正常成年人在 1.2~2.2 米之间，超出就是尺度错了。
            val hp = overlay.charImpliedHeight()
            if (hp != null) {
                if (hp > 2.3) h.add("反解出 %.1f 米高，太大了".format(hp))
                else if (hp < 1.15 && overlay.shotCover >= 0.95) h.add("反解出 %.1f 米高，太小了".format(hp))
            }

            // ③ 视点对不上：立绘基本都是平视画的（画师的机位在人物眼高）。
            //    场景相机要是压得很低或举得很高，人物的脸和身体朝向就跟场景拧着。
            if (overlay.shotCover >= 0.95) {
                val fullH = (hp ?: p.camHeight) / overlay.shotCover.coerceAtLeast(0.2)
                val eyeH = fullH * 0.93
                val diff = p.camHeight - eyeH
                if (diff > 0.55) h.add("相机比人物眼高 %.1f 米，俯角下立绘是平视画的".format(diff))
                else if (diff < -0.55) h.add("相机比人物眼高 %.1f 米，仰视下立绘是平视画的".format(-diff))
            }
        }
        return if (h.isEmpty()) null else h.joinToString("　·　")
    }

    /** 把图高换算回全身，给个尺度参照 */
    private fun refreshScaleRead() {
        if (!charFree) { scaleRead.text = ""; return }
        val r = overlay.impliedFullBody() ?: run { scaleRead.text = ""; return }
        val pct = r.second * 100.0
        val note = when {
            pct > 220 -> "　前景特写"
            pct > 120 -> "　人物伸出画面外"
            pct > 55  -> "　近景"
            pct > 25  -> "　中景"
            else      -> "　远景"
        }
        scaleRead.text = "补全成全身 ≈ 画面高的 %.0f%%%s".format(pct, note)
    }

    private var currentPose = "站"

    private fun setPose(name: String) {
        currentPose = name
        overlay.setPose(name)
        poseButtons.forEachIndexed { i, b -> paint(b, Poses.ALL[i].first == name) }
        refreshStatus()
    }

    private fun paint(b: Button, on: Boolean) {
        b.background = if (on) round("#2B6E8F", 11f, 1f, "#4FC3F7")
                       else round("#1E262D", 11f)
        b.setTextColor(Color.parseColor(if (on) "#FFFFFF" else "#C3CFD9"))
    }


    // ── 界面搭建（纯代码，不依赖 layout XML）───────────────────────
    private fun buildUi() {
        val root = FrameLayout(this).apply { setBackgroundColor(Color.parseColor("#0A0E11")) }

        val column = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }

        // 预览区：外层 FrameLayout 居中，内层锁死宽高比
        val wrap = FrameLayout(this)
        aspectBox = AspectFrameLayout(this)
        previewView = PreviewView(this).apply {
            scaleType = PreviewView.ScaleType.FIT_CENTER   // 不能裁切，裁了叠加就整体偏移
            implementationMode = PreviewView.ImplementationMode.COMPATIBLE
        }
        overlay = OverlayView(this)
        aspectBox.addView(previewView, FrameLayout.LayoutParams(-1, -1))
        aspectBox.addView(overlay, FrameLayout.LayoutParams(-1, -1))
        wrap.addView(aspectBox, FrameLayout.LayoutParams(-2, -2, Gravity.CENTER))

        // 抽屉内容。状态条和模式切换搬到底栏去了，这里只剩参数
        val panel = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(0, dp(8), 0, 0)
        }

        // 滑条只覆盖手持范围 0.3~3m。之前写成 0.3~30，常用段只占滑条 8%，
        // 根本拖不准（实测把 1.6m 拖成了 2.65m）。站高处往下拍用旁边的框填。
        rowCamH = SliderRow("相机高度 h（米）", 0.3, 3.0, 1.6) { v -> setCamHeight(v, false) }
        panel.addView(rowCamH.view)

        val camRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }
        camRow.addView(TextView(this).apply {
            setTextColor(Color.parseColor("#6E7A85")); textSize = 10.5f
            text = "站高处（天桥/台阶/楼上）直接填："
        }, LinearLayout.LayoutParams(0, -2, 1f))
        camNum = EditText(this).apply {
            inputType = android.text.InputType.TYPE_CLASS_NUMBER or
                        android.text.InputType.TYPE_NUMBER_FLAG_DECIMAL
            setText("1.60"); setTextColor(Color.parseColor("#E8EEF3")); textSize = 12f
            setBackgroundColor(Color.parseColor("#222A31"))
            setPadding(dp(8), dp(5), dp(8), dp(5))
            setSingleLine(true)
        }
        camNum.addTextChangedListener(object : android.text.TextWatcher {
            override fun afterTextChanged(s: android.text.Editable?) {
                if (syncingCam) return
                val v = s?.toString()?.toDoubleOrNull() ?: return
                if (v in 0.2..60.0) setCamHeight(v, true)
            }
            override fun beforeTextChanged(s: CharSequence?, a: Int, b: Int, c: Int) {}
            override fun onTextChanged(s: CharSequence?, a: Int, b: Int, c: Int) {}
        })
        camRow.addView(camNum, LinearLayout.LayoutParams(dp(74), -2).apply { marginStart = dp(6) })
        panel.addView(camRow)

        rowSubjH = SliderRow("人物身高（米）", 1.10, 2.10, 1.65) { v ->
            overlay.applySubjectHeight(v); refreshStatus() }
        panel.addView(rowSubjH.view)

        rowDist = SliderRow("距离（米）", 0.5, 30.0, 4.0) { v ->
            overlay.subjectDist = v; overlay.syncPainter(); refreshStatus() }
        panel.addView(rowDist.view)

        rowLat = SliderRow("横向（米）", -10.0, 10.0, 0.0) { v ->
            overlay.subjectX = v; overlay.syncPainter(); refreshStatus() }
        panel.addView(rowLat.view)

        // ── 2D 专属区 ────────────────────────────────────────────
        box2d = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }

        val importRow = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        importRow.addView(btn("导入角色图") { pickImage.launch("image/*") }, lp())
        importRow.addView(btn("清除") {
            invalidateCharStats()
            overlay.setCharacter(null); setMode(true); toast("已清除立绘")
        }, lp())
        importRow.addView(btn("对齐到人体") {
            overlay.alignCharToSubject(); refreshStatus()
        }, lp())
        box2d.addView(importRow)

        val bgRow = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        bgRow.addView(btn("去纯色底") { keyOutBackground() }, lp())
        bgRow.addView(btn("检查透明底") {
            val b = overlay.charBitmap
            if (b == null) toast("先导入立绘")
            else toast(if (overlay.hasTransparency()) "有透明通道 ✓"
                       else "不透明，贴上去会是个方块。用「去纯色底」")
        }, lp())
        box2d.addView(bgRow)

        // 全身立绘 / 半身立绘 走两条不同的路
        val fitRow = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        btnFitGround = btn("贴地 · 全身立绘") { setCharFit(false) }
        btnFitFree = btn("自由 · 半身立绘") { setCharFit(true) }
        fitRow.addView(btnFitGround, lp())
        fitRow.addView(btnFitFree, lp())
        box2d.addView(fitRow)

        // ── 半身专属区：切口 + 景别 + 尺度参照 ──────────────────
        boxFree = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }

        boxFree.addView(TextView(this).apply {
            setTextColor(Color.parseColor("#9AA7B2")); textSize = 11f
            text = "吸到哪条边（钉住就不能乱跑了，只能沿线滑 + 改大小）"
        })
        var edgeRow = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        EDGES.forEachIndexed { i, (name, bar) ->
            if (i > 0 && i % 3 == 0) {
                boxFree.addView(edgeRow)
                edgeRow = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
            }
            val b = btn(name) { setEdgeBar(bar) }
            edgeRow.addView(b, lp())
            edgeButtons.add(b)
        }
        boxFree.addView(edgeRow)

        boxFree.addView(TextView(this).apply {
            setTextColor(Color.parseColor("#9AA7B2")); textSize = 11f
            text = "景别（这张图从哪切）"
        })
        var shotRow = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        SHOTS.forEachIndexed { i, (name, _) ->
            if (i > 0 && i % 3 == 0) {
                boxFree.addView(shotRow)
                shotRow = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
            }
            val b = btn(name) { setShot(name) }
            shotRow.addView(b, lp())
            shotButtons.add(b)
        }
        boxFree.addView(shotRow)

        rowCharSize = SliderRow("立绘大小（占画面高 %）", 5.0, 300.0, 40.0, 0) { v ->
            overlay.applyCharSize(v / 100.0); refreshStatus() }
        boxFree.addView(rowCharSize.view)

        scaleRead = TextView(this).apply {
            setTextColor(Color.parseColor("#6E7A85")); textSize = 10.5f
            setPadding(dp(2), dp(2), dp(2), dp(4))
        }
        boxFree.addView(scaleRead)
        box2d.addView(boxFree)

        rowCharBottom = SliderRow("立绘下沿位置（0=脚 50=腰 75=胸）", 0.0, 90.0, 0.0, 0) { v ->
            overlay.applyCharBottomRatio(v / 100.0); refreshStatus() }
        box2d.addView(rowCharBottom.view)

        rowCharFill = SliderRow("图内人物占比（%）", 20.0, 150.0, 100.0, 0) { v ->
            overlay.applyCharFill(v / 100.0); refreshStatus() }
        box2d.addView(rowCharFill.view)

        // 融合：不靠 AI，纯画面处理，但对"像不像真的"影响最大
        box2d.addView(TextView(this).apply {
            setTextColor(Color.parseColor("#5D8BA8")); textSize = 11f
            setPadding(0, dp(8), 0, dp(2))
            text = "融合"
        })
        rowCharBright = SliderRow("亮度（%）", 40.0, 160.0, 100.0, 0) { v ->
            overlay.charBrightness = v / 100.0; overlay.syncPainter(); refreshStatus() }
        box2d.addView(rowCharBright.view)

        rowCharSat = SliderRow("饱和度（%）", 0.0, 200.0, 100.0, 0) { v ->
            overlay.charSaturation = v / 100.0; overlay.syncPainter(); refreshStatus() }
        box2d.addView(rowCharSat.view)

        rowCharFeather = SliderRow("下沿柔化（占图高 %）", 0.0, 50.0, 10.0, 0) { v ->
            overlay.charFeather = v / 100.0; overlay.syncPainter(); refreshStatus() }
        box2d.addView(rowCharFeather.view)

        val shRow = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        shRow.addView(btn("接触阴影") {
            overlay.charShadow = !overlay.charShadow
            overlay.syncPainter()
            toast(if (overlay.charShadow) "接触阴影：开" else "接触阴影：关")
        }, lp())
        shRow.addView(btn("自动配色") { autoMatchColor() }, lp())
        shRow.addView(btn("还原配色") {
            overlay.charGain = floatArrayOf(1f, 1f, 1f, 0f, 0f, 0f)
            overlay.syncPainter(); toast("已还原")
        }, lp())
        box2d.addView(shRow)

        rowRim = SliderRow("轮廓光（%）", 0.0, 100.0, 0.0, 0) { v ->
            overlay.charRimAlpha = v / 100.0; overlay.syncPainter() }
        box2d.addView(rowRim.view)

        rowNoise = SliderRow("噪点（%）", 0.0, 100.0, 0.0, 0) { v ->
            overlay.charNoise = v / 100.0; overlay.syncPainter() }
        box2d.addView(rowNoise.view)

        rowDefringe = SliderRow("去边缘光晕（%）", 0.0, 90.0, 35.0, 0) { v ->
            overlay.charDefringe = v / 100.0; overlay.syncPainter() }
        box2d.addView(rowDefringe.view)

        rowShadowShift = SliderRow("阴影偏移（光从哪边来）", -100.0, 100.0, 0.0, 0) { v ->
            overlay.shadowShift = v / 100.0; overlay.syncPainter(); saveState() }
        box2d.addView(rowShadowShift.view)

        rowCharRot = SliderRow("立绘倾斜（度）", -30.0, 30.0, 0.0, 1) { v ->
            overlay.applyCharRotation(v); saveState() }
        box2d.addView(rowCharRot.view)

        val toolRow = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        toolRow.addView(btn("左右翻转") { overlay.toggleFlip(); saveState() }, lp())
        toolRow.addView(btn("三分法") {
            overlay.showThirds = !overlay.showThirds
            overlay.invalidate()
            toast(if (overlay.showThirds) "三分法辅助线：开" else "三分法辅助线：关")
        }, lp())
        box2d.addView(toolRow)

        val toolRow2 = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        toolRow2.addView(btn("导出遮罩") { exportMask() }, lp())
        toolRow2.addView(btn("重置融合") { resetFusion() }, lp())
        box2d.addView(toolRow2)

        hint2d = TextView(this).apply {
            setTextColor(Color.parseColor("#8B98A3")); textSize = 10.5f
            setPadding(dp(2), dp(4), dp(2), dp(4))
            text = "透明底 PNG 立绘。\n" +
                   "贴地：拖到哪就站到哪，大小按距离自动算。全身立绘用这个。\n" +
                   "自由：拖动挪位置、捏合改大小，不受地面约束。半身立绘用这个。"
        }
        box2d.addView(hint2d)
        panel.addView(box2d)

        // ── 显示 ────────────────────────────────────────────────
        val row1 = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        row1.addView(btn("网格") {
            overlay.showGrid = !overlay.showGrid; overlay.invalidate()
        }, lp())
        row1.addView(btn("地平线") {
            overlay.showHorizon = !overlay.showHorizon; overlay.invalidate()
        }, lp())
        row1.addView(btn("重置距离") {
            overlay.subjectDist = 4.0; overlay.subjectX = 0.0
            rowDist.set(4.0); rowLat.set(0.0)
            overlay.syncPainter(); refreshStatus()
        }, lp())
        panel.addView(row1)

        val row2 = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        row2.addView(btn("开发者") { openDevMenu() }, lp())
        panel.addView(row2)

        // ── 底栏 ────────────────────────────────────────────────
        // 预览占满，控制项浮在底部。参数收进可折叠抽屉，不展开时预览能大一半。
        val bottom = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            background = round("#F20D1216", 22f, 0.7f, "#26FFFFFF")
            setPadding(dp(14), dp(10), dp(14), dp(12))
        }

        statusText = TextView(this).apply {
            setTextColor(Color.parseColor("#8FB8CE")); textSize = 11f
            setPadding(dp(2), 0, dp(2), dp(8))
        }
        bottom.addView(statusText)

        val actRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }
        val gridBtn = chip("网格") {}
        gridBtn.setOnClickListener {
            overlay.showGrid = !overlay.showGrid
            overlay.invalidate()
            paint(gridBtn, overlay.showGrid)
        }
        paint(gridBtn, true)
        actRow.addView(gridBtn, LinearLayout.LayoutParams(0, dp(46), 1f))

        // 快门：白圆 + 外圈
        val shutter = Button(this).apply {
            text = ""
            val d = dp(5)
            background = android.graphics.drawable.LayerDrawable(arrayOf(
                round("#59FFFFFF", 40f).apply { shape = android.graphics.drawable.GradientDrawable.OVAL },
                round("#FFFFFF", 34f).apply { shape = android.graphics.drawable.GradientDrawable.OVAL }
            )).apply { setLayerInset(1, d, d, d, d) }
            setOnClickListener { takeShot() }
        }
        val gearBtn = chip("参数 ▲") { toggleDrawer(gearBtnRef!!) }
        gearBtnRef = gearBtn
        actRow.addView(gearBtn, LinearLayout.LayoutParams(0, dp(46), 1f))
        bottom.addView(actRow, LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(10) })

        drawer = ScrollView(this).apply {
            visibility = View.GONE
            isFillViewport = true
        }
        drawer!!.addView(panel, ViewGroup.LayoutParams(-1, -2))
        bottom.addView(drawer, LinearLayout.LayoutParams(-1, -2))

        // 控制条放顶部 —— 调滑条时手指在画面上方，不挡下面摆角色的地方
        column.addView(bottom, LinearLayout.LayoutParams(-1, -2))
        column.addView(wrap, LinearLayout.LayoutParams(-1, 0, 1f))

        val shutterRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER
            setPadding(0, dp(10), 0, dp(14))
        }
        shutterRow.addView(shutter, LinearLayout.LayoutParams(dp(70), dp(70)))
        column.addView(shutterRow, LinearLayout.LayoutParams(-1, -2))

        root.addView(column, FrameLayout.LayoutParams(-1, -1))

        // 诊断面板（盖在最上层）
        diagScroll = ScrollView(this).apply {
            setBackgroundColor(Color.parseColor("#EE0B0F12"))
            visibility = View.GONE
            isFillViewport = true
        }
        diagText = TextView(this).apply {
            setTextColor(Color.parseColor("#B8C4CE"))
            textSize = 11.5f
            setPadding(dp(14), dp(28), dp(14), dp(14))
            typeface = android.graphics.Typeface.MONOSPACE
        }
        diagScroll.addView(diagText, ViewGroup.LayoutParams(-1, -2))
        root.addView(diagScroll, FrameLayout.LayoutParams(-1, -1))

        // ── 检测模式面板 ──────────────────────────────────────────
        testScroll = ScrollView(this).apply {
            setBackgroundColor(Color.parseColor("#F20B0F12"))
            visibility = View.GONE
            isFillViewport = true
        }
        val testBox = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(14), dp(26), dp(14), dp(20))
        }
        testTitle = TextView(this).apply {
            setTextColor(Color.parseColor("#7DFCFF")); textSize = 14f
            setPadding(0, 0, 0, dp(4))
        }
        testBox.addView(testTitle)
        testBox.addView(TextView(this).apply {
            setTextColor(Color.parseColor("#8B98A3")); textSize = 11f
            setPadding(0, 0, 0, dp(12))
            text = "按顺序做一遍，每做完一个点一次「记录」。全部记完按最下面的结束键，会生成一份 md。"
        })

        DiagRecorder.STEPS.forEachIndexed { i, step ->
            val row = LinearLayout(this).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
                setPadding(0, dp(4), 0, dp(4))
            }
            val tv = TextView(this).apply {
                setTextColor(Color.parseColor("#DFE4E8")); textSize = 12.5f
                text = "${i + 1}. $step"
            }
            val st = TextView(this).apply {
                setTextColor(Color.parseColor("#6E7A85")); textSize = 11f
                text = ""
                setPadding(dp(8), 0, 0, 0)
            }
            val b = btn("记录") { markStep(i) }
            row.addView(tv, LinearLayout.LayoutParams(0, -2, 1f))
            row.addView(st, LinearLayout.LayoutParams(dp(78), -2))
            row.addView(b, LinearLayout.LayoutParams(dp(66), dp(38)))
            testBox.addView(row)
            testButtons.add(b)
            testStatus.add(st)
        }

        val endBtn = btn("结束检测并生成报告") { endTest() }
        endBtn.setTextColor(Color.WHITE)
        endBtn.setBackgroundColor(Color.parseColor("#C2402F"))
        testBox.addView(endBtn, LinearLayout.LayoutParams(-1, dp(48)).apply { topMargin = dp(18) })

        testBox.addView(btn("取消（不生成报告）") { cancelTest() },
            LinearLayout.LayoutParams(-1, dp(40)).apply { topMargin = dp(6) })

        testScroll.addView(testBox, ViewGroup.LayoutParams(-1, -2))
        root.addView(testScroll, FrameLayout.LayoutParams(-1, -1))

        setContentView(root)
        overlay.onChanged = { refreshStatus() }
        // 兜底切到自由模式时把面板同步过来，否则 UI 还写着「贴地·全身立绘」，
        // 自由模式专属的滑条却藏着，看着像坏了。
        overlay.onFreeModeForced = {
            if (::btnFitFree.isInitialized && !charFree) setCharFit(true)
        }
        setMode(false)
        setCharFit(prefs.getBoolean("free", true))
        setShot(prefs.getString("shot", "全身") ?: "全身")
        loadState()                   // 上次调好的融合参数接着用
        restoreEdgeBar()
    }

    // ── 检测模式 ──────────────────────────────────────────────────
    private fun startTest() {
        val dm = resources.displayMetrics
        rec.deviceModel = Build.MODEL
        rec.deviceBrand = Build.BRAND
        rec.androidRel = Build.VERSION.RELEASE
        rec.sdkInt = Build.VERSION.SDK_INT
        rec.abis = Build.SUPPORTED_ABIS.joinToString(", ")
        rec.screenW = dm.widthPixels
        rec.screenH = dm.heightPixels
        rec.screenDensity = dm.density
        rec.focalMm = focalMm
        rec.sensorLongMm = sensorLongMm
        rec.sensorShortMm = sensorShortMm
        rec.activeW = activeW
        rec.activeH = activeH
        rec.previewW = previewW
        rec.previewH = previewH
        rec.viewW = overlay.proj.imgW.toInt()
        rec.viewH = overlay.proj.imgH.toInt()
        rec.intrinsicsOk = intrinsicsOk
        rec.focalPxExact = overlay.proj.focalPxExact
        rec.focalPxUsed = overlay.proj.focalPx()
        rec.captureW = 0
        rec.captureH = 0
        rec.sensorTypeName = sensorTypeName
        rec.sensorVendor = rotSensor?.vendor ?: ""
        rec.sensorResolution = rotSensor?.resolution ?: 0f
        rec.sensorMaxRange = rotSensor?.maximumRange ?: 0f
        rec.appVersion = try {
            packageManager.getPackageInfo(packageName, 0).versionName ?: "?"
        } catch (e: Exception) { "?" }
        rec.start()

        testing = true
        testStatus.forEach { it.text = "" }
        testButtons.forEach { it.isEnabled = true; paint(it, false) }
        testScroll.visibility = View.VISIBLE
        testScroll.bringToFront()
        ui.post(testTick)
    }

    private fun markStep(i: Int) {
        if (!testing) return
        rec.mark(DiagRecorder.STEPS[i], orient.pitchDeg, orient.rollDeg, orient.raw, orient.matrix)
        testStatus[i].text = "p%.0f r%.0f".format(orient.pitchDeg, orient.rollDeg)
        testButtons[i].isEnabled = false
        paint(testButtons[i], true)
        testButtons[i].text = "✓"
    }

    private fun endTest() {
        if (!testing) return
        testing = false
        ui.removeCallbacks(testTick)
        rec.stop()
        val md = rec.buildReport(buildDiag())
        val name = "检测报告_${System.currentTimeMillis()}.md"
        val saved = saveMarkdown(md, name)
        testScroll.visibility = View.GONE
        if (saved) toast("报告已存到 Download/ArcView/$name")
    }

    private fun cancelTest() {
        testing = false
        ui.removeCallbacks(testTick)
        rec.stop()
        testScroll.visibility = View.GONE
    }

    private val testTick = object : Runnable {
        override fun run() {
            if (!testing) return
            val sec = (System.currentTimeMillis() - rec.startedAt) / 1000
            testTitle.text = "检测中　%02d:%02d　已采样 %d 次".format(sec / 60, sec % 60, rec.samples)
            ui.postDelayed(this, 500)
        }
    }

    private fun dp(v: Int) = (v * resources.displayMetrics.density).toInt()
    private fun lp() = LinearLayout.LayoutParams(0, dp(38), 1f).apply { marginEnd = dp(5) }
    private fun chipLp() = LinearLayout.LayoutParams(0, dp(46), 1f).apply { marginEnd = dp(8) }

    /** 圆角背景。fill 是 "#AARRGGBB" */
    private fun round(fill: String, radius: Float, strokeW: Float = 0f, stroke: String = "#00000000")
        : android.graphics.drawable.GradientDrawable =
        android.graphics.drawable.GradientDrawable().apply {
            setColor(Color.parseColor(fill))
            cornerRadius = radius * resources.displayMetrics.density
            if (strokeW > 0f) setStroke((strokeW * resources.displayMetrics.density).toInt(),
                                        Color.parseColor(stroke))
        }

    private var gearBtnRef: Button? = null
    private var drawer: ScrollView? = null
    private var drawerOpen = false

    private fun toggleDrawer(gear: Button) {
        drawerOpen = !drawerOpen
        drawer?.visibility = if (drawerOpen) View.VISIBLE else View.GONE
        gear.text = if (drawerOpen) "参数 ▼" else "参数 ▲"
        // 展开之后才量得出高度，这时候才该限高
        if (drawerOpen) drawer?.post { adjustPanelHeight() }
    }

    /** 圆角药丸按钮。选中态由 paint() 上色 */
    private fun chip(text: String, onClick: () -> Unit): Button =
        Button(this).apply {
            this.text = text; textSize = 13f; isAllCaps = false
            stateListAnimator = null
            background = round("#1E262D", 12f)
            setTextColor(Color.parseColor("#C3CFD9"))
            setPadding(0, 0, 0, 0)
            setOnClickListener { onClick() }
        }

    /** 旧样式按钮，抽屉内还在用 */
    private fun btn(text: String, onClick: () -> Unit): Button =
        Button(this).apply {
            setText(text); textSize = 12f; isAllCaps = false
            stateListAnimator = null
            background = round("#1E262D", 10f)
            setTextColor(Color.parseColor("#C3CFD9"))
            setPadding(0, 0, 0, 0)
            setOnClickListener { onClick() }
        }

    /**
     * 一根滑条。内部用 0..1000 的整数线性映射到 [lo, hi]。
     * set() 是程序化赋值，会更新显示但**不**触发 onSet，避免和外部状态打架。
     */
    private inner class SliderRow(
        private val label: String, private val lo: Double, private val hi: Double,
        init: Double, private val dec: Int = 2, private val onSet: (Double) -> Unit
    ) {
        val view = LinearLayout(this@MainActivity).apply { orientation = LinearLayout.VERTICAL }
        private val tv = TextView(this@MainActivity).apply {
            setTextColor(Color.parseColor("#9AA7B2")); textSize = 11f
        }
        private val sb = SeekBar(this@MainActivity).apply { max = 1000 }
        private var silent = false

        init {
            tv.text = fmt(init)
            sb.progress = toProg(init)
            sb.setOnSeekBarChangeListener(object : SeekBar.OnSeekBarChangeListener {
                override fun onProgressChanged(s: SeekBar?, p: Int, fromUser: Boolean) {
                    val v = toVal(p)
                    tv.text = fmt(v)
                    if (!silent) onSet(v)
                }
                override fun onStartTrackingTouch(s: SeekBar?) {}
                override fun onStopTrackingTouch(s: SeekBar?) {}
            })
            view.addView(tv); view.addView(sb)
        }

        private fun toVal(p: Int) = lo + (hi - lo) * (p / 1000.0)
        private fun toProg(v: Double) =
            (((v - lo) / (hi - lo)) * 1000).toInt().coerceIn(0, 1000)
        private fun fmt(v: Double) = String.format("%s：%.${dec}f", label, v)

        fun set(v: Double) {
            silent = true
            sb.progress = toProg(v)
            tv.text = fmt(v)
            silent = false
        }
    }

    private fun refreshStatus() {
        val p = overlay.proj
        val src = if (p.focalPxExact != null) "精确" else "估算"
        statusText.text = String.format(
            "f=%s(%.0fpx)  俯角 %.1f°  滚转 %.1f°  h=%.2fm  →  距离 %.2fm",
            src, p.focalPx(), p.pitchDeg, p.rollDeg, p.camHeight, overlay.subjectDist
        )
        val imp = overlay.charImpliedHeight()
        if (imp != null) {
            statusText.append(String.format("\n立绘反解身高 %.2fm", imp))
        }
        if (edgeBar != 0) {
            // 底部那条边贴住画面下沿时，立绘就"站在相机跟前、被画幅从腰上切掉"。
            // 反解身高在这时候没有意义（它根本没脚），提示一下免得被误读。
            statusText.append("\n已吸附：" + EDGES[edgeBar].first + "边（旋转已锁 0°）")
        }
        refreshScaleRead()
        val hint = compositionHints()
        if (hint != null) statusText.text = statusText.text.toString() + "\n⚠ " + hint
    }

    // ── 相机 ──────────────────────────────────────────────────────
    private fun startCamera() {
        val future = ProcessCameraProvider.getInstance(this)
        future.addListener({
            // 拿 provider 本身就可能抛（CameraX 初始化失败、无可用摄像头）。
            // 之前裸调 future.get()，抛出的 ExecutionException 在主线程没人接 → 崩。
            val provider = try {
                future.get()
            } catch (e: Exception) {
                Log.e(TAG, "相机初始化失败", e)
                toast("相机初始化失败：" + (e.cause?.message ?: e.message)); return@addListener
            }
            // 授予权限后 CameraX 冷启动要几百毫秒，用户完全可能在这个窗口里按返回键。
            // 对着已销毁的 lifecycle 绑定会抛 IllegalArgumentException，同样是主线程崩。
            if (isFinishing || isDestroyed) return@addListener
            val preview = Preview.Builder()
                .setTargetAspectRatio(AspectRatio.RATIO_4_3)
                .build()
            imageCapture = ImageCapture.Builder()
                .setTargetAspectRatio(AspectRatio.RATIO_4_3)
                .setCaptureMode(ImageCapture.CAPTURE_MODE_MINIMIZE_LATENCY)
                .build()

            preview.setSurfaceProvider(previewView.surfaceProvider)
            provider.unbindAll()
            val camera = provider.bindToLifecycle(
                this, CameraSelector.DEFAULT_BACK_CAMERA, preview, imageCapture
            )

            // 相机内参：焦距 + 传感器物理尺寸 + 有效像素阵列
            try {
                val info = Camera2CameraInfo.from(camera.cameraInfo)
                focalMm = info.getCameraCharacteristic(
                    CameraCharacteristics.LENS_INFO_AVAILABLE_FOCAL_LENGTHS)
                    ?.firstOrNull()?.toDouble() ?: 0.0
                val sz = info.getCameraCharacteristic(
                    CameraCharacteristics.SENSOR_INFO_PHYSICAL_SIZE)
                val arr = info.getCameraCharacteristic(
                    CameraCharacteristics.SENSOR_INFO_ACTIVE_ARRAY_SIZE)
                if (sz != null) {
                    sensorLongMm = max(sz.width, sz.height).toDouble()
                    sensorShortMm = min(sz.width, sz.height).toDouble()
                }
                if (arr != null) {
                    activeLongPx = max(arr.width(), arr.height())
                    activeW = arr.width(); activeH = arr.height()
                }
                intrinsicsOk = focalMm > 0 && sensorLongMm > 0
            } catch (e: Exception) {
                Log.w(TAG, "读相机内参失败", e)
                intrinsicsOk = false
            }

            previewUseCase = preview
            boundCamera = camera
            previewView.post { updatePreviewAspect(); applyIntrinsics() }
            toast("相机已就绪")
        }, ContextCompat.getMainExecutor(this))
    }

    /**
     * 预览流在屏幕上显示出来的宽高比，拿去锁容器。
     *
     * 不能拿 PreviewView 自己的宽高来算（那等于拿容器的宽高算容器，绕回来了，
     * 结果永远停在初始值）。要从预览流的分辨率 + 当前屏幕方向推。
     * 容器和预览同一比例，PreviewView 就不会 letterbox，叠加层坐标才和画面对得上。
     */
    private fun updatePreviewAspect() {
        val res = previewUseCase?.resolutionInfo?.resolution ?: return
        val cam = boundCamera ?: return
        val dispDeg = when (display?.rotation ?: Surface.ROTATION_0) {
            Surface.ROTATION_90 -> 90
            Surface.ROTATION_180 -> 180
            Surface.ROTATION_270 -> 270
            else -> 0
        }
        val rel = ((cam.cameraInfo.sensorRotationDegrees - dispDeg) % 360 + 360) % 360
        val w = if (rel % 180 == 0) res.width else res.height
        val h = if (rel % 180 == 0) res.height else res.width
        if (w <= 0 || h <= 0) return
        aspectBox.aspect = w.toFloat() / h
        previewW = w; previewH = h
        overlay.post { overlay.syncPainter() }
    }

    override fun onConfigurationChanged(newConfig: android.content.res.Configuration) {
        super.onConfigurationChanged(newConfig)
        previewUseCase?.targetRotation = display?.rotation ?: Surface.ROTATION_0
        overlay.post { updatePreviewAspect(); adjustPanelHeight() }
    }

    /** 横过来之后预览区变矮，面板不能还占六成 */
    private fun adjustPanelHeight() {
        drawer?.let {
            val land = resources.configuration.orientation ==
                       android.content.res.Configuration.ORIENTATION_LANDSCAPE
            val maxH = (resources.displayMetrics.heightPixels * (if (land) 0.42 else 0.54)).toInt()
            if (it.height > maxH) it.layoutParams = it.layoutParams.apply { height = maxH }
            else if (it.layoutParams.height > 0 && it.height < maxH)
                it.layoutParams = it.layoutParams.apply { height = -2 }
        }
    }

    private fun applyIntrinsics() {
        overlay.post {
            if (intrinsicsOk) overlay.applyCameraIntrinsics(focalMm, sensorLongMm)
            else overlay.applyCameraIntrinsics(0.0, 0.0)
            refreshStatus()
        }
    }

    // ── 传感器 ────────────────────────────────────────────────────
    override fun onResume() {
        super.onResume()
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA)
            == PackageManager.PERMISSION_GRANTED) startCamera()
        else permLauncher.launch(Manifest.permission.CAMERA)

        rotSensor = sensorMgr.getDefaultSensor(Sensor.TYPE_GAME_ROTATION_VECTOR)
            ?: sensorMgr.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR)
        sensorTypeName = when (rotSensor?.type) {
            Sensor.TYPE_GAME_ROTATION_VECTOR -> "GAME_ROTATION_VECTOR（不含磁力计）"
            Sensor.TYPE_ROTATION_VECTOR -> "ROTATION_VECTOR（含磁力计）"
            else -> "无可用旋转矢量传感器"
        }
        rotSensor?.let { sensorMgr.registerListener(this, it, SensorManager.SENSOR_DELAY_GAME) }
    }

    override fun onPause() {
        super.onPause()
        sensorMgr.unregisterListener(this)
        // 兜底存一次。loadState 会读 bright/sat/feather/defringe/rim/noise，
        // 但这几个滑条原来只有「阴影偏移 / 倾斜 / 翻转」三条路径调了 saveState ——
        // 拖完亮度直接返回键退出，下次打开就回到旧值，注释承诺的「记得上次调的」不成立。
        saveState()
    }

    override fun onSensorChanged(e: SensorEvent) {
        orient.setScreenRotation(
            if (Build.VERSION.SDK_INT >= 30) display?.rotation ?: Surface.ROTATION_0
            else @Suppress("DEPRECATION") windowManager.defaultDisplay.rotation
        )
        orient.update(e.values)
        lastSensorAt = System.currentTimeMillis()
        sensorCount++
        overlay.proj.pitchDeg = orient.pitchDeg
        overlay.proj.rollDeg = orient.rollDeg
        overlay.invalidate()
        rec.onSensor(orient.pitchDeg, orient.rollDeg)
    }

    override fun onAccuracyChanged(s: Sensor?, a: Int) {}

    // ── 诊断面板 ──────────────────────────────────────────────────
    private fun toggleDiag() {
        diagOn = !diagOn
        diagScroll.visibility = if (diagOn) View.VISIBLE else View.GONE
        if (diagOn) diagScroll.bringToFront()
    }

    private val diagTick = object : Runnable {
        override fun run() {
            if (diagOn) diagText.text = buildDiag()
            ui.postDelayed(this, 250)
        }
    }

    private fun buildDiag(): String {
        val p = overlay.proj
        val ago = if (lastSensorAt == 0L) -1 else System.currentTimeMillis() - lastSensorAt
        val live = ago in 0..800
        val fExact = if (intrinsicsOk) Projection.focalFromCamera(
            focalMm, sensorLongMm, max(previewW, previewH).toDouble().coerceAtLeast(1.0)) else 0.0
        val fovLong = if (intrinsicsOk) Math.toDegrees(2 * atan(sensorLongMm / (2 * focalMm))) else 0.0
        val fovShort = if (intrinsicsOk) Math.toDegrees(2 * atan(sensorShortMm / (2 * focalMm))) else 0.0

        val sb = StringBuilder()
        sb.append("══ 相机 ══\n")
        sb.append(String.format("焦距            %.3f mm\n", focalMm))
        sb.append(String.format("传感器物理尺寸  %.3f × %.3f mm\n", sensorLongMm, sensorShortMm))
        sb.append(String.format("有效像素阵列    %d px（长边）\n", activeLongPx))
        sb.append(String.format("预览画面        %d × %d\n", previewW, previewH))
        sb.append(String.format("长边 FOV        %.2f°\n", fovLong))
        sb.append(String.format("短边 FOV        %.2f°\n", fovShort))
        sb.append(String.format("等效 35mm       %.1f mm\n",
            if (fovLong > 0) 43.266 / (2 * tan(Math.toRadians(fovLong / 2))) else 0.0))
        sb.append("\n")
        sb.append("══ 叠加层焦距 ══\n")
        if (p.focalPxExact != null) {
            sb.append(String.format("f_px（精确）    %.1f px\n", p.focalPxExact!!))
            sb.append(String.format("核对 f_px       %.1f px  %s\n", fExact,
                if (fExact > 0 && abs(fExact - p.focalPxExact!!) < 1.0) "✓ 一致" else "✗ 不一致"))
        } else {
            sb.append("f_px（估算）    ")
            sb.append(String.format("%.1f px  ← 内参读取失败，用的等效焦距回落\n", p.focalPx()))
        }
        sb.append(String.format("画面            %.0f × %.0f px\n", p.imgW, p.imgH))
        sb.append("\n")

        sb.append("══ 传感器 ══\n")
        sb.append("类型            ").append(sensorTypeName).append("\n")
        sb.append(String.format("采样            %d 次，%s\n", sensorCount,
            if (live) String.format("%d ms 前有数据 ✓", ago) else "⚠ 超过 800ms 没有新数据"))
        sb.append(String.format("俯角 pitch      %.3f°\n", orient.pitchDeg))
        sb.append(String.format("滚转 roll       %.3f°\n", orient.rollDeg))
        sb.append(String.format("原始四元数      [%.3f, %.3f, %.3f, %.3f]\n",
            orient.raw.getOrElse(0) { 0f }, orient.raw.getOrElse(1) { 0f },
            orient.raw.getOrElse(2) { 0f }, orient.raw.getOrElse(3) { 0f }))
        sb.append("\n")

        sb.append("══ 场景 ══\n")
        sb.append(String.format("相机高度 h      %.2f m\n", p.camHeight))
        sb.append(String.format("人物            %.2f m，前方 %.2f m，横向 %.2f m\n",
            overlay.subjectHeight, overlay.subjectDist, overlay.subjectX))
        val c = overlay.charPlacementSafe()
        if (c != null) {
            sb.append(String.format("2D 立绘         中心 (%.0f, %.0f)，高 %.0f px\n", c.u, c.v, c.h))
            val g = p.unprojectGround(c.u, c.v + c.h / 2)
            if (g != null) sb.append(String.format("  底边落点     距离 %.2f m，横向 %.2f m\n", g.second, g.first))
            else sb.append("  底边落点     不在可见地面上（悬空/在地平线以上）\n")
            overlay.charImpliedHeight()?.let {
                sb.append(String.format("  反解身高      %.2f m\n", it))
            }
        }
        sb.append("\n")

        sb.append("══ 自检 ══\n")
        sb.append(check(intrinsicsOk, "相机内参读取成功（焦距 + 传感器尺寸）"))
        sb.append(check(p.focalPx() > 10, "f_px 合理（> 10px）"))
        sb.append(check(live, "传感器持续有数据"))
        sb.append(check(orient.valid, "至少收到过一次姿态"))
        sb.append(check(p.imgW > 10 && p.imgH > 10, "叠加层尺寸有效"))
        sb.append("\n")
        sb.append("══ roll 符号 ══\n")
        sb.append("歪着拿手机，青色网格应往同一边歪。\n")
        sb.append("歪向相反 = 符号要取负。\n")
        return sb.toString()
    }

    private fun check(ok: Boolean, label: String) =
        (if (ok) "  ✓  " else "  ✗  ") + label + "\n"

    // ── 拍照 ──────────────────────────────────────────────────────
    private fun takeShot() {
        val ic = imageCapture ?: return toast("相机还没就绪")
        ic.takePicture(cameraExec, object : ImageCapture.OnImageCapturedCallback() {
            override fun onCaptureSuccess(image: ImageProxy) {
                try {
                    val bytes = image.planes[0].buffer.let { b ->
                        ByteArray(b.remaining()).also { b.get(it) }
                    }
                    // 相机给的是全分辨率 JPEG。12MP = 4000×3000，ARGB_8888 单张 48MB。
                    // 而 takeShot 里同时活着 raw + bmp + composite + mask 四张，
                    // 240MB —— OutOfMemoryError 是 Error，外层 catch (Exception) 接不住，
                    // 进程直接没。遮罩本质只有 1bit 信息，更不该按全尺寸分配。
                    // 所以：解码时就按需降采样，且尺寸上限卡死。
                    val opts = BitmapFactory.Options().apply {
                        inJustDecodeBounds = true
                    }
                    BitmapFactory.decodeByteArray(bytes, 0, bytes.size, opts)
                    var sample = 1
                    while (max(opts.outWidth, opts.outHeight) / sample > WORK_MAX_DIM) sample *= 2
                    val raw = BitmapFactory.decodeByteArray(bytes, 0, bytes.size,
                        BitmapFactory.Options().apply {
                            inSampleSize = sample
                            inPreferredConfig = Bitmap.Config.ARGB_8888
                        }) ?: throw IllegalStateException("照片解码失败")
                    val rot = image.imageInfo.rotationDegrees
                    val bmp = if (rot != 0) {
                        val m = Matrix().apply { postRotate(rot.toFloat()) }
                        Bitmap.createBitmap(raw, 0, 0, raw.width, raw.height, m, true)
                            .also { if (it !== raw) raw.recycle() }
                    } else raw

                    val clean = bmp
                    val composite = drawComposite(bmp)
                    val scene = buildScene(bmp)
                    val ts = System.currentTimeMillis()

                    rec.captureW = bmp.width
                    rec.captureH = bmp.height
                    rec.shot("shot_$ts", overlay.proj.pitchDeg, overlay.proj.rollDeg,
                             overlay.proj.camHeight, overlay.subjectDist, overlay.subjectX,
                             bmp.width, bmp.height)

                    // 有立绘就顺手把遮罩也出了，下游 inpainting 直接用
                    val mask = if (overlay.charBitmap != null)
                        overlay.renderMask(composite.width, composite.height) else null

                    runOnUiThread {
                        // 逐个看返回值。之前无条件弹「已保存」，存盘失败被后发的
                        // 成功 toast 盖掉，等于静默丢文件。
                        val done = mutableListOf<String>()
                        val failed = mutableListOf<String>()
                        fun step(tag: String, ok: Boolean) =
                            (if (ok) done else failed).add(tag)

                        step("底图", saveBitmap(clean, "shot_clean_$ts.jpg"))
                        step("合成图", saveBitmap(composite, "shot_char_$ts.jpg"))
                        step("scene.json", saveText(scene, "scene_$ts.json"))
                        if (mask != null) {
                            // 不用再 copy 一份：makeMask 出来的本来就是 ARGB_8888
                            step("遮罩", saveBitmap(mask, "mask_$ts.png", "image/png"))
                        }
                        when {
                            failed.isEmpty() -> toast("已保存：" + done.joinToString(" + "))
                            done.isEmpty()   -> toast("全部保存失败，看系统存储权限")
                            else -> toast("存了 " + done.joinToString(" + ") +
                                          "；失败：" + failed.joinToString(" + "))
                        }
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "出图失败", e)
                    runOnUiThread { toast("出图失败：" + e.message) }
                } finally {
                    image.close()
                }
            }

            override fun onError(exc: ImageCaptureException) {
                runOnUiThread { toast("拍照失败：" + exc.message) }
            }
        })
    }

    /** 用同一套画法、按 JPEG 分辨率重算焦距，把网格和人形画到大图上 */
    private fun drawComposite(src: Bitmap): Bitmap {
        val out = src.copy(Bitmap.Config.ARGB_8888, true)
        val canvas = Canvas(out)
        val vp = overlay.proj

        val jp = Projection().apply {
            imgW = out.width.toDouble()
            imgH = out.height.toDouble()
            camHeight = vp.camHeight
            pitchDeg = vp.pitchDeg
            rollDeg = vp.rollDeg
            focalEq35mm = vp.focalEq35mm
            focalPxExact = if (intrinsicsOk)
                Projection.focalFromCamera(focalMm, sensorLongMm, max(out.width, out.height).toDouble())
            else null
        }

        // 立绘/人物位置是在 view 像素里定的，按图片尺寸等比换算
        val s = out.width.toDouble() / vp.imgW.coerceAtLeast(1.0)
        val c = overlay.charPlacementSafe()

        val painter = ScenePainter(
            proj = jp,
            subjectHeight = overlay.subjectHeight,
            subjectDist = overlay.subjectDist,
            subjectX = overlay.subjectX,
            pose = overlay.pose,
            charBitmap = overlay.charBitmap,
            charU = (c?.u ?: 0.0) * s,
            charV = (c?.v ?: 0.0) * s,
            charH = (c?.h ?: 0.0) * s,
            charBottomRatio = overlay.charBottomRatio,
        )
        // 全部融合参数走 OverlayView 那一份配置函数。
        // 以前这里只设了 4 个，倾斜/翻转/自动配色/廓光/噪点/边缘推掉全丢 ——
        // 用户照着预览构图，拿到的是另一个样子。
        overlay.stylePainter(painter)
        // 网格和地平线是标定工具，不进照片 —— 照片里只留内容（骨架 / 立绘）
        painter.paint(canvas, grid = false, figure = overlay.showFigure, horizonLine = false)
        return out
    }

    private fun buildScene(src: Bitmap): String {
        val vp = overlay.proj
        val jp = Projection().apply {
            imgW = src.width.toDouble(); imgH = src.height.toDouble()
            camHeight = vp.camHeight; pitchDeg = vp.pitchDeg; rollDeg = vp.rollDeg
            focalEq35mm = vp.focalEq35mm
            focalPxExact = if (intrinsicsOk)
                Projection.focalFromCamera(focalMm, sensorLongMm, max(src.width, src.height).toDouble())
            else null
        }
        val foot = jp.projectGround(overlay.subjectX, overlay.subjectDist)
        val head = jp.project(overlay.subjectX, overlay.subjectHeight - jp.camHeight, overlay.subjectDist)
        return buildString {
            append("{\n")
            append("  \"version\": 1,\n")
            append("  \"image\": { \"width\": ${src.width}, \"height\": ${src.height} },\n")
            append("  \"camera\": {\n")
            append("    \"focalPx\": ${nf(".2", jp.focalPx())},\n")
            append("    \"focalMm\": ${nf(".4", focalMm)},\n")
            append("    \"sensorLongMm\": ${nf(".4", sensorLongMm)},\n")
            append("    \"sensorShortMm\": ${nf(".4", sensorShortMm)},\n")
            append("    \"focalSource\": \"${if (jp.focalPxExact != null) "camera2" else "fallback"}\",\n")
            append("    \"pitchDeg\": ${nf(".3", vp.pitchDeg)},\n")
            append("    \"rollDeg\": ${nf(".3", vp.rollDeg)},\n")
            append("    \"heightM\": ${nf(".3", vp.camHeight)},\n")
            append("    \"pitchSource\": \"gravity\"\n")
            append("  },\n")
            append("  \"subject\": {\n")
            append("    \"heightM\": ${nf(".3", overlay.subjectHeight)},\n")
            append("    \"distanceM\": ${nf(".3", overlay.subjectDist)},\n")
            append("    \"lateralM\": ${nf(".3", overlay.subjectX)},\n")
            append("    \"footPixel\": ${foot?.let { "[${nf(".1", it.u)}, ${nf(".1", it.v)}]" } ?: "null"},\n")
            append("    \"headPixel\": ${head?.let { "[${nf(".1", it.u)}, ${nf(".1", it.v)}]" } ?: "null"}\n")
            append("  },\n")
            append("  \"ground\": { \"normal\": [0, 1, 0] }\n")
            append("}\n")
        }
    }

    // ── 存盘 ──────────────────────────────────────────────────────
    //
    // ⚠ 这一整段是 API 24–28 上最容易崩的地方，改之前先读这段注释：
    //
    //   MediaStore.Downloads 这个类是 **API 29 才有的**。在 API 24–28 上写
    //   `MediaStore.Downloads.EXTERNAL_CONTENT_URI` 不是抛 Exception，是抛
    //   NoClassDefFoundError（Error 的子类）—— catch (e: Exception) 根本接不住，
    //   而且拍照那条路径跑在 runOnUiThread 里，已经出了外层 try 的作用域 →
    //   主线程直接崩。之前 saveBitmap 做了版本分支，saveText / saveMarkdown 漏了。
    //
    //   API 24–28 走公共目录还需要 WRITE_EXTERNAL_STORAGE 运行时权限，
    //   Manifest 里声明了但一直没人申请 → mkdirs/FileOutputStream 抛 EACCES，
    //   被 catch 吞成一句 toast，文件永远出不来。
    //
    // 所以现在统一走一个出口，返回 Boolean，调用方按结果报「成功」还是「失败」。

    /** 建好的文件落在哪，给 toast 用 */
    private var lastSaveDir = ""

    /**
     * 存一个文件。true = 真写进去了。
     * 调用方**必须**看返回值再报成功 —— 之前无条件弹「已保存」，
     * 把存盘失败变成了静默失效（toast 后发者还会盖掉失败提示）。
     */
    private fun saveFile(bytes: ByteArray, name: String, mime: String, subDir: String): Boolean {
        return try {
            if (Build.VERSION.SDK_INT >= 29) {
                val collection = if (mime.startsWith("image/"))
                    MediaStore.Images.Media.EXTERNAL_CONTENT_URI
                else MediaStore.Downloads.EXTERNAL_CONTENT_URI      // 只在 29+ 求值
                val v = ContentValues().apply {
                    put(MediaStore.MediaColumns.DISPLAY_NAME, name)
                    put(MediaStore.MediaColumns.MIME_TYPE, mime)
                    put(MediaStore.MediaColumns.RELATIVE_PATH, subDir)
                }
                val uri = contentResolver.insert(collection, v)
                if (uri == null) { toast("建媒体条目失败"); return false }
                contentResolver.openOutputStream(uri)?.use { it.write(bytes) }
                    ?: run { toast("打开输出流失败"); return false }
            } else {
                if (ContextCompat.checkSelfPermission(this,
                        Manifest.permission.WRITE_EXTERNAL_STORAGE)
                    != PackageManager.PERMISSION_GRANTED) {
                    pendingSave = { saveFile(bytes, name, mime, subDir) }
                    requestLegacyStorage()
                    return false
                }
                val d = File(Environment.getExternalStoragePublicDirectory(
                    subDir.substringBefore('/')), subDir.substringAfter('/', "ArcView"))
                if (!d.exists() && !d.mkdirs()) { toast("建目录失败：" + d.path); return false }
                FileOutputStream(File(d, name)).use { it.write(bytes) }
            }
            lastSaveDir = subDir
            true
        } catch (e: Exception) {
            Log.e(TAG, "存 $name 失败", e)
            toast("存盘失败：" + e.message)
            false
        }
    }

    /** 被权限拦下来的那次保存，授予后原样重放 */
    private var pendingSave: (() -> Boolean)? = null

    private fun requestLegacyStorage() {
        if (Build.VERSION.SDK_INT >= 29) return
        requestPermissions(arrayOf(Manifest.permission.WRITE_EXTERNAL_STORAGE), REQ_LEGACY_STORAGE)
    }

    override fun onRequestPermissionsResult(
        code: Int, perms: Array<out String>, results: IntArray
    ) {
        super.onRequestPermissionsResult(code, perms, results)
        if (code != REQ_LEGACY_STORAGE) return
        val ok = results.isNotEmpty() && results.all { it == PackageManager.PERMISSION_GRANTED }
        val p = pendingSave
        pendingSave = null
        if (ok && p != null) {
            if (p() == true) toast("已保存")
        } else {
            toast("没有存储权限，存不了。到系统设置里给「AR取景器」开一下。")
        }
    }

    private fun saveBitmap(bmp: Bitmap, name: String, mime: String = "image/jpeg"): Boolean {
        val bos = java.io.ByteArrayOutputStream()
        val ok = if (mime.contains("png")) bmp.compress(Bitmap.CompressFormat.PNG, 100, bos)
                 else bmp.compress(Bitmap.CompressFormat.JPEG, 95, bos)
        if (!ok) { toast("编码失败"); return false }
        return saveFile(bos.toByteArray(), name, mime, "Pictures/ArcView")
    }

    private fun saveMarkdown(text: String, name: String): Boolean =
        saveFile(text.toByteArray(Charsets.UTF_8), name, "text/markdown", "Download/ArcView")

    private fun saveText(text: String, name: String): Boolean =
        saveFile(text.toByteArray(Charsets.UTF_8), name, "application/json", "Download/ArcView")

    private fun toast(s: String) = Toast.makeText(this, s, Toast.LENGTH_SHORT).show()

    override fun onDestroy() {
        super.onDestroy()
        cameraExec.shutdown()
        ui.removeCallbacksAndMessages(null)
    }

    companion object {
        private const val TAG = "ArcView"
        private const val REQ_LEGACY_STORAGE = 9001

        /** 出图工作分辨率上限。手机相机动辄 12MP，全尺寸叠四张必然 OOM */
        private const val WORK_MAX_DIM = 3072
    }
}
