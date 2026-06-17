package io.territorial.net;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.territorial.room.GameRoom;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

/**
 * Bridges WebSocket sessions to the {@link GameRoom}. Inbound: {@code {"type":"action",
 * "targetOwner":N,"fraction":0.5}}. Outbound (from the room): welcome, map, state.
 */
@Component
public class GameHandler extends TextWebSocketHandler {

    private final GameRoom room;
    private final ObjectMapper json;

    public GameHandler(GameRoom room, ObjectMapper json) {
        this.room = room;
        this.json = json;
    }

    @Override
    public void afterConnectionEstablished(WebSocketSession session) {
        room.addHuman(session);
        room.send(session, room.welcomeFor(session));
        room.send(session, room.mapMessage());
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) throws Exception {
        JsonNode n = json.readTree(message.getPayload());
        String type = n.path("type").asText("");
        switch (type) {
            case "action" -> room.submitAction(
                    session,
                    n.path("targetOwner").asInt(io.territorial.sim.GameState.NEUTRAL),
                    n.path("fraction").asDouble(0.5));
            case "chat" -> room.submitChat(
                    session,
                    n.path("templateId").asText(""),
                    n.path("target").asInt(-1),
                    System.currentTimeMillis());
            case "diplo" -> room.submitDiplo(
                    session,
                    n.path("kind").asText(""),
                    n.path("target").asInt(-1));
            default -> { /* ignore unknown */ }
        }
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        room.removeHuman(session);
    }
}
