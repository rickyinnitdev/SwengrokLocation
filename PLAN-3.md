# WanderPenh Plan 3: Multiplayer Stability, Ranked Parties, No-Thailand Rule, Wiki

This plan is for an AI coding agent. It follows `PLAN.md` and `PLAN-2.md` and uses the same conventions:
- Find code by **symbol name** (`RoomEngine`, `PartyRoom`, `initRoomConnection`, `applyRoomState`), not by line number.
- Use `t()` / `data-i18n` for every new string, in Khmer and English.
- Scoring stays server-authoritative. Use only the Cloudflare Free plan.
- `npm run check` must pass after each phase. Add a unit test (`tests/*.test.mjs`) for every server bug fix, and an e2e test (`tests/*.spec.js`) where the bug can be seen in the UI.
- Bump `GAME_PROTOCOL` (`src/location-rotation.js`) whenever the room message format changes.

Order: **Phase 1 (bugs and lag) → Phase 2 (No-Thailand rule) → Phase 3 (Ranked parties) → Phase 4 (Wiki)**. Phase 3 depends on the anti-cheat fixes in Phase 1.

---

## Phase 1: Multiplayer bugs, connection drops and lag

These were found by reading `src/worker.js`, `src/room-engine.js` and the room code in `client/app.js`. All 61 current unit tests pass, so none of these bugs has a test yet. Write a failing test first for each one.

### 1A. Connection drops ("connecting issue")
| # | Bug | Where | Fix |
|---|-----|-------|-----|
| C1 | **Dead connections are noticed after the player's seat is gone.** The client pings every 15 s and only treats the socket as dead after 40 s of silence, but the server removes a disconnected player after `GRACE_MS` = 30 s. A friend on bad Wi-Fi is removed before their browser even tries to reconnect. | `initRoomConnection` heartbeat, `GRACE_MS` | Ping every 5 s and treat the socket as dead after 12 s. Raise `GRACE_MS` to 60 s during a match (keep 30 s in the lobby). |
| C2 | **Reconnecting gives up too early.** The client makes at most 6 attempts with backoff capped at 4 s (about 15 s in total), then shows "room lost", even though the server still holds the seat. | `socket.onclose` | Keep retrying until the grace period ends (time-based, not count-based). Retry right away on `online` and on `visibilitychange` to visible, since phones kill sockets when the app goes to the background. |
| C3 | **The resume token is in `sessionStorage`.** If a phone browser reloads a discarded tab, or the player opens the invite link again in a new tab, the token is lost. The player then rejoins as a stranger, and as a spectator if a match is running. | `initRoomConnection` (`wanderpenh_room_<code>`) | Keep the token in `localStorage`, keyed by room code, with an expiry. Remove it on `LEAVE` and on a room error. |
| C4 | **If the host drops, the lobby has no working host for 30 s.** Host transfer waits for the grace period, so nobody can press Start. | `RoomEngine.tick` host pick | In the lobby, move host to a connected player as soon as the host disconnects. Give it back if they return within the grace period. |

### 1B. Rounds getting stuck ("delay")
| # | Bug | Where | Fix |
|---|-----|-------|-----|
| S1 | **A disconnected player blocks the next round.** `advance()` waits until every roster player is ready, including one who disconnected and is still in the grace period. At the deadline the server records a missing guess for them, but nobody marks them ready, so everyone waits up to 30 s more. In Royale the same thing happens through `contenders()`. | `advance` | Count only connected players when checking ready. Also auto-advance a few seconds (8 s) after a round is revealed even if someone forgot to press Ready. |
| S2 | **Start silently does nothing.** `START_MATCH` returns without any message if any roster player is disconnected, for example a friend who refreshed. The host clicks Start and nothing happens. | `handle` `START_MATCH` | Start with the connected players, or send a `ROOM_NOTICE` that explains why the match cannot start. Grey out Start in the client and show the reason. |
| S3 | **Royale wins are lost when the last rival quits.** `recordFinished()` runs only in `webSocketMessage`. When a Royale ends from `alarm()` or `webSocketClose()` (because a quitter's grace period ran out), the result is never saved to the leaderboard. | `PartyRoom.alarm`, `webSocketClose` | Call `recordFinished()` in both places. |
| S4 | **Tag-Team roles can change in the middle of a round.** `tick()` recalculates `m.roles` on every message. When a teammate reconnects, the Pinner can change in the middle of the round, so a player who already saw the street becomes the Pinner (or the other way round). | `tick` → `roundRoles` | Set the roles only in `startRound`. Recalculate them in the middle of a round only when the current Pinner is no longer connected. |

### 1C. Lag on every action
| # | Problem | Fix |
|---|---------|-----|
| L1 | Every message, including emotes, profile edits and pings that reach the handler, writes the whole room state to storage (with up to 1,500 history ids and the saved decks) and sends a full personalized snapshot to every socket. | Don't persist or broadcast for `LOBBY_EMOTE`. Store `rotation` under its own storage key and write it only when it changes. Skip the broadcast when the state did not change (compare a version counter). |
| L2 | The server rebuilds `Object.values(locations).flat()` and searches it on every guess and every snapshot. | Build a `Map` from id to location once, when the module loads. |
| L3 | The client sets the clock offset from each `serverNow` without allowing for network delay, so the timer jumps. | Measure the round trip with the ping (`{type:'PING', t}` → `PONG`), keep the lowest-delay sample, and smooth the offset. |
| L4 | Panoramas load only once the round starts (with an 800 ms head start). | Preload the next panorama during the result screen (only for the player's own round, so no future ids leak; see A1). |

### 1D. Cheating and fairness
| # | Bug | Fix |
|---|-----|-----|
| A1 | **In normal party modes (City Pulse, Sprint, Bounty, No-Move, Landmark, World), every player receives the full plan, including the location ids of all future rounds.** Only Tag-Team hides them. Anyone with dev tools can read all 5 answers ahead. | In `snapshot()`, hide future rounds for every mode, as the Tag-Team branch already does. |
| A2 | **Other players' guesses (pin, distance, score) are sent before the round is revealed** in normal modes, so a player who hasn't guessed yet can copy a friend's pin. | Apply the same "locked" hiding that Royale and spectators already use: send only `{locked:true, elapsed}` until `roundRevealed()`. |
| A3 | Ranked runs use `{ history: [] }`, so the same spots repeat run after run. | Keep a per-player rotation in the `RankedPlayer` Durable Object storage. |

### 1E. Verification
- Add a two-browser Playwright test that drops one player's network (`context.setOffline(true)` for 20 s), then confirms they rejoin in the same seat with the same score.
- Add a load test script (`scripts/soak.mjs`) that plays 8 fake WebSocket players through a full match against `wrangler dev` and reports message round-trip times.
- Add a debug overlay, shown with `?debug=1`: ping, clock offset, socket state, and the number of reconnects.

---

## Phase 2: No-Thailand rule

**Rule (owner decision): the game must not contain any Thailand content.** That means no locations, place names, flags, map regions, mode descriptions or translations.

1. Remove Thailand from:
   - `client/data/locations.js`: `w_48`, `w_49`, `w_64` and the `// Thailand` block (`asia_01`–`asia_05`, plus any other entry with `country: "Thailand"`; there are 9 matches in total).
   - `client/app.js`: the flag map entry and the country centre entry for `"Thailand"`.
   - `client/map/areas.js`: the `Thailand` bounding box.
   - `client/data/modes.js`: the World description says "Bangkok, Hanoi, …". Replace Bangkok with another city, and update `descKm` to match.
   - Search `client/i18n.js`, `index.html`, `data/` and `README.md` for `thai|thailand|bangkok|chiang mai|phuket|ayutthaya|pattaya|baht` (case-insensitive) and remove anything you find.
2. Refill the World and Asia pools so their size and difficulty stay the same. Add replacement spots in other countries, keeping `id`s unique and never reusing a removed id.
3. **Enforce the rule:** add `tests/content-rules.test.mjs`. It must fail if any location, mode, area or i18n string matches the pattern above. Add the rule to `README.md` (under "Locations and assets") and to a project `CLAUDE.md`, so future agents follow it.
4. Saved draw decks and the history in localStorage may still hold removed ids. `drawLocations` already filters by `lookup`. Confirm this with a test.

---

## Phase 3: Ranked parties with friends

Goal: friends can play **ranked** together in a party room, and the host picks which ranked mode to play.

1. **Lobby switch:** the host gets a "Ranked match" toggle (`SET_RANKED`). When it is on:
   - The mode picker shows only modes with `ranked: true` for the room's region, and the host can choose any of them (Landmark, City Pulse, Sprint, Bounty, No-Move, World…).
   - Skipping the location (`SKIP_LOCATION`) is turned off, spectators never see the answer early, and Royale and Tag-Team are hidden.
   - Every player needs a linked device identity (`linkIdentity`). Players without one are shown "Unranked" and cannot ready up until they open the Ranked screen once.
2. **Scoring:** the room's `guess()` is already server-side and uses `scoreRound`. When the match ends in a ranked room, `recordFinished()` calls `recordRun(..., ranked: true, performance)` for each player. This moves their rating exactly as a solo run does, and records the score under the real mode's board (not `party:`).
3. **Abuse limits:** a ranked party needs at least 2 connected players. A ranked party counts toward the same 30-starts-per-hour limit (share the counter through the `RankedPlayer` DO). A player who quits a ranked party in the middle of a match scores 0 for the remaining rounds, so rage-quitting doesn't protect a rating.
4. **Ranked screen:** add a "Play ranked with friends" button that opens a ranked party with the selected mode already chosen. The solo mode buttons stay as they are.
5. **Results:** the final podium shows each player's rating change (+/−) and any new tier.
6. Tests: a unit test that a ranked party updates ratings, rejects unranked modes and blocks skip. An e2e test where two browsers finish a ranked party and both ratings change.

---

## Phase 4: In-game Wiki

A **Wiki** screen (a button on the home screen, plus the `/?wiki` link) that explains everything. Build it from the same data the game uses, so it never goes out of date:

| Section | Source |
|---------|--------|
| Game modes: name, time, rounds, ranked or party-only, rules | `MODE_CONFIG` (`client/data/modes.js`) |
| Ranks and tiers: rating thresholds, how rating changes, the region split | `TIERS` and the rating functions (`src/rating.js`, which needs to be exported to the client in the build) |
| Scoring: distance score, speed bonus, Bounty and Sprint rules | `src/scoring.js` |
| Battle Royale, Tag-Team and spectator rules | The rules text that is in `README.md` today, moved into i18n strings |
| Unlocks: avatar items and frames, and how to earn them | `client/data/avatar-unlocks.js` |
| Locations: number of spots per pool and region, with a map of the coverage (no answers listed for ranked pools) | `client/data/locations.js` |
| Leaderboards: weekly reset time (Monday 00:00 Phnom Penh), backup and restore | Text |

The Wiki has search, works offline (it is static and bundled by `scripts/build.mjs`) and is available in both Khmer and English. Add an e2e test that the Wiki lists every mode in `MODE_CONFIG` and every tier.

---

## Done when
- All Phase 1 bug tests pass. The two-browser offline test rejoins the player in the same seat. The soak test shows median round trip under 150 ms locally.
- `tests/content-rules.test.mjs` passes, and searching for the Thailand pattern finds nothing.
- Two friends can finish a ranked party in any ranked mode the host picks, and both ratings update.
- The Wiki lists every mode, tier and unlock, generated from the game's data.
