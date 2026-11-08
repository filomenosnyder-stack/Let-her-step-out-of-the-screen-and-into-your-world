package com.arcam.viewfinder

import android.Manifest
import android.annotation.SuppressLint
import android.content.pm.PackageManager
import android.content.Intent
import android.content.ContentValues
import android.net.Uri
import android.provider.MediaStore
import android.os.Environment
import android.os.Build
import android.os.Bundle
import java.io.File
import android.view.Surface
import android.view.ViewGroup
import android.view.WindowManager
import android.webkit.ConsoleMessage
import android.webkit.JavascriptInterface
import android.webkit.PermissionRequest
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.webkit.ValueCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.webkit.WebViewAssetLoader
import org.json.JSONObject

/**
 * 网页版的安卓壳。把 phone/index.html 装进 WebView 跑。
 *
 * ★★ 为什么不能直接 loadUrl("file:///android_asset/...")：
 *    `file://` **不是安全上下文**，getUserMedia（摄像头）会被直接拒掉，
 *    而这一页整个就靠摄像头。必须用 WebViewAssetLoader 把它挂在
 *    `https://appassets.androidplatform.net/` 上 —— 那才算 https，摄像才给。
 *
 * assets 按仓库原样镜像：
 *    assets/web/phone/index.html
 *    assets/web/cutout.js
 *    assets/web/chars/  （chars.js 和「立绘」「街景」两个目录）
 * 页面里写的是 `../cutout.js`，从 /web/phone/ 往上跳一级正好落在 /web/cutout.js ✓
 *
 * ⚠ Kotlin 的块注释**能嵌套**，所以在注释里写路径通配符（比如 chars 后面跟斜杠星号）
 *   会开一个嵌套注释，把整个注释块吃掉，编译器报的却是文件末尾 "Unclosed comment"。
 *   注释里别写那种通配符。
 *
 * ★ 进应用就自动开始记录（AutoRecorder），不需要点任何东西。
 */
class WebActivity : AppCompatActivity() {

    private lateinit var web: WebView
    private lateinit var nativeCutout: NativeCutout
    private var camGranted = false
    private var fileCallback: ValueCallback<Array<Uri>>? = null
    private val chooseFiles = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        val callback = fileCallback; fileCallback = null
        val data = result.data
        val uris = if (result.resultCode != RESULT_OK) null else when {
            data?.clipData != null -> Array(data.clipData!!.itemCount) { data.clipData!!.getItemAt(it).uri }
            data?.data != null -> arrayOf(data.data!!)
            else -> null
        }
        callback?.onReceiveValue(uris)
    }

    private val askCam = registerForActivityResult(ActivityResultContracts.RequestPermission()) { ok ->
        camGranted = ok
        AutoRecorder.event(if (ok) "perm_cam_ok" else "perm_cam_deny", null as JSONObject?)
        load()
    }

    // 页面里可以调 window.ArcLog.event('shot', {...})。
    // ⚠ 网页版（浏览器里跑）没有这个对象，所以页面那边必须写成"有才调"的形式，
    //   不能假定它在 —— 公开站点上它永远不存在。
    inner class Bridge {
        @JavascriptInterface
        fun event(name: String, json: String?) = AutoRecorder.event(name, json)

        @JavascriptInterface
        fun note(text: String) = AutoRecorder.event("note", JSONObject().put("text", text))

        // ── 存文件 ───────────────────────────────────────────────
        // WebView 里 <a download> 是**死路**：要 setDownloadListener，
        // 而且 blob: 的 URL 原生这头取不到内容。所以由页面把 blob 转成 base64
        // 分片递过来，这边拼起来写盘。
        // 落点跟日志同一棵树，`adb pull` 一把全拉走：
        //   /sdcard/Android/data/com.arcam.viewfinder/files/out/
        @JavascriptInterface
        fun saveChunk(name: String, b64: String) {
            if (b64.isEmpty()) return
            synchronized(pending) { pending.getOrPut(name) { StringBuilder() }.append(b64) }
        }

        @JavascriptInterface
        fun saveEnd(name: String): String {
            return try {
                val sb = synchronized(pending) { pending.remove(name) } ?: return ""
                // ⚠ 文件名来自页面，可能带路径分隔符之类的 —— 只取最后一段，
                //   别让人写到目录外面去
                val safe = File(name).name.ifBlank { "unnamed" }
                val bytes = android.util.Base64.decode(sb.toString(), android.util.Base64.DEFAULT)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    val values = ContentValues().apply {
                        put(MediaStore.Downloads.DISPLAY_NAME, safe)
                        put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/ARView")
                        put(MediaStore.Downloads.MIME_TYPE, when (safe.substringAfterLast('.').lowercase()) {
                            "jpg", "jpeg" -> "image/jpeg"
                            "png" -> "image/png"
                            "zip" -> "application/zip"
                            "json" -> "application/json"
                            else -> "application/octet-stream"
                        })
                        put(MediaStore.Downloads.IS_PENDING, 1)
                    }
                    val uri = contentResolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values) ?: error("无法创建导出文件")
                    try {
                        contentResolver.openOutputStream(uri)?.use { it.write(bytes) } ?: error("无法写入导出文件")
                        contentResolver.update(uri, ContentValues().apply { put(MediaStore.Downloads.IS_PENDING, 0) }, null, null)
                        return "Download/ARView/$safe"
                    } catch (error: Throwable) { contentResolver.delete(uri, null, null); throw error }
                }
                val dir = File(getExternalFilesDir(null), "out").apply { mkdirs() }
                val f = File(dir, safe)
                f.writeBytes(bytes)
                AutoRecorder.event("file_saved", JSONObject()
                    .put("name", safe).put("bytes", f.length()).put("path", f.absolutePath))
                f.absolutePath
            } catch (e: Throwable) {
                AutoRecorder.event("file_save_fail", JSONObject()
                    .put("name", name).put("err", e.toString()))
                ""
            }
        }
    }

    /** 分片拼装中的文件：文件名 → 已收到的 base64 片段 */
    private val pending = HashMap<String, StringBuilder>()

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        AutoRecorder.start(applicationContext)      // 进应用就记，不等任何点击
        AutoRecorder.event("web_activity_onCreate", null as JSONObject?)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        // ★ 用默认的 "/assets/" 处理器，URL 就得写成 .../assets/web/phone/index.html。
        //   ⚠ 这里第一次写错了：注册 "/web/" 再请求 /web/phone/index.html，
        //     **注册的前缀会被剥掉**，处理器拿到的是 "phone/index.html"，
        //     于是去找 assets/phone/index.html —— 那一层根本不存在，
        //     页面报 net::ERR_INVALID_RESPONSE。
        //     约定是：URL 里 /assets/ 后面那一段 = assets/ 目录下的相对路径。
        val loader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        web = WebView(this)
        WebView.setWebContentsDebuggingEnabled((applicationInfo.flags and android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) != 0)
        // ⚠ setContentView 只有 (View) 和 (View, LayoutParams) 两个重载，
        //   没有 (View, int, int) 那种 —— 宽高要自己包一个 LayoutParams 实例。
        setContentView(web, ViewGroup.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))

        web.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            mediaPlaybackRequiresUserGesture = false
            allowFileAccess = false           // 走 AssetLoader，不需要放开文件
            allowContentAccess = true
            // ⚠ 不设 setUserAgentString 的话页面拿不到任何线索；留着默认即可。
        }
        web.addJavascriptInterface(Bridge(), "ArcLog")
        nativeCutout = NativeCutout(applicationContext, web)
        web.addJavascriptInterface(nativeCutout, "ArcNative")

        web.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                if (request.url.host == "appassets.androidplatform.net") return false
                if (request.isForMainFrame) {
                    try { startActivity(Intent(Intent.ACTION_VIEW, request.url)) } catch (_: Exception) { }
                    return true
                }
                return false
            }
            override fun shouldInterceptRequest(v: WebView, req: WebResourceRequest): WebResourceResponse? =
                loader.shouldInterceptRequest(req.url)

            override fun onPageFinished(v: WebView, url: String) {
                AutoRecorder.event("web_loaded", JSONObject().put("url", url))
            }
        }

        web.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(view: WebView, callback: ValueCallback<Array<Uri>>, params: FileChooserParams): Boolean {
                fileCallback?.onReceiveValue(null)
                fileCallback = callback
                val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
                    addCategory(Intent.CATEGORY_OPENABLE)
                    type = "*/*"
                    putExtra(Intent.EXTRA_ALLOW_MULTIPLE, params.mode == FileChooserParams.MODE_OPEN_MULTIPLE)
                }
                return try { chooseFiles.launch(intent); true }
                catch (error: Exception) { fileCallback = null; callback.onReceiveValue(null); false }
            }
            // ★ getUserMedia 必须在这里放行，光有系统权限不够 ——
            //   不放行的话页面永远卡在"需要授权摄像头"那道门上，还不报错。
            override fun onPermissionRequest(request: PermissionRequest) {
                val want = request.resources.any { it == PermissionRequest.RESOURCE_VIDEO_CAPTURE }
                AutoRecorder.event("web_perm_req", JSONObject()
                    .put("want", want).put("res", request.resources.joinToString(",")))
                if (want && camGranted && request.origin.host == "appassets.androidplatform.net") request.grant(arrayOf(PermissionRequest.RESOURCE_VIDEO_CAPTURE))
                else request.deny()
            }

            override fun onConsoleMessage(m: ConsoleMessage): Boolean {
                AutoRecorder.event("web_console", JSONObject()
                    .put("lvl", m.messageLevel()).put("msg", m.message())
                    .put("src", m.sourceId()).put("line", m.lineNumber()))
                return true
            }
        }

        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
            camGranted = true
            load()
        } else {
            askCam.launch(Manifest.permission.CAMERA)
        }
    }

    private fun load() {
        // 页面里写的是 ../cutout.js → /assets/web/cutout.js → assets/web/cutout.js ✓ 对得上
        web.loadUrl("https://appassets.androidplatform.net/assets/web/phone/index.html")
    }

    override fun onResume() {
        super.onResume()
        if (::web.isInitialized) web.onResume()
        // 屏幕朝向要在每次回来时更新 —— 记录里每一条都会带上它，
        // 回家重算 pitch/roll 时全靠这个数决定轴怎么换
        displayRotationOf()
        AutoRecorder.event("web_resume", JSONObject().put("rot", AutoRecorder.displayRotation))
    }

    override fun onPause() {
        AutoRecorder.event("web_pause", null as JSONObject?)
        if (::web.isInitialized) web.onPause()
        super.onPause()
    }

    override fun onDestroy() {
        AutoRecorder.event("web_destroy", null as JSONObject?)
        fileCallback?.onReceiveValue(null); fileCallback = null
        if (::nativeCutout.isInitialized) nativeCutout.close()
        if (::web.isInitialized) { web.removeJavascriptInterface("ArcNative"); web.destroy() }
        super.onDestroy()
    }

    private fun displayRotationOf() {
        val r = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R)
            display?.rotation ?: Surface.ROTATION_0
        else
            @Suppress("DEPRECATION") windowManager.defaultDisplay.rotation
        AutoRecorder.displayRotation = r
    }

    override fun onConfigurationChanged(newConfig: android.content.res.Configuration) {
        super.onConfigurationChanged(newConfig)
        displayRotationOf()
        AutoRecorder.event("web_rotate", JSONObject().put("rot", AutoRecorder.displayRotation))
    }

    @Deprecated("老的返回键处理，页面里没有历史记录就直接退出")
    override fun onBackPressed() {
        if (web.canGoBack()) web.goBack() else super.onBackPressed()
    }
}
