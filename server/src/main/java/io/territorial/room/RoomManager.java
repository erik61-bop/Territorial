package io.territorial.room;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.WebSocketSession;

import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.locks.ReentrantLock;

/**
 * Matchmaking across multiple concurrent {@link GameRoom} matches. A connecting player reconnects to
 * their previous room (by token) if it still exists, otherwise joins the most-populated room that
 * still has a free slot, or a brand-new room. Rooms left with no humans are reaped.
 */
@Component
public class RoomManager {
    static final int MAX_ROOMS = 100;
    static final long REAP_PERIOD_MS = 15_000;   // dispose abandoned (all-bot) rooms periodically

    private final ObjectMapper json;
    private final int tickMs;
    private final ReentrantLock lock = new ReentrantLock();
    private final List<GameRoom> rooms = new ArrayList<>();
    private final Map<String, GameRoom> sessionRoom = new ConcurrentHashMap<>();
    private final Map<String, GameRoom> tokenRoom = new ConcurrentHashMap<>();
    private int nextRoomId = 1;
    private ScheduledExecutorService reaper;

    public RoomManager(ObjectMapper json, @Value("${territorial.tickMs:125}") int tickMs) {
        this.json = json;
        this.tickMs = tickMs;
    }

    @PostConstruct
    void start() {
        reaper = Executors.newSingleThreadScheduledExecutor(r -> {
            Thread t = new Thread(r, "room-reaper");
            t.setDaemon(true);
            return t;
        });
        reaper.scheduleAtFixedRate(this::reap, REAP_PERIOD_MS, REAP_PERIOD_MS, TimeUnit.MILLISECONDS);
    }

    @PreDestroy
    void shutdown() {
        if (reaper != null) reaper.shutdownNow();
        lock.lock();
        try { for (GameRoom r : rooms) r.stop(); rooms.clear(); } finally { lock.unlock(); }
    }

    /** Pick (or create) a room for this connection, attach the session, and return it (or null if full).
     *  solo=true gives the player a PRIVATE room (you + bots) that matchmaking won't add others to. */
    public GameRoom assign(WebSocketSession session, String token, boolean solo) {
        lock.lock();
        try {
            // 1. Reconnect to the same room if the token still owns a live one.
            GameRoom room = token != null ? tokenRoom.get(token) : null;
            if (room == null || !rooms.contains(room)) {
                room = null;
                // 2. Multiplayer only: join the most-populated PUBLIC room that still has space.
                if (!solo) {
                    int best = Integer.MAX_VALUE;
                    for (GameRoom r : rooms) {
                        if (r.isPrivate) continue;
                        int free = r.freeHumanSlots();
                        if (free > 0 && free < best) { best = free; room = r; }
                    }
                }
                // 3. Otherwise (solo, or no public room with space) spin up a new match.
                if (room == null && rooms.size() < MAX_ROOMS) {
                    room = new GameRoom(json, tickMs, nextRoomId++);
                    room.isPrivate = solo;
                    room.start();
                    rooms.add(room);
                }
                if (room == null) return null;   // at capacity and every room full
            }
            room.addHuman(session, token);
            sessionRoom.put(session.getId(), room);
            if (token != null) tokenRoom.put(token, room);
            return room;
        } finally {
            lock.unlock();
        }
    }

    public GameRoom roomOf(WebSocketSession session) {
        return sessionRoom.get(session.getId());
    }

    /** Detach a closed session (the room keeps the slot for the reconnect grace period). */
    public void onClose(WebSocketSession session) {
        GameRoom room = sessionRoom.remove(session.getId());
        if (room != null) room.removeHuman(session);
    }

    /** Dispose rooms whose humans have all left (grace expired) so resource use tracks player count. */
    private void reap() {
        lock.lock();
        try {
            for (Iterator<GameRoom> it = rooms.iterator(); it.hasNext(); ) {
                GameRoom r = it.next();
                if (r.isAbandoned()) {
                    it.remove();
                    r.stop();
                    final GameRoom dead = r;
                    tokenRoom.values().removeIf(v -> v == dead);
                }
            }
        } catch (Exception e) {
            System.err.println("reap error: " + e);
        } finally {
            lock.unlock();
        }
    }

    public int roomCount() { lock.lock(); try { return rooms.size(); } finally { lock.unlock(); } }
}
