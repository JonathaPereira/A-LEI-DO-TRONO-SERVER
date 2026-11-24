package br.com.mntrono.app;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import java.io.BufferedInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URI;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.json.JSONArray;
import org.json.JSONObject;

final class AndroidUpdater {
  interface Listener {
    void onState(JSObject state);
  }

  private static final String RELEASES_API_URL =
      "https://api.github.com/repos/JonathaPereira/A-LEI-DO-TRONO-SERVER/releases?per_page=20";
  private static final String DEFAULT_RELEASE_PAGE =
      "https://github.com/JonathaPereira/A-LEI-DO-TRONO-SERVER/releases/latest";
  private static final Set<String> ALLOWED_HOSTS =
      new HashSet<>(
          Arrays.asList(
              "api.github.com",
              "github.com",
              "objects.githubusercontent.com",
              "release-assets.githubusercontent.com",
              "a-lei-do-trono.surge.sh"));
  private static final Pattern SEMVER = Pattern.compile("^(?:android-)?v?(\\d+)\\.(\\d+)\\.(\\d+)$");
  private static final Pattern SHA256_LINE =
      Pattern.compile("^([a-fA-F0-9]{64})\\s+\\*?(.+)$");
  private static final int CONNECT_TIMEOUT_MS = 15_000;
  private static final int READ_TIMEOUT_MS = 30_000;
  private static final int MAX_REDIRECTS = 5;
  private static final long MAX_TEXT_BYTES = 1024 * 1024;
  private static final long MAX_APK_BYTES = 250L * 1024L * 1024L;

  private final Context context;
  private final Listener listener;
  private final ExecutorService executor = Executors.newSingleThreadExecutor();

  private volatile JSObject currentState = new JSObject().put("status", "idle");
  private volatile ReleaseCandidate pendingRelease = null;
  private volatile File verifiedApkFile = null;

  private static final class ReleaseCandidate {
    final String version;
    final String apkName;
    final String apkUrl;
    final String sha256;
    final String releaseUrl;

    ReleaseCandidate(
        String version, String apkName, String apkUrl, String sha256, String releaseUrl) {
      this.version = version;
      this.apkName = apkName;
      this.apkUrl = apkUrl;
      this.sha256 = sha256;
      this.releaseUrl = releaseUrl;
    }
  }

  AndroidUpdater(Context context, Listener listener) {
    this.context = context.getApplicationContext();
    this.listener = listener;
  }

  JSObject getState() {
    return currentState;
  }

  void submit(Runnable task) {
    executor.execute(task);
  }

  void shutdown() {
    executor.shutdownNow();
  }

  private void publish(JSObject next) {
    currentState = next;
    listener.onState(next);
  }

  JSObject checkUpdatesSync() {
    publish(new JSObject().put("status", "checking"));
    try {
      String payload = fetchText(RELEASES_API_URL, "application/vnd.github+json");
      JSONArray releases = new JSONArray(payload);
      ReleaseCandidate candidate = selectLatestRelease(releases, BuildConfig.VERSION_NAME);
      if (candidate == null) {
        pendingRelease = null;
        verifiedApkFile = null;
        JSObject current =
            new JSObject().put("status", "current").put("version", BuildConfig.VERSION_NAME);
        publish(current);
        return current;
      }

      pendingRelease = candidate;
      File existing = new File(updatesDir(), safeApkFilename(candidate.version));
      if (existing.isFile() && verifyFileSha256(existing, candidate.sha256)) {
        verifiedApkFile = existing;
        JSObject ready =
            new JSObject()
                .put("status", "ready")
                .put("version", candidate.version)
                .put("sha256", candidate.sha256)
                .put("releaseUrl", candidate.releaseUrl);
        publish(ready);
        return ready;
      }

      verifiedApkFile = null;
      JSObject available =
          new JSObject()
              .put("status", "available")
              .put("version", candidate.version)
              .put("sha256", candidate.sha256)
              .put("releaseUrl", candidate.releaseUrl);
      publish(available);
      return available;
    } catch (Exception error) {
      JSObject failed =
          new JSObject()
              .put("status", "error")
              .put(
                  "message",
                  "Não foi possível verificar atualizações agora. Tente novamente mais tarde.");
      publish(failed);
      return failed;
    }
  }

  JSObject downloadUpdateSync() {
    ReleaseCandidate target = pendingRelease;
    if (target == null) {
      JSObject checked = checkUpdatesSync();
      String status = checked.optString("status", "");
      if (!"available".equals(status) && !"ready".equals(status)) return checked;
      target = pendingRelease;
      if (target == null) return checked;
      if ("ready".equals(status) && verifiedApkFile != null && verifiedApkFile.isFile()) {
        return checked;
      }
    }

    File dir = updatesDir();
    File finalFile = new File(dir, safeApkFilename(target.version));
    File partFile = new File(dir, safeApkFilename(target.version) + ".part");
    if (finalFile.isFile() && verifyFileSha256(finalFile, target.sha256)) {
      verifiedApkFile = finalFile;
      JSObject ready =
          new JSObject()
              .put("status", "ready")
              .put("version", target.version)
              .put("sha256", target.sha256)
              .put("releaseUrl", target.releaseUrl);
      publish(ready);
      return ready;
    }

    if (partFile.exists()) partFile.delete();
    publish(
        new JSObject()
            .put("status", "downloading")
            .put("version", target.version)
            .put("percent", 0)
            .put("releaseUrl", target.releaseUrl));

    HttpURLConnection connection = null;
    try {
      connection = openAllowedConnection(target.apkUrl, "application/octet-stream");
      long totalBytes = connection.getContentLengthLong();
      if (totalBytes > MAX_APK_BYTES) {
        throw new IOException("APK excede o limite de tamanho permitido.");
      }

      MessageDigest digest = MessageDigest.getInstance("SHA-256");
      long downloaded = 0;
      int lastPercent = 0;

      try (InputStream in = new BufferedInputStream(connection.getInputStream());
          FileOutputStream out = new FileOutputStream(partFile)) {
        byte[] buffer = new byte[8192];
        int read;
        while ((read = in.read(buffer)) != -1) {
          downloaded += read;
          if (downloaded > MAX_APK_BYTES) {
            throw new IOException("APK excede o limite de tamanho permitido.");
          }
          digest.update(buffer, 0, read);
          out.write(buffer, 0, read);
          if (totalBytes > 0) {
            int pct = (int) Math.min(99, Math.max(0, (downloaded * 100L) / totalBytes));
            if (pct > lastPercent) {
              lastPercent = pct;
              publish(
                  new JSObject()
                      .put("status", "downloading")
                      .put("version", target.version)
                      .put("percent", pct)
                      .put("releaseUrl", target.releaseUrl));
            }
          }
        }
        out.getFD().sync();
      }

      publish(
          new JSObject()
              .put("status", "verifying")
              .put("version", target.version)
              .put("percent", 100)
              .put("releaseUrl", target.releaseUrl));

      String actualHex = toHex(digest.digest());
      if (!constantTimeEquals(target.sha256, actualHex)) {
        partFile.delete();
        verifiedApkFile = null;
        JSObject mismatch =
            new JSObject()
                .put("status", "error")
                .put("version", target.version)
                .put("releaseUrl", target.releaseUrl)
                .put(
                    "message",
                    "A verificação de integridade (SHA-256) falhou. O arquivo foi descartado.");
        publish(mismatch);
        return mismatch;
      }

      cleanupOldApks(dir, finalFile.getName());
      if (finalFile.exists()) finalFile.delete();
      if (!partFile.renameTo(finalFile)) {
        partFile.delete();
        throw new IOException("Não foi possível preparar o arquivo de atualização.");
      }

      verifiedApkFile = finalFile;
      JSObject ready =
          new JSObject()
              .put("status", "ready")
              .put("version", target.version)
              .put("sha256", target.sha256)
              .put("releaseUrl", target.releaseUrl);
      publish(ready);
      return ready;
    } catch (Exception error) {
      if (partFile.exists()) partFile.delete();
      verifiedApkFile = null;
      JSObject failed =
          new JSObject()
              .put("status", "error")
              .put("version", target.version)
              .put("releaseUrl", target.releaseUrl)
              .put(
                  "message",
                  "Falha ao baixar ou validar o SHA-256 da atualização. Tente novamente.");
      publish(failed);
      return failed;
    } finally {
      if (connection != null) connection.disconnect();
    }
  }

  JSObject installUpdate(Activity activity) throws Exception {
    ReleaseCandidate target = pendingRelease;
    File apk = verifiedApkFile;
    if (target == null || apk == null || !apk.isFile()) {
      throw new IllegalStateException("Nenhuma atualização verificada está pronta para instalação.");
    }
    if (!verifyFileSha256(apk, target.sha256)) {
      apk.delete();
      verifiedApkFile = null;
      JSObject failed =
          new JSObject()
              .put("status", "error")
              .put("version", target.version)
              .put(
                  "message",
                  "A integridade SHA-256 do APK baixado falhou. Baixe a atualização novamente.");
      publish(failed);
      throw new SecurityException("SHA-256 mismatch");
    }

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
        && !context.getPackageManager().canRequestPackageInstalls()) {
      JSObject permissionState =
          new JSObject()
              .put("status", "permission_required")
              .put("version", target.version)
              .put("sha256", target.sha256)
              .put("releaseUrl", target.releaseUrl)
              .put(
                  "message",
                  "Autorize \"Instalar apps desconhecidos\" para o MN Trono e toque novamente em Instalar.");
      publish(permissionState);

      Intent settingsIntent =
          new Intent(
                  Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                  Uri.parse("package:" + context.getPackageName()))
              .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
      activity.startActivity(settingsIntent);
      return new JSObject().put("permissionRequired", true);
    }

    Uri apkUri =
        FileProvider.getUriForFile(context, context.getPackageName() + ".fileprovider", apk);
    Intent installIntent =
        new Intent(Intent.ACTION_VIEW)
            .setDataAndType(apkUri, "application/vnd.android.package-archive")
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
    activity.startActivity(installIntent);
    return new JSObject().put("launched", true);
  }

  void openDownloadPage(Activity activity) {
    String url =
        pendingRelease != null && isAllowedUrl(pendingRelease.releaseUrl)
            ? pendingRelease.releaseUrl
            : DEFAULT_RELEASE_PAGE;
    Intent intent =
        new Intent(Intent.ACTION_VIEW, Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
    activity.startActivity(intent);
  }

  private ReleaseCandidate selectLatestRelease(JSONArray releases, String installedVersion)
      throws Exception {
    String bestVersion = null;
    String bestApkName = null;
    String bestApkUrl = null;
    String bestChecksumUrl = null;
    String bestReleaseUrl = null;

    for (int i = 0; i < releases.length(); i++) {
      JSONObject item = releases.optJSONObject(i);
      if (item == null || item.optBoolean("draft", false) || item.optBoolean("prerelease", false)) {
        continue;
      }
      String tag = item.optString("tag_name", "").trim();
      if (!tag.startsWith("android-v")) continue;
      String version = tag.substring("android-v".length());
      if (compareSemver(version, installedVersion) <= 0) continue;
      if (bestVersion != null && compareSemver(version, bestVersion) <= 0) continue;

      JSONArray assets = item.optJSONArray("assets");
      if (assets == null) continue;
      String expectedApk = "MN-Trono-" + version + "-Android.apk";
      String apkUrl = null;
      String sumUrl = null;
      for (int j = 0; j < assets.length(); j++) {
        JSONObject asset = assets.optJSONObject(j);
        if (asset == null) continue;
        String name = asset.optString("name", "").trim();
        String url = asset.optString("browser_download_url", "").trim();
        if (!isAllowedUrl(url)) continue;
        if (expectedApk.equals(name)) apkUrl = url;
        if ("SHA256SUMS.txt".equals(name)) sumUrl = url;
      }
      if (apkUrl == null || sumUrl == null) continue;

      String htmlUrl = item.optString("html_url", "").trim();
      bestVersion = version;
      bestApkName = expectedApk;
      bestApkUrl = apkUrl;
      bestChecksumUrl = sumUrl;
      bestReleaseUrl = isAllowedUrl(htmlUrl) ? htmlUrl : DEFAULT_RELEASE_PAGE;
    }

    if (bestVersion == null) return null;
    String sumsContent = fetchText(bestChecksumUrl, "text/plain");
    String expectedSha256 = parseSha256ForFile(sumsContent, bestApkName);
    if (expectedSha256 == null) {
      throw new IOException("SHA256SUMS.txt ausente ou inválido para " + bestApkName);
    }
    return new ReleaseCandidate(
        bestVersion, bestApkName, bestApkUrl, expectedSha256, bestReleaseUrl);
  }

  private File updatesDir() {
    File dir = new File(context.getCacheDir(), "updates");
    if (!dir.exists()) dir.mkdirs();
    return dir;
  }

  private static String safeApkFilename(String version) {
    return "trono-update-" + version.replaceAll("[^0-9.]", "") + ".apk";
  }

  private static void cleanupOldApks(File dir, String keepFilename) {
    File[] files = dir.listFiles();
    if (files == null) return;
    for (File file : files) {
      if (!file.getName().equals(keepFilename) && !file.getName().equals(keepFilename + ".part")) {
        file.delete();
      }
    }
  }

  private static boolean isAllowedUrl(String raw) {
    if (raw == null || raw.trim().isEmpty()) return false;
    try {
      URI uri = URI.create(raw.trim());
      if (!"https".equalsIgnoreCase(uri.getScheme())) return false;
      if (uri.getUserInfo() != null) return false;
      String host = uri.getHost();
      return host != null && ALLOWED_HOSTS.contains(host.toLowerCase(Locale.ROOT));
    } catch (Exception ignored) {
      return false;
    }
  }

  private static HttpURLConnection openAllowedConnection(String initialUrl, String accept)
      throws IOException {
    String current = initialUrl;
    for (int hop = 0; hop <= MAX_REDIRECTS; hop++) {
      if (!isAllowedUrl(current)) {
        throw new IOException("Origem de atualização não autorizada.");
      }
      HttpURLConnection conn = (HttpURLConnection) new URL(current).openConnection();
      conn.setInstanceFollowRedirects(false);
      conn.setConnectTimeout(CONNECT_TIMEOUT_MS);
      conn.setReadTimeout(READ_TIMEOUT_MS);
      conn.setRequestMethod("GET");
      conn.setRequestProperty("Accept", accept);
      conn.setRequestProperty("User-Agent", "MN-Trono-Android/" + BuildConfig.VERSION_NAME);
      int code = conn.getResponseCode();
      if (code == HttpURLConnection.HTTP_MOVED_PERM
          || code == HttpURLConnection.HTTP_MOVED_TEMP
          || code == HttpURLConnection.HTTP_SEE_OTHER
          || code == 307
          || code == 308) {
        String location = conn.getHeaderField("Location");
        conn.disconnect();
        if (location == null || location.trim().isEmpty()) {
          throw new IOException("Redirecionamento inválido.");
        }
        current = new URL(new URL(current), location).toString();
        continue;
      }
      if (code < 200 || code >= 300) {
        conn.disconnect();
        throw new IOException("HTTP " + code);
      }
      return conn;
    }
    throw new IOException("Muitos redirecionamentos.");
  }

  private static String fetchText(String url, String accept) throws IOException {
    HttpURLConnection conn = openAllowedConnection(url, accept);
    try (InputStream in = new BufferedInputStream(conn.getInputStream());
        ByteArrayOutputStream out = new ByteArrayOutputStream()) {
      byte[] buffer = new byte[4096];
      long total = 0;
      int read;
      while ((read = in.read(buffer)) != -1) {
        total += read;
        if (total > MAX_TEXT_BYTES) throw new IOException("Resposta excede o limite permitido.");
        out.write(buffer, 0, read);
      }
      return new String(out.toByteArray(), StandardCharsets.UTF_8);
    } finally {
      conn.disconnect();
    }
  }

  private static int compareSemver(String leftRaw, String rightRaw) {
    int[] left = parseSemver(leftRaw);
    int[] right = parseSemver(rightRaw);
    if (left == null || right == null) return 0;
    for (int i = 0; i < 3; i++) {
      if (left[i] != right[i]) return Integer.compare(left[i], right[i]);
    }
    return 0;
  }

  private static int[] parseSemver(String raw) {
    if (raw == null) return null;
    Matcher matcher = SEMVER.matcher(raw.trim());
    if (!matcher.matches()) return null;
    return new int[] {
      Integer.parseInt(matcher.group(1)),
      Integer.parseInt(matcher.group(2)),
      Integer.parseInt(matcher.group(3))
    };
  }

  private static String parseSha256ForFile(String content, String filename) {
    if (content == null || filename == null) return null;
    for (String rawLine : content.split("\\r?\\n")) {
      String line = rawLine.trim();
      if (line.isEmpty()) continue;
      Matcher matcher = SHA256_LINE.matcher(line);
      if (matcher.matches() && filename.equals(matcher.group(2).trim())) {
        return matcher.group(1).toLowerCase(Locale.ROOT);
      }
    }
    return null;
  }

  private static boolean verifyFileSha256(File file, String expectedHex) {
    try (InputStream in = new BufferedInputStream(new FileInputStream(file))) {
      MessageDigest digest = MessageDigest.getInstance("SHA-256");
      byte[] buffer = new byte[8192];
      int read;
      while ((read = in.read(buffer)) != -1) {
        digest.update(buffer, 0, read);
      }
      return constantTimeEquals(expectedHex, toHex(digest.digest()));
    } catch (Exception ignored) {
      return false;
    }
  }

  private static String toHex(byte[] bytes) {
    StringBuilder sb = new StringBuilder(bytes.length * 2);
    for (byte b : bytes) {
      sb.append(String.format(Locale.ROOT, "%02x", b & 0xff));
    }
    return sb.toString();
  }

  private static boolean constantTimeEquals(String a, String b) {
    if (a == null || b == null || a.length() != b.length()) return false;
    int diff = 0;
    for (int i = 0; i < a.length(); i++) {
      diff |= a.charAt(i) ^ b.charAt(i);
    }
    return diff == 0;
  }
}
