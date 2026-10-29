// Shared by the server and solo/AI browser play. Each pool has a saved draw deck.
export const GAME_PROTOCOL = 3;
export function rotationRandom(n) {
  const limit = Math.floor(0x100000000 / n) * n;
  let value;
  do { value = crypto.getRandomValues(new Uint32Array(1))[0]; } while (value >= limit);
  return value % n;
}

export function locationSeparation(a, b) {
  return Math.hypot((a.lat - b.lat) * 111000, (a.lng - b.lng) * 108800);
}

export function streetFamily(location) {
  return location.name.toLowerCase().replace(/\([^)]*\)/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

export function drawLocations(pool, count, state, key, excluded = []) {
  state.decks ||= {};
  state.history ||= [];
  const lookup = new Map(pool.map(l => [l.id, l]));
  const forbidden = new Set(excluded);
  const picked = [];
  // Include new coordinates in an existing deck after a deployment without resetting it.
  state.catalogs ||= {};
  if (state.decks[key]) {
    const known = new Set(state.catalogs[key] || pool.map(l => l.id));
    state.decks[key] = [...new Set([...state.decks[key], ...pool.filter(l => !known.has(l.id)).map(l => l.id)])].filter(id => lookup.has(id));
  }
  state.catalogs[key] = pool.map(l => l.id);
  for (let i = 0; i < count; i++) {
    if (!state.decks[key]) {
      const unseen = pool.filter(l => !state.history.includes(l.id)).map(l => l.id);
      state.decks[key] = unseen.length ? unseen : pool.map(l => l.id);
    }
    // Do not wrap a deck simply because the remaining IDs are excluded this match.
    let eligible = state.decks[key].filter(id => !forbidden.has(id));
    if (!eligible.length && state.decks[key].length) break;
    if (!eligible.length) {
      state.decks[key] = pool.map(l => l.id);
      eligible = state.decks[key].filter(id => !forbidden.has(id));
    }
    if (!eligible.length) break;
    const recent = state.history.slice(-14).map(id => lookup.get(id)).filter(Boolean);
    const families = new Set(recent.map(streetFamily));
    let diverse = eligible.filter(id => {
      const candidate = lookup.get(id);
      return !families.has(streetFamily(candidate)) && recent.every(l => locationSeparation(candidate, l) > 600);
    });
    // A nearly exhausted pool cannot satisfy every spacing constraint. Favor its
    // least recently visited streets, then farthest available points, without ID repeats.
    if (!diverse.length) {
      const last = recent.slice(-4);
      const ranked = eligible.map(id => ({ id, gap: last.length ? Math.min(...last.map(l => locationSeparation(lookup.get(id), l))) : Infinity }));
      const best = Math.max(...ranked.map(r => r.gap));
      diverse = ranked.filter(r => r.gap >= Math.min(600, best * 0.85)).map(r => r.id);
    }
    const id = diverse[rotationRandom(diverse.length)];
    state.decks[key] = state.decks[key].filter(value => value !== id);
    state.history = [...state.history.filter(value => value !== id), id].slice(-1500);
    forbidden.add(id);
    picked.push(lookup.get(id));
  }
  return picked;
}
