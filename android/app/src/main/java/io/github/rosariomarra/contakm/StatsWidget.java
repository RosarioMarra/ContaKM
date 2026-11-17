package io.github.rosariomarra.contakm;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.view.View;
import android.widget.RemoteViews;
import org.json.JSONObject;

/** Riepilogo: km della settimana con l'obiettivo, mese, totale; durante l'uscita i numeri in diretta. */
public class StatsWidget extends AppWidgetProvider {
    @Override
    public void onUpdate(Context ctx, AppWidgetManager manager, int[] ids) {
        updateAll(ctx, manager, ids);
    }

    static void updateAll(Context ctx, AppWidgetManager manager, int[] ids) {
        if (ids.length == 0) return;
        JSONObject d = Widgets.read(ctx);
        RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.widget_stats);
        v.setTextViewText(R.id.w_bike, d.optString("bike", ""));
        boolean live = Widgets.running(d);
        v.setViewVisibility(R.id.w_live, live ? View.VISIBLE : View.GONE);
        if (live) {
            String state = "paused".equals(d.optString("state")) ? "In pausa" : "In corso";
            v.setTextViewText(R.id.w_live, state + " · " + d.optString("rideKm", "0") + " km · "
                + d.optString("rideTime", "") + " · " + d.optString("rideSpeed", "0") + " km/h");
        }
        v.setTextViewText(R.id.w_week, d.optString("weekKm", "0"));
        int goal = d.optInt("goalKm", 0);
        v.setViewVisibility(R.id.w_goal_row, goal > 0 ? View.VISIBLE : View.GONE);
        v.setProgressBar(R.id.w_goal_bar, 100, Math.min(100, d.optInt("goalPct", 0)), false);
        v.setTextViewText(R.id.w_goal_text, d.optString("weekKm", "0") + " di " + goal + " km");
        v.setTextViewText(R.id.w_month, d.optString("monthKm", "0"));
        v.setTextViewText(R.id.w_total, d.optString("totalKm", "0"));
        v.setTextViewText(R.id.w_rides, d.optString("rides", "0"));
        String last = d.optString("lastRide", "");
        v.setTextViewText(R.id.w_last, last.isEmpty() ? "Apri ContaKM e premi Avvia per la prima uscita" : "Ultima uscita: " + last);
        v.setOnClickPendingIntent(R.id.w_root, Widgets.open(ctx, null, 10));
        for (int id : ids) manager.updateAppWidget(id, v);
    }
}
