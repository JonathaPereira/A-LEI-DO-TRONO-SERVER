package br.com.mntrono.app;

import android.app.*;
import android.content.*;
import android.content.pm.ServiceInfo;
import android.media.AudioAttributes;
import android.media.AudioDeviceInfo;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.net.wifi.WifiManager;
import android.os.*;
import androidx.core.app.NotificationCompat;
import java.util.List;
import java.util.function.Consumer;

/**
 * Holds the Android foreground call lease, CPU/Wi-Fi locks, AudioFocus, native audio output route,
 * and lock-screen notification controls (Mute / Leave). WebRTC retains its existing media owner.
 */
public class CallService extends Service {
  static final String CHANNEL = "trono_calls_active";
  static final int ID = 7;
  static final String ACTION_TOGGLE_MUTE = "br.com.mntrono.app.ACTION_TOGGLE_MUTE";
  static final String ACTION_LEAVE_CALL = "br.com.mntrono.app.ACTION_LEAVE_CALL";
  static final String ACTION_UPDATE_STATE = "br.com.mntrono.app.ACTION_UPDATE_STATE";

  static volatile String lease;
  static volatile String activeRoomName = "Chamada no Trono";
  static volatile boolean activeMuted = false;
  static volatile String activeAudioRoute = "speaker";
  static volatile Consumer<String> actionListener;

  private PowerManager.WakeLock cpu;
  private WifiManager.WifiLock wifi;
  private Integer previousAudioMode;
  private Boolean previousSpeakerphone;
  private AudioFocusRequest audioFocusRequest;
  private BroadcastReceiver noisyReceiver;
  private String ownedLease;

  @Override
  public void onCreate() {
    super.onCreate();
    NotificationManager manager = getSystemService(NotificationManager.class);
    if (manager != null) {
      NotificationChannel channel =
          new NotificationChannel(
              CHANNEL, "Chamadas em andamento", NotificationManager.IMPORTANCE_DEFAULT);
      channel.setSound(null, null);
      channel.enableVibration(false);
      channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
      manager.createNotificationChannel(channel);
    }
  }

  private Notification buildCallNotification() {
    Intent open =
        new Intent(this, MainActivity.class)
            .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
    PendingIntent openAction =
        PendingIntent.getActivity(
            this, 7, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

    Intent muteIntent = new Intent(this, CallService.class).setAction(ACTION_TOGGLE_MUTE);
    PendingIntent muteAction =
        PendingIntent.getService(
            this,
            8,
            muteIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

    Intent leaveIntent = new Intent(this, CallService.class).setAction(ACTION_LEAVE_CALL);
    PendingIntent leaveAction =
        PendingIntent.getService(
            this,
            9,
            leaveIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

    String room = activeRoomName != null && !activeRoomName.isEmpty() ? activeRoomName : "Voz";
    String routeLabel =
        "bluetooth".equals(activeAudioRoute)
            ? "Bluetooth"
            : "earpiece".equals(activeAudioRoute) ? "Auricular" : "Viva-voz";
    String subtitle =
        (activeMuted ? "Microfone mutado" : "Microfone ativo") + " · " + routeLabel;

    return new NotificationCompat.Builder(this, CHANNEL)
        .setSmallIcon(R.drawable.ic_trono_notification)
        .setContentTitle("Chamada ativa · " + room)
        .setContentText(subtitle)
        .setContentIntent(openAction)
        .setOngoing(true)
        .setSilent(true)
        .setOnlyAlertOnce(true)
        .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
        .setPriority(NotificationCompat.PRIORITY_HIGH)
        .setCategory(NotificationCompat.CATEGORY_CALL)
        .addAction(0, activeMuted ? "Ativar mic" : "Mutar", muteAction)
        .addAction(0, "Desligar", leaveAction)
        .build();
  }

  private void refreshNotification() {
    if (lease == null) return;
    NotificationManager manager = getSystemService(NotificationManager.class);
    if (manager != null) manager.notify(ID, buildCallNotification());
  }

  static void updateNotificationState(Context context, String roomName, boolean muted) {
    if (roomName != null && !roomName.trim().isEmpty()) activeRoomName = roomName.trim();
    activeMuted = muted;
    if (lease == null) return;
    try {
      Intent update = new Intent(context, CallService.class).setAction(ACTION_UPDATE_STATE);
      context.startService(update);
    } catch (Exception ignored) {
    }
  }

  static boolean isBluetoothRouteAvailable(Context context) {
    try {
      AudioManager audio = (AudioManager) context.getSystemService(Context.AUDIO_SERVICE);
      if (audio == null) return false;
      if (Build.VERSION.SDK_INT >= 31) {
        List<AudioDeviceInfo> devices = audio.getAvailableCommunicationDevices();
        for (AudioDeviceInfo dev : devices) {
          int type = dev.getType();
          if (type == AudioDeviceInfo.TYPE_BLUETOOTH_SCO
              || type == AudioDeviceInfo.TYPE_BLE_HEADSET
              || type == AudioDeviceInfo.TYPE_BLE_SPEAKER) {
            return true;
          }
        }
        return false;
      }
      return audio.isBluetoothScoAvailableOffCall();
    } catch (Exception ignored) {
      return false;
    }
  }

  static String getAudioRoute() {
    return activeAudioRoute;
  }

  @SuppressWarnings("deprecation")
  static String setAudioRoute(Context context, String requested) {
    String route =
        "earpiece".equals(requested) || "bluetooth".equals(requested) ? requested : "speaker";
    try {
      AudioManager audio = (AudioManager) context.getSystemService(Context.AUDIO_SERVICE);
      if (audio != null) {
        if (Build.VERSION.SDK_INT >= 31) {
          List<AudioDeviceInfo> devices = audio.getAvailableCommunicationDevices();
          AudioDeviceInfo target = null;
          for (AudioDeviceInfo dev : devices) {
            int type = dev.getType();
            if ("bluetooth".equals(route)
                && (type == AudioDeviceInfo.TYPE_BLUETOOTH_SCO
                    || type == AudioDeviceInfo.TYPE_BLE_HEADSET)) {
              target = dev;
              break;
            }
            if ("speaker".equals(route) && type == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER) {
              target = dev;
              break;
            }
            if ("earpiece".equals(route)
                && (type == AudioDeviceInfo.TYPE_BUILTIN_EARPIECE
                    || type == AudioDeviceInfo.TYPE_WIRED_HEADSET
                    || type == AudioDeviceInfo.TYPE_WIRED_HEADPHONES
                    || type == AudioDeviceInfo.TYPE_USB_HEADSET)) {
              target = dev;
              break;
            }
          }
          if (target != null) {
            audio.setCommunicationDevice(target);
          } else if ("bluetooth".equals(route)) {
            route = "speaker";
            for (AudioDeviceInfo dev : devices) {
              if (dev.getType() == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER) {
                audio.setCommunicationDevice(dev);
                break;
              }
            }
          }
        } else {
          if ("bluetooth".equals(route) && audio.isBluetoothScoAvailableOffCall()) {
            audio.setSpeakerphoneOn(false);
            audio.startBluetoothSco();
            audio.setBluetoothScoOn(true);
          } else {
            audio.stopBluetoothSco();
            audio.setBluetoothScoOn(false);
            if ("bluetooth".equals(route)) route = "speaker";
            audio.setSpeakerphoneOn("speaker".equals(route));
          }
        }
      }
    } catch (Exception ignored) {
    }
    activeAudioRoute = route;
    updateNotificationState(context, activeRoomName, activeMuted);
    return route;
  }

  private void acquireAudioFocus(AudioManager audio) {
    if (audioFocusRequest != null) return;
    try {
      AudioAttributes attrs =
          new AudioAttributes.Builder()
              .setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION)
              .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
              .build();
      audioFocusRequest =
          new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
              .setAudioAttributes(attrs)
              .setAcceptsDelayedFocusGain(true)
              .setOnAudioFocusChangeListener(focusChange -> {})
              .build();
      audio.requestAudioFocus(audioFocusRequest);
    } catch (Exception ignored) {
    }
  }

  @Override
  public int onStartCommand(Intent intent, int flags, int startId) {
    String action = intent == null ? null : intent.getAction();
    if (ACTION_TOGGLE_MUTE.equals(action)) {
      Consumer<String> listener = actionListener;
      if (listener != null) listener.accept("toggleMute");
      return START_NOT_STICKY;
    }
    if (ACTION_LEAVE_CALL.equals(action)) {
      Consumer<String> listener = actionListener;
      if (listener != null) listener.accept("leave");
      lease = null;
      stopSelf();
      return START_NOT_STICKY;
    }
    if (ACTION_UPDATE_STATE.equals(action)) {
      refreshNotification();
      return START_NOT_STICKY;
    }

    String requested = intent == null ? null : intent.getStringExtra("lease");
    if (requested == null || !requested.equals(lease)) {
      stopSelf(startId);
      return START_NOT_STICKY;
    }
    String roomExtra = intent.getStringExtra("roomName");
    if (roomExtra != null && !roomExtra.trim().isEmpty()) activeRoomName = roomExtra.trim();
    ownedLease = requested;

    Notification notice = buildCallNotification();
    if (Build.VERSION.SDK_INT >= 29)
      startForeground(
          ID,
          notice,
          ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK
              | (Build.VERSION.SDK_INT >= 30 ? ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE : 0));
    else startForeground(ID, notice);

    if (cpu == null) {
      cpu =
          ((PowerManager) getSystemService(POWER_SERVICE))
              .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "MNTrono:Call");
      cpu.setReferenceCounted(false);
      cpu.acquire();
    }
    if (wifi == null) {
      try {
        WifiManager wifiManager =
            (WifiManager) getApplicationContext().getSystemService(Context.WIFI_SERVICE);
        if (wifiManager != null) {
          int mode =
              Build.VERSION.SDK_INT >= 29
                  ? WifiManager.WIFI_MODE_FULL_LOW_LATENCY
                  : WifiManager.WIFI_MODE_FULL_HIGH_PERF;
          wifi = wifiManager.createWifiLock(mode, "MNTrono:CallWifi");
          wifi.setReferenceCounted(false);
          wifi.acquire();
        }
      } catch (Exception ignored) {
      }
    }
    if (previousAudioMode == null) {
      try {
        AudioManager audio = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
        if (audio != null) {
          previousAudioMode = audio.getMode();
          previousSpeakerphone = audio.isSpeakerphoneOn();
          audio.setMode(AudioManager.MODE_IN_COMMUNICATION);
          acquireAudioFocus(audio);
          setAudioRoute(this, activeAudioRoute);
        }
      } catch (Exception ignored) {
      }
    }
    if (noisyReceiver == null) {
      noisyReceiver =
          new BroadcastReceiver() {
            @Override
            public void onReceive(Context ctx, Intent noisyIntent) {
              if (AudioManager.ACTION_AUDIO_BECOMING_NOISY.equals(noisyIntent.getAction())
                  && lease != null) {
                // Headset/Bluetooth unplugged mid-call: keep call audio alive via earpiece/speaker.
                setAudioRoute(ctx, "speaker");
              }
            }
          };
      IntentFilter filter = new IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY);
      if (Build.VERSION.SDK_INT >= 33) {
        registerReceiver(noisyReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
      } else {
        registerReceiver(noisyReceiver, filter);
      }
    }
    return START_NOT_STICKY; // Never restore a phantom call after the process was killed.
  }

  @Override
  public void onTaskRemoved(Intent root) {
    lease = null;
    stopSelf(); // A deliberate dismissal ends the native lease too.
    super.onTaskRemoved(root);
  }

  @SuppressWarnings("deprecation")
  @Override
  public void onDestroy() {
    if (noisyReceiver != null) {
      try {
        unregisterReceiver(noisyReceiver);
      } catch (Exception ignored) {
      }
      noisyReceiver = null;
    }
    if (cpu != null && cpu.isHeld()) cpu.release();
    cpu = null;
    if (wifi != null && wifi.isHeld()) wifi.release();
    wifi = null;
    try {
      AudioManager audio = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
      if (audio != null) {
        if (audioFocusRequest != null) {
          audio.abandonAudioFocusRequest(audioFocusRequest);
          audioFocusRequest = null;
        }
        if (Build.VERSION.SDK_INT >= 31) {
          audio.clearCommunicationDevice();
        } else {
          audio.stopBluetoothSco();
          audio.setBluetoothScoOn(false);
          if (previousSpeakerphone != null) audio.setSpeakerphoneOn(previousSpeakerphone);
        }
        if (previousAudioMode != null) audio.setMode(previousAudioMode);
      }
    } catch (Exception ignored) {
    }
    previousAudioMode = null;
    previousSpeakerphone = null;
    if (ownedLease != null && ownedLease.equals(lease)) lease = null;
    stopForeground(STOP_FOREGROUND_REMOVE);
    super.onDestroy();
  }

  @Override
  public IBinder onBind(Intent intent) {
    return null;
  }
}
