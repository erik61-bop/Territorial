package io.territorial.room;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.territorial.sim.*;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.locks.ReentrantLock;

/**
 * One authoritative match. A single scheduled thread advances the pure {@link Sim} at a fixed
 * tick rate, mixing human actions (one-shot, event-driven) with bot actions (every tick), and
 * broadcasts a JSON snapshot to all connected sessions. The sim is never touched off this thread.
 * Instances are created and disposed by {@link RoomManager} (one per concurrent match).
 */
public class GameRoom {

    // Live-match shape (bigger, equal small spawns -> expansion is the early game).
    static final int WIDTH = 120, HEIGHT = 120, NUM_PLAYERS = 12, START_SIZE = 30;
    static final int SPAWN_SIZE = 30;            // a human's starting blob when they pick a spawn
    static final int RESTART_AFTER_TICKS = 40;   // hold on the result, then new match

    private final ObjectMapper json;
    private final int tickMs;

    static final long CHAT_COOLDOWN_MS = 1200;   // anti-spam: min gap between a player's messages
    static final int RECONNECT_GRACE_TICKS = 320; // ~40s to reconnect before a slot is freed
    static final double SUSTAIN_CAP = 0.30;       // max army fraction a standing order spends per tick

    private final ReentrantLock lock = new ReentrantLock();
    private final List<WebSocketSession> sessions = new CopyOnWriteArrayList<>();
    private final Map<String, Integer> sessionToPlayer = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<Integer, Action> humanActions = new ConcurrentHashMap<>();
    private final java.util.concurrent.ConcurrentLinkedQueue<Diplo> humanDiplo = new java.util.concurrent.ConcurrentLinkedQueue<>();
    private final ConcurrentHashMap<Integer, Long> lastChatAt = new ConcurrentHashMap<>();
    private final boolean[] human = new boolean[NUM_PLAYERS];
    // Player identity: chosen display name (humans only) and a colour index. colorIdx is kept a
    // permutation of 0..NUM_PLAYERS-1 (every empire a distinct colour) by swapping on a pick.
    private final String[] names = new String[NUM_PLAYERS];
    private final int[] colorIdx = new int[NUM_PLAYERS];
    // Reconnection: a persistent client token owns a slot; a disconnected slot is held for a grace
    // period (empire kept) before being freed.
    private final boolean[] connected = new boolean[NUM_PLAYERS];
    private final int[] disconnectTick = new int[NUM_PLAYERS];
    private final String[] slotToken = new String[NUM_PLAYERS];
    private final Map<String, Integer> tokenToSlot = new ConcurrentHashMap<>();
    // Snapshot deltas: lastOwner is the broadcast baseline; needsFull sessions get a full snapshot.
    static final int KEYFRAME_TICKS = 40;        // a full snapshot every ~5s heals any desync
    private int[] lastOwner;
    private final java.util.Set<String> needsFull = java.util.concurrent.ConcurrentHashMap.newKeySet();

    private GameState state;
    private Sim sim;
    private long matchSeed = 1L;
    private int winner = -1;
    private int holdTicks = 0;

    private ScheduledExecutorService scheduler;

    private final int roomId;

    public GameRoom(ObjectMapper json, int tickMs, int roomId) {
        this.json = json;
        this.tickMs = tickMs;
        this.roomId = roomId;
    }

    public int roomId() { return roomId; }

    /** Begin ticking (called by RoomManager when the room is created). */
    public void start() {
        for (int p = 0; p < NUM_PLAYERS; p++) colorIdx[p] = p;   // default: one colour per slot
        newMatch();
        scheduler = Executors.newSingleThreadScheduledExecutor(r -> {
            Thread t = new Thread(r, "game-tick-" + roomId);
            t.setDaemon(true);
            return t;
        });
        scheduler.scheduleAtFixedRate(this::safeStep, tickMs, tickMs, TimeUnit.MILLISECONDS);
    }

    /** Stop ticking and release the thread (called by RoomManager on disposal/shutdown). */
    public void stop() {
        if (scheduler != null) scheduler.shutdownNow();
    }

    /** Number of human slots not currently claimed (free capacity for matchmaking). */
    public int freeHumanSlots() {
        lock.lock();
        try {
            int free = 0;
            for (int p = 0; p < NUM_PLAYERS; p++) if (!human[p]) free++;
            return free;
        } finally { lock.unlock(); }
    }

    /** True when no human slot is occupied (all bots) — the room can be disposed. */
    public boolean isAbandoned() {
        lock.lock();
        try {
            for (int p = 0; p < NUM_PLAYERS; p++) if (human[p]) return false;
            return true;
        } finally { lock.unlock(); }
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
        lastOwner = null;
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
                broadcastState();
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
                Action a;
                if (human[p]) {
                    a = humanActions.get(p);                       // STANDING order: persists each tick
                    if (a != null && a.targetOwner() >= 0 && !state.alive[a.targetOwner()]) {
                        humanActions.remove(p); a = null;          // target eliminated -> stop
                    }
                    if (a != null) {                               // cap per-tick so it flows, not dumps
                        a = new Action(p, a.targetOwner(), Math.min(a.fraction(), SUSTAIN_CAP), a.targetCell());
                    }
                } else {
                    a = Bot.decide(state, p);
                }
                if (a != null) actions.add(a);
            }
            sim.tick(actions);
            expireDisconnects();
            sim.recomputeDerived();
            winner = sim.winner();
            broadcastState();
        } finally {
            lock.unlock();
        }
    }

    // ---- session lifecycle (called from WebSocket container threads) ----

    /**
     * Attach a connection to a slot. If {@code token} already owns a (still-reserved) slot, the
     * player RECONNECTS to it with their empire intact; otherwise a fresh slot is claimed and
     * cleared (they pick a spawn). Returns the slot, or -1 if the match is full.
     */
    public int addHuman(WebSocketSession session, String token) {
        lock.lock();
        try {
            sessions.add(session);
            needsFull.add(session.getId());   // first state to a new connection is a full snapshot
            if (token != null) {
                Integer existing = tokenToSlot.get(token);
                if (existing != null && human[existing]) {     // reconnect — keep their empire
                    connected[existing] = true;
                    sessionToPlayer.put(session.getId(), existing);
                    return existing;
                }
            }
            for (int p = 0; p < NUM_PLAYERS; p++) {
                if (!human[p]) {
                    human[p] = true;
                    connected[p] = true;
                    sessionToPlayer.put(session.getId(), p);
                    state.clearPlayer(p);      // no inherited empire; player must choose a spawn
                    if (token != null) { slotToken[p] = token; tokenToSlot.put(token, p); }
                    return p;
                }
            }
            return -1; // spectator
        } finally {
            lock.unlock();
        }
    }

    /** Mark the connection gone but HOLD the slot (empire kept) for the reconnect grace period. */
    public void removeHuman(WebSocketSession session) {
        lock.lock();
        try {
            sessions.remove(session);
            Integer p = sessionToPlayer.remove(session.getId());
            if (p != null && human[p]) {
                connected[p] = false;
                disconnectTick[p] = state.tick;
                humanActions.remove(p);
            }
        } finally {
            lock.unlock();
        }
    }

    /** Free slots whose player disconnected and never came back within the grace period. */
    private void expireDisconnects() {
        for (int p = 0; p < NUM_PLAYERS; p++) {
            if (human[p] && !connected[p] && state.tick - disconnectTick[p] > RECONNECT_GRACE_TICKS) {
                state.clearPlayer(p);          // dissolve the abandoned empire
                human[p] = false;
                names[p] = null;               // back to a "Bot N" identity
                humanActions.remove(p);
                if (slotToken[p] != null) { tokenToSlot.remove(slotToken[p]); slotToken[p] = null; }
            }
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
            state.clearPlayer(p);                                  // drop any stale treaties/army
            humanActions.remove(p);                                // and any stale standing order
            int n = state.spawnBlob(p, cell, SPAWN_SIZE);
            state.army[p] = n * io.territorial.sim.Config.START_ARMY_PER_LAND;
            sim.recomputeDerived();
        } finally {
            lock.unlock();
        }
    }

    /** Set a human's STANDING order: it keeps firing each tick until replaced, stopped, or invalid. */
    public void submitAction(WebSocketSession session, int targetOwner, double fraction, int targetCell) {
        Integer p = sessionToPlayer.get(session.getId());
        if (p == null) return;
        humanActions.put(p, new Action(p, targetOwner, fraction, targetCell));
    }

    /** Stop a human's standing order (Hold / defend). */
    public void stopOrder(WebSocketSession session) {
        Integer p = sessionToPlayer.get(session.getId());
        if (p != null) humanActions.remove(p);
    }

    /** Set a player's display name and colour. The colour is applied by swapping with whoever holds
     *  it, so every empire keeps a distinct colour. */
    public void setProfile(WebSocketSession session, String name, int color) {
        Integer p = sessionToPlayer.get(session.getId());
        if (p == null) return;
        lock.lock();
        try {
            if (name != null) {
                String nm = name.trim().replaceAll("[\\p{Cntrl}]", "");
                if (nm.length() > 16) nm = nm.substring(0, 16);
                if (!nm.isEmpty()) names[p] = nm;
            }
            if (color >= 0 && color < NUM_PLAYERS && color != colorIdx[p]) {
                for (int j = 0; j < NUM_PLAYERS; j++) if (colorIdx[j] == color) { colorIdx[j] = colorIdx[p]; break; }
                colorIdx[p] = color;
            }
        } finally { lock.unlock(); }
    }

    /** Set bot difficulty for the match (0 Easy, 1 Normal, 2 Hard). Match-global; latest wins. */
    public void setDifficulty(int level) {
        if (level >= 0 && level <= 2) Bot.level = level;
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
        m.put("room", roomId);
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

    /** Everything except the cell ownership (which is sent full as "owner" or diffed as "changed"). */
    private Map<String, Object> buildCommon() {
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
        m.put("tick", state.tick);
        m.put("army", army);
        m.put("morale", morale);
        m.put("income", income);
        m.put("land", state.land.clone());
        m.put("alive", state.alive.clone());
        m.put("human", human.clone());
        String[] nm = new String[state.numPlayers];
        for (int p = 0; p < state.numPlayers; p++)
            nm[p] = human[p] ? (names[p] != null ? names[p] : "Player " + (p + 1)) : "Bot " + (p + 1);
        m.put("names", nm);
        m.put("colors", colorIdx.clone());
        m.put("winner", winner);
        m.put("capitals", state.capitalCell.clone());
        m.put("phase", state.phase);
        int endsIn = state.phase == GameState.PEACE ? Config.PEACE_PHASE_TICKS - state.tick : -1;
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

    /**
     * Broadcast ownership efficiently: a full "state" (owner array) to new clients and on keyframes,
     * a "delta" (only changed cells) to everyone else. Per-player arrays are tiny so always full.
     */
    private void broadcastState() {
        int[] owner = state.owner;
        boolean keyframeAll = lastOwner == null || lastOwner.length != owner.length
                || state.tick % KEYFRAME_TICKS == 0;

        Map<String, Object> common = buildCommon();
        Map<String, Object> full = new HashMap<>(common);
        full.put("type", "state");
        full.put("owner", owner.clone());
        String fullText = serialize(full);

        String deltaText = null;
        if (!keyframeAll) {
            int n = 0;
            for (int c = 0; c < owner.length; c++) if (owner[c] != lastOwner[c]) n++;
            int[] changed = new int[n * 2];
            int k = 0;
            for (int c = 0; c < owner.length; c++) if (owner[c] != lastOwner[c]) { changed[k++] = c; changed[k++] = owner[c]; }
            Map<String, Object> delta = new HashMap<>(common);
            delta.put("type", "delta");
            delta.put("changed", changed);
            deltaText = serialize(delta);
        }

        for (WebSocketSession s : sessions) {
            boolean wantsFull = keyframeAll || needsFull.remove(s.getId());
            sendRaw(s, wantsFull ? fullText : deltaText);
        }
        lastOwner = owner.clone();
    }

    // ---- transport ----

    private String serialize(Object payload) {
        try { return json.writeValueAsString(payload); } catch (Exception e) { return null; }
    }

    private void sendRaw(WebSocketSession s, String text) {
        if (text == null) return;
        try {
            synchronized (s) { if (s.isOpen()) s.sendMessage(new TextMessage(text)); }
        } catch (Exception e) { /* drop on a dead session */ }
    }

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
