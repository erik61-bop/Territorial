import { useGame } from '../state/store';
import { sfx } from '../audio/sfx';

/** Format a server event [type,a,b] into feed text (diplomacy only shown if it involves you). */
function announceEvent(ev: number[], names: string[] | undefined, myId: number): { text: string; color: string; major: boolean } | null {
  const [type, a, b] = ev;
  const nm = (i: number) => (i === myId ? 'You' : names?.[i] ?? `P${i + 1}`);
  switch (type) {
    case 1: return { text: `💀 ${nm(a)} was eliminated`, color: '#ff9f8f', major: true };
    case 2: return { text: `👑 ${nm(a)}'s capital fell${b >= 0 ? ` to ${nm(b)}` : ''}!`, color: '#ffd54a', major: true };
    case 3: return a === myId || b === myId ? { text: `🤝 ${nm(a)} & ${nm(b)} made peace`, color: '#86d6ff', major: false } : null;
    case 4: return a === myId || b === myId ? { text: `🛡️ ${nm(a)} & ${nm(b)} allied`, color: '#8affb0', major: false } : null;
    case 5: return a === myId || b === myId ? { text: `⚔️ ${nm(a)} broke a treaty with ${nm(b)}`, color: '#ff9f8f', major: false } : null;
    default: return null;
  }
}

let ws: WebSocket | null = null;
let chatKey = 1;
let intentionalClose = false;   // set when the player leaves, so we don't auto-reconnect

/** ws://<same-host>:8080/ws/game on web (same origin as the page); localhost otherwise. */
export function serverUrl(): string {
  const st = useGame.getState();
  const jwt = `jwt=${encodeURIComponent(st.authToken ?? '')}`;   // identity + auth (account)
  const solo = st.singlePlayer ? '&solo=1' : '';
  // Prize (wager) rooms are multiplayer only; stake = coins to ante.
  const stake = (!st.singlePlayer && st.prizeStake > 0) ? `&stake=${st.prizeStake}` : '';
  if (typeof window !== 'undefined' && window.location && window.location.host) {
    // Same origin as the page: wss on https (prod behind the proxy), ws otherwise (dev on :8080).
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    return `${proto}://${window.location.host}/ws/game?${jwt}${solo}${stake}`;
  }
  return `ws://localhost:8080/ws/game?${jwt}${solo}${stake}`;
}

// ---- Auth + account REST API ----

export async function apiRegister(email: string, password: string, displayName: string): Promise<{ ok: boolean; error?: string }> {
  return authCall('/api/auth/register', { email, password, displayName });
}
export async function apiLogin(email: string, password: string): Promise<{ ok: boolean; error?: string }> {
  return authCall('/api/auth/login', { email, password });
}

async function authCall(path: string, body: object): Promise<{ ok: boolean; error?: string }> {
  try {
    const r = await fetch(`${httpBase()}${path}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, error: j.error || (r.status === 401 ? 'bad_credentials' : `error_${r.status}`) };
    useGame.getState().setAuth(j.token, j.account);
    return { ok: true };
  } catch { return { ok: false, error: 'network' }; }
}

/** Re-fetch the logged-in account (coins, name). Logs out if the token is rejected. */
export async function refreshMe(): Promise<void> {
  const token = useGame.getState().authToken;
  if (!token) return;
  try {
    const r = await fetch(`${httpBase()}/api/me`, { headers: { Authorization: `Bearer ${token}` } });
    if (r.status === 401 || r.status === 403) { useGame.getState().setAuth(null, null); return; }
    const j = await r.json();
    useGame.getState().setAuth(token, j);
  } catch { /* offline — keep cached */ }
}

export function logout(): void {
  disconnect();
  useGame.getState().setAuth(null, null);
}

/** Claim the daily login bonus. Returns coins granted (0 if already claimed today). */
export async function claimDaily(): Promise<number> {
  const token = useGame.getState().authToken;
  if (!token) return 0;
  try {
    const r = await fetch(`${httpBase()}/api/daily`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
    const j = await r.json();
    if (typeof j.coins === 'number') useGame.getState().setCoins(j.coins);
    return j.granted ?? 0;
  } catch { return 0; }
}

/** Fetch the public leaderboard (top players). */
export async function fetchLeaderboard(): Promise<{ name: string; wins: number; level: number; xp: number }[]> {
  try {
    const r = await fetch(`${httpBase()}/api/leaderboard`);
    return await r.json();
  } catch { return []; }
}

/** REST base = same origin as the page (dev: http://localhost:8080; prod: https://your-domain). */
function httpBase(): string {
  if (typeof window !== 'undefined' && window.location && window.location.origin) {
    return window.location.origin;
  }
  return 'http://localhost:8080';
}

export function connect(url = serverUrl()): WebSocket {
  if (ws) return ws;
  intentionalClose = false;
  const store = useGame.getState();
  const sock = new WebSocket(url);

  sock.onopen = () => store.setConnected(true);
  sock.onclose = () => {
    store.setConnected(false);
    ws = null;
    if (intentionalClose) return;            // player left — don't reconnect
    setTimeout(() => connect(url), 1000);    // otherwise auto-reconnect
  };
  sock.onerror = () => { /* state surfaced via connected=false */ };
  sock.onmessage = (ev) => {
    let m: any;
    try { m = JSON.parse(ev.data as string); } catch { return; }
    const s = useGame.getState();
    switch (m.type) {
      case 'welcome':
        s.setPlayerId(m.playerId);
        s.setMatchId(m.room ?? -1);
        s.setJoinError(null);
        break;
      case 'joinError':
        intentionalClose = true;   // server will close; don't auto-reconnect into the same refusal
        if (m.reason === 'auth_required') { s.setAuth(null, null); s.setJoinError('Please sign in to play.'); }
        else s.setJoinError(m.reason === 'insufficient_coins'
          ? `Not enough coins — you have ${m.coins}, need ${m.stake}.`
          : 'Could not join that room.');
        s.setStarted(false);       // bounce back to the menu / auth
        break;
      case 'map':
        s.setMap({
          width: m.width, height: m.height, numPlayers: m.numPlayers,
          ownableCells: m.ownableCells ?? m.width * m.height,
          terrain: m.terrain, capitals: m.capitals,
        });
        break;
      case 'state':
      case 'delta': {
        // Full snapshot carries owner[]; a delta carries changed[idx,owner,...] applied to the
        // previous owner array. Per-player arrays are always sent in full.
        let owner: number[];
        if (m.type === 'state') {
          owner = m.owner;
        } else {
          const prev = useGame.getState().snap?.owner;
          if (!prev) break;                 // no baseline yet — wait for the next full keyframe
          owner = prev.slice();
          const ch = m.changed ?? [];
          for (let i = 0; i + 1 < ch.length; i += 2) owner[ch[i]] = ch[i + 1];
        }
        s.setSnap({
          tick: m.tick, owner, army: m.army, morale: m.morale ?? [], income: m.income ?? [], land: m.land, border: m.border ?? [], defScore: m.defScore, stance: m.stance, developing: m.developing,
          alive: m.alive, human: m.human, winner: m.winner,
          rel: m.rel ?? [], offer: m.offer ?? [], allyOffer: m.allyOffer ?? [],
          phase: m.phase ?? 1, phaseEndsIn: m.phaseEndsIn ?? -1,
          capitals: m.capitals ?? [],
          names: m.names, colors: m.colors, attacks: m.attacks,
          peakLand: m.peakLand, place: m.place,
          isPrize: m.isPrize, stake: m.stake, pot: m.pot, coins: m.coins,
          lobby: m.lobby, lobbyLeft: m.lobbyLeft, humans: m.humans,
        });
        // Announce this tick's events (eliminations, capitals, your treaties) in the feed.
        if (Array.isArray(m.events) && m.events.length) {
          const myId = s.playerId; const muted = s.muted;
          for (const ev of m.events) {
            const a = announceEvent(ev, m.names, myId);
            if (!a) continue;
            s.pushGameEvent(a.text, a.color);
            if (a.major && !muted) (ev[0] === 1 ? sfx.eliminate : sfx.capitalFell)();
          }
        }
        break;
      }
      case 'chat':
        s.pushChat({ key: chatKey++, from: m.from, templateId: m.templateId, target: m.target });
        break;
    }
  };

  ws = sock;
  return sock;
}

/** Leave the match: tell the server to surrender (dissolve the empire now), then close + stop
 *  auto-reconnect. (An accidental drop instead keeps the empire for the reconnect grace.) */
export function disconnect(): void {
  intentionalClose = true;
  const sock = ws; ws = null;
  if (sock) {
    try { if (sock.readyState === WebSocket.OPEN) sock.send(JSON.stringify({ type: 'leave' })); } catch { /* ignore */ }
    setTimeout(() => { try { sock.close(); } catch { /* ignore */ } }, 80);   // let the leave msg flush first
  }
  useGame.getState().setConnected(false);
}

function send(obj: unknown): void {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
}

/**
 * targetOwner = a playerId to attack, or -1 to expand into neutral. targetCell directs the wave
 * (the tapped cell); -1 = cheapest-first. One-shot.
 */
export function sendAction(targetOwner: number, fraction: number, targetCell = -1): void {
  send({ type: 'action', targetOwner, fraction, targetCell });
  useGame.getState().setOrder(targetOwner);   // remember the standing order for the UI
}

/** Stop the standing order (Hold / defend). */
export function sendStop(): void {
  send({ type: 'stop' });
  useGame.getState().setOrder(null);
}

/** Set bot difficulty for the match (0 Easy, 1 Normal, 2 Hard). */
export function sendDifficulty(level: number): void {
  send({ type: 'difficulty', level });
}

/** Send the player's chosen display name and colour index. */
export function sendProfile(name: string, color: number): void {
  send({ type: 'profile', name, color });
}

/** Send a quick-chat message; target is a playerId or -1. "peace_request" also requests peace. */
export function sendChat(templateId: string, target: number): void {
  send({ type: 'chat', templateId, target });
}

/** kind: REQUEST_PEACE | ACCEPT_PEACE | BREAK_PEACE. */
export function sendDiplo(kind: string, target: number): void {
  send({ type: 'diplo', kind, target });
}

/** Place your starting blob at a chosen (neutral) cell. */
export function sendSpawn(cell: number): void {
  send({ type: 'spawn', cell });
}

// Expose senders on web for automated end-to-end checks.
if (typeof window !== 'undefined') {
  (window as any).__net = { sendAction, sendChat, sendDiplo, sendSpawn };
}
