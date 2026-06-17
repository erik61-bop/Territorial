import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.WebSocket;
import java.util.concurrent.CompletionStage;
import java.util.concurrent.atomic.AtomicInteger;

/** Minimal JDK-only WebSocket client: connects, sends one attack, prints message types seen. */
public class WsSmoke {
    public static void main(String[] args) throws Exception {
        String url = args.length > 0 ? args[0] : "ws://localhost:8080/ws/game";
        AtomicInteger states = new AtomicInteger();
        StringBuilder seen = new StringBuilder();

        WebSocket ws = HttpClient.newHttpClient().newWebSocketBuilder()
            .buildAsync(URI.create(url), new WebSocket.Listener() {
                @Override public void onOpen(WebSocket webSocket) {
                    System.out.println("OPEN");
                    webSocket.request(1);
                }
                @Override public CompletionStage<?> onText(WebSocket webSocket, CharSequence data, boolean last) {
                    String s = data.toString();
                    String type = s.replaceAll(".*\"type\":\"([a-z]+)\".*", "$1");
                    if (type.length() > 12) type = "?";
                    if (seen.indexOf(type) < 0) seen.append(type).append(" ");
                    if ("state".equals(type)) {
                        int n = states.incrementAndGet();
                        if (n == 1) {
                            System.out.println("FIRST STATE: " + s.substring(0, Math.min(160, s.length())) + "...");
                            webSocket.sendText("{\"type\":\"action\",\"targetOwner\":-1,\"fraction\":0.5}", true);
                            // exercise the quick-chat path; expect a 'chat' broadcast back
                            webSocket.sendText("{\"type\":\"chat\",\"templateId\":\"gg\",\"target\":-1}", true);
                        }
                    }
                    webSocket.request(1);
                    return null;
                }
            }).join();

        Thread.sleep(2000);
        System.out.println("MESSAGE TYPES SEEN: " + seen.toString().trim());
        System.out.println("STATE FRAMES IN ~2s: " + states.get());
        ws.sendClose(WebSocket.NORMAL_CLOSURE, "done");
        System.out.println(states.get() >= 5 && seen.indexOf("welcome") >= 0
            && seen.indexOf("map") >= 0 && seen.indexOf("state") >= 0 && seen.indexOf("chat") >= 0
            ? "SMOKE: PASS (incl. chat round-trip)" : "SMOKE: FAIL");
    }
}
