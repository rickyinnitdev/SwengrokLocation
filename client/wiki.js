// In-game Wiki. Pure: everything is built from the data the game itself uses (modes, tiers,
// scoring, unlocks, locations), so the pages cannot drift from the rules. Static and offline.
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const POOL_LABEL = { all: 'wiki.pool.all', landmarks: 'wiki.pool.landmarks', countries: 'wiki.pool.countries', asia: 'wiki.pool.asia', cambodia: 'wiki.pool.cambodia' };

export function poolSizes(locations) {
  const sizes = {};
  for (const [pool, list] of Object.entries(locations)) sizes[pool] = list.length;
  sizes.all = (sizes.landmarks || 0) + (sizes.classic || 0);
  return sizes;
}

// Coarse coverage only: positions are rounded to 10 degrees so the map can never reveal an answer.
export function coverage(locations) {
  const cells = new Map();
  for (const key of ['countries', 'asia', 'cambodia']) {
    for (const l of locations[key] || []) {
      const cell = `${Math.round(l.lat / 10) * 10},${Math.round(l.lng / 10) * 10}`;
      cells.set(cell, (cells.get(cell) || 0) + 1);
    }
  }
  const countries = {};
  for (const l of locations.countries || []) if (l.country) countries[l.country] = (countries[l.country] || 0) + 1;
  return { cells: [...cells].map(([k, n]) => ({ lat: +k.split(',')[0], lng: +k.split(',')[1], n })), countries };
}

function coverageSVG(cov) {
  const max = Math.max(1, ...cov.cells.map(c => c.n));
  const dots = cov.cells.map(c => `<circle cx="${(c.lng + 180) / 360 * 360}" cy="${(90 - c.lat) / 180 * 180}" r="${4 + 8 * Math.sqrt(c.n / max)}" class="wiki-dot"><title>${c.n}</title></circle>`).join('');
  return `<svg class="wiki-map" viewBox="0 0 360 180" role="img" aria-label="coverage"><rect width="360" height="180" rx="8" class="wiki-sea"/>${dots}</svg>`;
}

export function wikiSections({ t, lang, modes, tiers, locations, unlocks, locks, scoring, rating }) {
  const km = lang === 'km';
  const sizes = poolSizes(locations);
  const item = (title, body, extra = '') => ({ title, body, extra });
  const flags = cfg => [
    cfg.nmpz && t('wiki.flag.nmpz'), cfg.isSniper && t('wiki.flag.sniper'), cfg.isBounty && t('wiki.flag.bounty'),
    cfg.isStreak && t('wiki.flag.streak'), cfg.isDistrict && t('wiki.flag.district'), cfg.teams && t('wiki.flag.teams'), cfg.royale && t('wiki.flag.royale')
  ].filter(Boolean);

  const modeItems = Object.entries(modes).map(([key, cfg]) => item(
    km && cfg.nameKm ? cfg.nameKm : cfg.name,
    `<p>${esc(km && cfg.descKm ? cfg.descKm : cfg.desc)}</p>
     <ul><li>${esc(t('mode.perRound', { n: cfg.time }))}</li>
     <li>${esc(cfg.royale ? t('wiki.royaleRounds') : t('mode.rounds', { n: cfg.rounds }))}</li>
     <li>${esc(cfg.ranked ? t('wiki.rankedMode') : t('wiki.partyOnly'))}</li>
     <li>${esc(t('wiki.pool'))}: ${esc(t(POOL_LABEL[cfg.pool] || 'wiki.pool.all'))} (${sizes[cfg.pool || 'all'] ?? sizes.all})</li>
     ${flags(cfg).map(f => `<li>${esc(f)}</li>`).join('')}</ul>`, `data-mode="${esc(key)}"`));

  const tierItems = tiers.map((tier, i) => item(
    km ? tier.km : tier.en,
    `<p>${tier.min === -Infinity ? esc(t('wiki.tierStart', { n: rating.START_RATING })) : esc(t('wiki.tierMin', { n: tier.min }))}</p>`, `data-tier="${esc(tier.id)}"`));
  tierItems.push(item(t('wiki.ratingHow'), `<p>${esc(t('wiki.ratingBody', { start: rating.START_RATING, mid: 1250, k1: rating.kFactor(0), k2: rating.kFactor(30), min: rating.MIN_RATING }))}</p><p>${esc(t('wiki.regionSplit'))}</p>`));

  const sample = [0, 25, 100, 500, 2000, 50000, 500000];
  const scoreRows = (label, cfg) => `<tr><th>${esc(label)}</th>${sample.map(d => `<td>${scoring.distanceScore(cfg, d)}</td>`).join('')}</tr>`;
  const scoreItems = [
    item(t('wiki.scoreDistance'), `<p>${esc(t('wiki.scoreDistanceBody'))}</p>
      <div class="wiki-table-wrap"><table class="wiki-table"><thead><tr><th>m</th>${sample.map(d => `<th>${d}</th>`).join('')}</tr></thead><tbody>
      ${scoreRows(t('wiki.pool.all'), {})}${scoreRows(t('wiki.pool.cambodia'), { pool: 'cambodia' })}${scoreRows(t('wiki.pool.asia'), { pool: 'asia' })}${scoreRows(t('wiki.pool.countries'), { pool: 'countries' })}
      </tbody></table></div>`),
    item(t('wiki.scoreSpeed'), `<p>${esc(t('wiki.scoreSpeedBody', { max: scoring.scoreRound('classic', { time: 60 }, 0, 0).speedBonus, sprint: scoring.scoreRound('sprint', { time: 60 }, 0, 0).speedBonus }))}</p>`),
    item(t('wiki.scoreBounty'), `<p>${esc(t('wiki.scoreBountyBody', { n: scoring.scoreRound('bounty', { time: 60, isBounty: true }, 0, 60).bountyBonus }))}</p>`),
    item(t('wiki.scoreMax'), `<p>${esc(t('wiki.scoreMaxBody', { n: scoring.maxRoundScore('classic', { time: 60 }) }))}</p>`)
  ];

  const partyItems = ['royale', 'tagteam', 'spectator', 'rankedParty'].map(k => item(t(`wiki.party.${k}.title`), `<p>${esc(t(`wiki.party.${k}.body`))}</p>`));

  const unlockItems = Object.entries(unlocks).map(([key, label]) => {
    const items = Object.entries(locks).flatMap(([slot, map]) => Object.entries(map).filter(([, need]) => need === key).map(([value]) => `${slot}: ${value}`));
    return item(km ? label.km : label.en, `<p>${esc(t('wiki.unlockBody'))}</p><ul>${items.map(i => `<li>${esc(i)}</li>`).join('')}</ul>`, `data-unlock="${esc(key)}"`);
  });

  const cov = coverage(locations);
  const countryList = Object.entries(cov.countries).sort((a, b) => b[1] - a[1]).map(([c, n]) => `${esc(c)} ${n}`).join(' · ');
  const locItems = [
    item(t('wiki.locCounts'), `<ul>${Object.entries(sizes).map(([pool, n]) => `<li>${esc(t(POOL_LABEL[pool] || 'wiki.pool.all'))}: ${n}</li>`).join('')}</ul>`),
    item(t('wiki.locCoverage'), `${coverageSVG(cov)}<p class="wiki-small">${esc(t('wiki.locCoverageNote'))}</p><p class="wiki-small">${countryList}</p>`)
  ];

  const boardItems = [item(t('wiki.boardReset'), `<p>${esc(t('wiki.boardResetBody'))}</p>`), item(t('wiki.boardBackup'), `<p>${esc(t('wiki.boardBackupBody'))}</p>`)];

  return [
    { id: 'modes', title: t('wiki.sec.modes'), items: modeItems },
    { id: 'ranks', title: t('wiki.sec.ranks'), items: tierItems },
    { id: 'scoring', title: t('wiki.sec.scoring'), items: scoreItems },
    { id: 'party', title: t('wiki.sec.party'), items: partyItems },
    { id: 'unlocks', title: t('wiki.sec.unlocks'), items: unlockItems },
    { id: 'locations', title: t('wiki.sec.locations'), items: locItems },
    { id: 'boards', title: t('wiki.sec.boards'), items: boardItems }
  ];
}

export function renderWiki(ctx) {
  return wikiSections(ctx).map(sec => `
    <section class="wiki-section" id="wiki-${sec.id}" data-wiki-section>
      <h2>${esc(sec.title)}</h2>
      ${sec.items.map(i => `<article class="wiki-item" ${i.extra}><h3>${esc(i.title)}</h3>${i.body}</article>`).join('')}
    </section>`).join('');
}

// Search hides non-matching articles and sections.
export function filterWiki(root, query) {
  const q = query.trim().toLowerCase();
  let shown = 0;
  for (const sec of root.querySelectorAll('[data-wiki-section]')) {
    let any = false;
    for (const art of sec.querySelectorAll('.wiki-item')) {
      const hit = !q || art.textContent.toLowerCase().includes(q) || sec.querySelector('h2').textContent.toLowerCase().includes(q);
      art.hidden = !hit; any ||= hit; if (hit) shown++;
    }
    sec.hidden = !any;
  }
  return shown;
}
