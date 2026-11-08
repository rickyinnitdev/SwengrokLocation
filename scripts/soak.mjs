// Plays 8 fake WebSocket players through a full match against `wrangler dev` (npm run dev)
// and reports the round-trip time of each action. Usage: node scripts/soak.mjs [http://127.0.0.1:4173]
const base = process.argv[2] || 'http://127.0.0.1:4173';
const origin = base, wsBase = base.replace(/^http/, 'ws');
const code = 'WP-' + Array.from({ length: 5 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join('');
const health = await (await fetch(base + '/api/health')).json();
const rtts = [];

function player(i) {
  const ws = new WebSocket(`${wsBase}/api/rooms/${code}`, { headers: { Origin: origin } });
  const p = { i, ws, state: null, sentAt: 0 };
  p.ready = new Promise(res => { p.onState = res; });
  ws.onopen = () => ws.send(JSON.stringify({ type: 'HELLO', protocol: health.version, create: i === 0, profile: { name: 'Bot' + i }, mode: 'classic' }));
  ws.onmessage = e => {
    const msg = JSON.parse(e.data);
    if (msg.type === 'WELCOME') p.id = msg.playerId;
    if (msg.type === 'ROOM_STATE') { if (p.sentAt) { rtts.push(Date.now() - p.sentAt); p.sentAt = 0; } p.state = msg; p.onState(); }
  };
  p.send = m => { p.sentAt = Date.now(); ws.send(JSON.stringify(m)); };
  return p;
}
const wait = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, ms = 20000) => { const t = Date.now(); while (!fn()) { if (Date.now() - t > ms) throw new Error('timeout'); await wait(50); } };

const host = player(0);
await host.ready;
const bots = [host];
for (let i = 1; i < 8; i++) { const b = player(i); await b.ready; bots.push(b); }
await until(() => host.state.players.length === 8);
host.send({ type: 'START_MATCH' });
await until(() => host.state.match);
for (let round = 1; round <= host.state.match.plan.length; round++) {
  await until(() => host.state.match.round === round && Date.now() >= host.state.match.startedAt);
  await wait(900);
  for (const b of bots) b.send({ type: 'PLAYER_GUESS', matchId: b.state.match.id, round, guessLatLng: { lat: 11.55 + Math.random() * 0.05, lng: 104.9 + Math.random() * 0.05 } });
  await until(() => bots.every(b => b.state.match.guesses[round]?.[b.id]?.score !== undefined));
  for (const b of bots) b.send({ type: 'ROUND_READY', matchId: b.state.match.id, round });
  await until(() => host.state.match.phase === 'final' || host.state.match.round > round);
}
bots.forEach(b => b.ws.close());
rtts.sort((a, b) => a - b);
const pct = q => rtts[Math.min(rtts.length - 1, Math.floor(rtts.length * q))];
console.log(`messages ${rtts.length}  median ${pct(0.5)} ms  p95 ${pct(0.95)} ms  max ${rtts.at(-1)} ms`);
process.exit(pct(0.5) < 150 ? 0 : 1);
