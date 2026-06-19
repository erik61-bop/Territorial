import { create } from 'zustand';

export interface MapInfo {
  width: number;
  height: number;
  numPlayers: number;
  ownableCells: number; // non-water cells (win denominator + % of map)
  terrain: number[];   // per-cell terrain ordinal
  capitals: number[];  // per-player capital cell index
}

export type Mode = 'attack' | 'hold';

export interface Snapshot {
  tick: number;
  owner: number[];     // per-cell owner playerId, or -1 neutral
  army: number[];      // per-player
  morale: number[];    // per-player momentum x100 (e.g. 120 = 1.20)
  income: number[];    // per-player army/sec
  land: number[];
  border: number[];    // per-player border-cell count (where battles happen)
  defScore?: number[]; // per-player terrain/supply/morale/stance-aware defence per border cell
  stance?: number[];   // per-player defence posture: 0 Normal, 1 Hold (+25% defence)
  developing?: number[]; // per-player count of just-captured cells not yet producing income
  alive: boolean[];
  human: boolean[];
  winner: number;      // -1 while playing
  rel: number[][];        // relation matrix: 0 none, 1 peace, 2 ally
  offer: boolean[][];     // offer[a][b] = a has offered b peace
  allyOffer: boolean[][]; // allyOffer[a][b] = a has offered b an alliance
  phase: number;       // 0 PEACE, 1 WAR
  phaseEndsIn: number; // ticks until next phase, or -1
  capitals: number[];  // per-player capital cell (reflects chosen spawn)
  names?: string[];    // per-player display name
  colors?: number[];   // per-player colour index into PLAYER_COLORS
  attacks?: number[];  // this tick's PvP attacks, flat [attacker, target, ...] (battle arrows)
  peakLand?: number[]; // post-game summary: max land each player ever held
  place?: number[];    // final ranking (1 = winner), present once the match ends; 0 = never played
  isPrize?: boolean;   // prize (wager) room?
  stake?: number;      // coins each player anted
  pot?: number;        // total prize pool for the winner
  coins?: number[];    // per-slot coin balance (0 for non-humans)
  lobby?: boolean;     // pre-match lobby (waiting for players)
  lobbyLeft?: number;  // seconds until the match starts
  humans?: number;     // human players currently in the room
}

/** Colour index for a player (uses the server's colour permutation, falls back to slot). */
export function colorIndexOf(snap: Snapshot | undefined, id: number): number {
  return snap?.colors?.[id] ?? id;
}
/** Defence score per border cell — the wave it takes to crack a typical border cell. Prefers the
 *  server's terrain/supply/morale/stance-aware value (defScore); falls back to the crude army/border
 *  average for older payloads. It's often < 1 (an over-stretched empire has near-zero defence). */
export function defenseOf(snap: Snapshot | undefined, id: number): number {
  if (!snap) return 0;
  const srv = snap.defScore?.[id];
  if (srv != null) return Math.round(srv * 10) / 10;       // already terrain/supply/morale/stance-aware
  const army = snap.army?.[id] ?? 0;
  const border = Math.max(1, snap.border?.[id] ?? 1);
  const mom = (snap.morale?.[id] ?? 100) / 100;
  const stanceMul = snap.stance?.[id] === 1 ? 1.25 : 1;   // HOLD stance digs in (+25%)
  return Math.round((army / border) * mom * stanceMul * 10) / 10;
}
/** Is this player in the Hold stance (+25% defence)? */
export function isHolding(snap: Snapshot | undefined, id: number): boolean {
  return snap?.stance?.[id] === 1;
}
/** Qualitative label for a defence value, so even small numbers read clearly. */
export function defenseTag(def: number): string {
  return def < 1 ? '⚠ thin' : def < 4 ? 'holding' : def < 9 ? 'solid' : 'fortress';
}

/** Display name for a player ("You" for yourself). */
export function nameOf(snap: Snapshot | undefined, id: number, me: number): string {
  if (id === me) return 'You';
  return snap?.names?.[id] ?? `Player ${id + 1}`;
}

export interface ChatMsg {
  key: number;         // unique, for list rendering
  from: number;
  templateId: string;
  target: number;
}

interface GameStore {
  connected: boolean;
  playerId: number;
  matchId: number;     // which concurrent match this client is in
  map?: MapInfo;
  snap?: Snapshot;
  fraction: number;    // per-tick army rate for a standing order
  chat: ChatMsg[];     // recent messages (capped)
  started: boolean;    // has the player pressed Play (left the menu)
  muted: boolean;
  mode: Mode;          // current action mode (from the bottom action bar)
  myName: string;      // chosen display name (sent on join)
  myColor: number;     // chosen colour index (sent on join)
  order: number | null; // current standing-order target (playerId, -1 = expand, null = none)
  underAttackAt: number; // performance.now() of the last time we lost land (for the threat cue)
  selected: number | null; // nation currently inspected (playerId), or null
  gameEvents: { key: number; text: string; color: string; t: number }[]; // event feed (recent)
  spectating: boolean;   // eliminated/idle player chose to watch instead of respawning
  showHelp: boolean;     // the How-to-play overlay is open
  showSettings: boolean; // the settings / pause panel is open
  difficulty: number;    // chosen bot difficulty (0 Easy, 1 Normal, 2 Hard)
  singlePlayer: boolean; // true = private match (you + bots); false = shared multiplayer room
  prizeStake: number;    // coins to wager for a prize room (0 = free room)
  joinError: string | null; // last failed-join reason (e.g. not enough coins)
  authToken: string | null; // JWT for the logged-in account (null = logged out)
  account: AccountInfo | null; // the logged-in account (id, email, displayName, coins)

  setConnected: (b: boolean) => void;
  setPlayerId: (n: number) => void;
  setMatchId: (n: number) => void;
  setMap: (m: MapInfo) => void;
  setSnap: (s: Snapshot) => void;
  setFraction: (f: number) => void;
  pushChat: (m: ChatMsg) => void;
  setStarted: (b: boolean) => void;
  toggleMuted: () => void;
  setMode: (m: Mode) => void;
  setProfile: (name: string, color: number) => void;
  setOrder: (o: number | null) => void;
  flagUnderAttack: () => void;
  setSelected: (id: number | null) => void;
  setSpectating: (b: boolean) => void;
  setShowHelp: (b: boolean) => void;
  setShowSettings: (b: boolean) => void;
  setDifficulty: (n: number) => void;
  setSinglePlayer: (b: boolean) => void;
  setPrizeStake: (n: number) => void;
  setJoinError: (s: string | null) => void;
  setAuth: (token: string | null, account: AccountInfo | null) => void;
  setCoins: (coins: number) => void;
  pushGameEvent: (text: string, color: string) => void;
}

export interface AccountInfo { id: number; email: string; displayName: string; coins: number; }

/** Restore a persisted JWT (web) so a refresh keeps you logged in. */
function savedToken(): string | null {
  try { return typeof localStorage !== 'undefined' ? localStorage.getItem('territorial_jwt') : null; } catch { return null; }
}

let evKey = 0;

export const useGame = create<GameStore>((set) => ({
  connected: false,
  playerId: -1,
  matchId: -1,
  fraction: 0.35,
  chat: [],
  started: false,
  muted: false,
  mode: 'attack',
  myName: '',
  myColor: 0,
  order: null,
  underAttackAt: 0,
  selected: null,
  gameEvents: [],
  spectating: false,
  showHelp: false,
  showSettings: false,
  difficulty: 1,
  singlePlayer: true,
  prizeStake: 0,
  joinError: null,
  authToken: savedToken(),
  account: null,
  setConnected: (b) => set({ connected: b }),
  setPlayerId: (n) => set({ playerId: n }),
  setMatchId: (n) => set({ matchId: n }),
  setMap: (m) => set({ map: m }),
  setSnap: (s) => set({ snap: s }),
  setFraction: (f) => set({ fraction: f }),
  pushChat: (m) => set((st) => ({ chat: [...st.chat, m].slice(-6) })),
  setStarted: (b) => set({ started: b }),
  toggleMuted: () => set((st) => ({ muted: !st.muted })),
  setMode: (m) => set({ mode: m }),
  setProfile: (name, color) => set({ myName: name, myColor: color }),
  setOrder: (o) => set({ order: o }),
  flagUnderAttack: () => set({ underAttackAt: typeof performance !== 'undefined' ? performance.now() : Date.now() }),
  setSelected: (id) => set({ selected: id }),
  setSpectating: (b) => set({ spectating: b }),
  setShowHelp: (b) => set({ showHelp: b }),
  setShowSettings: (b) => set({ showSettings: b }),
  setDifficulty: (n) => set({ difficulty: n }),
  setSinglePlayer: (b) => set({ singlePlayer: b }),
  setPrizeStake: (n) => set({ prizeStake: n }),
  setJoinError: (s) => set({ joinError: s }),
  setAuth: (token, account) => {
    try {
      if (typeof localStorage !== 'undefined') {
        if (token) localStorage.setItem('territorial_jwt', token); else localStorage.removeItem('territorial_jwt');
      }
    } catch { /* ignore */ }
    set({ authToken: token, account });
  },
  setCoins: (coins) => set((st) => ({ account: st.account ? { ...st.account, coins } : st.account })),
  pushGameEvent: (text, color) => set((st) => ({
    gameEvents: [...st.gameEvents, { key: ++evKey, text, color, t: typeof performance !== 'undefined' ? performance.now() : Date.now() }].slice(-6),
  })),
}));

// Expose the store on web for debugging / automated end-to-end checks.
if (typeof window !== 'undefined') {
  (window as any).__game = useGame;
}
