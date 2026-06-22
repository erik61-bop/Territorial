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
    static final int LOBBY_TICKS = 64;           // ~8s pre-match lobby for multiplayer/prize rooms

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
    private int[] lastAttacks = new int[0];   // this tick's PvP attacks [attacker,target,...] for battle arrows
    private final int[] peakLand = new int[NUM_PLAYERS];  // post-game summary: max land each player held
    private final int[] deathSeq = new int[NUM_PLAYERS];  // elimination order (0 = still alive / never played)
    private int deathCount = 0;
    // Event feed: diff state each tick to surface eliminations, capital captures, diplomacy.
    private boolean[] evAlive; private int[] evCap; private byte[][] evRel;
    private int[][] lastEvents = new int[0][];   // [type,a,b]: 1 ELIM,2 CAPITAL,3 PEACE,4 ALLY,5 BREAK
    private long matchSeed = 1L;
    private int winner = -1;
    private int holdTicks = 0;

    private ScheduledExecutorService scheduler;

    private final int roomId;
    private final io.territorial.account.WalletService wallet;
    volatile boolean isPrivate = false;   // single-player room — matchmaking won't add others

    // Prize (wager) room: each joiner antes `stake` into `pot`; the winner takes the whole pot.
    volatile boolean isPrize = false;
    volatile long stake = 0;
    private long pot = 0;
    private boolean potPaid = false;
    // Who anted how much (accountId -> coins). The pot is escrow: it is ALWAYS fully disbursed — to the
    // winner, or refunded to contributors if no human wins / the match never completes. Coins are never
    // created or destroyed. Survives players leaving (a leaver still forfeits to a human winner).
    private final java.util.Map<Long, Long> anteByAccount = new java.util.HashMap<>();
    // Pre-match lobby (multiplayer/prize): wait a few seconds for players before the match begins.
    volatile boolean inLobby = false;
    private int lobbyTicksLeft = 0;
    // slotToken[p] is now the account id (as a string); cache each seat's coin balance to avoid a
    // DB read every tick (it only changes on ante/payout).
    private final long[] slotCoins = new long[NUM_PLAYERS];

    public GameRoom(ObjectMapper json, io.territorial.account.WalletService wallet, int tickMs, int roomId) {
        this.json = json;
        this.wallet = wallet;
        this.tickMs = tickMs;
        this.roomId = roomId;
    }

    /** slotToken[p] holds the account id as a string; parse it (or -1). */
    private static long acct(String token) {
        try { return token == null ? -1 : Long.parseLong(token); } catch (NumberFormatException e) { return -1; }
    }

    public int roomId() { return roomId; }

    /** Make this a prize (wager) room: each joiner antes {@code stake} into the pot; winner takes it. */
    public void setPrize(long stake) { this.isPrize = true; this.stake = stake; }

    /** Free rooms are always joinable; a prize room only accepts joiners during its pre-match lobby
     *  (the wager roster is fixed once the match begins). */
    public boolean joinable() {
        if (!isPrize) return true;
        lock.lock();
        try { return inLobby; } finally { lock.unlock(); }
    }

    /** Begin ticking (called by RoomManager when the room is created). */
    public void start() {
        for (int p = 0; p < NUM_PLAYERS; p++) colorIdx[p] = p;   // default: one colour per slot
        newMatch();
        // Multiplayer & prize rooms open with a short lobby so players can gather; solo starts at once.
        if (!isPrivate) { inLobby = true; lobbyTicksLeft = LOBBY_TICKS; }
        scheduler = Executors.newSingleThreadScheduledExecutor(r -> {
            Thread t = new Thread(r, "game-tick-" + roomId);
            t.setDaemon(true);
            return t;
        });
        scheduler.scheduleAtFixedRate(this::safeStep, tickMs, tickMs, TimeUnit.MILLISECONDS);
    }

    /** Stop ticking and release the thread (called by RoomManager on disposal/shutdown). Refunds any
     *  unpaid prize escrow first so coins are never destroyed by a room dying mid-match. */
    public void stop() {
        settleUnpaid();
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

    // Map variety: rotate the board size/shape per match so games feel different (terrain already
    // varies by seed). The client handles any dimensions, so this is safe.
    private static final int[][] MAP_DIMS = { {96, 96}, {120, 120}, {150, 120}, {120, 150}, {140, 140} };

    private void newMatch() {
        int[] sizes = new int[NUM_PLAYERS];
        Arrays.fill(sizes, START_SIZE);
        int[] d = MAP_DIMS[(int) Math.floorMod(matchSeed, MAP_DIMS.length)];
        state = GameFactory.create(d[0], d[1], sizes, matchSeed++);
        Arrays.fill(peakLand, 0);
        Arrays.fill(deathSeq, 0);
        deathCount = 0;
        // Connected humans don't inherit a bot empire — they re-pick a spawn each match.
        for (int p = 0; p < NUM_PLAYERS; p++) if (human[p]) state.clearPlayer(p);
        sim = new Sim(state);
        sim.recomputeDerived();
        winner = -1;
        holdTicks = 0;
        lastOwner = null;
        humanActions.clear();
        humanDiplo.clear();
        lastAttacks = new int[0];
        lastEvents = new int[0][];
        evAlive = null;                 // re-baseline event diffing for the new match (no spurious events)
    }

    private void safeStep() {
        try { step(); } catch (Exception e) { System.err.println("tick error: " + e); }
    }

    /** One authoritative tick. Runs only on the scheduler thread, under the lock. */
    private void step() {
        lock.lock();
        try {
            if (inLobby) {                            // pre-match: count down, don't advance the sim yet
                int humans = 0; for (int p = 0; p < NUM_PLAYERS; p++) if (human[p]) humans++;
                if (--lobbyTicksLeft <= 0 || humans >= NUM_PLAYERS) inLobby = false;   // start the match
                broadcastState();
                return;
            }

            if (winner != -1) {                       // match over: hold, then restart (free rooms only)
                if (!isPrize && ++holdTicks >= RESTART_AFTER_TICKS) {
                    newMatch();                       // prize rooms are single-match: stay on the result
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
                    Action ord = humanActions.get(p);              // STANDING order: persists until Hold
                    if (ord != null && ord.targetOwner() >= 0 && !state.alive[ord.targetOwner()]) {
                        humanActions.remove(p); ord = null;        // target eliminated -> stop
                    }
                    state.stance[p] = (ord == null) ? 1 : 0;       // having an order = attacking (Normal stance)
                    // Launch a wave only ~1-2x/sec (not every tick): the order pulses, army rebuilds between.
                    a = (ord != null && state.tick % Config.ATTACK_PERIOD_TICKS == 0) ? ord : null;
                } else {
                    a = Bot.decide(state, p);
                    state.stance[p] = (a == null) ? 1 : 0;         // a holding bot digs in (+25% defence)
                }
                if (a != null) actions.add(a);
            }
            // Record this tick's PvP attacks (attacker,target,...) for the client's battle arrows.
            int na = 0;
            for (Action a : actions) if (a.targetOwner() >= 0 && a.targetOwner() != a.attackerId()) na++;
            int[] atk = new int[na * 2]; int ka = 0;
            for (Action a : actions) if (a.targetOwner() >= 0 && a.targetOwner() != a.attackerId()) { atk[ka++] = a.attackerId(); atk[ka++] = a.targetOwner(); }
            lastAttacks = atk;
            sim.tick(actions);
            expireDisconnects();
            sim.recomputeDerived();
            for (int p = 0; p < NUM_PLAYERS; p++) {       // post-game stats
                if (state.land[p] > peakLand[p]) peakLand[p] = state.land[p];
                if (!state.alive[p] && deathSeq[p] == 0 && peakLand[p] > 0) deathSeq[p] = ++deathCount;
            }
            buildEvents();
            winner = sim.winner();
            if (winner != -1 && isPrize && !potPaid) awardPot();
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
            long account = acct(token);
            for (int p = 0; p < NUM_PLAYERS; p++) {
                if (!human[p]) {
                    // Prize room: ante the stake into the pot before claiming the seat. If the player
                    // can't afford it (or isn't authenticated), they don't get a seat.
                    if (isPrize) {
                        if (account < 0 || !wallet.tryDebit(account, stake,
                                io.territorial.account.LedgerEntry.Reason.PRIZE_ANTE, "room:" + roomId)) return -1;
                        pot += stake;
                        anteByAccount.merge(account, stake, Long::sum);
                    }
                    human[p] = true;
                    connected[p] = true;
                    sessionToPlayer.put(session.getId(), p);
                    state.clearPlayer(p);      // no inherited empire; player must choose a spawn
                    if (token != null) { slotToken[p] = token; tokenToSlot.put(token, p); }
                    slotCoins[p] = account >= 0 ? wallet.balance(account) : 0;   // cache for the HUD
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

    /** Deliberate surrender (clicked "Leave match"): dissolve the empire NOW and free the slot — no
     *  grace, no bot takeover. (An accidental disconnect goes through removeHuman + the grace timer.) */
    public void leaveMatch(WebSocketSession session) {
        Integer p = sessionToPlayer.remove(session.getId());
        if (p == null) return;
        lock.lock();
        try {
            state.clearPlayer(p);          // their land returns to neutral
            human[p] = false;
            connected[p] = false;
            names[p] = null;
            humanActions.remove(p);
            if (slotToken[p] != null) { tokenToSlot.remove(slotToken[p]); slotToken[p] = null; }
            sim.recomputeDerived();
        } finally {
            lock.unlock();
        }
    }

    /** Settle a finished prize match: the human winner takes the whole pot (everyone else forfeits
     *  their ante to them). If a BOT won — i.e. no human survived — refund every contributor instead. */
    private void awardPot() {
        if (potPaid) return;
        if (winner >= 0 && human[winner] && acct(slotToken[winner]) >= 0) {
            long a = acct(slotToken[winner]);
            wallet.credit(a, pot, io.territorial.account.LedgerEntry.Reason.PRIZE_PAYOUT, "room:" + roomId);
            slotCoins[winner] = wallet.balance(a);
            potPaid = true;
            anteByAccount.clear();
        } else {
            refundEscrow();   // no human winner -> give everyone their ante back
        }
    }

    /** Refund the whole escrow to its contributors and mark the pot settled. Idempotent. Used when no
     *  human wins, or when the room is disposed before a payout (reap/shutdown) — so coins are never
     *  destroyed: the pot is ALWAYS either won or refunded in full. */
    private void refundEscrow() {
        if (potPaid) return;
        potPaid = true;
        for (var e : anteByAccount.entrySet()) {
            wallet.credit(e.getKey(), e.getValue(), io.territorial.account.LedgerEntry.Reason.PRIZE_REFUND, "room:" + roomId);
            Integer slot = tokenToSlot.get(String.valueOf(e.getKey()));
            if (slot != null) slotCoins[slot] = wallet.balance(e.getKey());
        }
        anteByAccount.clear();
    }

    /** Called on disposal (reap/shutdown): if a prize match never paid out, refund the escrow. */
    void settleUnpaid() {
        lock.lock();
        try { if (isPrize && !potPaid && pot > 0) refundEscrow(); } finally { lock.unlock(); }
    }

    /** Hand a disconnected (grace-expired) player's empire to a BOT instead of dissolving it, so the
     *  map stays intact and the war continues (named-bot replacement). The slot is free to reclaim. */
    private void expireDisconnects() {
        for (int p = 0; p < NUM_PLAYERS; p++) {
            if (human[p] && !connected[p] && state.tick - disconnectTick[p] > RECONNECT_GRACE_TICKS) {
                human[p] = false;              // a bot now plays the empire (no clearPlayer)
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
    /** Diff state since last tick into events the client can announce (eliminations, capitals, treaties). */
    private void buildEvents() {
        java.util.List<int[]> ev = new java.util.ArrayList<>();
        if (evAlive != null) {
            for (int p = 0; p < NUM_PLAYERS; p++) {
                if (evAlive[p] && !state.alive[p]) ev.add(new int[]{1, p, -1});                       // eliminated
                else if (state.alive[p] && evCap[p] >= 0 && state.owner[evCap[p]] != p)               // capital fell
                    ev.add(new int[]{2, p, state.owner[evCap[p]] >= 0 ? state.owner[evCap[p]] : -1});
            }
            for (int a = 0; a < NUM_PLAYERS; a++)
                for (int b = a + 1; b < NUM_PLAYERS; b++) {
                    int was = evRel[a][b], now = state.rel[a][b];
                    if (was == now) continue;
                    if (now == 1) ev.add(new int[]{3, a, b});       // peace
                    else if (now == 2) ev.add(new int[]{4, a, b});  // alliance
                    else if (now == 0) ev.add(new int[]{5, a, b});  // broke a treaty
                }
        } else {
            evAlive = new boolean[NUM_PLAYERS]; evCap = new int[NUM_PLAYERS]; evRel = new byte[NUM_PLAYERS][NUM_PLAYERS];
        }
        lastEvents = ev.toArray(new int[0][]);
        System.arraycopy(state.alive, 0, evAlive, 0, NUM_PLAYERS);
        for (int p = 0; p < NUM_PLAYERS; p++) evCap[p] = state.capitalCell[p];
        for (int a = 0; a < NUM_PLAYERS; a++)
            for (int b = 0; b < NUM_PLAYERS; b++) evRel[a][b] = state.rel[a][b];
    }

    /** Final ranking: alive players by land, then dead by reverse elimination order. 0 = never played. */
    private int[] computePlaces() {
        int n = state.numPlayers;
        Integer[] ids = new Integer[n];
        for (int i = 0; i < n; i++) ids[i] = i;
        java.util.Arrays.sort(ids, (a, b) -> {
            if (state.alive[a] != state.alive[b]) return state.alive[a] ? -1 : 1;   // alive above dead
            if (state.alive[a]) return Integer.compare(state.land[b], state.land[a]); // more land = better
            return Integer.compare(deathSeq[b], deathSeq[a]);                         // later death = better
        });
        int[] place = new int[n];
        int rank = 1;
        for (int id : ids) if (peakLand[id] > 0) place[id] = rank++;
        return place;
    }

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
        m.put("border", state.border.clone());   // border-cell count (where battles happen)
        m.put("defScore", round1(state.defScore)); // terrain/supply/morale/stance-aware defence per border cell
        m.put("stance", state.stance.clone());    // 0 Normal, 1 Hold (+25% defence)
        m.put("developing", state.developing.clone());   // just-captured cells not yet earning income
        m.put("events", lastEvents);              // this tick's events for the feed [type,a,b]
        m.put("alive", state.alive.clone());
        m.put("human", human.clone());
        String[] nm = new String[state.numPlayers];
        for (int p = 0; p < state.numPlayers; p++)
            nm[p] = human[p] ? (names[p] != null ? names[p] : "Player " + (p + 1))
                             : "Bot " + (p + 1) + " · " + Bot.STYLES[state.botStyle[p] % Bot.STYLES.length].name;
        m.put("names", nm);
        m.put("colors", colorIdx.clone());
        m.put("winner", winner);
        m.put("peakLand", peakLand.clone());
        if (winner >= 0) m.put("place", computePlaces());   // final ranking for the summary screen
        m.put("capitals", state.capitalCell.clone());
        m.put("phase", state.phase);
        m.put("attacks", lastAttacks);
        int endsIn = state.phase == GameState.PEACE ? Config.PEACE_PHASE_TICKS - state.tick : -1;
        m.put("phaseEndsIn", Math.max(-1, endsIn));
        // Diplomacy matrices (byte[][] -> int[][] so Jackson emits arrays, not base64).
        int[][] rel = new int[state.numPlayers][state.numPlayers];
        for (int a = 0; a < state.numPlayers; a++)
            for (int b = 0; b < state.numPlayers; b++) rel[a][b] = state.rel[a][b];
        m.put("rel", rel);
        m.put("offer", state.offer);
        m.put("allyOffer", state.allyOffer);
        // Prize-room economy: the stake, the live pot, and each seated human's coin balance (by slot).
        m.put("isPrize", isPrize);
        m.put("stake", stake);
        m.put("pot", pot);
        int[] coins = new int[state.numPlayers];
        for (int p = 0; p < state.numPlayers; p++) coins[p] = (int) slotCoins[p];   // cached; updated on ante/payout
        m.put("coins", coins);
        // Pre-match lobby: tell the client to show the "waiting for players" countdown.
        m.put("lobby", inLobby);
        m.put("lobbyLeft", inLobby ? (int) Math.ceil(lobbyTicksLeft / (1000.0 / tickMs)) : 0);
        int humans = 0; for (int p = 0; p < state.numPlayers; p++) if (human[p]) humans++;
        m.put("humans", humans);
        return m;
    }

    /** Round each value to 1 decimal for a compact wire payload. */
    private static double[] round1(double[] a) {
        double[] r = new double[a.length];
        for (int i = 0; i < a.length; i++) r[i] = Math.round(a[i] * 10.0) / 10.0;
        return r;
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
