package com.malanxi.paidan;

import android.content.Context;
import android.content.SharedPreferences;
import android.net.Uri;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;

@CapacitorPlugin(name = "ShareReceive")
public class ShareReceivePlugin extends Plugin {

    private static final String PREFS = "share_receive";
    private static final String KEY_PENDING_ORDER_ID = "pending_order_id";
    private static final String KEY_SHARE_PATH = "pending_share_path";
    private static final String KEY_SHARE_NAME = "pending_share_name";
    private static final String KEY_SHARE_MIME = "pending_share_mime";
    private static final String KEY_SHARE_ORDER_ID = "pending_share_order_id";

    private static ShareReceivePlugin instance;

    @Override
    public void load() {
        instance = this;
    }

    static ShareReceivePlugin getInstance() {
        return instance;
    }

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    @PluginMethod
    public void setPendingOrderId(PluginCall call) {
        Integer orderId = call.getInt("orderId");
        if (orderId == null || orderId <= 0) {
            call.reject("invalid orderId");
            return;
        }
        prefs().edit().putInt(KEY_PENDING_ORDER_ID, orderId).apply();
        call.resolve();
    }

    @PluginMethod
    public void clearPendingOrderId(PluginCall call) {
        prefs().edit().remove(KEY_PENDING_ORDER_ID).apply();
        call.resolve();
    }

    @PluginMethod
    public void consumePendingShare(PluginCall call) {
        SharedPreferences prefs = prefs();
        String path = prefs.getString(KEY_SHARE_PATH, null);
        if (path == null || path.isEmpty()) {
            call.resolve(null);
            return;
        }
        JSObject ret = new JSObject();
        ret.put("orderId", prefs.getInt(KEY_SHARE_ORDER_ID, -1));
        ret.put("path", path);
        ret.put("fileName", prefs.getString(KEY_SHARE_NAME, "call-recording.mp3"));
        ret.put("mimeType", prefs.getString(KEY_SHARE_MIME, "audio/mpeg"));
        prefs
            .edit()
            .remove(KEY_SHARE_PATH)
            .remove(KEY_SHARE_NAME)
            .remove(KEY_SHARE_MIME)
            .remove(KEY_SHARE_ORDER_ID)
            .apply();
        call.resolve(ret);
    }

    @PluginMethod
    public void readSharedFile(PluginCall call) {
        String path = call.getString("path");
        if (path == null || path.isEmpty()) {
            call.reject("path required");
            return;
        }
        File file = new File(path);
        if (!file.exists() || !file.isFile()) {
            call.reject("file not found");
            return;
        }
        try {
            byte[] bytes = readAllBytes(file);
            JSObject ret = new JSObject();
            ret.put("base64", Base64.encodeToString(bytes, Base64.NO_WRAP));
            String fileName = call.getString("fileName");
            if (fileName == null || fileName.isEmpty()) {
                fileName = file.getName();
            }
            String mimeType = call.getString("mimeType");
            if (mimeType == null || mimeType.isEmpty()) {
                mimeType = guessMimeType(fileName);
            }
            ret.put("fileName", fileName);
            ret.put("mimeType", mimeType);
            call.resolve(ret);
        } catch (Exception ex) {
            call.reject("read failed: " + ex.getMessage());
        }
    }

    static void handleIncomingShare(Context context, Uri uri, String mimeType) {
        if (context == null || uri == null) {
            return;
        }
        try {
            ShareReceivePlugin plugin = getInstance();
            Context appContext = plugin != null ? plugin.getContext() : context.getApplicationContext();
            SharedPreferences prefs = appContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            int pendingOrderId = prefs.getInt(KEY_PENDING_ORDER_ID, -1);

            String fileName = resolveDisplayName(appContext, uri);
            String ext = guessExtension(fileName, mimeType);
            if (!fileName.toLowerCase().endsWith(ext.toLowerCase()) && !ext.isEmpty()) {
                fileName = fileName + ext;
            }
            if (fileName == null || fileName.isEmpty()) {
                fileName = "call-recording" + ext;
            }

            File dir = new File(appContext.getCacheDir(), "share-receive");
            if (!dir.exists() && !dir.mkdirs()) {
                return;
            }
            File outFile = new File(dir, System.currentTimeMillis() + "-" + sanitizeFileName(fileName));

            try (InputStream in = appContext.getContentResolver().openInputStream(uri);
                 FileOutputStream out = new FileOutputStream(outFile)) {
                if (in == null) {
                    return;
                }
                byte[] buffer = new byte[8192];
                int read;
                while ((read = in.read(buffer)) != -1) {
                    out.write(buffer, 0, read);
                }
            }

            String resolvedMime = mimeType != null && !mimeType.isEmpty() ? mimeType : guessMimeType(fileName);
            prefs
                .edit()
                .putString(KEY_SHARE_PATH, outFile.getAbsolutePath())
                .putString(KEY_SHARE_NAME, outFile.getName())
                .putString(KEY_SHARE_MIME, resolvedMime)
                .putInt(KEY_SHARE_ORDER_ID, pendingOrderId)
                .apply();

            if (plugin != null) {
                plugin.dispatchShareEvent(pendingOrderId, outFile.getAbsolutePath(), outFile.getName(), resolvedMime);
            }
        } catch (Exception ignored) {
            // ignore malformed share payloads
        }
    }

    private void dispatchShareEvent(int orderId, String path, String fileName, String mimeType) {
        JSObject ret = new JSObject();
        ret.put("orderId", orderId);
        ret.put("path", path);
        ret.put("fileName", fileName);
        ret.put("mimeType", mimeType);
        notifyListeners("shareReceived", ret);
    }

    private static byte[] readAllBytes(File file) throws Exception {
        try (FileInputStream in = new FileInputStream(file); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[8192];
            int read;
            while ((read = in.read(buffer)) != -1) {
                out.write(buffer, 0, read);
            }
            return out.toByteArray();
        }
    }

    private static String resolveDisplayName(Context context, Uri uri) {
        String fallback = "call-recording";
        try (android.database.Cursor cursor = context.getContentResolver().query(uri, null, null, null, null)) {
            if (cursor != null && cursor.moveToFirst()) {
                int index = cursor.getColumnIndex(android.provider.OpenableColumns.DISPLAY_NAME);
                if (index >= 0) {
                    String name = cursor.getString(index);
                    if (name != null && !name.trim().isEmpty()) {
                        return name.trim();
                    }
                }
            }
        } catch (Exception ignored) {
            // fall through
        }
        String last = uri.getLastPathSegment();
        return last != null && !last.trim().isEmpty() ? last.trim() : fallback;
    }

    private static String sanitizeFileName(String name) {
        return name.replaceAll("[^a-zA-Z0-9._\\-]", "_");
    }

    private static String guessExtension(String fileName, String mimeType) {
        String lower = fileName != null ? fileName.toLowerCase() : "";
        if (lower.endsWith(".mp3")) return ".mp3";
        if (lower.endsWith(".amr")) return ".amr";
        if (lower.endsWith(".m4a")) return ".m4a";
        if (lower.endsWith(".3gp")) return ".3gp";
        if (lower.endsWith(".wav")) return ".wav";
        if (lower.endsWith(".aac")) return ".aac";
        if (lower.endsWith(".ogg")) return ".ogg";
        if (lower.endsWith(".webm")) return ".webm";
        if (mimeType == null) return ".mp3";
        String type = mimeType.toLowerCase();
        if (type.contains("amr")) return ".amr";
        if (type.contains("3gpp")) return ".3gp";
        if (type.contains("mpeg")) return ".mp3";
        if (type.contains("mp4") || type.contains("m4a")) return ".m4a";
        if (type.contains("wav")) return ".wav";
        if (type.contains("aac")) return ".aac";
        if (type.contains("ogg")) return ".ogg";
        if (type.contains("webm")) return ".webm";
        return ".mp3";
    }

    private static String guessMimeType(String fileName) {
        String lower = fileName != null ? fileName.toLowerCase() : "";
        if (lower.endsWith(".mp3")) return "audio/mpeg";
        if (lower.endsWith(".amr")) return "audio/amr";
        if (lower.endsWith(".m4a")) return "audio/mp4";
        if (lower.endsWith(".3gp")) return "audio/3gpp";
        if (lower.endsWith(".wav")) return "audio/wav";
        if (lower.endsWith(".aac")) return "audio/aac";
        if (lower.endsWith(".ogg")) return "audio/ogg";
        if (lower.endsWith(".webm")) return "audio/webm";
        return "audio/mpeg";
    }
}
