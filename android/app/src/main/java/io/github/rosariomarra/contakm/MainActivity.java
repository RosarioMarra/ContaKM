package io.github.rosariomarra.contakm;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Plugin dell'app: passa ai widget della schermata Home i km e lo stato dell'uscita
        registerPlugin(WidgetsPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
