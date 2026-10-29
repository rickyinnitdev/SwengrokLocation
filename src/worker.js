import { DurableObject } from 'cloudflare:workers';
import { RoomEngine, EMOTES } from './room-engine.js';
import { GAME_PROTOCOL } from './location-rotation.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/health') return Response.json({ service: 'wanderpenh-rooms', version: GAME_PROTOCOL });
    const room = url.pathname.match(/^\/api\/rooms\/(WP-[A-Z0-9]{5,6})$/);
    if (room) {
      if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return new Response('WebSocket required', { status: 426 });
      if (request.headers.get('Origin') !== url.origin) return new Response('Origin not allowed', { status: 403 });
      return env.ROOMS.get(env.ROOMS.idFromName(room[1])).fetch(request);
    }
    if (url.pathname.startsWith('/api/')) return new Response('Not found', { status: 404 });
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
    if (this.ctx.getWebSockets().length >= 16) return new Response('Too many connections', { status: 429 });
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
      if (p && EMOTES.includes(msg.emote)) this.sendAll({ type: 'LOBBY_EMOTE', sender: p.profile.name, emote: msg.emote });
    } else {
      this.engine.tick(now);
      this.engine.handle(attachment.playerId, msg, now);
    }
    await this.persist();
    this.broadcast();
  }
  sendAll(msg) {
    for (const ws of this.ctx.getWebSockets()) {
      if (ws.deserializeAttachment()?.playerId && ws.deserializeAttachment()?.protocol !== GAME_PROTOCOL) {
        try { ws.send(JSON.stringify({ type: 'ROOM_ERROR', message: 'The game has updated. Reload this page, then join again.' })); ws.close(1008, 'Update required'); } catch {}
        continue;
      }
      if (ws.deserializeAttachment()?.playerId) { try { ws.send(JSON.stringify(msg)); } catch {} }
    }
  }
  broadcast() { this.sendAll({ type: 'ROOM_STATE', serverNow: Date.now(), ...this.engine.snapshot() }); }
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
