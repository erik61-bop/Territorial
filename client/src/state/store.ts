import { create } from 'zustand';

export interface MapInfo {
  width: number;
  height: number;
  numPlayers: number;
  terrain: number[];   // per-cell terrain ordinal
  capitals: number[];  // per-player capital cell index
}

export interface Snapshot {
  tick: number;
  owner: number[];     // per-cell owner playerId, or -1 neutral
  army: number[];      // per-player
  land: number[];
  alive: boolean[];
  human: boolean[];
  winner: number;      // -1 while playing
  rel: number[][];     // relation matrix: 0 none, 1 peace, 2 ally
  offer: boolean[][];  // offer[a][b] = a has offered b peace
  phase: number;       // 0 PEACE, 1 WAR, 2 FINAL_WAR
  phaseEndsIn: number; // ticks until next phase, or -1
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

  setConnected: (b: boolean) => void;
  setPlayerId: (n: number) => void;
  setMap: (m: MapInfo) => void;
  setSnap: (s: Snapshot) => void;
  setFraction: (f: number) => void;
  pushChat: (m: ChatMsg) => void;
}

export const useGame = create<GameStore>((set) => ({
  connected: false,
  playerId: -1,
  fraction: 0.5,
  chat: [],
  setConnected: (b) => set({ connected: b }),
  setPlayerId: (n) => set({ playerId: n }),
  setMap: (m) => set({ map: m }),
  setSnap: (s) => set({ snap: s }),
  setFraction: (f) => set({ fraction: f }),
  pushChat: (m) => set((st) => ({ chat: [...st.chat, m].slice(-6) })),
}));

// Expose the store on web for debugging / automated end-to-end checks.
if (typeof window !== 'undefined') {
  (window as any).__game = useGame;
}
