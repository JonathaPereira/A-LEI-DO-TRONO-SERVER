package br.com.mntrono.app;

import android.Manifest;
import android.app.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import com.getcapacitor.JSObject;

final class NativeNotices {
  static volatile boolean foreground;
  static final String CHANNEL = "trono_messages";

  static void show(Context context, String key, String title, String body, JSObject target) {
    String account = context.getSharedPreferences("trono_device", 0).getString("account", null);
    if (foreground || account == null || !account.equals(target.optString("accountId"))) return;
    if (Build.VERSION.SDK_INT >= 33
        && context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
            != PackageManager.PERMISSION_GRANTED) return;
    android.content.SharedPreferences policy = context.getSharedPreferences("trono_device", 0);
    if (!policy.getBoolean("notices_enabled", true)
        || policy
            .getStringSet("muted", java.util.Collections.emptySet())
            .contains(target.optString("id"))) return;
    String kind = target.optString("type");
    if (!kind.equals("direct") && !kind.equals("channel") && !kind.equals("friends")) return;
    NotificationManager manager = context.getSystemService(NotificationManager.class);
    manager.createNotificationChannel(
        new NotificationChannel(
            CHANNEL, "Mensagens e convites", NotificationManager.IMPORTANCE_DEFAULT));
    int id = key.hashCode();
    if (id == CallService.ID) id++;
    Intent open =
        new Intent(context, MainActivity.class)
            .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
    open.setAction("br.com.mntrono.NOTICE." + id).putExtra("tronoTarget", target.toString());
    PendingIntent action =
        PendingIntent.getActivity(
            context, id, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    manager.notify(
        id,
        new NotificationCompat.Builder(context, CHANNEL)
            .setSmallIcon(R.drawable.ic_trono_notification)
            .setContentTitle(title)
            .setContentText(body)
            .setContentIntent(action)
            .setAutoCancel(true)
            .setOnlyAlertOnce(true)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .build());
  }

  static void clear(Context context) {
    NotificationManager manager = context.getSystemService(NotificationManager.class);
    for (android.service.notification.StatusBarNotification notice :
        manager.getActiveNotifications())
      if (notice.getId() != CallService.ID) manager.cancel(notice.getId());
  }
}
