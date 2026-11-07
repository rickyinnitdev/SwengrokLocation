import { DurableObject } from 'cloudflare:workers';
import { RoomEngine, EMOTES, profile } from './room-engine.js';
import { GAME_PROTOCOL } from './location-rotation.js';
import { modes } from '../.generated/game-data.js';
import { RankedPlayer } from './ranked.js';
import { authenticate, getRatings, getUnlocks, topBoard, myStanding, recordRun, validIdentity, boardCacheKey, HttpError } from './leaderboard.js';
import { weekKey, weekStartMs } from './rating.js';

export { RankedPlayer };

const json = (body, status = 200) => Response.json(body, { status });

async function readBody(request, url) {
  if (request.method !== 'POST') throw new HttpError(405, 'POST required.');
  if (request.headers.get('Origin') !== url.origin) throw new HttpError(403, 'Origin not allowed.');
  const text = await request.text();
  if (text.length > 2048) throw new HttpError(413, 'Request too large.');
  try { const body = JSON.parse(text); if (body && typeof body === 'object') return body; } catch {}
  throw new HttpError(400, 'Invalid JSON.');
}

function boardParams(q) {
  const type = q.get('type') === 'rating' ? 'rating' : 'score';
  const region = q.get('region') === 'world' ? 'world' : 'kh';
  const period = q.get('period') === 'all' ? 'all' : 'week';
  const mode = q.get('mode') || 'classic';
  if (type === 'score' && mode !== 'party') {
    const base = mode.startsWith('party:') ? mode.slice(6) : mode;
    if (!modes[base] || (mode === base && !modes[base].ranked)) throw new HttpError(400, 'Unknown board.');
  }
  return { type, region, period, mode };
}

async function leaderboard(request, env, ctx, url) {
  if (!env.DB) throw new HttpError(503, 'The leaderboard is not available yet.');
  const params = boardParams(url.searchParams);
  const playerId = url.searchParams.get('playerId');
  const now = Date.now();
  const cacheKey = boardCacheKey(params, now);
  let rows;
  const hit = await caches.default.match(cacheKey);
  if (hit) rows = await hit.json();
  else {
    rows = await topBoard(env.DB, params, now);
    ctx.waitUntil(caches.default.put(cacheKey, new Response(JSON.stringify(rows), { headers: { 'Cache-Control': 'public, max-age=60' } })));
  }
  const me = playerId && validIdentity(playerId, 'a'.repeat(32)) ? await myStanding(env.DB, playerId, params, now) : null;
  return json({
    ...params,
    weekStart: weekStartMs(weekKey(now)),
    rows: rows.map(({ playerId: id, ...row }) => ({ ...row, isMe: id === playerId })),
    me
  });
}

async function api(request, env, ctx, url) {
  const path = url.pathname;
  if (path === '/api/leaderboard') return leaderboard(request, env, ctx, url);
  if (path === '/api/me' || path.startsWith('/api/ranked/')) {
    if (!env.DB) throw new HttpError(503, 'The leaderboard is not available yet.');
    const body = await readBody(request, url);
    const name = await authenticate(env.DB, body);
    if (path === '/api/me') return json({ name, ratings: await getRatings(env.DB, body.playerId), unlocks: await getUnlocks(env.DB, body.playerId) });
    const action = path.slice('/api/ranked/'.length);
    if (!['start', 'guess', 'next'].includes(action)) throw new HttpError(404, 'Not found.');
    const stub = env.RANKED.get(env.RANKED.idFromName(body.playerId));
    const forward = await stub.fetch(`https://ranked/${action}`, {
      method: 'POST',
      body: JSON.stringify({ mode: body.mode, round: body.round, guessLatLng: body.guessLatLng, playerId: body.playerId, name })
    });
    return new Response(forward.body, { status: forward.status, headers: { 'Content-Type': 'application/json' } });
  }
  return new Response('Not found', { status: 404 });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/api/health') return Response.json({ service: 'wanderpenh-rooms', version: GAME_PROTOCOL });
    const room = url.pathname.match(/^\/api\/rooms\/(WP-[A-Z0-9]{5,6})$/);
    if (room) {
      if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return new Response('WebSocket required', { status: 426 });
      if (request.headers.get('Origin') !== url.origin) return new Response('Origin not allowed', { status: 403 });
      return env.ROOMS.get(env.ROOMS.idFromName(room[1])).fetch(request);
    }
    if (url.pathname.startsWith('/api/')) {
      try { return await api(request, env, ctx, url); }
      catch (e) {
        if (e instanceof HttpError) return json({ error: e.message }, e.status);
        console.error('api error', e?.message);
        return json({ error: 'Something went wrong. Try again.' }, 500);
      }
    }
    return env.ASSETS.fetch(request);
  }
};

export class PartyRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.ctx = ctx;
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
    ctx.blockConcurrencyWhile(async () => { this.engine = new RoomEngine(await ctx.storage.get('room')); });
  }
  async fetch() {
    // 8 players + 8 spectators, plus room for a resumed tab before its old socket closes.
    if (this.ctx.getWebSockets().length >= 20) return new Response('Too many connections', { status: 429 });
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ pendingUntil: Date.now() + 15000 });
    await this.schedule();
    return new Response(null, { status: 101, webSocket: client });
  }
  async webSocketMessage(ws, raw) {
    if (typeof raw !== 'string' || raw.length > 16384) return ws.close(1009, 'Message too large');
    let msg;
    try { msg = JSON.parse(raw); } catch { return ws.close(1007, 'Invalid JSON'); }
    if (!msg || typeof msg !== 'object') return;
    let attachment = ws.deserializeAttachment();
    const now = Date.now();
    // Per-connection rate limit is persisted with the hibernating socket.
    if (attachment.windowAt && now - attachment.windowAt < 1000 && attachment.count >= 20) return;
    if (!attachment.windowAt || now - attachment.windowAt >= 1000) { attachment.windowAt = now; attachment.count = 0; }
    attachment.count++;
    ws.serializeAttachment(attachment);
    if (!attachment.playerId) {
      if (msg.type !== 'HELLO' || now > attachment.pendingUntil) return ws.close(1008, 'Join required');
      if (msg.protocol !== GAME_PROTOCOL) {
        ws.send(JSON.stringify({ type: 'ROOM_ERROR', message: 'The game has updated. Reload this page, then join again.' }));
        ws.close(1008, 'Update required');
        return;
      }
      try {
        this.engine.tick(now);
        const p = this.engine.join(msg, now);
        await this.linkIdentity(p, msg.identity);
        // A resume token replaces the old socket, without removing its player.
        for (const old of this.ctx.getWebSockets()) {
          if (old !== ws && old.deserializeAttachment()?.playerId === p.id) {
            old.serializeAttachment({ replaced: true });
            old.close(1000, 'Session resumed');
          }
        }
        attachment = { ...attachment, playerId: p.id, protocol: GAME_PROTOCOL, pendingUntil: null };
        ws.serializeAttachment(attachment);
        ws.send(JSON.stringify({ type: 'WELCOME', playerId: p.id, token: p.token }));
      } catch (e) {
        ws.send(JSON.stringify({ type: 'ROOM_ERROR', message: e.message }));
        ws.close(1008, 'Join failed');
        return;
      }
    } else if (msg.type === 'LEAVE') {
      this.engine.disconnect(attachment.playerId, now, true);
      ws.serializeAttachment({ replaced: true });
      ws.close(1000, 'Left party');
    } else if (msg.type === 'LOBBY_EMOTE') {
      const p = this.engine.state.players.find(p => p.id === attachment.playerId);
      if (p && EMOTES.includes(msg.emote)) this.sendAll({ type: 'LOBBY_EMOTE', sender: p.profile.name, emote: msg.emote, spectator: p.role === 'spectator' });
    } else {
      this.engine.tick(now);
      this.engine.handle(attachment.playerId, msg, now);
    }
    await this.recordFinished();
    await this.persist();
    this.broadcast();
  }
  // Optional: lets a finished party show up on the leaderboard. Never blocks play.
  async linkIdentity(player, identity) {
    if (!this.env.DB || !identity || !validIdentity(identity.playerId, identity.secret)) return;
    try {
      await authenticate(this.env.DB, { playerId: identity.playerId, secret: identity.secret, name: player.profile.name });
      player.deviceId = identity.playerId;
      player.unlocks = await getUnlocks(this.env.DB, identity.playerId);
      // Re-check the avatar now that we know what this player has earned.
      if (!this.engine.state.match) player.profile = profile(player.wanted || player.profile, player.unlocks);
    } catch (e) { console.error('party identity not linked:', e?.message); }
  }
  async recordFinished() {
    const s = this.engine.state, m = s.match;
    if (!this.env.DB || !m || m.phase !== 'final' || m.recorded) return;
    m.recorded = true;
    const cfg = modes[s.mode];
    // Battle Royale is scored by placement (1st 100, 2nd 70, 3rd 50, then -10 per place, min 5); a score of 100 is a win.
    const placement = m.royale ? Object.fromEntries((m.royale.placements || this.engine.placements()).map(x => [x.id, x.points])) : null;
    for (const p of s.players) {
      if (!p.deviceId || p.role === 'spectator') continue;
      const score = placement ? (placement[p.id] ?? 5) : Object.values(m.guesses).reduce((sum, round) => sum + (round[p.id]?.score || 0), 0);
      const rounds = placement ? Math.max(1, m.round) : cfg.rounds;
      try { await recordRun(this.env.DB, { playerId: p.deviceId, mode: `party:${s.mode}`, region: cfg.region, score, rounds, ranked: false }); } catch (e) { console.error('party result not saved:', e?.message); }
    }
  }
  sendAll(msg) {
    for (const ws of this.ctx.getWebSockets()) {
      const attachment = ws.deserializeAttachment();
      if (attachment?.playerId && attachment?.protocol !== GAME_PROTOCOL) {
        try { ws.send(JSON.stringify({ type: 'ROOM_ERROR', message: 'The game has updated. Reload this page, then join again.' })); ws.close(1008, 'Update required'); } catch {}
        continue;
      }
      if (attachment?.playerId) { try { ws.send(JSON.stringify(msg)); } catch {} }
    }
  }
  broadcast() {
    // Each player gets their own snapshot so a Tag-Team Pinner never receives
    // the current round's location before the reveal.
    const serverNow = Date.now();
    for (const ws of this.ctx.getWebSockets()) {
      const attachment = ws.deserializeAttachment();
      if (!attachment?.playerId) continue;
      if (attachment.protocol !== GAME_PROTOCOL) {
        try { ws.send(JSON.stringify({ type: 'ROOM_ERROR', message: 'The game has updated. Reload this page, then join again.' })); ws.close(1008, 'Update required'); } catch {}
        continue;
      }
      try {
        ws.send(JSON.stringify({ type: 'ROOM_STATE', serverNow, ...this.engine.snapshot(attachment.playerId) }));
      } catch {}
    }
  }
  async webSocketClose(ws) {
    const id = ws.deserializeAttachment()?.playerId;
    if (id) this.engine.disconnect(id);
    await this.persist();
    this.broadcast();
  }
  async webSocketError(ws) { await this.webSocketClose(ws); }
  async schedule() {
    const pending = this.ctx.getWebSockets().map(ws => ws.deserializeAttachment()?.pendingUntil).filter(Boolean);
    const next = this.engine.nextAlarm();
    if (next) pending.push(next);
    if (pending.length) await this.ctx.storage.setAlarm(Math.min(...pending));
    else await this.ctx.storage.deleteAlarm();
  }
  async persist() {
    await this.ctx.storage.put('room', this.engine.state);
    await this.schedule();
  }
  async alarm() {
    for (const ws of this.ctx.getWebSockets()) {
      const a = ws.deserializeAttachment();
      if (a?.pendingUntil && a.pendingUntil <= Date.now()) { ws.serializeAttachment({ replaced: true }); ws.close(1008, 'Join timed out'); }
    }
    this.engine.tick();
    if (!this.engine.state.players.length) {
      for (const ws of this.ctx.getWebSockets()) ws.close(1000, 'Room expired');
    }
    await this.persist();
    this.broadcast();
  }
}
