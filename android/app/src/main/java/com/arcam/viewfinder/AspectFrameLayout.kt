package com.arcam.viewfinder

import android.content.Context
import android.util.AttributeSet
import android.widget.FrameLayout

/**
 * 按指定宽高比缩到可用空间内。
 *
 * 叠加层的坐标要跟预览画面像素一一对应，所以让 PreviewView 和 OverlayView 填满一个
 * 宽高比等于预览流的容器，PreviewView 用 FIT_CENTER 不裁切，两者坐标系就对齐了。
 * PreviewView 默认的 FILL_CENTER 会裁，裁了叠加就整体偏移。
 */
class AspectFrameLayout @JvmOverloads constructor(
    ctx: Context, attrs: AttributeSet? = null, defStyle: Int = 0
) : FrameLayout(ctx, attrs, defStyle) {

    /** 宽 / 高。默认 3:4（竖幅 4:3 传感器） */
    var aspect = 3f / 4f
        set(v) { if (v > 0f && v != field) { field = v; requestLayout() } }

    override fun onMeasure(widthSpec: Int, heightSpec: Int) {
        val availW = MeasureSpec.getSize(widthSpec)
        val availH = MeasureSpec.getSize(heightSpec)
        var w = availW
        var h = (w / aspect).toInt()
        if (h > availH) { h = availH; w = (h * aspect).toInt() }
        setMeasuredDimension(w, h)
        val cw = MeasureSpec.makeMeasureSpec(w, MeasureSpec.EXACTLY)
        val ch = MeasureSpec.makeMeasureSpec(h, MeasureSpec.EXACTLY)
        for (i in 0 until childCount) measureChild(getChildAt(i), cw, ch)
    }
}
