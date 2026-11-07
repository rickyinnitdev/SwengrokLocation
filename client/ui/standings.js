// One shared standings component for the AI battle, party round results and final standings.
// It returns HTML strings and touches no globals: the caller passes `deps` for escaping,
// avatars, translations and distance formatting. The sort helpers are pure and unit tested.
//
// Row shape (built by the caller from server data, never recomputed here):
//   { id, name, isMe, avatar, aura, guess: { dist, elapsed, score, distScore, speedBonus, bountyBonus } | null,
//     total, hearts?, shield?, lostLife?, shieldBlocked?, alive?, eliminatedRound?, roundScores? }

const NO_GUESS = Number.POSITIVE_INFINITY;
const num = (v, fallback) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

// This round: points desc, then smaller distance, then faster. "No guess" rows go last.
export function sortByRoundPoints(rows) {
  return [...rows].sort((a, b) => {
    const ga = a.guess, gb = b.guess;
    const ha = !!ga && ga.dist !== null, hb = !!gb && gb.dist !== null;
    if (ha !== hb) return ha ? -1 : 1;
    if (!ha) return 0; // two no-guess rows keep their incoming order
    return (num(gb?.score, 0) - num(ga?.score, 0))
      || (num(ga?.dist, NO_GUESS) - num(gb?.dist, NO_GUESS))
      || (num(ga?.elapsed, NO_GUESS) - num(gb?.elapsed, NO_GUESS));
  });
}
// Battle Royale decides rounds by distance, so its round tab sorts by it.
export function sortByDistance(rows) {
  return [...rows].sort((a, b) => num(a.guess?.dist, NO_GUESS) - num(b.guess?.dist, NO_GUESS) || num(a.guess?.elapsed, NO_GUESS) - num(b.guess?.elapsed, NO_GUESS));
}
// Overall: total desc. Ties keep the incoming (join) order.
export function sortByTotal(rows) {
  return rows.map((r, i) => [r, i]).sort((a, b) => (b[0].total - a[0].total) || (a[1] - b[1])).map(([r]) => r);
}
// Royale overall: still alive first, then lives, then later elimination.
export function sortByLives(rows) {
  return rows.map((r, i) => [r, i]).sort(([a, ai], [b, bi]) =>
    (Number(!!b.alive) - Number(!!a.alive)) || (num(b.hearts, 0) - num(a.hearts, 0))
    || (num(b.eliminatedRound, 1e9) - num(a.eliminatedRound, 1e9)) || (ai - bi)).map(([r]) => r);
}
// previousOrder: ids ordered as they stood before this round (null on round 1).
export function positionChange(id, newIndex, previousOrder) {
  if (!previousOrder) return 0;
  const was = previousOrder.indexOf(id);
  return was < 0 ? 0 : was - newIndex;
}
export function previousOrderFrom(rows) {
  return sortByTotal(rows.map(r => ({ ...r, total: r.total - num(r.guess?.score, 0) }))).map(r => r.id);
}

const MEDAL = ['🥇', '🥈', '🥉'];

function breakdown(g, d) {
  if (!g) return d.t('result.stillGuessing');
  if (g.dist === null) return d.t('result.noGuess');
  const parts = [d.fmtDist(g.dist)];
  if (typeof g.elapsed === 'number') parts.push(`${g.elapsed.toFixed(1)}s`);
  if (g.speedBonus) parts.push(`+${g.speedBonus.toLocaleString()} ${d.t('standings.speed')}`);
  if (g.bountyBonus) parts.push(`+${g.bountyBonus.toLocaleString()} ${d.t('standings.bounty')}`);
  return parts.join(' · ');
}
function face(r, d, cls = '') {
  return `<span class="st-face ${cls}" style="--aura:${d.esc(r.aura || 'var(--line)')}">${d.avatar(r)}</span>`;
}
function youTag(r, d) { return r.isMe ? `<span class="st-you">${d.t('party.you')}</span>` : ''; }
function arrow(change) {
  if (change > 0) return `<span class="st-move up" aria-label="up ${change}">▲${change}</span>`;
  if (change < 0) return `<span class="st-move down" aria-label="down ${-change}">▼${-change}</span>`;
  return '<span class="st-move same">–</span>';
}
function royaleBadge(r, d) {
  if (r.shieldBlocked) return `<span class="st-hit shield" title="${d.t('royale.shieldBlocked')}">🛡️</span>`;
  if (r.lostLife) return `<span class="st-hit broke">💔 −1</span>`;
  return '';
}
function hearts(r) {
  if (!r.alive && r.alive !== undefined) return '👻';
  return '❤️'.repeat(Math.max(0, r.hearts || 0)) + (r.shield ? '🛡️' : '');
}

function podium(top, d, royale) {
  // Visual order 2nd, 1st, 3rd so the winner stands in the middle.
  const order = [1, 0, 2].filter(i => top[i]);
  return `<div class="st-podium">${order.map(i => {
    const r = top[i];
    const main = royale ? royaleBadge(r, d) || (r.guess && r.guess.dist !== null ? d.fmtDist(r.guess.dist) : '—')
      : (r.guess && r.guess.dist !== null ? `+${num(r.guess.score, 0).toLocaleString()}` : '0');
    return `<div class="st-step place-${i + 1} ${r.isMe ? 'is-me' : ''}" style="--i:${i}">
      ${face(r, d, 'big')}<div class="st-step-name">${d.esc(r.name)}${youTag(r, d)}</div>
      <div class="st-step-pts">${main}</div><div class="st-step-block">${MEDAL[i]}</div></div>`;
  }).join('')}</div>`;
}

function row(r, rank, d, { tab, royale, change }) {
  const g = r.guess;
  const noGuess = !g || g.dist === null;
  let main, sub;
  if (tab === 'round') {
    main = royale ? (royaleBadge(r, d) || (noGuess ? '' : d.fmtDist(g.dist))) : (noGuess ? '0' : `+${num(g.score, 0).toLocaleString()}`);
    sub = breakdown(g, d);
  } else {
    main = royale ? hearts(r) : num(r.total, 0).toLocaleString();
    sub = royale ? (r.alive === false ? d.t('royale.outRound', { n: r.eliminatedRound ?? '?' }) : '') : '';
  }
  return `<div class="st-row ${r.isMe ? 'is-me' : ''} ${noGuess && tab === 'round' ? 'no-guess' : ''}" style="--i:${rank}" data-player="${d.esc(r.id)}">
    <span class="st-rank">${tab === 'round' && noGuess ? '–' : (MEDAL[rank] || rank + 1)}</span>
    ${face(r, d)}
    <div class="st-who"><div class="st-name">${d.esc(r.name)}${youTag(r, d)}</div><div class="st-sub">${sub}</div></div>
    <div class="st-main">${main}${tab === 'overall' ? arrow(change) : ''}</div></div>`;
}

export function renderStandings({ rows, tab = 'round', royale = false, previousOrder = null, deps }) {
  const d = deps;
  let sorted;
  if (tab === 'round') sorted = royale ? sortByDistance(rows) : sortByRoundPoints(rows);
  else sorted = royale ? sortByLives(rows) : sortByTotal(rows);
  const showPodium = tab === 'round' && sorted.length >= 3 && sorted.slice(0, 3).every(r => r.guess && r.guess.dist !== null);
  const rest = showPodium ? sorted.slice(3) : sorted;
  const offset = showPodium ? 3 : 0;
  const rowsHtml = rest.map((r, i) => row(r, i + offset, d, {
    tab, royale, change: positionChange(r.id, i + offset, previousOrder)
  })).join('');
  return `${showPodium ? podium(sorted.slice(0, 3), d, royale) : ''}<div class="st-list">${rowsHtml}</div>`;
}

// Final screen: totals with a small bar per round (a sparkline of each player's round scores).
export function renderFinal({ rows, royale = false, ordered = false, deps }) {
  const d = deps;
  // `ordered`: the server already decided the places (Royale placements), keep its order.
  const sorted = ordered ? rows : royale ? sortByLives(rows) : sortByTotal(rows);
  const max = Math.max(1, ...sorted.flatMap(r => r.roundScores || [0]));
  return `<div class="st-list final">${sorted.map((r, i) => `
    <div class="st-row ${r.isMe ? 'is-me' : ''} ${i === 0 ? 'winner' : ''}" style="--i:${i}">
      <span class="st-rank">${MEDAL[i] || i + 1}</span>${face(r, d)}
      <div class="st-who"><div class="st-name">${d.esc(r.name)}${youTag(r, d)}${i === 0 && royale ? ' 👑' : ''}</div>
        ${r.note ? `<div class="st-sub">${d.esc(r.note)}</div>` : ''}
        <div class="st-bars" aria-hidden="true">${(r.roundScores || []).map(v => `<i style="height:${Math.max(6, Math.round(v / max * 100))}%"></i>`).join('')}</div></div>
      <div class="st-main">${royale ? (r.points !== undefined ? '+' + r.points : hearts(r)) : num(r.total, 0).toLocaleString() + ' ' + d.t('final.points')}</div></div>`).join('')}</div>`;
}
