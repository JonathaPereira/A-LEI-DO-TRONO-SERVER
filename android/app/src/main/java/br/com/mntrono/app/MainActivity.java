package br.com.mntrono.app;

import android.os.Bundle;
import androidx.activity.OnBackPressedCallback;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle state) {
    registerPlugin(TronoAndroidPlugin.class);
    super.onCreate(state);
    WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
    WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView())
        .setAppearanceLightStatusBars(false);
    WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView())
        .setAppearanceLightNavigationBars(false);
    // This activity owns safe-area and IME sizing. SystemBars insets handling is disabled
    // in capacitor.config.json to avoid subtracting the keyboard height twice.
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
}
