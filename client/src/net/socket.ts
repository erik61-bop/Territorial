import { useGame } from '../state/store';

let ws: WebSocket | null = null;
let chatKey = 1;

/** A persistent client id so a reload/disconnect reconnects to the same empire. */
function clientToken(): string {
  try {
    if (typeof localStorage !== 'undefined') {
      let t = localStorage.getItem('territorial_token');
      if (!t) { t = Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem('territorial_token', t); }
      return t;
    }
  } catch { /* ignore */ }
  return 'anon';
}

/** ws://<same-host>:8080/ws/game on web (same origin as the page); localhost otherwise. */
export function serverUrl(): string {
  const t = encodeURIComponent(clientToken());
  if (typeof window !== 'undefined' && window.location && window.location.hostname) {
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    return `${proto}://${window.location.hostname}:8080/ws/game?t=${t}`;
  }
  return `ws://localhost:8080/ws/game?t=${t}`;
}

export function connect(url = serverUrl()): WebSocket {
  if (ws) return ws;
  const store = useGame.getState();
  const sock = new WebSocket(url);

  sock.onopen = () => store.setConnected(true);
  sock.onclose = () => {
    store.setConnected(false);
    ws = null;
    // simple auto-reconnect after a short delay
    setTimeout(() => connect(url), 1000);
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
          tick: m.tick, owner, army: m.army, morale: m.morale ?? [], income: m.income ?? [], land: m.land,
          alive: m.alive, human: m.human, winner: m.winner,
          rel: m.rel ?? [], offer: m.offer ?? [], allyOffer: m.allyOffer ?? [],
          phase: m.phase ?? 1, phaseEndsIn: m.phaseEndsIn ?? -1,
          capitals: m.capitals ?? [],
          names: m.names, colors: m.colors, attacks: m.attacks,
        });
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
