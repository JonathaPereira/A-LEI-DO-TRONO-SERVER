package br.com.mntrono.app;

import com.getcapacitor.JSObject;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;
import java.util.Map;

public class TronoMessagingService extends FirebaseMessagingService {
  @Override
  public void onNewToken(String token) {
    getSharedPreferences("trono_device", 0).edit().putString("push_token", token).apply();
  }

  @Override
  public void onMessageReceived(RemoteMessage message) {
    Map<String, String> data = message.getData();
    JSObject target = new JSObject();
    target.put("accountId", data.get("accountId"));
    target.put("type", data.get("type"));
    target.put("id", data.get("id"));
    NativeNotices.show(
        this,
        data.getOrDefault("key", message.getMessageId()),
        "MN Trono",
        "Você tem uma nova mensagem ou convite na Corte.",
        target);
  }
}
