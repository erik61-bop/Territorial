import { create } from 'zustand';

export interface MapInfo {
  width: number;
  height: number;
  numPlayers: number;
  ownableCells: number; // non-water cells (win denominator + % of map)
  terrain: number[];   // per-cell terrain ordinal
  capitals: number[];  // per-player capital cell index
}

export type Mode = 'attack' | 'move' | 'split' | 'hold';

export interface Snapshot {
  tick: number;
  owner: number[];     // per-cell owner playerId, or -1 neutral
  army: number[];      // per-player
  morale: number[];    // per-player momentum x100 (e.g. 120 = 1.20)
  income: number[];    // per-player army/sec
  land: number[];
  alive: boolean[];
  human: boolean[];
  winner: number;      // -1 while playing
  rel: number[][];        // relation matrix: 0 none, 1 peace, 2 ally
  offer: boolean[][];     // offer[a][b] = a has offered b peace
  allyOffer: boolean[][]; // allyOffer[a][b] = a has offered b an alliance
  phase: number;       // 0 PEACE, 1 WAR, 2 FINAL_WAR
  phaseEndsIn: number; // ticks until next phase, or -1
  capitals: number[];  // per-player capital cell (reflects chosen spawn)
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
  map?: MapInfo;
  snap?: Snapshot;
  fraction: number;    // how much army a tap commits
  chat: ChatMsg[];     // recent messages (capped)
  started: boolean;    // has the player pressed Play (left the menu)
  muted: boolean;
  mode: Mode;          // current action mode (from the bottom action bar)

  setConnected: (b: boolean) => void;
  setPlayerId: (n: number) => void;
  setMap: (m: MapInfo) => void;
  setSnap: (s: Snapshot) => void;
  setFraction: (f: number) => void;
  pushChat: (m: ChatMsg) => void;
  setStarted: (b: boolean) => void;
  toggleMuted: () => void;
  setMode: (m: Mode) => void;
}

export const useGame = create<GameStore>((set) => ({
  connected: false,
  playerId: -1,
  fraction: 0.5,
  chat: [],
  started: false,
  muted: false,
  mode: 'attack',
  setConnected: (b) => set({ connected: b }),
  setPlayerId: (n) => set({ playerId: n }),
  setMap: (m) => set({ map: m }),
  setSnap: (s) => set({ snap: s }),
  setFraction: (f) => set({ fraction: f }),
  pushChat: (m) => set((st) => ({ chat: [...st.chat, m].slice(-6) })),
  setStarted: (b) => set({ started: b }),
  toggleMuted: () => set((st) => ({ muted: !st.muted })),
  setMode: (m) => set({ mode: m }),
}));

// Expose the store on web for debugging / automated end-to-end checks.
if (typeof window !== 'undefined') {
  (window as any).__game = useGame;
}
