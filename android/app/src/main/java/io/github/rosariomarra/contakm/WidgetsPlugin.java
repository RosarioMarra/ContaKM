package io.github.rosariomarra.contakm;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Riceve dall'app i dati già pronti (testi in italiano) e aggiorna i widget. */
@CapacitorPlugin(name = "ContaWidgets")
public class WidgetsPlugin extends Plugin {
    @PluginMethod
    public void update(PluginCall call) {
        Widgets.save(getContext(), call.getString("data", "{}"));
        Widgets.refreshAll(getContext());
        call.resolve();
    }
}
