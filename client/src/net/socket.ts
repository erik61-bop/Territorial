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
        break;
      case 'map':
        s.setMap({
          width: m.width, height: m.height, numPlayers: m.numPlayers,
          ownableCells: m.ownableCells ?? m.width * m.height,
          terrain: m.terrain, capitals: m.capitals,
        });
        break;
      case 'state':
        s.setSnap({
          tick: m.tick, owner: m.owner, army: m.army, morale: m.morale ?? [], income: m.income ?? [], land: m.land,
          alive: m.alive, human: m.human, winner: m.winner,
          rel: m.rel ?? [], offer: m.offer ?? [], allyOffer: m.allyOffer ?? [],
          phase: m.phase ?? 1, phaseEndsIn: m.phaseEndsIn ?? -1,
          capitals: m.capitals ?? [],
        });
        break;
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
