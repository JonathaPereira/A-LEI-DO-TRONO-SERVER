package br.com.mntrono.app;

import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import androidx.activity.OnBackPressedCallback;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  private final Handler keepAliveHandler = new Handler(Looper.getMainLooper());
  private final Runnable keepAliveTask = this::keepCallWebViewAliveNow;

  @Override
  public void onCreate(Bundle state) {
    registerPlugin(TronoAndroidPlugin.class);
    super.onCreate(state);
    WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
    WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView())
        .setAppearanceLightStatusBars(false);
    WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView())
        .setAppearanceLightNavigationBars(false);
    ViewCompat.setOnApplyWindowInsetsListener(
        bridge.getWebView(),
        (view, insets) -> {
          androidx.core.graphics.Insets bars =
              insets.getInsets(
                  WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
          androidx.core.graphics.Insets ime = insets.getInsets(WindowInsetsCompat.Type.ime());
          android.view.ViewGroup.LayoutParams parameters = view.getLayoutParams();
          if (parameters instanceof android.view.ViewGroup.MarginLayoutParams) {
            android.view.ViewGroup.MarginLayoutParams margins =
                (android.view.ViewGroup.MarginLayoutParams) parameters;
            margins.setMargins(bars.left, bars.top, bars.right, Math.max(bars.bottom, ime.bottom));
            view.setLayoutParams(margins);
          }
          bridge
              .getWebView()
              .evaluateJavascript(
                  "document.documentElement.dataset.keyboard='"
                      + (ime.bottom > bars.bottom ? "true" : "false")
                      + "'",
                  null);
          return WindowInsetsCompat.CONSUMED;
        });
    if (bridge != null && bridge.getWebView() != null) {
      bridge.getWebView().getSettings().setMediaPlaybackRequiresUserGesture(false);
      bridge.getWebView().setOverScrollMode(android.view.View.OVER_SCROLL_NEVER);
    }
    getOnBackPressedDispatcher()
        .addCallback(
            this,
            new OnBackPressedCallback(true) {
              @Override
              public void handleOnBackPressed() {
                // Close overlays first; never destroy/reload the WebView or its active call.
                bridge
                    .getWebView()
                    .evaluateJavascript(
                        "window.dispatchEvent(new Event('trono-android-back'))", null);
              }
            });
  }

  private void keepCallWebViewAliveNow() {
    if (CallService.lease == null || bridge == null || bridge.getWebView() == null) return;
    // Capacitor's BridgeActivity pauses the WebView on screen-off/background, which suspends
    // WebRTC audio and JS timers. Resume the WebView while CallService holds an active call lease.
    bridge.getWebView().onResume();
    bridge.getWebView().resumeTimers();
  }

  private void keepCallWebViewAlive() {
    if (CallService.lease == null) return;
    keepCallWebViewAliveNow();
    // Android 12+ fires onWindowVisibilityChanged(GONE) slightly after onStop() when turning off
    // the display; re-assert WebView resume right after the transition completes.
    keepAliveHandler.removeCallbacks(keepAliveTask);
    keepAliveHandler.postDelayed(keepAliveTask, 180);
  }

  @Override
  public void onPause() {
    super.onPause();
    keepCallWebViewAlive();
  }

  @Override
  public void onStop() {
    super.onStop();
    keepCallWebViewAlive();
  }

  @Override
  public void onWindowFocusChanged(boolean hasFocus) {
    super.onWindowFocusChanged(hasFocus);
    if (!hasFocus) keepCallWebViewAlive();
  }

  @Override
  public void onDestroy() {
    keepAliveHandler.removeCallbacks(keepAliveTask);
    super.onDestroy();
  }
}
