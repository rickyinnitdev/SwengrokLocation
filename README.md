# WanderPenh / SwengrokLocation

Phnom Penh guessing game with solo, AI battle, server-scored ranked runs with leaderboards, and server-backed private party rooms. The first screen offers two doors: **In Cambodia** (Khmer by default) and **Around the World**. The website and multiplayer server run together in one Cloudflare Worker. No PeerJS, TURN service, API key or third-party room service is required.

## Deploy from the private GitHub repository

1. In Cloudflare, open **Compute → Workers & Pages → Create application** and choose **Connect a repository / Import a repository**. Create a **Worker**, not a static Pages upload.
2. Connect GitHub and allow access to **only rickyinnitdev/SwengrokLocation**. If Cloudflare requests GitHub authorization, the account owner must approve it.
3. Select the repository, production branch **main**, and Worker name **wanderpenh** (must match name in wrangler.jsonc).
4. Set the root directory to the repository root, build command to **npm run build**, and deploy command to **npx wrangler deploy**. Dependency installation uses the committed package-lock.json. Use Node.js 22 or newer.
5. Deploy. Wrangler creates the ROOMS binding and SQLite-backed Durable Object using the migration in wrangler.jsonc. No account ID or secrets belong in the repository.
6. Open the resulting **workers.dev** URL. Share that same URL with friends. /api/health should return service wanderpenh-rooms, version 4.

Cloudflare's Git integration deploys subsequent pushes to main. The GitHub Actions workflow separately runs server checks and browser regression tests; it does not gate Cloudflare's build unless you configure that policy. Leave non-production branch deployments disabled until the initial Durable Object migration has deployed. A static ZIP upload alone cannot run these rooms.

The configuration uses Workers, SQLite Durable Objects and one D1 database, all supported on the Free plan, subject to Cloudflare's limits. Do not enable paid services merely to deploy this project.

### Leaderboard database (D1)

wrangler.jsonc binds a D1 database named **wanderpenh-db** as `DB` without a `database_id`, so Wrangler creates it on the first deploy. The Worker creates its own tables the first time they are needed (src/schema.js); there is no manual migration step. If your Cloudflare build refuses to auto-create it, create it once with `npx wrangler d1 create wanderpenh-db`, then add the returned `database_id` to the binding. A D1 id is not a secret. Without a database the game still works: the Ranked screen shows that the leaderboard is unavailable and party rooms play normally.

## Local development

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:4173. Wrangler emulates the Worker, assets and Durable Objects locally. Opening index.html as a file or using a plain static file server does not provide room APIs. Always use npm run dev for development.

```sh
npm run check
npx playwright install chromium
npm run test:e2e
```

Browser tests use installed Chrome locally; CI uses Playwright Chromium. To deploy from the terminal instead of Git integration, the account owner can run npx wrangler login, then npm run deploy.

## Ranked, ratings and leaderboards

- **Identity:** no accounts. Each browser makes a random player id and a secret, kept in localStorage; the server stores only a hash of the secret. Clearing site data loses the rank, so **Ranked → Backup and restore** shows a code that moves it to another device. Anyone holding the code can play as that player.
- **Ranked runs:** a ranked run is started, timed and scored by the server (`src/ranked.js`, one Durable Object per device, using the same formulas as party rooms in `src/scoring.js`). Each round's clock starts when the player asks for it, guesses after the deadline count as zero, skipping is disabled and at most 30 runs can be started per hour. Ranked modes are the ones flagged `ranked: true` in `client/data/modes.js`. The location table ships to the browser, so the server stops forged *scores*, not someone looking up answers.
- **Ratings and tiers:** each finished ranked run moves a rating (kept separately for Cambodia and World; `src/rating.js`). Tiers: Tourist, Moto Rider (900), Tuk-Tuk Driver (1100), City Guide (1300), Khan Master (1500), Legend of Penh (1700).
- **Boards:** `GET /api/leaderboard?mode=classic&period=week|all&region=kh` (best score per player) and `?type=rating&region=kh`. Weeks reset on Monday 00:00 Phnom Penh time. Responses are cached for a minute and the affected boards are cleared when a run is saved.
- **Party results:** a finished party records each player's total under `party:<mode>` when that player's browser sent its device identity. Party games never change ratings.

## Tag-Team relay

Teams of two (one team may have three). Each round one teammate is the **Viewer** and sees only the street, and the other is the **Pinner** and sees only the map; roles swap every round and the Pinner's guess scores for the whole team. The server never sends the Pinner the current location before the reveal, and never sends anyone a future round's location. If a partner disconnects, the remaining player sees both. Available in the party picker of both regions.

## Battle Royale ("Tuk-Tuk Royale" / "World Royale")

Party-only, best with 4 to 8 players. Everyone starts with lives (host sets 1 to 5, default 3). Each round the farthest guess loses a life (the two farthest with 6+ alive; a missing guess counts as farthest; ties at the bottom all lose one; if everyone would lose, nobody does). A guess within 100 m (25 km in the world) earns one shield that blocks the next hit. The round timer starts at 60 s (host can change it) and drops 5 s per round to a 20 s floor. From round 4 a glowing zone shrinks around the answer (6 km, 3 km, 1.5 km, and so on; 3,000 km in the world); the server picks a centre that always contains the answer but is never on it. With two players left it is a **final duel** (no quick-jump chips). Eliminated players become **ghosts**: they see the answer 5 s into each round and the living players' pins as they lock in, and may drop one anonymous ghost pin per round (the host can switch heckling off). The match ends when one player is left, or after 30 rounds on lives and then total distance. Placement points go to the party leaderboard as `party:royale`: 1st 100, 2nd 70, 3rd 50, then 10 less per place, minimum 5. The server never sends living players the answer or anyone else's pin before the round is decided.

## Spectators

Joining mid-match (or while results are showing) is allowed: the newcomer watches and joins the next lobby. Up to 8 spectators per room, separate from the 8 players. Spectators cannot guess, ready up, change settings or become host. By default they get no answer and no distances until the round is revealed; a locked pin (its position only) can be shown for the player they follow. The host's "Spectators see the answer early" switch turns that off for streams. When the host starts a rematch, spectators become players in join order while seats remain.

## Party rules

- Everyone can edit their character, name and title in the lobby; saved changes appear live for friends.
- The host picks the mode in the creation dialog or lobby. Everyone sees the server-confirmed mode.
- A single Durable Object owns each room: roster, host, shared randomized location plan, timers, accepted guesses, scores and round readiness.
- The Start button enables after at least two players are connected. Someone who opens the room link mid-match joins as a **spectator** (see below).
- Every match draws five distinct spots, with random headings. Saved shuffled draw decks use every location in the selected pool before repeating. Nearby points and recently used street names are avoided where the remaining pool allows; history follows players into new rooms. Landmark mode uses the 42 landmark coordinates; other modes use all 392.
- After guessing, press Ready for next round. Everyone advances together after all remaining players are ready.
- Refreshing/reconnecting in the same browser tab resumes the session using a token in session storage. Tokens are never included in shared rosters. A disconnected player's place is saved for 30 seconds, then removed; if the host leaves, another player becomes host.
- The server computes scores and deadlines, ignores duplicate/stale guesses, and automatically records zero for missing guesses when time expires.
- Sprint doubles the speed bonus in parties. Bounty gives a 500-point bonus below 200m and shortens the remaining clock to 15 seconds after the first valid guess. No-Move disables panorama interaction.
- The host can replace a broken panorama before any player submits a guess. Replacements are shared and limited to five per match.
- The host returns everyone to the lobby after the final standings for a rematch. Rooms expire after two hours without gameplay activity.

## Locations and assets

The original 110 locations plus 282 additional OSM-derived named road coordinates are within Phnom Penh. See [data/SOURCES.md](data/SOURCES.md) for provenance, licensing and panorama limitations. Extra coordinates are bundled at build time; they do not add a live map API dependency.

index.html and avatar_generator.js are editable sources. scripts/build.mjs builds dist/, bundles Leaflet locally and generates the server's matching mode/location data. Do not edit generated files or commit them. Original local versions and legacy Netlify downloads remain ignored in this checkout.

## Validation scope

Server unit tests cover missing/full rooms, host permissions, unique plans, score calculation, stale/duplicate messages, automatic timeouts, resuming persisted identity, host transfer, shared skips and mode rules. Browser tests run independent browser contexts against the actual local Cloudflare runtime for roster/mode synchronization, refresh recovery, accepted guesses, complete matches, rematches and room isolation. Google panoramas are stubbed in browser tests; actual coverage needs visual checks on the deployed site. Cross-network production connectivity requires the Cloudflare deployment to be live.

