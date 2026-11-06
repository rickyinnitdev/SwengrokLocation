# WanderPenh Overhaul Plan

This plan is written for an AI coding agent to carry out. Work through the phases **in order**. Each phase should ship as its own commit or PR, and **`npm run check` must pass** before you move to the next one. Read `README.md` first. It covers the architecture, deploy flow and rules for generated files.

## 0. Context (current state, verified 2026-11-07)

- **Single-page client:** `index.html` (~4,600 lines) holds all CSS, markup and JS. Inside it, `MODE_CONFIG` and `LOCATIONS_DB` are the **single source of truth**. `scripts/build.mjs` extracts them with a regex (`const MODE_CONFIG = ...;`) into `.generated/game-data.js` for the server. If you move or rename these constants, update `build.mjs` too.
- **Server:** this is a Cloudflare Worker (`src/worker.js`). Each party room is one SQLite-backed Durable Object (`PartyRoom`), with its logic in `src/room-engine.js`. The engine scores guesses on the server. Routes are `/api/health` and `/api/rooms/WP-XXXXX`.
- **Deck rotation:** `src/location-rotation.js` handles it and is shared by the client and server.
- **13 existing modes, all shown in one flat list:** `landmarks, classic, sprint, bounty, nmpz, district, sniper, streak, cambodia` (Cambodia) and `world, country, asia` (international). They render as one grid in `renderModeCards()`.
- **Solo and "4P AI Battle"** are scored only on the client. Only party rooms use the server.
- **Panoramas:** a Google Street View embed iframe (`maps.google.com/maps?layer=c&...&output=svembed`). There is no API key.
- **Maps:** Leaflet, bundled locally.
- **Profile and history:** stored in `localStorage` (`wanderpenh_profile`, history/rotation keys).
- **Hosting:** Cloudflare Workers Free plan. Everything here must stay free-plan compatible (Workers, Durable Objects, D1, KV).

## Goals (from the owner)

1. **Separate the "In Cambodia" and "Around the World" experiences** so local Cambodian players get a simpler, focused path.
2. **Overhaul the UI** so it's friendlier and modes are easier to find and start. It **must not look like GeoGuessr.**
3. **Add exactly one new party mode: Tag-Team / Relay.** The owner turned down the other proposed modes (Daily, Survival, Hot & Cold, Sabotage, Imposter, Betting, Blind Guide, Puzzle Pieces, etc.), so **do not add them**.
4. **Leaderboard and ranks** hosted on Cloudflare.
5. **Khmer + English language toggle.** Cambodia mode defaults to Khmer.

Non-goals: user accounts/login, paid Cloudflare features, new modes beyond Tag-Team, and replacing Street View.

---

## Phase 1: Restructure the client (no visible change)

The goal is to make the next phases manageable. Don't change any behavior in this phase.

1. Split `index.html` into these files:
   - `client/styles.css`
   - `client/i18n.js`: translation tables (filled in Phase 3)
   - `client/data/modes.js`: `MODE_CONFIG`
   - `client/data/locations.js`: `LOCATIONS_DB`
   - `client/app.js` and smaller modules if useful (`map.js`, `panorama.js`, `party.js`, `solo.js`, `avatar.js`)
   - Leave `index.html` as markup only, plus `<script>`/`<link>` tags.
2. Update `scripts/build.mjs`:
   - Read `MODE_CONFIG`/`LOCATIONS_DB` from the new files. The best option is to make them real ES modules and `import()` them in the build script instead of using the regex+vm hack.
   - Copy or concatenate the client files into `dist/`. Plain ES modules (`<script type="module">`) are fine. Don't add a bundler unless it's truly needed.
   - Keep the extra-locations injection and the coordinate validation.
3. Add a `region` field to every mode in `MODE_CONFIG`: `"kh"` or `"world"`.
   - `kh`: landmarks, classic, sprint, bounty, nmpz, district, sniper, streak, cambodia
   - `world`: world, country, asia

**Done when:** `npm run check` and `npm run test:e2e` pass unchanged, and the game behaves the same.

---

## Phase 2: Split Cambodia and World

1. **Entry screen:** the first screen a new visitor sees is a choice between two large "doors":
   - 🇰🇭 **ក្នុងស្រុក / In Cambodia**: Phnom Penh streets, landmarks, districts, Angkor and beyond.
   - 🌍 **ជុំវិញពិភពលោក / Around the World**: world, country flags, Asia.
   - Save the choice in `localStorage` (`wanderpenh_region`). Returning players land straight in their last region. A region switch is always visible in the header.
2. Each region shows **only its own modes** (filter `MODE_CONFIG` by `region`).
3. **Simplify the Cambodia region for casual locals:**
   - Put a single big **"Play now" (លេងឥឡូវ)** button at the top. It starts `classic` solo with default settings and no mode picking.
   - Under it, show at most 3 featured modes: Landmarks, Khan Detective (district), Angkor & Beyond. The rest go in an "More modes" expandable section.
   - Use Khmer place names alongside English in results ("You were at Wat Phnom / វត្តភ្នំ"). Add a `nameKm` field where available. It's optional, so fall back to `name`.
   - Show distances in metres under 1 km. Add a friendly scale ("same block", "same khan", "wrong side of the river").
4. **World region:** can keep the current mode set as it is.
5. **Party rooms:** the room creation dialog and the lobby mode picker show only the current region's modes, with a small toggle to switch region. The server needs no change, because modes are still validated by key.

**Done when:** a first-time visitor can start a Cambodia game in **two taps or fewer** (door → Play now). Add a Playwright test for this. Update existing e2e tests for the new navigation.

---

## Phase 3: UI overhaul and bilingual support

### Visual identity (must clearly differ from GeoGuessr)
GeoGuessr's look is a dark navy/purple UI, yellow/green accents, a full-screen panorama with a small hover-to-expand minimap in the bottom-right corner, and a "Guess" button under it. **Avoid that combination.** Use this direction instead:

- **Palette:** use Khmer-inspired tokens on `:root`: temple gold `#E0A526`, lotus pink `#E4578A`, Mekong blue `#1F7FB8`, rice-field green `#4CAF6A`, and a warm off-white background `#FFF8EE`. Add a matching dark theme (`prefers-color-scheme` plus a manual toggle).
- **Shapes:** rounded "ticket/card" shapes, plus tuk-tuk/moto and lotus motifs as small illustrations and icons. Use playful, chunky buttons.
- **Fonts:** keep `Kantumruy Pro` for Khmer and `Plus Jakarta Sans` for Latin.
- **Layout on mobile (primary target):** put the panorama on top and the map in a **bottom sheet** that the player drags up (peek → half → full). Don't use a corner minimap. The guess button belongs to the sheet.
- **Layout on desktop:** a side-by-side split (panorama 65% / map 35%) with a resizable divider.
- **Results screen:** an animated tuk-tuk drives along the line from the guess to the answer. Show the score count-up, distance in friendly words, and a "Next" button within thumb reach.

### Findability
- **Home:** region doors (Phase 2), then within a region show **Play now**, **Party** (create/join), and **Ranked**, then featured modes, then "More modes".
- **Mode cards:** each card has an icon, a one-line description, chips for time, rounds and difficulty (★☆☆), and **one** Play button. Solo vs. party is picked at the top of the page, not per card.
- **Join a party:** a large "Enter room code" field on home. Also support `?room=WP-XXXXX` deep links and a share button (Web Share API, then copy-link fallback). Put a Telegram share link first, because it's popular in Cambodia.
- **First-time help:** a 3-step coach-mark overlay (look around → open map → drop pin). Show it once and store the dismissal in `localStorage`.

### i18n
- `client/i18n.js` exports `{ en: {...}, km: {...} }` and a `t(key)` helper. Mark static text with `data-i18n="key"`. Dynamic strings go through `t()`.
- Default language is `km` when the region is `kh`, otherwise `en`. A header toggle (ខ្មែរ / EN) is saved in `localStorage` (`wanderpenh_lang`).
- Translate all UI chrome, mode names/descriptions (`nameKm`, `descKm` in `MODE_CONFIG`) and result phrases. Location names fall back to English.
- Have a native speaker review the Khmer strings later. Mark uncertain ones with `// TODO(km-review)`.

### Accessibility and performance
- Tap targets ≥ 44px and visible focus styles.
- The page must work at 360px width with no horizontal scroll.
- Respect `prefers-reduced-motion` (no tuk-tuk animation).
- Lazy-load Leaflet only when the map first opens. Many local players are on mobile data.

**Done when:** e2e tests pass. Add tests for the language toggle and bottom sheet open/guess. Manually check at 360px, 768px and 1440px.

---

## Phase 4: Tag-Team / Relay party mode (the only new mode)

### Rules
- Players are split into **teams of 2**. Each round, one teammate is the **Viewer** and the other is the **Pinner**:
  - The **Viewer** sees the panorama (can move/pan) but has **no map** and cannot guess.
  - The **Pinner** sees **only the map**, with no panorama, and places the team's single guess.
  - They talk (in person or on a voice call) to work it out.
- Roles swap every round. Use 6 rounds by default so each player gets 3 turns in each role. Use the normal party timer (60s).
- **Team score** = the Pinner's guess score (same formula as classic: distance score + speed bonus). Both teammates get it.
- **Team assignment:** auto-pair in the lobby, and let the host drag players to re-pair them. If the player count is odd, one team has 3 players: 2 Viewers and 1 Pinner, with the Pinner role rotating among the three.
- **With exactly 2 players** (one team), it plays as co-op. The final screen compares the score with the team's personal best and the global Tag-Team leaderboard.
- Region: available in **both** regions. Add `tagteam_kh` with the `classic` pool and `tagteam_world` with the `world` pool, or a single mode that uses the room's region pool. Pick whichever is simpler in the engine.

### Server changes (`src/room-engine.js`, `src/worker.js`)
- Add a `teams` mode flag in `MODE_CONFIG`: `{ teams: true, rounds: 6, time: 60, region: ... }`.
- Add room state `teams: [{ id, playerIds: [a, b] }]`. Add a host message `setTeams`, which is validated: each connected player is in exactly one team of 2–3.
- `startMatch` requires valid teams for team modes (auto-pair if unset).
- Assign roles per round: `roles[round] = { [playerId]: 'viewer' | 'pinner' }`.
- `guess`: accept it **only from that round's Pinner**. Save the result under the team, and mirror it to every member so the existing per-player scoreboard still works.
- **Anti-cheat (important):** the server's state snapshot currently sends `match` (including the location coordinates) to everyone. For team modes, **redact per player**: Pinners must not receive the current round's `lat/lng`/panorama info until the reveal phase. Implement a `viewFor(playerId)` that the Worker uses when it broadcasts, instead of one shared snapshot. Confirm where `src/worker.js` builds and sends the broadcast, and change it to send a separate message to each player.
- Readiness: everyone still presses Ready to advance, as in current modes.

### Client changes
- Lobby: a team panel with colored team badges, plus drag-to-swap for the host.
- In-round:
  - The Viewer gets a full-screen panorama, a large "You're the EYES 👀" banner, and the teammate's name.
  - The Pinner gets a full-screen map, a "You're the HANDS 📍" banner, and a big timer.
- Results: show team cards instead of individual rows, and the final standings by team.

### Tests
- Unit tests (`tests/room.test.mjs`):
  - team validation, odd-player teams, and auto-pairing
  - Viewer guesses are rejected
  - role rotation across rounds
  - per-player redaction: a Pinner's view has no coordinates before reveal
  - team scoring
  - a disconnect mid-match: if a team member drops past the grace period, the remaining member plays both roles (sees the panorama **and** the map)
- e2e: 4 browser contexts → 2 teams → complete a match.

---

## Phase 5: Leaderboard and ranks (Cloudflare D1)

### Identity
- **Anonymous device ID + nickname.** No login.
- On first visit, generate a `playerId` (UUID) and a random `secret`, and keep both in `localStorage`. The server stores `sha256(secret)`. Every score submission sends `{playerId, secret}`.
- Nickname comes from the existing profile name. Filter names server-side (length, characters, basic profanity list in both Khmer and English).
- Tell users in the UI that clearing browser data loses their rank. An optional "Backup code" button shows `playerId:secret` as text or a QR code so they can restore on another device. Keep this simple.

### Storage
- Add a **D1** database `wanderpenh-db` bound as `DB` in `wrangler.jsonc`, with migrations in `migrations/` (run with `wrangler d1 migrations apply`). Update the README deploy steps: create the D1 database once in the dashboard or CLI, then put its `database_id` in `wrangler.jsonc`. A D1 database id is not a secret.
- Schema (draft):
  ```sql
  CREATE TABLE players (id TEXT PRIMARY KEY, secret_hash TEXT NOT NULL, name TEXT NOT NULL,
    rating INTEGER NOT NULL DEFAULT 1000, games INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
  CREATE TABLE runs (id TEXT PRIMARY KEY, player_id TEXT NOT NULL, mode TEXT NOT NULL,
    region TEXT NOT NULL, score INTEGER NOT NULL, rounds INTEGER NOT NULL,
    created_at INTEGER NOT NULL, week TEXT NOT NULL);
  CREATE INDEX runs_mode_week_score ON runs(mode, week, score DESC);
  CREATE INDEX runs_mode_score ON runs(mode, score DESC);
  ```

### Server-verified solo runs ("Ranked")
Solo is currently scored on the client, so it's trivially cheatable. Ranked play must be scored on the server:
- `POST /api/ranked/start {playerId, secret, mode}`: the server draws the locations and stores the run in a **Durable Object** (new class `RankedRun`, or reuse a per-player DO keyed by `playerId`). It returns the run id and round 1 only.
- `POST /api/ranked/guess {runId, round, lat, lng}`: the server scores the guess with the same `distance`/score code as `room-engine.js`. Factor it out into `src/scoring.js` and share it. The server enforces the deadline, then returns the result and the next round.
- On the last round, the server writes to D1 and updates the rating.
- Unranked "Play now" can stay client-side. Only the Ranked button uses this flow.
- Rate limit: max N starts per player per hour. Use the DO or the Workers rate-limit binding, whichever is free-plan compatible.

### Leaderboards
- `GET /api/leaderboard?mode=classic&period=week|all&region=kh`: top 50 entries, plus the caller's own rank if `playerId` is passed. Cache it for 60s with the Cache API.
- Tabs: **This week** (resets Monday 00:00 Asia/Phnom_Penh time) and **All time**, per mode, plus a **Region** filter.
- Party results: at match end, the room DO records each player's final score into `runs` with `mode = party:<mode>`. These entries appear on a separate "Party" board, and the Tag-Team board shows team pairs.

### Ranks
- Each player has a **rating** that updates after every ranked run: `rating += K * (performance - expected)`. Performance is the run score normalized to 0–1 for that mode. Expected is based on the current rating. Use K=32, decreasing after 30 games. Keep the formula in `src/rating.js` with unit tests.
- **Tiers** (Cambodian-themed names, shown with a badge on the profile, lobby and leaderboard):
  | Rating | Tier (EN / KM) |
  |---|---|
  | < 900 | Tourist / ភ្ញៀវទេសចរ |
  | 900–1099 | Moto Rider / អ្នកជិះម៉ូតូ |
  | 1100–1299 | Tuk-Tuk Driver / អ្នកបើកតុកតុក |
  | 1300–1499 | City Guide / មគ្គុទ្ទេសក៍ |
  | 1500–1699 | Khan Master / មេខណ្ឌ |
  | ≥ 1700 | Legend of Penh / វីរបុរសភ្នំពេញ |
- Keep separate ratings for `kh` and `world` (two columns, or a `ratings` table keyed by `(player_id, region)`, which is preferred).

### Tests
- Unit tests: scoring parity between client and server, rating math, leaderboard queries against a local D1 (`wrangler dev` uses local D1), and rejecting a guess that arrives after the deadline or for the wrong round.
- e2e: play one ranked run, then confirm the player appears on the weekly board.

---

## Phase 6: Polish and release

- Update `README.md`: the new deploy steps (D1 creation + migrations), new modes, the ranked flow and i18n.
- Bump the `GAME_PROTOCOL` version so old clients reload.
- Update `/api/health`, then deploy a preview and smoke-test on a real phone over mobile data.
- Keep everything on the free plan. Check D1 read/write volume against free limits (leaderboard caching helps).

## Guardrails for the executing agent
- Don't commit `dist/` or `.generated/`.
- Don't add secrets to the repo.
- Don't add modes the owner rejected (see Goals #3).
- Keep the server authoritative for anything that affects rank or party scores.
- Ask the owner before changing the Street View provider, adding a login, or using any paid Cloudflare feature.
