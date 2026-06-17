package io.territorial.room;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.territorial.sim.*;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.locks.ReentrantLock;

/**
 * One authoritative match. A single scheduled thread advances the pure {@link Sim} at a fixed
 * tick rate, mixing human actions (one-shot, event-driven) with bot actions (every tick), and
 * broadcasts a JSON snapshot to all connected sessions. The sim is never touched off this thread.
 */
@Component
public class GameRoom {

    // Live-match shape (bigger, equal small spawns -> expansion is the early game).
    static final int WIDTH = 60, HEIGHT = 60, NUM_PLAYERS = 12, START_SIZE = 10;
    static final int RESTART_AFTER_TICKS = 40;   // hold on the result, then new match

    private final ObjectMapper json;
    private final int tickMs;

    private final ReentrantLock lock = new ReentrantLock();
    private final List<WebSocketSession> sessions = new CopyOnWriteArrayList<>();
    private final Map<String, Integer> sessionToPlayer = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<Integer, Action> humanActions = new ConcurrentHashMap<>();
    private final boolean[] human = new boolean[NUM_PLAYERS];

    private GameState state;
    private Sim sim;
    private long matchSeed = 1L;
    private int winner = -1;
    private int holdTicks = 0;

    private ScheduledExecutorService scheduler;

    public GameRoom(ObjectMapper json, @Value("${territorial.tickMs:125}") int tickMs) {
        this.json = json;
        this.tickMs = tickMs;
    }

    @PostConstruct
    void start() {
        newMatch();
        scheduler = Executors.newSingleThreadScheduledExecutor(r -> {
            Thread t = new Thread(r, "game-tick");
            t.setDaemon(true);
            return t;
        });
        scheduler.scheduleAtFixedRate(this::safeStep, tickMs, tickMs, TimeUnit.MILLISECONDS);
    }

    @PreDestroy
    void stop() {
        if (scheduler != null) scheduler.shutdownNow();
    }

    private void newMatch() {
        int[] sizes = new int[NUM_PLAYERS];
        Arrays.fill(sizes, START_SIZE);
        state = GameFactory.create(WIDTH, HEIGHT, sizes, matchSeed++);
        sim = new Sim(state);
        sim.recomputeDerived();
        winner = -1;
        holdTicks = 0;
        humanActions.clear();
    }

    private void safeStep() {
        try { step(); } catch (Exception e) { System.err.println("tick error: " + e); }
    }

    /** One authoritative tick. Runs only on the scheduler thread, under the lock. */
    private void step() {
        lock.lock();
        try {
            if (winner != -1) {                       // match over: hold, then restart
                if (++holdTicks >= RESTART_AFTER_TICKS) {
                    newMatch();
                    broadcast(buildMapMessage());
                }
                broadcast(buildStateMessage());
                return;
            }

            List<Action> actions = new ArrayList<>(NUM_PLAYERS);
            for (int p = 0; p < NUM_PLAYERS; p++) {
                if (!state.alive[p]) continue;
                Action a = human[p] ? humanActions.remove(p) : Bot.decide(state, p);
                if (a != null) actions.add(a);
            }
            sim.tick(actions);
            sim.recomputeDerived();
            winner = sim.winner();
            broadcast(buildStateMessage());
        } finally {
            lock.unlock();
        }
    }

    // ---- session lifecycle (called from WebSocket container threads) ----

    /** Assign a free (bot-controlled) slot to a new player; -1 if the match is full. */
    public int addHuman(WebSocketSession session) {
        lock.lock();
        try {
            sessions.add(session);
            for (int p = 0; p < NUM_PLAYERS; p++) {
                if (!human[p] && state.alive[p]) {
                    human[p] = true;
                    sessionToPlayer.put(session.getId(), p);
                    return p;
                }
            }
            return -1; // spectator
        } finally {
            lock.unlock();
        }
    }

    public void removeHuman(WebSocketSession session) {
        lock.lock();
        try {
            sessions.remove(session);
            Integer p = sessionToPlayer.remove(session.getId());
            if (p != null) { human[p] = false; humanActions.remove(p); } // slot reverts to a bot
        } finally {
            lock.unlock();
        }
    }

    /** Queue a human's one-shot action for the next tick (latest submission wins). */
    public void submitAction(WebSocketSession session, int targetOwner, double fraction) {
        Integer p = sessionToPlayer.get(session.getId());
        if (p == null) return;
        humanActions.put(p, new Action(p, targetOwner, fraction));
    }

    public Map<String, Object> welcomeFor(WebSocketSession session) {
        Integer p = sessionToPlayer.get(session.getId());
        Map<String, Object> m = new HashMap<>();
        m.put("type", "welcome");
        m.put("playerId", p == null ? -1 : p);
        return m;
    }

    public Map<String, Object> mapMessage() {
        lock.lock();
        try { return buildMapMessage(); } finally { lock.unlock(); }
    }

    // ---- message building (caller holds the lock) ----

    private Map<String, Object> buildMapMessage() {
        int[] terrain = new int[state.cellCount];
        for (int c = 0; c < state.cellCount; c++) terrain[c] = state.terrain[c].ordinal();
        Map<String, Object> m = new HashMap<>();
        m.put("type", "map");
        m.put("width", state.width);
        m.put("height", state.height);
        m.put("numPlayers", state.numPlayers);
        m.put("terrain", terrain);
        m.put("capitals", state.capitalCell.clone());
        return m;
    }

    private Map<String, Object> buildStateMessage() {
        int[] army = new int[state.numPlayers];
        for (int p = 0; p < state.numPlayers; p++) army[p] = (int) Math.round(state.army[p]);
        Map<String, Object> m = new HashMap<>();
        m.put("type", "state");
        m.put("tick", state.tick);
        m.put("owner", state.owner.clone());
        m.put("army", army);
        m.put("land", state.land.clone());
        m.put("alive", state.alive.clone());
        m.put("human", human.clone());
        m.put("winner", winner);
        return m;
    }

    // ---- transport ----

    public void send(WebSocketSession session, Object payload) {
        try {
            String text = json.writeValueAsString(payload);
            synchronized (session) {
                if (session.isOpen()) session.sendMessage(new TextMessage(text));
            }
        } catch (Exception e) { /* drop on a dead session */ }
    }

    private void broadcast(Object payload) {
        String text;
        try { text = json.writeValueAsString(payload); } catch (Exception e) { return; }
        TextMessage msg = new TextMessage(text);
        for (WebSocketSession s : sessions) {
            try {
                synchronized (s) { if (s.isOpen()) s.sendMessage(msg); }
            } catch (Exception e) { /* drop on a dead session */ }
        }
    }
}
