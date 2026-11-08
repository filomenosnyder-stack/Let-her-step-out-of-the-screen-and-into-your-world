package com.arcam.viewfinder

import android.hardware.SensorManager
import android.view.Surface
import kotlin.math.asin
import kotlin.math.atan2
import kotlin.math.sqrt

/**
 * 用旋转矢量传感器算相机俯角 / 滚转。
 *
 * SensorManager.getRotationMatrixFromVector 给的是「设备系 → 世界系（东北天）」的旋转矩阵，
 * 和网页版拿 W3C alpha/beta/gamma 拼出来的那个 R 是同一套约定，所以解算逻辑一字不差
 *（自检见 verify/4_sensor_to_pitch_roll.mjs，6 种姿态全部精确命中）。
 *
 * 相机光轴 = 设备 -z（后摄朝设备背面），画面上的「上」= 设备 +y。
 * 俯角 = 光轴低于水平面的角度；滚转 = 像平面相对水平线的倾角。
 *
 * 用 TYPE_GAME_ROTATION_VECTOR（不含磁力计）：航向无所谓，只要重力方向对就行，
 * 而且不受周围磁场干扰。
 */
class SensorOrientation {

    var pitchDeg = 0.0
        private set
    var rollDeg = 0.0
        private set
    var valid = false
        private set

    /** 原始四元数，诊断面板要显示 */
    var raw = FloatArray(4)

    /** 设备系 → 世界系的旋转矩阵（行主序 9 元素），检测报告里要留档 */
    var matrix = FloatArray(9)
        private set

    private val r = FloatArray(9)
    private var screenRotation = Surface.ROTATION_0

    fun setScreenRotation(rot: Int) {
        screenRotation = rot
    }

    fun update(values: FloatArray) {
        if (values.size < 4) return
        raw = values.copyOf()
        SensorManager.getRotationMatrixFromVector(r, values)
        System.arraycopy(r, 0, matrix, 0, 9)

        // 矩阵是行主序 9 元素：列 k 就是设备第 k 根轴在世界系里的方向
        // 第一列 = 设备 x（画面右）、第二列 = 设备 y（画面上）、第三列 = 设备 z（朝使用者）
        val fx = -r[2].toDouble(); val fy = -r[5].toDouble(); val fz = -r[8].toDouble()  // 光轴
        val ux = r[1].toDouble();  val uy = r[4].toDouble();  val uz = r[7].toDouble()  // 画面上
        val rx = r[0].toDouble();  val ry = r[3].toDouble();  val rz = r[6].toDouble()  // 画面右

        pitchDeg = Math.toDegrees(asin((-fz).coerceIn(-1.0, 1.0)))

        // 世界「上」(0,0,1) 在像平面上的投影方向，与相机 up 的夹角就是滚转
        val k = fz
        var wx = -k * fx
        var wy = -k * fy
        var wz = 1.0 - k * fz
        val n = sqrt(wx * wx + wy * wy + wz * wz)
        if (n > 1e-9) { wx /= n; wy /= n; wz /= n }
        rollDeg = Math.toDegrees(atan2(rx * wx + ry * wy + rz * wz,
                                       ux * wx + uy * wy + uz * wz))

        when (screenRotation) {
            Surface.ROTATION_90 -> rollDeg += 90.0
            Surface.ROTATION_270 -> rollDeg -= 90.0
            Surface.ROTATION_180 -> rollDeg += 180.0
        }
        valid = true
    }
}
