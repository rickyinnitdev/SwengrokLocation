# WanderPenh project rules

## No Thailand content (owner decision)
The game must not contain any Thailand content: no locations, place names, flags, map regions, mode descriptions or translations
(Thai cities, landmarks and currency included). When you add locations or text, use other countries.
`tests/content-rules.test.mjs` enforces this and must stay green. Never reuse the removed ids (`w_48`, `w_49`, `w_64`, `asia_01`–`asia_05`).

## Conventions
- Find code by symbol name, not line number. Every new string goes through `t()` / `data-i18n` in Khmer and English.
- Scoring is server-authoritative. Cloudflare Free plan only. `npm run check` must pass; bump `GAME_PROTOCOL` when the room message format changes.
