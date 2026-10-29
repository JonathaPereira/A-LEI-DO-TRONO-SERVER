package br.com.mntrono.app;

import android.Manifest;
import android.content.*;
import android.os.Build;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import com.getcapacitor.*;
import com.getcapacitor.annotation.*;
import com.google.firebase.FirebaseApp;
import com.google.firebase.messaging.FirebaseMessaging;
import java.security.KeyStore;
import java.util.*;
import javax.crypto.*;
import javax.crypto.spec.GCMParameterSpec;

@CapacitorPlugin(
    name = "TronoAndroid",
    permissions = {
      @Permission(
          alias = "microphone",
          strings = {Manifest.permission.RECORD_AUDIO}),
      @Permission(
          alias = "notifications",
          strings = {Manifest.permission.POST_NOTIFICATIONS})
    })
public class TronoAndroidPlugin extends Plugin {
  private final Set<String> cancelled = Collections.synchronizedSet(new LinkedHashSet<>());
  private JSObject pendingTarget;

  private SharedPreferences device() {
    return getContext().getSharedPreferences("trono_device", 0);
  }

  @PluginMethod
  public void prepareVoice(PluginCall call) {
    String lease = call.getString("lease", "");
    if (lease.isEmpty() || cancelled.contains(lease)) {
      call.reject("A chamada foi cancelada.");
      return;
    }
    if (getPermissionState("microphone") != PermissionState.GRANTED) {
      requestPermissionForAlias("microphone", call, "microphoneResult");
      return;
    }
    startVoice(call);
  }

  @PermissionCallback
  private void microphoneResult(PluginCall call) {
    if (getPermissionState("microphone") != PermissionState.GRANTED) {
      call.reject("Permita o microfone para entrar na chamada.");
      return;
    }
    startVoice(call);
  }

  private void startVoice(PluginCall call) {
    synchronized (cancelled) {
      String lease = call.getString("lease", "");
      if (cancelled.contains(lease) || !NativeNotices.foreground) {
        call.reject("Volte ao Trono para iniciar a chamada.");
        return;
      }
      try {
        CallService.lease = lease;
        Intent start = new Intent(getContext(), CallService.class).putExtra("lease", lease);
        if (Build.VERSION.SDK_INT >= 26) getContext().startForegroundService(start);
        else getContext().startService(start);
        call.resolve();
      } catch (Exception error) {
        if (lease.equals(CallService.lease)) CallService.lease = null;
        call.reject("Não foi possível manter a chamada em segundo plano.", error);
      }
    }
  }

  @PluginMethod
  public void endVoice(PluginCall call) {
    synchronized (cancelled) {
      String lease = call.getString("lease", "");
      cancelled.add(lease);
      while (cancelled.size() > 64) cancelled.remove(cancelled.iterator().next());
      if (lease.equals(CallService.lease)) {
        CallService.lease = null;
        getContext().stopService(new Intent(getContext(), CallService.class));
      }
      call.resolve();
    }
  }

  @PluginMethod
  public void minimize(PluginCall call) {
    getActivity()
        .runOnUiThread(
            () -> {
              getActivity().moveTaskToBack(true);
              call.resolve();
            });
  }

  @PluginMethod
  public void permissions(PluginCall call) {
    call.resolve(permissionResult());
  }

  private JSObject permissionResult() {
    boolean granted =
        Build.VERSION.SDK_INT < 33
            || getPermissionState("notifications") == PermissionState.GRANTED;
    return new JSObject().put("notifications", granted ? "granted" : "default");
  }

  @PluginMethod
  public void requestNotifications(PluginCall call) {
    if (Build.VERSION.SDK_INT >= 33
        && getPermissionState("notifications") != PermissionState.GRANTED)
      requestPermissionForAlias("notifications", call, "notificationResult");
    else call.resolve(permissionResult());
  }

  @PermissionCallback
  private void notificationResult(PluginCall call) {
    JSObject answer = permissionResult();
    if (!answer.optString("notifications").equals("granted")) answer.put("notifications", "denied");
    call.resolve(answer);
  }

  @PluginMethod
  public void notify(PluginCall call) {
    JSObject target = call.getObject("target");
    if (target != null)
      NativeNotices.show(
          getContext(),
          call.getString("key", ""),
          call.getString("title", "MN Trono"),
          call.getString("body", ""),
          target);
    call.resolve();
  }

  @PluginMethod
  public void setAccount(PluginCall call) {
    String account = call.getString("accountId");
    String previous = device().getString("account", null);
    boolean enabled = call.getBoolean("enabled", true);
    JSArray input = call.getArray("muted", new JSArray());
    Set<String> muted = new HashSet<>();
    for (int i = 0; i < Math.min(input.length(), 1000); i++) muted.add(input.optString(i));
    device()
        .edit()
        .putString("account", account)
        .putBoolean("notices_enabled", enabled)
        .putStringSet("muted", muted)
        .apply();
    if (!Objects.equals(previous, account)) pendingTarget = null;
    if (!Objects.equals(previous, account) || !enabled) {
      NativeNotices.clear(getContext());
    }
    call.resolve();
  }

  @PluginMethod
  public void pushRegistration(PluginCall call) {
    String id = device().getString("device_id", null);
    if (id == null) {
      id = UUID.randomUUID().toString();
      device().edit().putString("device_id", id).apply();
    }
    JSObject answer = new JSObject().put("deviceId", id);
    boolean configured = !FirebaseApp.getApps(getContext()).isEmpty();
    answer.put("configured", configured);
    if (!configured) {
      call.resolve(answer);
      return;
    }
    FirebaseMessaging.getInstance()
        .getToken()
        .addOnCompleteListener(
            task -> {
              if (task.isSuccessful()) answer.put("token", task.getResult());
              call.resolve(answer);
            });
  }

  // Android Keystore protects the remembered session; Android backup is disabled in the manifest.
  private javax.crypto.SecretKey sessionKey() throws Exception {
    KeyStore store = KeyStore.getInstance("AndroidKeyStore");
    store.load(null);
    if (!store.containsAlias("trono_session")) {
      KeyGenerator generator =
          KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
      generator.init(
          new KeyGenParameterSpec.Builder(
                  "trono_session", KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
              .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
              .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
              .build());
      generator.generateKey();
    }
    return (javax.crypto.SecretKey) store.getKey("trono_session", null);
  }

  @PluginMethod
  public void readSession(PluginCall call) {
    try {
      String raw = device().getString("session", null);
      if (raw == null) {
        call.resolve(new JSObject().put("value", org.json.JSONObject.NULL));
        return;
      }
      String[] parts = raw.split(":");
      Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
      cipher.init(
          Cipher.DECRYPT_MODE,
          sessionKey(),
          new GCMParameterSpec(128, Base64.decode(parts[0], Base64.NO_WRAP)));
      String value =
          new String(
              cipher.doFinal(Base64.decode(parts[1], Base64.NO_WRAP)),
              java.nio.charset.StandardCharsets.UTF_8);
      call.resolve(new JSObject().put("value", new JSObject(value)));
    } catch (Exception error) {
      device().edit().remove("session").apply();
      call.resolve(new JSObject().put("value", org.json.JSONObject.NULL));
    }
  }

  @PluginMethod
  public void saveSession(PluginCall call) {
    JSObject value = call.getObject("value");
    try {
      if (value == null) {
        device().edit().remove("session").commit();
        call.resolve();
        return;
      }
      Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
      cipher.init(Cipher.ENCRYPT_MODE, sessionKey());
      String raw =
          Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP)
              + ":"
              + Base64.encodeToString(
                  cipher.doFinal(
                      value.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8)),
                  Base64.NO_WRAP);
      if (!device().edit().putString("session", raw).commit())
        throw new Exception("Storage unavailable");
      call.resolve();
    } catch (Exception error) {
      call.reject("Não foi possível lembrar a conta neste aparelho.");
    }
  }

  @PluginMethod
  public void consumeNotification(PluginCall call) {
    JSObject value = new JSObject();
    if (pendingTarget != null) value.put("target", pendingTarget);
    pendingTarget = null;
    call.resolve(value);
  }

  private void acceptIntent(Intent intent) {
    String raw = intent.getStringExtra("tronoTarget");
    intent.removeExtra("tronoTarget");
    if (raw == null || raw.length() > 2048) return;
    try {
      JSObject target = new JSObject(raw);
      pendingTarget = target;
      notifyListeners("notificationClick", new JSObject().put("target", target), true);
    } catch (Exception ignored) {
    }
  }

  @Override
  public void load() {
    acceptIntent(getActivity().getIntent());
  }

  @Override
  protected void handleOnNewIntent(Intent intent) {
    acceptIntent(intent);
  }

  @Override
  protected void handleOnResume() {
    NativeNotices.foreground = true;
  }

  @Override
  protected void handleOnPause() {
    NativeNotices.foreground = false;
  }

  @Override
  protected void handleOnDestroy() {
    CallService.lease = null;
    getContext().stopService(new Intent(getContext(), CallService.class));
  }
}
