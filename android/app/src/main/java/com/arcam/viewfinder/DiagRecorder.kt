package com.arcam.viewfinder

import android.os.Build
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlin.math.abs
import kotlin.math.atan
import kotlin.math.sqrt
import kotlin.math.tan

/**
 * 检测模式：把用眼睛在外头看不出来的东西记下来，结束时生成一份 md。
 *
 * 记录三块：
 *   ① 传感器全程统计（采样率、俯角/滚转的范围和抖动）
 *   ② 六个已知姿态的标定记录 —— 这几条是判定 roll 符号的依据
 *   ③ 每次拍照时的场景参数
 */
class DiagRecorder {

    // ── 设备 / 相机快照（开始检测时抓一次）─────────────────────────
    var deviceModel = ""
    var deviceBrand = ""
    var androidRel = ""
    var sdkInt = 0
    var abis = ""
    var screenW = 0
    var screenH = 0
    var screenDensity = 0f

    var focalMm = 0.0
    var sensorLongMm = 0.0
    var sensorShortMm = 0.0
    var activeW = 0
    var activeH = 0
    var previewW = 0
    var previewH = 0
    var viewW = 0
    var viewH = 0
    var intrinsicsOk = false
    var focalPxExact: Double? = null
    var focalPxUsed = 0.0
    var captureW = 0
    var captureH = 0

    var sensorTypeName = ""
    var sensorVendor = ""
    var sensorResolution = 0f
    var sensorMaxRange = 0f

    // ── 传感器统计 ────────────────────────────────────────────────
    var running = false
        private set
    var startedAt = 0L
        private set
    var endedAt = 0L
        private set

    var samples = 0
        private set
    private var lastSampleAt = 0L
    private val intervals = ArrayDeque<Long>()
    private var pSum = 0.0
    private var pSumSq = 0.0
    private var rSum = 0.0
    private var rSumSq = 0.0
    var pMin = Double.MAX_VALUE; private set
    var pMax = -Double.MAX_VALUE; private set
    var rMin = Double.MAX_VALUE; private set
    var rMax = -Double.MAX_VALUE; private set

    // ── 标定记录 / 拍照记录 / 事件 ────────────────────────────────
    class Mark(val label: String, val pitch: Double, val roll: Double,
               val q: FloatArray, val matrix: FloatArray, val at: Long)

    class Shot(val name: String, val pitch: Double, val roll: Double, val camH: Double,
               val dist: Double, val lat: Double, val w: Int, val h: Int, val at: Long)

    val marks = mutableListOf<Mark>()
    val shots = mutableListOf<Shot>()
    val events = mutableListOf<Pair<Long, String>>()

    fun start() {
        running = true
        startedAt = System.currentTimeMillis()
        samples = 0; lastSampleAt = 0
        intervals.clear()
        pSum = 0.0; pSumSq = 0.0; rSum = 0.0; rSumSq = 0.0
        pMin = Double.MAX_VALUE; pMax = -Double.MAX_VALUE
        rMin = Double.MAX_VALUE; rMax = -Double.MAX_VALUE
        marks.clear(); shots.clear(); events.clear()
        note("开始检测")
    }

    fun stop() {
        running = false
        endedAt = System.currentTimeMillis()
        note("结束检测")
    }

    fun note(s: String) {
        events.add(Pair(System.currentTimeMillis(), s))
    }

    fun onSensor(pitch: Double, roll: Double) {
        if (!running) return
        val now = System.currentTimeMillis()
        if (lastSampleAt > 0) {
            intervals.addLast(now - lastSampleAt)
            if (intervals.size > 600) intervals.removeFirst()
        }
        lastSampleAt = now
        samples++
        pSum += pitch; pSumSq += pitch * pitch
        rSum += roll; rSumSq += roll * roll
        if (pitch < pMin) pMin = pitch
        if (pitch > pMax) pMax = pitch
        if (roll < rMin) rMin = roll
        if (roll > rMax) rMax = roll
    }

    fun mark(label: String, pitch: Double, roll: Double, q: FloatArray, matrix: FloatArray) {
        marks.add(Mark(label, pitch, roll, q.copyOf(), matrix.copyOf(), System.currentTimeMillis()))
        note("标定记录：$label  → pitch ${f1(pitch)}°  roll ${f1(roll)}°")
    }

    fun shot(name: String, pitch: Double, roll: Double, camH: Double,
             dist: Double, lat: Double, w: Int, h: Int) {
        shots.add(Shot(name, pitch, roll, camH, dist, lat, w, h, System.currentTimeMillis()))
        note("拍照：$name  ${w}×$h")
    }

    // ── 报告 ──────────────────────────────────────────────────────
    fun buildReport(extraDiag: String): String {
        val fmt = SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.CHINA)
        val tf = SimpleDateFormat("HH:mm:ss", Locale.CHINA)
        val dur = if (endedAt > 0) (endedAt - startedAt) / 1000.0 else 0.0
        val sb = StringBuilder()

        sb.append("# AR 取景器 · 检测报告\n\n")
        sb.append("- 时间：").append(fmt.format(Date(if (startedAt > 0) startedAt else System.currentTimeMillis()))).append('\n')
        sb.append("- 时长：").append(f2(dur)).append(" 秒\n")
        sb.append("- App 版本：").append(appVersion).append("\n\n")

        // 设备
        sb.append("## 设备\n\n")
        sb.append("- 型号：").append(deviceBrand).append(' ').append(deviceModel).append('\n')
        sb.append("- Android：").append(androidRel).append(" (API ").append(sdkInt).append(")\n")
        sb.append("- ABI：").append(abis).append('\n')
        sb.append("- 屏幕：").append(screenW).append(" × ").append(screenH)
          .append(" @ ").append(f2(screenDensity.toDouble())).append("x\n\n")

        // 相机
        sb.append("## 相机\n\n")
        if (intrinsicsOk) {
            val fovL = Math.toDegrees(2 * atan(sensorLongMm / (2 * focalMm)))
            val fovS = Math.toDegrees(2 * atan(sensorShortMm / (2 * focalMm)))
            sb.append("- 焦距：").append(f2(focalMm)).append(" mm\n")
            sb.append("- 传感器物理尺寸：").append(f2(sensorLongMm)).append(" × ")
              .append(f2(sensorShortMm)).append(" mm\n")
            sb.append("- 有效像素阵列：").append(activeW).append(" × ").append(activeH).append('\n')
            sb.append("- 长边 FOV：").append(f2(fovL)).append("°　短边 FOV：").append(f2(fovS)).append("°\n")
            sb.append("- 等效 35mm：").append(f1(43.266 / (2 * tan(Math.toRadians(fovL / 2))))).append(" mm\n")
            sb.append("- 叠加层 f_px：").append(focalPxExact?.let { f1(it) } ?: "未取到").append(" px")
              .append("（画面 ").append(viewW).append('×').append(viewH).append("）\n")
        } else {
            sb.append("- 内参读取失败，f_px 用的是等效焦距回落值 ").append(f1(focalPxUsed)).append(" px\n")
        }
        sb.append("- 预览流：").append(previewW).append(" × ").append(previewH).append('\n')
        sb.append("- 拍照输出：").append(if (captureW > 0) "$captureW × $captureH" else "本次未拍照").append("\n\n")

        // 传感器
        sb.append("## 传感器\n\n")
        sb.append("- 类型：").append(sensorTypeName).append('\n')
        if (sensorVendor.isNotEmpty()) {
            sb.append("- 厂商 / 最大量程 / 分辨率：").append(sensorVendor).append(" / ")
              .append(f1(sensorMaxRange.toDouble())).append(" / ").append(f3(sensorResolution.toDouble())).append('\n')
        }
        sb.append("- 总采样：").append(samples).append(" 次\n")
        if (samples > 1 && intervals.isNotEmpty()) {
            val sorted = intervals.sorted()
            val avg = intervals.average()
            sb.append("- 采样间隔：均值 ").append(f1(avg)).append(" ms　中位 ")
              .append(sorted[sorted.size / 2]).append(" ms　最大 ").append(sorted.last()).append(" ms")
              .append("　→ 约 ").append(f0(1000.0 / avg)).append(" Hz\n")
        } else {
            sb.append("- ⚠ 采样数不足，传感器可能没在工作\n")
        }
        if (samples > 0) {
            val pAvg = pSum / samples
            val rAvg = rSum / samples
            val pStd = sqrt((pSumSq / samples - pAvg * pAvg).coerceAtLeast(0.0))
            val rStd = sqrt((rSumSq / samples - rAvg * rAvg).coerceAtLeast(0.0))
            sb.append("- 俯角：min ").append(f1(pMin)).append("°　max ").append(f1(pMax))
              .append("°　均值 ").append(f1(pAvg)).append("°　标准差 ").append(f1(pStd)).append("°\n")
            sb.append("- 滚转：min ").append(f1(rMin)).append("°　max ").append(f1(rMax))
              .append("°　均值 ").append(f1(rAvg)).append("°　标准差 ").append(f1(rStd)).append("°\n")
        }
        sb.append('\n')

        // 姿态标定
        sb.append("## 姿态标定记录\n\n")
        if (marks.isEmpty()) {
            sb.append("本次没有做标定记录。\n\n")
        } else {
            sb.append("| # | 操作 | pitch | roll | 期望 | 判定 |\n")
            sb.append("|---|---|---|---|---|---|\n")
            marks.forEachIndexed { i, m ->
                val (exp, verdict) = judge(m)
                sb.append("| ").append(i + 1).append(" | ").append(m.label)
                  .append(" | ").append(f1(m.pitch)).append("°")
                  .append(" | ").append(f1(m.roll)).append("°")
                  .append(" | ").append(exp)
                  .append(" | ").append(verdict).append(" |\n")
            }
            sb.append("\n### 原始数据\n\n")
            marks.forEachIndexed { i, m ->
                sb.append(i + 1).append(". ").append(m.label).append('\n')
                sb.append("   - q = [").append(m.q.joinToString(", ") { f3(it.toDouble()) }).append("]\n")
                sb.append("   - R = [").append(m.matrix.joinToString(", ") { f3(it.toDouble()) }).append("]\n")
            }
            sb.append('\n')

            // roll 符号
            sb.append("## roll 符号\n\n")
            val right = marks.firstOrNull { it.label.contains("向右") }
            val left = marks.firstOrNull { it.label.contains("向左") }
            if (right != null && left != null) {
                sb.append("- 顶部向右倒 → roll = ").append(f1(right.roll)).append("°\n")
                sb.append("- 顶部向左倒 → roll = ").append(f1(left.roll)).append("°\n")
                when {
                    right.roll < 0 && left.roll > 0 ->
                        sb.append("- 两次符号相反 ✓，绝对值 ")
                          .append(f1(abs(right.roll))).append(" / ").append(f1(abs(left.roll))).append("°\n")
                    right.roll > 0 && left.roll < 0 ->
                        sb.append("- 两次符号相反 ✓，但与「顶部向右倒为负」的推导相反 —— 符号需要取负\n")
                    else ->
                        sb.append("- ⚠ 两次同号，姿势可能没做到位\n")
                }
            } else {
                sb.append("缺少右倒/左倒的记录，判不了。\n")
            }
            sb.append('\n')
        }

        // 拍照记录
        sb.append("## 拍照记录\n\n")
        if (shots.isEmpty()) {
            sb.append("本次没有拍照。\n\n")
        } else {
            sb.append("| # | 文件 | 俯角 | 滚转 | 相机高 h | 距离 | 横向 | 输出尺寸 |\n")
            sb.append("|---|---|---|---|---|---|---|---|\n")
            shots.forEachIndexed { i, s ->
                sb.append("| ").append(i + 1).append(" | ").append(s.name)
                  .append(" | ").append(f1(s.pitch)).append("°")
                  .append(" | ").append(f1(s.roll)).append("°")
                  .append(" | ").append(f2(s.camH)).append(" m")
                  .append(" | ").append(f2(s.dist)).append(" m")
                  .append(" | ").append(f2(s.lat)).append(" m")
                  .append(" | ").append(s.w).append('×').append(s.h)
                  .append(" |\n")
            }
            sb.append('\n')
        }

        // 事件
        sb.append("## 事件\n\n")
        events.forEach { sb.append("- ").append(tf.format(Date(it.first))).append('　').append(it.second).append('\n') }
        sb.append('\n')

        // 结束时的诊断快照
        sb.append("## 结束时的诊断面板\n\n```\n").append(extraDiag).append("```\n")

        return sb.toString()
    }

    /** 按姿势给期望值和判定 */
    private fun judge(m: Mark): Pair<String, String> {
        val label = m.label
        return when {
            label.contains("平放") -> {
                val ok = abs(abs(m.pitch) - 90.0) < 8.0
                Pair("pitch ≈ ±90°", if (ok) "✓" else "✗ 偏 ${f1(abs(abs(m.pitch) - 90.0))}°")
            }
            label.contains("竖直") -> {
                val ok = abs(m.pitch) < 10.0
                Pair("pitch ≈ 0°", if (ok) "✓" else "✗ 偏 ${f1(abs(m.pitch))}°")
            }
            label.contains("下压") -> {
                val ok = abs(m.pitch - 45.0) < 12.0
                Pair("pitch ≈ +45°", if (ok) "✓" else "✗ 实测 ${f1(m.pitch)}°")
            }
            label.contains("上抬") -> {
                val ok = abs(m.pitch + 45.0) < 12.0
                Pair("pitch ≈ −45°", if (ok) "✓" else "✗ 实测 ${f1(m.pitch)}°")
            }
            label.contains("右倒") -> {
                val ok = m.roll < -10.0
                Pair("roll 为负（顶部右倒）", if (ok) "✓" else "符号相反")
            }
            label.contains("左倒") -> {
                val ok = m.roll > 10.0
                Pair("roll 为正（顶部左倒）", if (ok) "✓" else "符号相反")
            }
            else -> Pair("", "")
        }
    }

    var appVersion = ""

    private fun f0(v: Double) = String.format(Locale.US, "%.0f", v)
    private fun f1(v: Double) = String.format(Locale.US, "%.1f", v)
    private fun f2(v: Double) = String.format(Locale.US, "%.2f", v)
    private fun f3(v: Double) = String.format(Locale.US, "%.3f", v)

    companion object {
        /** 引导步骤。前两条定 pitch 零点和 ±90，中间两条定 roll 符号，后两条验 pitch 线性。 */
        val STEPS = listOf(
            "手机平放桌面，屏幕朝上",
            "竖直举起，后摄水平朝正前方",
            "手机顶部向右倒约 45°",
            "手机顶部向左倒约 45°",
            "镜头向下压约 45°（俯拍）",
            "镜头向上抬约 45°（仰拍）"
        )
    }
}
