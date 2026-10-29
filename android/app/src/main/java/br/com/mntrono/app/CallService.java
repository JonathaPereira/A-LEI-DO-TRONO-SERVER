package br.com.mntrono.app;

import android.app.*;
import android.content.*;
import android.content.pm.ServiceInfo;
import android.os.*;
import androidx.core.app.NotificationCompat;

/** Holds only the foreground lease and CPU lock. WebRTC retains its existing media owner. */
public class CallService extends Service {
  static final String CHANNEL = "trono_calls";
  static final int ID = 7;
  static volatile String lease;
  private PowerManager.WakeLock cpu;
  private String ownedLease;

  @Override
  public void onCreate() {
    super.onCreate();
    NotificationManager manager = getSystemService(NotificationManager.class);
    manager.createNotificationChannel(
        new NotificationChannel(
            CHANNEL, "Chamadas em andamento", NotificationManager.IMPORTANCE_LOW));
  }

  @Override
  public int onStartCommand(Intent intent, int flags, int startId) {
    String requested = intent == null ? null : intent.getStringExtra("lease");
    if (requested == null || !requested.equals(lease)) {
      stopSelf(startId);
      return START_NOT_STICKY;
    }
    ownedLease = requested;
    Intent open =
        new Intent(this, MainActivity.class)
            .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
    PendingIntent action =
        PendingIntent.getActivity(
            this, 7, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    Notification notice =
        new NotificationCompat.Builder(this, CHANNEL)
            .setSmallIcon(R.drawable.ic_trono_notification)
            .setContentTitle("Chamada no Trono")
            .setContentText("Toque para voltar à chamada e aos controles de áudio.")
            .setContentIntent(action)
            .setOngoing(true)
            .setSilent(true)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .build();
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
    return START_NOT_STICKY; // Never restore a phantom call after the process was killed.
  }

  @Override
  public void onTaskRemoved(Intent root) {
    lease = null;
    stopSelf(); // A deliberate dismissal ends the native lease too.
    super.onTaskRemoved(root);
  }

  @Override
  public void onDestroy() {
    if (cpu != null && cpu.isHeld()) cpu.release();
    cpu = null;
    if (ownedLease != null && ownedLease.equals(lease)) lease = null;
    stopForeground(STOP_FOREGROUND_REMOVE);
    super.onDestroy();
  }

  @Override
  public IBinder onBind(Intent intent) {
    return null;
  }
}
