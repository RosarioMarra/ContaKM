package io.github.rosariomarra.contakm;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.graphics.Color;
import android.view.View;
import android.widget.RemoteViews;
import org.json.JSONArray;
import org.json.JSONObject;

/** Le prossime manutenzioni della bici in uso, con quanto manca. */
public class MaintenanceWidget extends AppWidgetProvider {
    private static final int[] ROWS = { R.id.w_m1, R.id.w_m2, R.id.w_m3 };
    private static final int[] LABELS = { R.id.w_m1_label, R.id.w_m2_label, R.id.w_m3_label };
    private static final int[] LEFTS = { R.id.w_m1_left, R.id.w_m2_left, R.id.w_m3_left };
    private static final int[] BARS = { R.id.w_m1_bar, R.id.w_m2_bar, R.id.w_m3_bar };

    @Override
    public void onUpdate(Context ctx, AppWidgetManager manager, int[] ids) {
        updateAll(ctx, manager, ids);
    }

    static void updateAll(Context ctx, AppWidgetManager manager, int[] ids) {
        if (ids.length == 0) return;
        JSONObject d = Widgets.read(ctx);
        RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.widget_maintenance);
        v.setTextViewText(R.id.w_bike, d.optString("bike", "La mia bici"));
        JSONArray items = d.optJSONArray("maint");
        int n = items == null ? 0 : items.length();
        v.setViewVisibility(R.id.w_m_empty, n == 0 ? View.VISIBLE : View.GONE);
        for (int i = 0; i < ROWS.length; i++) {
            JSONObject it = i < n ? items.optJSONObject(i) : null;
            v.setViewVisibility(ROWS[i], it == null ? View.GONE : View.VISIBLE);
            if (it == null) continue;
            boolean due = it.optBoolean("due");
            v.setTextViewText(LABELS[i], it.optString("label"));
            v.setTextViewText(LEFTS[i], it.optString("text"));
            v.setTextColor(LEFTS[i], due ? Color.parseColor("#ff6b6b") : Color.parseColor("#9fb0c4"));
            v.setProgressBar(BARS[i], 100, it.optInt("pct", 0), false);
        }
        v.setOnClickPendingIntent(R.id.w_root, Widgets.open(ctx, "bike", 30));
        for (int id : ids) manager.updateAppWidget(id, v);
    }
}
