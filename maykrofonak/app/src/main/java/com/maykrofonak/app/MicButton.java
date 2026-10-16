package com.maykrofonak.app;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.RectF;
import android.graphics.Shader;
import android.graphics.drawable.Drawable;
import android.os.SystemClock;
import android.util.AttributeSet;
import android.view.HapticFeedbackConstants;
import android.view.View;
import android.widget.Button;

/**
 * زر المايك الكبير: دائرة واضحة، وحلقات تنبض مع صوتك وهو شغّال
 * حتى تشوف إن المايك يسمعك. يرسم نفسه بالكامل، فهو خفيف وسريع.
 */
public final class MicButton extends View {
    static final int IDLE = 0, STARTING = 1, LIVE = 2, WAITING = 3;

    private final Paint core = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint ring = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint halo = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint arc = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final RectF arcBox = new RectF();
    private final Drawable icon;
    private final int accent, accent2, idleTop, idleBottom, warn;
    private final long t0 = SystemClock.uptimeMillis();
    private Shader liveShader, idleShader, waitShader;
    private int mode = IDLE;
    private float shown;

    public MicButton(Context c) {
        this(c, null);
    }

    public MicButton(Context c, AttributeSet attrs) {
        super(c, attrs);
        accent = c.getColor(R.color.accent);
        accent2 = c.getColor(R.color.accent2);
        idleTop = c.getColor(R.color.surface3);
        idleBottom = c.getColor(R.color.surface2);
        warn = c.getColor(R.color.warn);
        icon = c.getDrawable(R.drawable.ic_mic).mutate();
        ring.setStyle(Paint.Style.STROKE);
        arc.setStyle(Paint.Style.STROKE);
        arc.setStrokeCap(Paint.Cap.ROUND);
        setClickable(true);
        setFocusable(true);
        setHapticFeedbackEnabled(true);
        updateDescription();
    }

    void setMode(int m) {
        if (m == mode) return;
        mode = m;
        updateDescription();
        invalidate();
    }

    @Override
    public boolean performClick() {
        performHapticFeedback(HapticFeedbackConstants.VIRTUAL_KEY);
        return super.performClick();
    }

    @Override
    public CharSequence getAccessibilityClassName() {
        return Button.class.getName();
    }

    private void updateDescription() {
        setContentDescription(getContext().getString(mode == IDLE ? R.string.cd_mic_start : R.string.cd_mic_stop));
    }

    @Override
    protected void onMeasure(int widthSpec, int heightSpec) {
        int want = (int) (260 * getResources().getDisplayMetrics().density);
        int w = resolveSize(want, widthSpec), h = resolveSize(want, heightSpec);
        setMeasuredDimension(w, h);
    }

    @Override
    protected void onSizeChanged(int w, int h, int ow, int oh) {
        float cy = h / 2f, r = Math.min(w, h) * 0.31f;
        liveShader = new LinearGradient(0, cy - r, 0, cy + r, accent2, accent, Shader.TileMode.CLAMP);
        idleShader = new LinearGradient(0, cy - r, 0, cy + r, idleTop, idleBottom, Shader.TileMode.CLAMP);
        waitShader = new LinearGradient(0, cy - r, 0, cy + r, warn, 0xFFE08A00, Shader.TileMode.CLAMP);
    }

    @Override
    protected void drawableStateChanged() {
        super.drawableStateChanged();
        invalidate();
    }

    @Override
    protected void onDraw(Canvas c) {
        float cx = getWidth() / 2f, cy = getHeight() / 2f;
        float maxR = Math.min(cx, cy);
        float r = maxR * 0.62f;
        float t = (SystemClock.uptimeMillis() - t0) / 1000f;
        float density = getResources().getDisplayMetrics().density;

        if (mode == LIVE) {
            float target = levelToUnit(MicEngine.level);
            shown += (target - shown) * (target > shown ? 0.5f : 0.12f);
            halo.setColor(accent);
            halo.setAlpha((int) (40 + 80 * shown));
            c.drawCircle(cx, cy, r + (maxR - r) * (0.25f + 0.6f * shown), halo);
            ring.setColor(accent);
            ring.setStrokeWidth(2f * density);
            for (int i = 0; i < 3; i++) {
                float ph = (t * 0.55f + i / 3f) % 1f;
                ring.setAlpha((int) (255 * (1f - ph) * (0.25f + 0.5f * shown)));
                c.drawCircle(cx, cy, r + (maxR - r) * ph, ring);
            }
        } else if (mode == IDLE) {
            ring.setColor(accent);
            ring.setAlpha(110);
            ring.setStrokeWidth(3f * density);
            c.drawCircle(cx, cy, r + 10f * density, ring);
            shown = 0f;
        } else {
            arc.setColor(mode == WAITING ? warn : accent);
            arc.setStrokeWidth(4f * density);
            float ar = r + 12f * density;
            arcBox.set(cx - ar, cy - ar, cx + ar, cy + ar);
            c.drawArc(arcBox, (t * 300f) % 360f, 90f, false, arc);
        }

        float scale = isPressed() ? 0.95f : 1f;
        core.setShader(mode == LIVE ? liveShader : mode == WAITING ? waitShader : idleShader);
        c.drawCircle(cx, cy, r * scale, core);

        int is = (int) (r * 0.95f * scale);
        icon.setBounds((int) (cx - is / 2f), (int) (cy - is / 2f), (int) (cx + is / 2f), (int) (cy + is / 2f));
        icon.setAlpha(mode == IDLE ? 235 : 255);
        icon.draw(c);

        if (mode != IDLE) postInvalidateOnAnimation();
    }

    private static float levelToUnit(float peak) {
        float db = 20f * (float) Math.log10(Math.max(peak, 1e-5f));
        return Math.max(0f, Math.min(1f, (db + 48f) / 48f));
    }
}
