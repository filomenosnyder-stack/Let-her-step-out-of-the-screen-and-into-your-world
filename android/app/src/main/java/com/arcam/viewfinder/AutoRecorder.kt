package com.arcam.viewfinder

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.Handler
import android.os.HandlerThread
import android.os.SystemClock
import android.view.Surface
import org.json.JSONObject
import java.io.BufferedWriter
import java.io.File
import java.io.FileWriter
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * 自动记录器：**进应用就开始写，不需要点任何东西**。
 *
 * 落盘位置：`/sdcard/Android/data/com.arcam.viewfinder/files/arcam_logs/`
 *   · `sess_<启动时刻>.jsonl`  一行一条 JSON，追加写
 *   · `README.txt`             给自己和后人看的说明
 * 这个目录**不用任何权限**，而且 `adb pull` 一定拿得到 —— 比写公共 Documents 稳
 * （Android 10+ 往公共目录写要走 MediaStore，各厂商行为还不一致）。
 *
 * 一行一条，形如：
 *   {"t":12345.6,"k":"sensor","az":1.23,"pt":-0.45,"rl":0.02,"rot":0}
 *   {"t":12350.1,"k":"ev","n":"shot","d":{"pitch":-3.2,"shot":"全身"}}
 *
 * ★ 设计上和上一版 DiagRecorder 的区别：
 *   那一版是**手动**的（开发者模式点一下开始，内存里拼一份 Markdown 报告）。
 *   这一版是**自动 + 追加写**：不点、不丢、随时拔线都拿得到已经写下去的部分。
 *
 * ★ 为什么连**原始欧拉角**一起记：算 pitch/roll 要先知道屏幕朝向（横屏时轴要换），
 *   这一步最容易错、也最难事后复现。把绕转矢量解出来的原始三轴 + 当时的
 *   `display.rotation` 一起存下来，**回家可以按不同约定重算**，不用让用户再拍一遍。
 *   同时页面自己算出来的 pitch/roll 也写一份（走 JS 桥），两边一对比就知道谁错。
 */
object AutoRecorder : SensorEventListener {

    private const val TAG = "AutoRecorder"
    private const val SENSOR_HZ = 20          // 采样落盘频率。50Hz 太占地方，20Hz 够画曲线
    private const val FLUSH_MS = 1500L

    private var sm: SensorManager? = null
    private var thread: HandlerThread? = null
    private var h: Handler? = null

    private var out: BufferedWriter? = null
    private var file: File? = null
    private var started = false
    private var lastWrite = 0L
    private var lastFlush = 0L
    private var lineCount = 0

    /** 屏幕朝向。横屏时绕转矢量的轴要换 —— 原样存下来，回家重算用。 */
    @Volatile var displayRotation: Int = Surface.ROTATION_0

    val logDir: File? get() = file?.parentFile
    val logFile: File? get() = file
    val lines: Int get() = lineCount

    /** 幂等 —— Application 和 Activity 都会调，重复调不会有第二份。 */
    @Synchronized
    fun start(ctx: Context) {
        if (started) return
        started = true
        try {
            val dir = File(ctx.getExternalFilesDir(null), "arcam_logs")
            if (!dir.exists()) dir.mkdirs()
            writeReadme(dir)
            val stamp = SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(Date())
            val f = File(dir, "sess_$stamp.jsonl")
            out = BufferedWriter(FileWriter(f, true), 1 shl 16)
            file = f

            val t = HandlerThread("arcam-rec").also { it.start() }
            thread = t
            h = Handler(t.looper)

            open("app_start", JSONObject().apply {
                put("pkg", ctx.packageName)
                put("sdk", android.os.Build.VERSION.SDK_INT)
                put("model", android.os.Build.MODEL)
                put("brand", android.os.Build.BRAND)
                put("android", android.os.Build.VERSION.RELEASE)
            })

            val m = ctx.getSystemService(Context.SENSOR_SERVICE) as SensorManager
            sm = m
            // 优先绕转矢量（已做传感器融合，抖动小）；没有再退到加速度+磁场
            val rv = m.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR)
            if (rv != null) {
                m.registerListener(this, rv, SensorManager.SENSOR_DELAY_GAME, h)
                open("sensor_ok", JSONObject().put("src", "rotation_vector"))
            } else {
                val acc = m.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)
                val mag = m.getDefaultSensor(Sensor.TYPE_MAGNETIC_FIELD)
                if (acc != null && mag != null) {
                    m.registerListener(this, acc, SensorManager.SENSOR_DELAY_GAME, h)
                    m.registerListener(this, mag, SensorManager.SENSOR_DELAY_GAME, h)
                    open("sensor_ok", JSONObject().put("src", "acc+mag"))
                } else {
                    open("sensor_missing", JSONObject())
                }
            }
        } catch (e: Throwable) {
            // 记录器自己不能把应用带崩 —— 拿不到就静默降级
            android.util.Log.w(TAG, "启动失败: ${e.message}")
            open("recorder_fail", JSONObject().put("err", e.toString()))
        }
    }

    fun stop() {
        try { sm?.unregisterListener(this) } catch (_: Throwable) {}
        h?.post {
            try { out?.flush(); out?.close() } catch (_: Throwable) {}
            out = null
        }
        thread?.quitSafely()
        started = false
    }

    // ── 传感器 ────────────────────────────────────────────────────────
    private val accV = FloatArray(3)
    private val magV = FloatArray(3)
    private var haveAcc = false
    private var haveMag = false
    private val rMat = FloatArray(9)
    private val iMat = FloatArray(9)
    private val ori = FloatArray(3)

    override fun onSensorChanged(e: SensorEvent) {
        val now = SystemClock.elapsedRealtime()
        if (now - lastWrite < 1000L / SENSOR_HZ) return   // 节流到 SENSOR_HZ

        when (e.sensor.type) {
            Sensor.TYPE_ROTATION_VECTOR -> {
                try {
                    SensorManager.getRotationMatrixFromVector(rMat, e.values)
                    SensorManager.getOrientation(rMat, ori)
                } catch (_: Throwable) { return }
            }
            Sensor.TYPE_ACCELEROMETER -> { System.arraycopy(e.values, 0, accV, 0, 3); haveAcc = true; return }
            Sensor.TYPE_MAGNETIC_FIELD -> { System.arraycopy(e.values, 0, magV, 0, 3); haveMag = true; return }
            else -> return
        }
        lastWrite = now
        // ori = [方位角, 俯仰, 滚转]，弧度。**原样存**，换算留到回家做
        val o = JSONObject()
            .put("t", now / 1000.0)
            .put("k", "sensor")
            .put("az", r3(ori[0])).put("pt", r3(ori[1])).put("rl", r3(ori[2]))
            .put("rot", displayRotation)
        if (haveAcc) o.put("acc", r3(accV[0])).put("acc2", r3(accV[1])).put("acc3", r3(accV[2]))
        if (haveMag) o.put("mag", r3(magV[0])).put("mag2", r3(magV[1])).put("mag3", r3(magV[2]))
        line(o)
    }

    override fun onAccuracyChanged(s: Sensor?, a: Int) {}

    // ── 事件（页面通过 JS 桥调过来，或原生自己调）────────────────────
    fun event(name: String, data: JSONObject?) = event(name, data?.toString())

    fun event(name: String, dataJson: String?) {
        val o = JSONObject()
            .put("t", SystemClock.elapsedRealtime() / 1000.0)
            .put("k", "ev")
            .put("n", name)
        if (!dataJson.isNullOrBlank()) {
            try { o.put("d", JSONObject(dataJson)) } catch (_: Throwable) { o.put("d", dataJson) }
        }
        open(name, o)
    }

    private fun open(name: String, o: JSONObject) {
        // open() 是"务必写下这一条"的入口 —— 起停这种关键节点不能被节流吃掉
        try { o.put("wall", System.currentTimeMillis()) } catch (_: Throwable) {}
        line(o, force = true)
    }

    // ── 落盘 ──────────────────────────────────────────────────────────
    private fun line(o: JSONObject, force: Boolean = false) {
        val w = out ?: return
        val hh = h ?: return
        hh.post {
            try {
                w.write(o.toString()); w.newLine()
                lineCount++
                val now = SystemClock.elapsedRealtime()
                if (force || now - lastFlush > FLUSH_MS) { w.flush(); lastFlush = now }
            } catch (_: Throwable) {}
        }
    }

    private fun r3(v: Float) = Math.round(v * 1000.0) / 1000.0

    private fun writeReadme(dir: File) {
        try {
            val f = File(dir, "README.txt")
            if (f.exists()) return
            f.writeText(
                """
                这是 AR 取景器（网页版壳）的自动记录。
                进应用就开始写，不需要点任何东西。

                sess_<启动时刻>.jsonl —— 一行一条 JSON：
                  {"t":..,"k":"sensor", ...}   姿态，20Hz
                      t    开机以来的秒数
                      az/pt/rl   方位角/俯仰/滚转，**弧度**，绕转矢量原始解算值
                      rot  当时的屏幕朝向 0/1/2/3（0=竖屏）
                      acc*/mag*  加速度/磁场原始值（走 acc+mag 回退时有）
                  {"t":..,"k":"ev","n":"<事件名>","d":{...}}  事件
                      app_start / sensor_ok / sensor_missing / recorder_fail
                      web_ready / web_fail / cam_ok / cam_fail
                      shot / export / mode / shot_kind / param / ...
                      d 里是当时的全量状态（页面给的）

                ⚠ az/pt/rl 是**原始值**，没有按屏幕朝向换算 —— 换算规则有几种，
                  留到分析时按不同约定各算一遍，比在这里猜一种写死强。
                  页面自己算的那份也记在 ev 里，两边能对。

                拉数据：
                  adb pull /sdcard/Android/data/com.arcam.viewfinder/files/arcam_logs
                """.trimIndent(),
                Charsets.UTF_8
            )
        } catch (_: Throwable) {}
    }
}
