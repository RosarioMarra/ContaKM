package io.github.rosariomarra.contakm;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import org.json.JSONObject;

/** Dati comuni ai widget: salvati dall'app, letti quando Android ridisegna un widget. */
final class Widgets {
    static final String PREFS = "contakm_widgets";
    static final String SCHEME = "io.github.rosariomarra.contakm://";

    private Widgets() {}

    static void save(Context ctx, String json) {
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString("data", json).apply();
    }

    static JSONObject read(Context ctx) {
        try {
            return new JSONObject(ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("data", "{}"));
        } catch (Exception e) {
            return new JSONObject();
        }
    }

    static boolean running(JSONObject d) {
        return "running".equals(d.optString("state")) || "paused".equals(d.optString("state"));
    }

    /** Apre l'app; con un percorso (start, bike) l'app sa cosa fare appena aperta. */
    static PendingIntent open(Context ctx, String path, int request) {
        Intent intent = new Intent(ctx, MainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        if (path != null) {
            intent.setAction(Intent.ACTION_VIEW);
            intent.setData(Uri.parse(SCHEME + path + "?t=" + System.currentTimeMillis()));
        }
        return PendingIntent.getActivity(ctx, request, intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    static void refreshAll(Context ctx) {
        AppWidgetManager manager = AppWidgetManager.getInstance(ctx);
        StatsWidget.updateAll(ctx, manager, manager.getAppWidgetIds(new ComponentName(ctx, StatsWidget.class)));
        StartWidget.updateAll(ctx, manager, manager.getAppWidgetIds(new ComponentName(ctx, StartWidget.class)));
        MaintenanceWidget.updateAll(ctx, manager, manager.getAppWidgetIds(new ComponentName(ctx, MaintenanceWidget.class)));
    }
}
