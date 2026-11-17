package io.github.rosariomarra.contakm;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.widget.RemoteViews;
import org.json.JSONObject;

/** Un tocco e parte l'uscita; mentre è in corso mostra i km fatti. */
public class StartWidget extends AppWidgetProvider {
    @Override
    public void onUpdate(Context ctx, AppWidgetManager manager, int[] ids) {
        updateAll(ctx, manager, ids);
    }

    static void updateAll(Context ctx, AppWidgetManager manager, int[] ids) {
        if (ids.length == 0) return;
        JSONObject d = Widgets.read(ctx);
        RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.widget_start);
        if (Widgets.running(d)) {
            v.setTextViewText(R.id.w_start_title, d.optString("rideKm", "0") + " km");
            v.setTextViewText(R.id.w_start_sub, "paused".equals(d.optString("state")) ? "In pausa · apri" : "In corso · " + d.optString("rideTime", ""));
            v.setOnClickPendingIntent(R.id.w_root, Widgets.open(ctx, null, 20));
        } else {
            v.setTextViewText(R.id.w_start_title, "Avvia");
            v.setTextViewText(R.id.w_start_sub, "ContaKM");
            v.setOnClickPendingIntent(R.id.w_root, Widgets.open(ctx, "start", 21));
        }
        for (int id : ids) manager.updateAppWidget(id, v);
    }
}
