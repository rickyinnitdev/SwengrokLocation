# WanderPenh Plan 2: Battle Royale and Easier Guess Map

This plan is for an AI coding agent. It is **separate from `PLAN.md`**, which another agent is carrying out right now.

## ⚠️ Coordination with PLAN.md (read first)
- **Start this plan only after PLAN.md Phase 1 (client split) is merged.** Code may have moved from `index.html` into `client/*.js`. Find code by **symbol name** (`MODE_CONFIG`, `LOCATIONS_DB`, `gameState.guessMap`, `L.map('guess-map'`, `RoomEngine`, `submitGuess`), not by line number.
- If PLAN.md Phase 3 (UI overhaul) or Phase 4 (Tag-Team) is still in progress, **don't edit the same UI files in parallel**. Finish Part A here first. It mostly adds new files (`client/map/*`), so it's the safest to run in parallel.
- Follow the same conventions as PLAN.md:
  - The `region` field on modes, and `t()` / `data-i18n` for every new string (Khmer + English)
  - The Khmer-inspired visual style, which must not look like GeoGuessr
  - Server-authoritative scoring
  - Free Cloudflare plan only
  - `npm run check` must pass after each part.
- Don't add other modes. The owner approved **only Battle Royale** in this plan.
- **Owner overrides of PLAN.md Phase 3:**
  - PLAN.md said "no corner minimap". On **desktop/tablet ≥ 900px**, this plan's Part C (a corner map that expands) **replaces** that rule. Phones keep the bottom sheet.
  - **PLAN.md Phase 3 is already implemented.** The in-game screen it built (a 65/35 panorama/map split on desktop, with a resizable divider) **must be replaced by Part C** on screens ≥ 900px.
    - Before you start Part C, read the current in-game markup and CSS (`client/styles.css`, `client/app.js`, `index.html`) to see what exists.
    - Remove the desktop split layout and its divider code instead of leaving dead CSS/JS behind.
    - **Keep** the rest of Phase 3: the palette tokens, dark theme, i18n, home/region screens, mode cards, coach marks and the phone bottom sheet.
    - Update or replace any Phase 3 e2e tests that assert the split layout, so they assert the Part C layout instead.

Order: **Part A (easier guess map) → Part C (in-game HUD) → Part E (round leaderboard) → Part F (late-join spectators) → Part D (character customization) → Part B (Battle Royale)**. Battle Royale uses the new map, HUD and leaderboard, and its ghosts reuse the spectator view from Part F, so it goes last.

---

## Part A: Make it easier to find the place you want on the guess map, in every mode

### Problem (current state)
- The guess map is Leaflet with raw OSM tiles (`tile.openstreetmap.org`).
- The start view is only set by flags (`isWorld`/`isAsia`/`isCambodia` → center+zoom, otherwise `PP_CENTER` zoom 12).
- There are no boundaries, no quick-jump, and no help for placing a precise pin on a phone.
- Players waste time panning or zooming, and they mis-tap on mobile.

### A1. Per-mode map profile (single source of truth)
Add a `map` field to every mode in `MODE_CONFIG`:
```js
map: {
  bounds: [[11.45, 104.75], [11.75, 105.05]], // initial fitBounds
  maxBounds: [[11.3, 104.6], [11.9, 105.2]],  // can't pan into nowhere (null for world)
  minZoom: 11, maxZoom: 19,
  quickJumps: 'pp-khans',                     // which jump-chip set to show (A3)
  overlays: ['khans', 'river', 'landmarks'],  // available overlay layers (A4)
}
```
- Defaults per region:
  - Phnom Penh modes (`classic, sprint, bounty, nmpz, sniper, streak, landmarks, district`): Phnom Penh bounds
  - `cambodia`: Cambodia bounds, `quickJumps: 'kh-provinces'`
  - `asia`: Asia bounds, `quickJumps: 'asia-countries'`
  - `world`: no maxBounds, `quickJumps: 'continents'`
  - `country`: still multiple choice, but also add an optional "peek map" that uses the world profile
- Replace the `isWorld ? … : …` center/zoom ternary with a `applyMapProfile(map, cfg.map)` function in `client/map/profile.js`.
- `scripts/build.mjs` must still pass `MODE_CONFIG` to the server. Make sure the extra `map` field doesn't break the build (the server can ignore it).

### A2. ~~Search box~~: REMOVED (owner decision)
**Do not add any place-name search or geocoding to the guess map.** The owner considers it cheating. Find-ability comes only from the starting view (A1), quick-jump chips (A3), overlays (A4) and pin precision (A5).

### A3. Quick-jump chips
- Show a horizontal scroll row of chips above the map, chosen by `map.quickJumps`:
  - `pp-khans`: the 14 Phnom Penh khans (Daun Penh, 7 Makara, Chamkar Mon, Toul Kork, Mean Chey, Russey Keo, Sen Sok, Por Senchey, Chroy Changvar, Prek Pnov, Chbar Ampov, Kambol, Dangkao, Boeng Keng Kang), using Khmer names when the language is km
  - `kh-provinces`: the 25 provinces
  - `asia-countries`: about 15 common countries
  - `continents`: 6 continents
- Tapping a chip fits the map to that area's bbox. Put the bbox data in `data/areas.json`, built once offline, with khan bboxes taken from OSM admin boundaries.
- Add a **"🏠 Reset view"** chip that re-applies the mode profile.

### A4. Helpful overlay layers (toggle button "Layers")
- **Khan boundaries:**
  - Simplified GeoJSON (`data/pp-khans.geojson`, simplified to < 150 KB with mapshaper or turf in the build script), drawn as thin dashed lines with a label at each khan centroid.
  - **On by default** for Phnom Penh modes. Required for `district` (Khan Detective): there, clicking a khan polygon should highlight it.
- **Mekong / Tonle Sap / Bassac rivers:** a label emphasis layer. These are the most important orientation cue in Phnom Penh.
- **Landmarks:**
  - Small icons for about 30 well-known orientation points (Independence Monument, Wat Phnom, Royal Palace, Central Market, Olympic Stadium, Aeon 1/2/3, airport, Chroy Changvar bridge, Koh Pich, etc.).
  - On by default in Cambodia modes, but **off and locked** in `landmarks` mode, where they would give the answer away.
  - Each mode can lock layers on or off with `map.lockedOverlays`.
- **Tile style:**
  - Add a choice between "Standard" (current OSM) and a cleaner, label-friendly free style.
  - Respect each tile provider's usage policy. Don't hammer `tile.openstreetmap.org` (its policy forbids heavy use). Before launch, evaluate a free-tier provider or self-host vector tiles (Protomaps PMTiles on R2: R2's free tier covers it, and it renders with MapLibre). Ask the owner before switching providers. For now, leave the OSM tiles and add a `TODO(tiles)`.

### A5. Precise pin placement (especially on phones)
- **Two-step pin:**
  1. Tap to place the pin.
  2. Drag it to adjust (it's a draggable marker).
  3. The Guess button confirms.
- **Magnifier loupe:** while the player drags the pin on a touch device, show a circular zoomed preview (about 100px, 2 zoom levels deeper) above the finger, so the finger doesn't hide the spot.
- **Crosshair mode (toggle):**
  - The pin is fixed at the map center, and the player pans the map underneath it.
  - It's easier with one thumb, so it's the default on screens < 480px wide. A tap still works too.
- Show the **pin's current khan/sangkat name** live under the map ("📍 Toul Kork · Boeung Kak 1"). Use point-in-polygon against the khan GeoJSON. In world modes, show the country name instead.
  - This helps players double-check they're on the right side of the river.
  - **Hide it in `district` mode**, where it would give the answer away.
- Remember the map zoom and center between rounds of the same match only if `map.keepViewBetweenRounds` is set. The default is to reset to the profile.

### A6. Tests
- Unit tests for point-in-polygon khan lookup.
- e2e:
  - In classic: tap a khan chip → the map fits that khan → the player places the pin → the guess is accepted.
  - The khan chip fits the bounds.
  - There is no search input anywhere on the guess map (regression guard).
  - Landmark overlay is locked off in `landmarks` mode.
- Bundle-size check: the guess-map extras add < 400 KB gzipped in total and are lazy-loaded.

---

## Part B: Battle Royale party mode ("Tuk-Tuk Royale" / "តុកតុករ៉ូយ៉ាល់")

### Concept
Everyone starts with **lives**. Each round, the worst guessers lose a life. When a player runs out of lives, they're out, but they stay in the game as **ghosts** who can heckle. The last player standing wins.

Works with 3–8 players, and is best with 4–8. It's available in both regions, using the Phnom Penh pool for `kh` and the world pool for `world`.

### Rules (defaults; the host can tweak lives and round time in the lobby)
- **Lives:** each player has ❤️❤️❤️ (3 lives).
- **Damage per round:**
  - The **slowest-to-find**, i.e. the farthest guess, loses 1 life.
  - With 6+ players still alive, the **two farthest** lose a life.
  - A missing guess (timeout) counts as the farthest.
  - **Ties** at the bottom (within 10 m, or 1 km for world): all tied players lose a life.
  - **"Bullseye shield":** a guess within 100 m (Phnom Penh) or 25 km (world) earns a 🛡️ that blocks the next life loss. A player can hold at most 1 shield.
- **The zone shrinks every round:**
  - The round timer starts at 60s and drops by 5s each round, down to a 20s minimum.
  - From round 4, the guess map's `maxBounds` shrinks to a **circle that is guaranteed to contain the answer**. It's centered at a random offset from the answer, with a radius that halves each round (PP: 6 km → 3 km → 1.5 km; world: 3000 km → …).
  - Show the circle as a glowing ring, with everything outside it darkened. This is the "zone". It lets players close in, and it also raises the stakes, because if everyone is inside the zone, small mistakes decide who loses a life.
  - The server computes the zone. Ghosts and live players all see the same zone.
- **Final duel:**
  - When 2 players are left, switch to **duel rounds**: the closer guess wins the round, and the loser loses 1 life.
  - Quick-jump chips are hidden during the duel, so it's pure skill.
- **Ghosts (eliminated players):**
  - They see the panorama **and the answer** right away, after a 5s delay.
  - Each round they get **one ghost pin** to drop on all living players' maps: a translucent 👻 marker that might be a hint or a lie.
  - Living players can see how many ghosts dropped a pin, but not whose pin is whose.
  - The host can turn ghost pins off with the lobby toggle **"Ghost heckling: on/off"**.
- **End:** the final standings are ordered by elimination order, with the winner crowned. Show stats: total rounds survived, best guess, and shields used.

### Server changes (`src/room-engine.js`)
- Add a mode config: `royale: { name, nameKm, region: 'both', royale: true, rounds: null /* until 1 left */, time: 60, minTime: 20, lives: 3, pool: 'classic' | 'world' }`.
  - The match continues until ≤ 1 player is alive. Cap it at 30 rounds; if it reaches the cap, the highest lives wins, then the total distance breaks the tie.
  - The location draw must therefore be able to draw more rounds lazily. Extend `drawLocations` / the deck logic to pull one location per round instead of fixed `rounds`.
- New per-player match state: `{ lives, shield, alive, eliminatedRound }`.
- At round end (all alive players guessed, or the deadline hits):
  1. Rank alive players by distance.
  2. Apply damage and shield rules.
  3. Mark eliminations.
  4. Compute the next round's `deadline` (shrinking time) and `zone` (center, radius).
  - All of this happens on the server. Clients only render.
- **The zone must not leak the answer:**
  - Pick the zone center uniformly inside a circle of radius `0.6 * zoneRadius` around the answer, so the answer is always inside the zone but never at its center.
  - Only send `{center, radius}`.
- **Ghost pins:**
  - A new message `ghostPin {lat, lng}` is accepted only from eliminated players, once per round, and is rate-limited.
  - Broadcast the pins without player ids to the living players.
- **Per-player view redaction:**
  - Ghosts receive the answer coordinates during the round. **Living players must not.**
  - Reuse the `viewFor(playerId)` redaction from PLAN.md Phase 4 (Tag-Team). If that doesn't exist yet, implement it here in the same way and tell the other plan's agent or owner.
- Joining mid-match: not allowed (same as now). A disconnect past the 30s grace period counts as elimination.
- Party leaderboard (from PLAN.md Phase 5): record `party:royale` results by **placement points**: 1st = 100, 2nd = 70, 3rd = 50, then −10 per place down to a minimum of 5. Also record wins. If Phase 5 isn't done yet, leave a hook (`onMatchEnd(results)`).

### Client changes
- **Lobby:** a Royale settings card for lives (1–5), start time, and ghost heckling on/off.
- **HUD:**
  - A row of player chips with ❤️ counts and 🛡️ icons, plus 👻 for eliminated players.
  - An "ALIVE 5/8" counter.
  - A big shrinking timer bar.
- **Zone ring** on the guess map, using the A1/A4 map layer system. Set `maxBounds` to the zone's bounds and dim everything outside it with an SVG mask.
- **Round-end "hit" sequence (~3s):**
  - Show all pins and the answer.
  - The losers' chips shake, a heart breaks 💔, and eliminated players get a tuk-tuk "crash" animation followed by the ghost state.
  - Respect `prefers-reduced-motion`.
- **Ghost view:**
  - A greyed-out UI with the answer marker visible.
  - A "Drop ghost pin 👻" button, plus a live view of the living players' guesses as they lock in (their positions are revealed only to ghosts, after each player submits).
- **Duel intro:** a full-screen "FINAL DUEL" splash with the two avatars.
- Use Khmer and English strings for everything (`t()`).

### Tests
- Unit tests (`tests/room.test.mjs`):
  - damage rules (1 vs 2 losers, ties, timeout = farthest)
  - shield blocks once
  - elimination and alive counts
  - the duel switch at 2 players
  - the round cap and tiebreak
  - the zone always contains the answer, and its center ≠ the answer (property test, 1,000 random draws)
  - living players' views have no answer coordinates; ghosts' views do
  - ghost pins rejected from living players and limited to 1 per round
  - a disconnect past grace = elimination
  - lazy location drawing never repeats within a match
- e2e: 4 browser contexts play until a winner is crowned (stub panoramas as the existing tests do). Check that the ghost UI appears for the eliminated players.

---

## Part C: In-game HUD layout (a full-screen panorama with floating panels)

The owner wants a layout **similar in structure** to GeoGuessr's party view: the panorama fills the screen and small panels float over it. It **must not look the same**. Keep the structure and change the look (see "Make it ours").

### Layout (desktop/tablet ≥ 900px)
```
┌───────────────────────────────────────────────────────────────┐
│ [≡ logo]          ┌─ compass strip ─┐            ┌──────────┐ │
│                   └──  ⏱ 01:35  ────┘            │ ticket   │ │
│                                                  │ panel    │ │
│                                                  └──────────┘ │
│                    FULL-SCREEN PANORAMA                       │
│                                                               │
│ ┌──┐                                         ┌──────────────┐ │
│ │+ │  (control dock)                         │  guess map   │ │
│ │− │                                         │  (expands on │ │
│ │↺ │                                         │   hover/tap) │ │
│ │⚑ │                                         ├──────────────┤ │
│ │⚙ │  [🙂🙂🙂🙂 guessed avatars]            │ [ GUESS 📍 ] │ │
└───────────────────────────────────────────────────────────────┘
```
- **Panorama:** 100vw × 100vh. The Street View iframe sits behind everything, and all the panels are absolutely positioned on top of it.
- **Top center:**
  - A **compass strip** (N/E/S/W tick marks). It shows a heading only when the panorama exposes it. Since the iframe embed doesn't report heading changes, show the round's starting heading and label it "start heading", or leave the compass out if it can't be accurate. **Don't fake it.**
  - The **timer** sits under it. It turns red and pulses in the last 10s.
- **Top right, "ticket panel":**
  - Mode name, round `3/5`, and my total score.
  - Below them, a live **"who has guessed" strip**: each player's avatar, which goes from a greyed outline to full colour with a ✓ when they lock in. This replaces GeoGuessr's plain "0/4 guesses made" text.
  - It can be collapsed.
- **Bottom left, control dock** (a vertical stack of round buttons):
  - zoom in/out for the guess map
  - **return to start** (reloads the iframe at the round's start position and heading)
  - **report a broken panorama** (the host's skip, which already exists)
  - settings
  - in party mode, an emote button that opens the existing `EMOTES` as a radial menu
- **Bottom right, guess map:**
  - Collapsed size is about 300×200.
  - **It expands to about 560×420 on hover** (desktop) **or tap** (tablet). Add a 📌 pin toggle that keeps it expanded.
  - The size is remembered in `localStorage`.
  - The **Guess button** sits directly under the map at the same width. It's disabled (and says "Drop a pin first") until a pin exists.
  - The A3 chips and A4 layers live in a slim toolbar on top of the map.
- **Emotes and chat toasts:** they float in at the right edge above the map and fade after 4s, showing the sender's avatar.

### Phones (< 900px)
- Keep the **bottom sheet map** from PLAN.md Phase 3. Put the timer and round info in a single top bar and the "who guessed" avatars under it.
- The control dock collapses into one ⋯ button.

### Make it ours (don't copy GeoGuessr's look)
- No dark navy/purple gradients and no GeoGuessr italic display fonts.
- Use the PLAN.md palette instead: temple gold, lotus pink and Mekong blue on **frosted warm-white glass** panels (`backdrop-filter: blur`) with rounded "ticket" corners and a perforated edge on the ticket panel.
- **Timer:** a tuk-tuk meter style, i.e. a rounded pill that a small tuk-tuk icon drives across as time runs out.
- **Guess button:** gold, chunky, with a press-down animation. It's labelled "📍 ទាយ / Guess".
- Panel icons are custom (lotus, tuk-tuk, flag), not generic GeoGuessr-like glyphs.
- **Theming:** use the dark theme from PLAN.md, with glass panels that switch to deep teal rather than purple.

### Tests
- e2e at 1440×900:
  - the map expands on hover
  - the Guess button is disabled before a pin
  - the "who guessed" avatar turns ✓ when another context guesses
  - the return-to-start button resets the iframe src
- e2e at 390×844: the bottom sheet is still used.

---

## Part D: More character customization

### Current state
- `avatar_generator.js` builds a hand-drawn SVG from a small set of options:
  - hairStyle (4)
  - eyeStyle (5)
  - mouthStyle (4)
  - jacketStyle (3)
  - squiggles (5)
  - earrings (2)
  - colours for hair, jacket, shirt, background and skin
- `AVATAR_ALLOWED` / `sanitizeAvatarConfig` whitelists everything, because configs come from other players over the network. **Every new option must be added to that whitelist.**
- The server's `profile()` in `src/room-engine.js` keeps at most 16 avatar fields with string values ≤ 40 chars. Raise that to **24 fields** to fit the new options.

### New options (keep the same doodle/hand-drawn SVG style)
| Category | New values |
|---|---|
| **Hair** | + long straight, ponytail, bun, buzz cut, curly afro, side part, braids, bald, **krama head wrap** (Cambodian checkered scarf) |
| **Headwear** (new slot, worn over hair) | none, helmet (moto), bucket hat, straw hat, flower clip, headphones, crown (cosmetic) |
| **Eyes** | + sleepy, star-eyes, wink, glasses (round), angry |
| **Eyebrows** (new slot) | normal, thick, raised, angry, worried |
| **Mouth** | + tongue out, grin with teeth, surprised "o", cat mouth |
| **Facial hair** (new slot) | none, stubble, moustache, goatee |
| **Top** | + t-shirt, school uniform shirt, **krama scarf** over a shirt, sports jersey, polo, traditional **sampot/silk top** |
| **Accessories** (new slot) | none, krama around the neck, backpack strap, camera, iced-coffee cup in hand, phone |
| **Earrings** | + studs, dangles |
| **Skin tones** | at least 8 swatches, with a wide range |
| **Background** | solid colours, plus **pattern backgrounds**: krama checks, lotus, Angkor silhouette, Phnom Penh skyline, night-market lights |
| **Frame/border** (new slot) | plain, gold ticket, lotus ring, unlocked rank frames |
| **Squiggles/effects** | + hearts, music notes, steam (hot), zzz |

- **Unlockables (optional, needs PLAN.md Phase 5 leaderboard):**
  - Rank tiers unlock frames and a couple of headwear items (e.g. "Tuk-Tuk Driver" → a helmet with a tuk-tuk sticker; "Legend of Penh" → a gold crown frame).
  - Winning a Battle Royale unlocks a "Royale champion" frame.
  - Check unlocks on the server (D1) when the profile is used in ranked/party play. In the editor, locked items show a 🔒 and their unlock condition.
- **Editor UX:**
  - Tabs for categories (Face, Hair, Clothes, Extras, Background), with a large live preview on the left and swatch/thumbnail grids on the right. Each thumbnail renders the actual option on the current avatar.
  - Buttons: **🎲 Randomize**, **↩ Undo**, and **Reset**.
  - Save to `localStorage` as now. In party lobbies, changes still sync live (this already works).
- **Performance:** cache the rendered SVG string per config hash. In-game avatar strips render many avatars at once.
- **Tests:**
  - `sanitizeAvatarConfig` rejects unknown values for every new slot.
  - The server keeps all the new fields (up to the new limit).
  - Snapshot-render each option once without exceptions.
  - e2e: change headwear in the lobby → the other browser sees it.

---

## Part E: Round leaderboard overhaul (ranked by points)

### Problem
- The round results leaderboard currently **sorts by distance** (see `sortedPlayers` in the round-result code in `client/app.js`; the real-multiplayer path is `renderMpRoundLeaderboard()`).
- Points include the speed and bounty bonuses, so the closest player isn't always the round winner. Sorting by distance confuses players.
- The rows also use a lot of inline styles.

### New behaviour
- **Sort by round points (descending)** for every mode, solo AI battle and real party alike.
  - Tie-break: smaller distance, then faster time.
  - Mode-specific scores (streak multiplier, sniper, country-guesser 5,000/0, Battle Royale) use the server's `score` field. **Don't recompute it on the client.**
- **Two tabs on the results screen:**
  - **This round:** rank, avatar, name, **+points** (large), and a breakdown line in small text (`2.3 km · 12.4s · +640 speed · +500 bounty`).
  - **Overall:** cumulative total after this round, with a **position change arrow** (▲2 / ▼1 / –) compared with the previous round's overall ranking.
  - Default to "This round" for 4s, then auto-switch to "Overall" after the score count-up. The user can tap the tabs at any time.
- **Presentation:**
  - Use a **podium** for the top 3 (gold/silver/bronze steps with avatars standing on them) and compact rows for 4th–8th.
  - Highlight my own row ("YOU").
  - Show "No guess" rows with 0 pts at the bottom.
  - Animations: rows slide into place by rank, and points count up. Respect `prefers-reduced-motion`.
- **On the result map:** each player's pin is labelled with their avatar and their round rank number, so the map matches the list.
- **Battle Royale (Part B):** the "This round" tab shows ❤️ changes (💔 −1, 🛡️ blocked) instead of points, sorted by distance, because that's how the mode is decided. "Overall" shows lives remaining, then elimination order.
- **Final standings screen:** use the same component, sorted by total points, with per-round mini bars for each player (a sparkline of their round scores).
- **Implementation:**
  - Build one shared `renderStandings({ rows, mode, tab, previousOrder })` component in `client/ui/standings.js`.
  - Use it for the AI battle, party round results and final standings.
  - Replace the inline styles with CSS classes that use the PLAN.md design tokens.
  - The server snapshot already includes per-round scores. Add `previousRank` only if it can't be derived on the client from earlier rounds.
- **Tests:**
  - Unit test for the sort: points desc, then distance, then time. Include a case where a closer player has fewer points because of a speed bonus and must rank lower.
  - e2e: 2 contexts → the faster-but-farther player with more points is shown first, and the position arrows appear in Overall.

---

## Part F: Late joiners spectate the match in progress

### Problem
`RoomEngine.join()` currently throws `"This match has started. Join the next party."` when someone opens a room code or link mid-match. Friends who arrive late just get an error.

### New behaviour
- Joining by room code **or** link (`?room=WP-XXXXX`) while a match is running **succeeds**. The person enters as a **spectator** and gets a toast: "Match in progress. You're watching 👀 and will join the next game." / "ការប្រកួតកំពុងដំណើរការ។ អ្នកកំពុងមើល 👀".
- Spectators **never** affect the match:
  - They have no score, can't guess, can't press Ready, and aren't counted when the server waits for "all players ready / all guessed".
  - They aren't in the standings.
- **Cap:** up to **8 spectators** per room, separate from `MAX_PLAYERS = 8`. Beyond that: "Room is full, try again after this match".
- **Spectators can switch the player they're watching (follow cam)**, using the player chips at the top or the ←/→ keys:
  - The followed player's **avatar, name, total score, round points** and live state ("looking…", "pin placed", "✓ guessed") are shown large.
  - The panorama is the **same round location** at its start heading. The embedded Street View iframe can't mirror another player's live camera, so **don't try to fake a live camera feed**. Label it "Round view".
  - **The followed player's pin is shown on the spectator's map only after that player locks in their guess.** Before that, show "thinking… 🤔".
- **Anti-cheat (important):**
  - Spectators are often in the same room or call as the players, so by default they **don't see the answer location, or any player's pin, until the round reveal**.
  - Host lobby toggle: **"Spectators see answer early"**, off by default. Turn it on for streams or casual watching.
  - Enforce this with the **per-player view redaction** (`viewFor(playerId)`) built for Tag-Team in PLAN.md Phase 4. Spectators get a redacted view, and players' pin coordinates are stripped from the spectator view until each player locks in (when the toggle is off, until the reveal).
- **Spectators can:**
  - send emotes (rate-limited like players), shown with an 👀 badge
  - see the round results and the overall leaderboard (Part E) after each round, exactly like players
- **When the match ends**, spectators **automatically become players** in the lobby for the rematch, in join order, as long as player slots remain (≤ 8). Anyone left over stays a spectator and is told "Lobby full, you're next in line".
- **Joining during the round-results or final screen** also works: they spectate until the lobby, then become players.
- **Host transfer never goes to a spectator** while a match is running.

### Server changes (`src/room-engine.js`, `src/worker.js`)
- Add a `role: 'player' | 'spectator'` field to each entry in `s.players`, or a separate `s.spectators` list. A role field is simpler for reconnection and tokens. Everywhere that counts players for readiness, guesses, scoring, `MAX_PLAYERS` or host transfer must filter for `role === 'player'`.
- `join()`:
  - Mid-match, create the entry with `role: 'spectator'` instead of throwing.
  - Spectators keep the same token/resume flow (refresh keeps them spectating), and the 30s disconnect grace applies.
- `guess`, `ready` and `setTeams` from a spectator are ignored. Unit tests must cover this.
- **Match end → lobby:** promote spectators to players (in join order, up to `MAX_PLAYERS`).
- **Snapshot:**
  - Expose `role` in the public roster, and `spectatorCount`.
  - `viewFor()` handles spectator redaction as described above.
- Add a lobby setting `spectatorsSeeAnswer: false` (host only).
- Bump `GAME_PROTOCOL`.

### Client changes
- **Spectator HUD:**
  - It's the Part C layout without the Guess button.
  - Add a top banner "👀 Spectating · Round 3/5" and a follow-player switcher. The map stays read-only, showing the answer and pins according to the rules above.
- **Player HUD:** a small "👀 2 watching" chip in the ticket panel, which shows spectator avatars on hover.
- **Lobby roster:** spectators appear in a "Watching" section under the players.
- **Strings:** all via `t()` in Khmer and English.

### Tests
- Unit tests:
  - Joining mid-match → spectator (no throw).
  - The spectator cap.
  - A spectator's guess or ready is ignored, and the match still advances when all **players** are ready.
  - With the toggle off, a spectator's view has no answer coordinates and no unlocked player pins before the reveal.
  - With the toggle on, the answer is included.
  - Promotion to player at match end, respecting `MAX_PLAYERS`.
  - The host is never a spectator.
  - A spectator who reconnects stays a spectator.
- e2e:
  - 2 players start a match.
  - A 3rd browser opens the room link and sees the spectating banner.
  - Players finish the match.
  - Rematch lobby shows the 3rd browser as a player.

---

## Guardrails
- Don't commit `dist/` or `.generated/`, and don't add secrets.
- Don't add modes other than Battle Royale.
- **No place search or geocoding on the guess map** (owner decision).
- Before any of these, ask the owner:
  - changing the map tile provider
  - adding a paid service
- Keep the server authoritative for lives, eliminations, zones and scores.
- Bump `GAME_PROTOCOL` when the room message format changes.
