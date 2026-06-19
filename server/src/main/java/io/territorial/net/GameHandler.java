package io.territorial.net;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.territorial.room.GameRoom;
import io.territorial.room.RoomManager;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

/**
 * Bridges WebSocket sessions to a {@link GameRoom}, chosen by the {@link RoomManager} (matchmaking
 * across concurrent matches). Inbound: {@code {"type":"action","targetOwner":N,"fraction":0.5}}.
 * Outbound (from the room): welcome, map, state.
 */
@Component
public class GameHandler extends TextWebSocketHandler {

    private final RoomManager manager;
    private final ObjectMapper json;
    private final io.territorial.auth.JwtService jwt;
    private final io.territorial.account.WalletService wallet;

    public GameHandler(RoomManager manager, ObjectMapper json,
                       io.territorial.auth.JwtService jwt, io.territorial.account.WalletService wallet) {
        this.manager = manager;
        this.json = json;
        this.jwt = jwt;
        this.wallet = wallet;
    }

    @Override
    public void afterConnectionEstablished(WebSocketSession session) {
        // Production: every connection must be an authenticated account (JWT in the ?jwt= query).
        Long accountId = jwt.verify(queryParam(session, "jwt"));
        if (accountId == null) {
            sendNow(session, java.util.Map.of("type", "joinError", "reason", "auth_required"));
            try { session.close(); } catch (Exception ignored) {}
            return;
        }
        long stake = stakeOf(session);
        // Prize room: refuse up front if the player can't cover the ante (so we don't seat them).
        if (stake > 0 && wallet.balance(accountId) < stake) {
            sendNow(session, java.util.Map.of("type", "joinError", "reason", "insufficient_coins",
                    "coins", wallet.balance(accountId), "stake", stake));
            try { session.close(); } catch (Exception ignored) {}
            return;
        }
        GameRoom room = manager.assign(session, String.valueOf(accountId), soloOf(session), stake);
        if (room == null) return;   // server at capacity
        room.send(session, room.welcomeFor(session));
        room.send(session, room.mapMessage());
    }

    private void sendNow(WebSocketSession session, Object payload) {
        try {
            synchronized (session) { if (session.isOpen()) session.sendMessage(new TextMessage(json.writeValueAsString(payload))); }
        } catch (Exception ignored) {}
    }

    /** Single-player flag from the ws URL query (&solo=1). */
    private static boolean soloOf(WebSocketSession session) {
        java.net.URI uri = session.getUri();
        if (uri == null || uri.getQuery() == null) return false;
        for (String kv : uri.getQuery().split("&")) if (kv.equals("solo=1")) return true;
        return false;
    }

    /** Prize-room stake from the ws URL query (&stake=N). 0 = free room. */
    private static long stakeOf(WebSocketSession session) {
        java.net.URI uri = session.getUri();
        if (uri == null || uri.getQuery() == null) return 0;
        for (String kv : uri.getQuery().split("&")) {
            int i = kv.indexOf('=');
            if (i > 0 && kv.substring(0, i).equals("stake")) {
                try { return Math.max(0, Math.min(1_000_000, Long.parseLong(kv.substring(i + 1)))); }
                catch (NumberFormatException e) { return 0; }
            }
        }
        return 0;
    }

    /** Read a query parameter from the ws URL (URL-decoded), or null. */
    private static String queryParam(WebSocketSession session, String name) {
        java.net.URI uri = session.getUri();
        if (uri == null || uri.getQuery() == null) return null;
        for (String kv : uri.getQuery().split("&")) {
            int i = kv.indexOf('=');
            if (i > 0 && kv.substring(0, i).equals(name)) {
                String v = kv.substring(i + 1);
                return v.isEmpty() ? null : java.net.URLDecoder.decode(v, java.nio.charset.StandardCharsets.UTF_8);
            }
        }
        return null;
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) throws Exception {
        GameRoom room = manager.roomOf(session);
        if (room == null) return;
        JsonNode n = json.readTree(message.getPayload());
        String type = n.path("type").asText("");
        switch (type) {
            case "action" -> room.submitAction(
                    session,
                    n.path("targetOwner").asInt(io.territorial.sim.GameState.NEUTRAL),
                    n.path("fraction").asDouble(0.5),
                    n.path("targetCell").asInt(-1));
            case "chat" -> room.submitChat(
                    session,
                    n.path("templateId").asText(""),
                    n.path("target").asInt(-1),
                    System.currentTimeMillis());
            case "spawn" -> room.submitSpawn(session, n.path("cell").asInt(-1));
            case "stop" -> room.stopOrder(session);
            case "difficulty" -> room.setDifficulty(n.path("level").asInt(1));
            case "profile" -> room.setProfile(session, n.path("name").asText(""), n.path("color").asInt(-1));
            case "leave" -> room.leaveMatch(session);   // deliberate surrender: dissolve the empire now
            case "diplo" -> room.submitDiplo(
                    session,
                    n.path("kind").asText(""),
                    n.path("target").asInt(-1));
            default -> { /* ignore unknown */ }
        }
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        manager.onClose(session);
    }
}
