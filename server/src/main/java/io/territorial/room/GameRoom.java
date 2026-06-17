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
    static final int WIDTH = 120, HEIGHT = 120, NUM_PLAYERS = 12, START_SIZE = 30;
    static final int SPAWN_SIZE = 30;            // a human's starting blob when they pick a spawn
    static final int RESTART_AFTER_TICKS = 40;   // hold on the result, then new match

    private final ObjectMapper json;
    private final int tickMs;

    static final long CHAT_COOLDOWN_MS = 1200;   // anti-spam: min gap between a player's messages

    private final ReentrantLock lock = new ReentrantLock();
    private final List<WebSocketSession> sessions = new CopyOnWriteArrayList<>();
    private final Map<String, Integer> sessionToPlayer = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<Integer, Action> humanActions = new ConcurrentHashMap<>();
    private final java.util.concurrent.ConcurrentLinkedQueue<Diplo> humanDiplo = new java.util.concurrent.ConcurrentLinkedQueue<>();
    private final ConcurrentHashMap<Integer, Long> lastChatAt = new ConcurrentHashMap<>();
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
        // Connected humans don't inherit a bot empire — they re-pick a spawn each match.
        for (int p = 0; p < NUM_PLAYERS; p++) if (human[p]) state.clearPlayer(p);
        sim = new Sim(state);
        sim.recomputeDerived();
        winner = -1;
        holdTicks = 0;
        humanActions.clear();
        humanDiplo.clear();
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

            // Diplomacy: humans' queued orders + bot decisions (bots only accept offers).
            List<Diplo> diplos = new ArrayList<>();
            Diplo hd;
            while ((hd = humanDiplo.poll()) != null) diplos.add(hd);
            for (int p = 0; p < NUM_PLAYERS; p++) {
                if (state.alive[p] && !human[p]) {
                    Diplo d = Bot.decideDiplo(state, p);
                    if (d != null) diplos.add(d);
                }
            }
            sim.applyDiplomacy(diplos);

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

    /** Claim a free slot for a new player and clear it (they will pick a spawn); -1 if full. */
    public int addHuman(WebSocketSession session) {
        lock.lock();
        try {
            sessions.add(session);
            for (int p = 0; p < NUM_PLAYERS; p++) {
                if (!human[p]) {
                    human[p] = true;
                    sessionToPlayer.put(session.getId(), p);
                    state.clearPlayer(p);      // no inherited empire; player must choose a spawn
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
            if (p != null) {
                state.clearPlayer(p);          // dissolve their empire
                human[p] = false;
                humanActions.remove(p);
            }
        } finally {
            lock.unlock();
        }
    }

    /** Place a joining (or eliminated) player's starting blob at a chosen neutral cell. */
    public void submitSpawn(WebSocketSession session, int cell) {
        Integer p = sessionToPlayer.get(session.getId());
        if (p == null) return;
        lock.lock();
        try {
            if (cell < 0 || cell >= state.cellCount) return;
            if (state.owner[cell] != GameState.NEUTRAL) return;   // must be empty land
            if (state.hasLand(p)) return;                          // already in play
            int n = state.spawnBlob(p, cell, SPAWN_SIZE);
            state.army[p] = n * io.territorial.sim.Config.START_ARMY_PER_LAND;
            sim.recomputeDerived();
        } finally {
            lock.unlock();
        }
    }

    /** Queue a human's one-shot action for the next tick (latest submission wins). */
    public void submitAction(WebSocketSession session, int targetOwner, double fraction, int targetCell) {
        Integer p = sessionToPlayer.get(session.getId());
        if (p == null) return;
        humanActions.put(p, new Action(p, targetOwner, fraction, targetCell));
    }

    /** Queue a human's diplomacy order (peace request/accept/break) for the next tick. */
    public void submitDiplo(WebSocketSession session, String kind, int target) {
        Integer p = sessionToPlayer.get(session.getId());
        if (p == null || target < 0 || target >= NUM_PLAYERS || target == p) return;
        Diplo.Kind k;
        try { k = Diplo.Kind.valueOf(kind); } catch (Exception e) { return; }
        humanDiplo.add(new Diplo(p, target, k));
    }

    /**
     * Relay a quick-chat message (by template id, optional target) to everyone, with a per-player
     * cooldown. A "peace_request" template also doubles as a REQUEST_PEACE diplomacy order.
     */
    public void submitChat(WebSocketSession session, String templateId, int target, long nowMs) {
        Integer p = sessionToPlayer.get(session.getId());
        if (p == null || templateId == null || templateId.length() > 32) return;
        Long last = lastChatAt.get(p);
        if (last != null && nowMs - last < CHAT_COOLDOWN_MS) return;
        lastChatAt.put(p, nowMs);

        boolean validTarget = target >= 0 && target < NUM_PLAYERS && target != p;
        if (validTarget && "peace_request".equals(templateId)) {
            humanDiplo.add(new Diplo(p, target, Diplo.Kind.REQUEST_PEACE));
        } else if (validTarget && "ally_request".equals(templateId)) {
            humanDiplo.add(new Diplo(p, target, Diplo.Kind.REQUEST_ALLY));
        }
        Map<String, Object> m = new HashMap<>();
        m.put("type", "chat");
        m.put("from", (int) p);
        m.put("templateId", templateId);
        m.put("target", target);
        broadcast(m);
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
        m.put("ownableCells", state.ownableCells);
        m.put("terrain", terrain);
        m.put("capitals", state.capitalCell.clone());
        return m;
    }

    private Map<String, Object> buildStateMessage() {
        int[] army = new int[state.numPlayers];
        int[] morale = new int[state.numPlayers]; // momentum x100, so the client avoids float noise
        int[] income = new int[state.numPlayers]; // army/sec (lastIncome x tickRate), rounded
        double perSec = 1000.0 / tickMs;
        for (int p = 0; p < state.numPlayers; p++) {
            army[p] = (int) Math.round(state.army[p]);
            morale[p] = (int) Math.round(state.momentum[p] * 100);
            income[p] = (int) Math.round(state.lastIncome[p] * perSec);
        }
        Map<String, Object> m = new HashMap<>();
        m.put("type", "state");
        m.put("tick", state.tick);
        m.put("owner", state.owner.clone());
        m.put("army", army);
        m.put("morale", morale);
        m.put("income", income);
        m.put("land", state.land.clone());
        m.put("alive", state.alive.clone());
        m.put("human", human.clone());
        m.put("winner", winner);
        m.put("capitals", state.capitalCell.clone());
        m.put("phase", state.phase);
        int endsIn = state.phase == GameState.PEACE ? Config.PEACE_PHASE_TICKS - state.tick
                : state.phase == GameState.WAR ? Config.FINAL_WAR_TICK - state.tick : -1;
        m.put("phaseEndsIn", Math.max(-1, endsIn));
        // Diplomacy matrices (byte[][] -> int[][] so Jackson emits arrays, not base64).
        int[][] rel = new int[state.numPlayers][state.numPlayers];
        for (int a = 0; a < state.numPlayers; a++)
            for (int b = 0; b < state.numPlayers; b++) rel[a][b] = state.rel[a][b];
        m.put("rel", rel);
        m.put("offer", state.offer);
        m.put("allyOffer", state.allyOffer);
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
