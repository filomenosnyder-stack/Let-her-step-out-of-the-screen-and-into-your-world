package com.arcam.viewfinder

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.util.Base64
import android.webkit.JavascriptInterface
import android.webkit.WebView
import ai.onnxruntime.OnnxTensor
import ai.onnxruntime.OrtEnvironment
import ai.onnxruntime.OrtSession
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.File
import java.nio.FloatBuffer
import java.util.concurrent.Executors
import kotlin.math.exp
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/** Runs model inference off the UI thread; no photo leaves the device. */
class NativeCutout(private val context: Context, private val web: WebView) : AutoCloseable {
    private data class Model(val file: String, val bytes: Long, val letterbox: Boolean)
    private val models = mapOf(
        "fast" to Model("isnet-anime-q8.onnx", 44214375L, true),
        "anime" to Model("isnet-anime-fp32.onnx", 176069933L, true),
        "birefnet" to Model("birefnet-lite.onnx", 224005088L, false)
    )
    private val worker = Executors.newSingleThreadExecutor()
    private val environment = OrtEnvironment.getEnvironment()
    private var session: OrtSession? = null
    private var sessionKey = ""
    @Volatile private var closed = false

    private fun loadSession(key: String, model: Model): OrtSession {
        if (sessionKey == key && session != null) return session!!
        session?.close(); session = null; sessionKey = ""
        val directory = File(context.noBackupFilesDir, "segmentation-models").apply { mkdirs() }
        val target = File(directory, model.file)
        if (!target.exists() || target.length() != model.bytes) {
            val partial = File(directory, model.file + ".partial")
            context.assets.open("web/anime/" + model.file).use { input ->
                partial.outputStream().use { output -> input.copyTo(output) }
            }
            check(partial.length() == model.bytes) { "模型文件不完整" }
            check(partial.renameTo(target)) { "无法安装本机分割模型" }
        }
        OrtSession.SessionOptions().use { options ->
            options.setIntraOpNumThreads(min(4, max(1, Runtime.getRuntime().availableProcessors() - 1)))
            options.setInterOpNumThreads(1)
            options.setMemoryPatternOptimization(false)
            options.setCPUArenaAllocator(false)
            session = environment.createSession(target.absolutePath, options)
        }
        sessionKey = key
        return session!!
    }

    @JavascriptInterface
    fun segment(id: String, key: String, encoded: String) {
        if (closed) return
        worker.execute {
            val response = JSONObject().put("id", id)
            var source: Bitmap? = null
            var square: Bitmap? = null
            var mask: Bitmap? = null
            try {
                val model = models[key] ?: error("未知抠图模型")
                require(encoded.length <= 48 * 1024 * 1024) { "图片过大，请缩小后再抠图" }
                val bytes = Base64.decode(encoded, Base64.DEFAULT)
                val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
                BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
                require(bounds.outWidth > 0 && bounds.outHeight > 0 && bounds.outWidth.toLong() * bounds.outHeight <= 24_000_000L) { "图片尺寸过大或格式不支持" }
                source = BitmapFactory.decodeByteArray(bytes, 0, bytes.size) ?: error("图片解码失败")
                val inference = loadSession(key, model)
                val side = 1024
                val scale = side.toFloat() / max(source.width, source.height)
                val w = if (model.letterbox) max(1, (source.width * scale).roundToInt()) else side
                val h = if (model.letterbox) max(1, (source.height * scale).roundToInt()) else side
                val ox = (side - w) / 2; val oy = (side - h) / 2
                square = Bitmap.createBitmap(side, side, Bitmap.Config.ARGB_8888)
                Canvas(square).apply {
                    drawColor(Color.BLACK)
                    drawBitmap(source, null, android.graphics.Rect(ox, oy, ox + w, oy + h), Paint(Paint.FILTER_BITMAP_FLAG))
                }
                val pixels = IntArray(side * side)
                square.getPixels(pixels, 0, side, 0, 0, side, side)
                val n = side * side; val input = FloatArray(n * 3)
                val mean = if (model.letterbox) floatArrayOf(0f, 0f, 0f) else floatArrayOf(.485f, .456f, .406f)
                val std = if (model.letterbox) floatArrayOf(1f, 1f, 1f) else floatArrayOf(.229f, .224f, .225f)
                for (i in 0 until n) {
                    input[i] = ((pixels[i] shr 16 and 255) / 255f - mean[0]) / std[0]
                    input[i + n] = ((pixels[i] shr 8 and 255) / 255f - mean[1]) / std[1]
                    input[i + 2 * n] = ((pixels[i] and 255) / 255f - mean[2]) / std[2]
                }
                val output = IntArray(w * h)
                OnnxTensor.createTensor(environment, FloatBuffer.wrap(input), longArrayOf(1, 3, 1024, 1024)).use { tensor ->
                    inference.run(mapOf(inference.inputNames.first() to tensor)).use { results ->
                        val values = (results[0] as OnnxTensor).floatBuffer
                        for (y in 0 until h) for (x in 0 until w) {
                            val v = values.get((y + oy) * side + x + ox)
                            val probability = if (model.letterbox) v else (1.0 / (1.0 + exp(-v.toDouble()))).toFloat()
                            val gray = (probability.coerceIn(0f, 1f) * 255).roundToInt()
                            output[y * w + x] = Color.rgb(gray, gray, gray)
                        }
                    }
                }
                mask = Bitmap.createBitmap(output, w, h, Bitmap.Config.ARGB_8888)
                val stream = ByteArrayOutputStream()
                mask.compress(Bitmap.CompressFormat.PNG, 100, stream)
                response.put("mask", Base64.encodeToString(stream.toByteArray(), Base64.NO_WRAP))
            } catch (error: Throwable) {
                response.put("error", error.message ?: "本机分割失败")
            } finally {
                source?.recycle(); square?.recycle(); mask?.recycle()
            }
            if (!closed) web.post {
                if (!closed) web.evaluateJavascript("window.dispatchEvent(new CustomEvent('arcam-native-segmentation',{detail:$response}));", null)
            }
        }
    }

    override fun close() {
        closed = true
        worker.execute { session?.close(); session = null }
        worker.shutdown()
    }
}
