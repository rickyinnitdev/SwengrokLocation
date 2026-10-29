# WanderPenh / SwengrokLocation

Phnom Penh guessing game with solo, AI battle and server-backed private party rooms. The website and multiplayer server run together in one Cloudflare Worker. No PeerJS, TURN service, API key or third-party room service is required.

## Deploy from the private GitHub repository

1. In Cloudflare, open **Compute → Workers & Pages → Create application** and choose **Connect a repository / Import a repository**. Create a **Worker**, not a static Pages upload.
2. Connect GitHub and allow access to **only rickyinnitdev/SwengrokLocation**. If Cloudflare requests GitHub authorization, the account owner must approve it.
3. Select the repository, production branch **main**, and Worker name **wanderpenh** (must match name in wrangler.jsonc).
4. Set the root directory to the repository root, build command to **npm run build**, and deploy command to **npx wrangler deploy**. Dependency installation uses the committed package-lock.json. Use Node.js 22 or newer.
5. Deploy. Wrangler creates the ROOMS binding and SQLite-backed Durable Object using the migration in wrangler.jsonc. No account ID or secrets belong in the repository.
6. Open the resulting **workers.dev** URL. Share that same URL with friends. /api/health should return service wanderpenh-rooms, version 3.

Cloudflare's Git integration deploys subsequent pushes to main. The GitHub Actions workflow separately runs server checks and browser regression tests; it does not gate Cloudflare's build unless you configure that policy. Leave non-production branch deployments disabled until the initial Durable Object migration has deployed. A static ZIP upload alone cannot run these rooms.

The configuration uses Workers and SQLite Durable Objects supported on the Free plan, subject to Cloudflare's limits. Do not enable paid services merely to deploy this project.

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

## Party rules

- Everyone can edit their character, name and title in the lobby; saved changes appear live for friends.
- The host picks the mode in the creation dialog or lobby. Everyone sees the server-confirmed mode.
- A single Durable Object owns each room: roster, host, shared randomized location plan, timers, accepted guesses, scores and round readiness.
- The Start button enables after at least two players are connected. New players wait until the current match finishes before joining.
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

