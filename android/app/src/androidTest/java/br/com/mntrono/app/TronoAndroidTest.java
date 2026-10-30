package br.com.mntrono.app;

import static org.junit.Assert.*;

import android.Manifest;
import android.app.*;
import android.content.*;
import android.os.SystemClock;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.rule.GrantPermissionRule;
import java.util.concurrent.*;
import org.junit.*;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class TronoAndroidTest {
  @Rule
  public GrantPermissionRule permissions =
      GrantPermissionRule.grant(
          Manifest.permission.RECORD_AUDIO,
          Manifest.permission.CAMERA,
          Manifest.permission.POST_NOTIFICATIONS);

  private ActivityScenario<MainActivity> scenario;

  private String js(String expression) throws Exception {
    CountDownLatch result = new CountDownLatch(1);
    final String[] value = {"null"};
    scenario.onActivity(
        activity ->
            activity
                .getBridge()
                .getWebView()
                .evaluateJavascript(
                    expression,
                    raw -> {
                      value[0] = raw;
                      result.countDown();
                    }));
    assertTrue("WebView did not answer", result.await(10, TimeUnit.SECONDS));
    return value[0];
  }

  private void await(String expression) throws Exception {
    long until = SystemClock.elapsedRealtime() + 30000;
    while (SystemClock.elapsedRealtime() < until) {
      if ("true".equals(js("Boolean(" + expression + ")"))) return;
      SystemClock.sleep(200);
    }
    fail(
        "Timed out: "
            + expression
            + "; state: "
            + js(
                "JSON.stringify({url:location.href,auth:window.TronoAuth?.forms.getSnapshot().message,network:window.TronoNetwork?.connected,voice:window.TronoSocial?.voiceJoined})"));
  }

  @After
  public void close() {
    if (scenario != null) scenario.close();
  }

  @Test
  public void actualWebViewKeepsMicrophoneAndForegroundLeaseWhenMinimized() throws Exception {
    scenario = ActivityScenario.launch(MainActivity.class);
    await("window.TronoAuth && window.TronoAndroid");
    assertEquals("\"android\"", js("document.documentElement.dataset.platform"));
    js(
        "window.TronoAuth.forms.open('login');"
            + " window.TronoAuth.forms.setField('email','android-native@example.test');"
            + " window.TronoAuth.forms.setField('password','Senha12!'); void"
            + " window.TronoAuth.forms.submit()");
    await(
        "window.TronoAuth.user && window.TronoNetwork.connected &&"
            + " document.querySelector('[data-voice-channel=\"chat-jogos\"]')");
    await(
        "document.querySelector('#chatOnlyScreen').getBoundingClientRect().width >= innerWidth -"
            + " 2");
    js("document.querySelector('[data-voice-channel=\"chat-jogos\"]').click()");
    await(
        "window.TronoSocial.voiceJoined && window.TronoSocial.getLocalAudioTrack()?.readyState ==="
            + " 'live'");
    js("window.__androidTrack = window.TronoSocial.getLocalAudioTrack()");
    assertNotNull("Call service was not started", CallService.lease);
    InstrumentationRegistry.getInstrumentation()
        .getUiAutomation()
        .executeShellCommand("input keyevent KEYCODE_HOME")
        .close();
    SystemClock.sleep(5000);
    assertNotNull("Call service ended on Home", CallService.lease);
    await(
        "window.TronoSocial.voiceJoined && window.__androidTrack ==="
            + " window.TronoSocial.getLocalAudioTrack() && window.__androidTrack.readyState ==="
            + " 'live'");
    js(
        "void window.TronoAndroid.notify({key:'android-native-test',title:'Teste Trono',body:'Aviso"
            + " nativo',target:{type:'friends',id:window.TronoAuth.user.id,accountId:window.TronoAuth.user.id}})");
    SystemClock.sleep(800);
    Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
    NotificationManager manager = context.getSystemService(NotificationManager.class);
    assertTrue(
        "No native message notification",
        java.util.Arrays.stream(manager.getActiveNotifications())
            .anyMatch(item -> item.getId() != CallService.ID));
    context.startActivity(
        new Intent(context, MainActivity.class)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP));
    await("window.TronoSocial.voiceJoined && window.__androidTrack.readyState === 'live'");
    js("void window.TronoSocial.leaveVoice()");
    await("!window.TronoSocial.voiceJoined && window.__androidTrack.readyState === 'ended'");
    SystemClock.sleep(500);
    assertNull("Native service outlived explicit leave", CallService.lease);
    assertFalse(
        java.util.Arrays.stream(manager.getActiveNotifications())
            .anyMatch(item -> item.getId() == CallService.ID));
    js("void window.TronoAuth.logout()");
    await("!window.TronoAuth.user");
    SystemClock.sleep(500);
    assertEquals(
        "Logout must clear account notifications", 0, manager.getActiveNotifications().length);
  }
}
