# Phnom Penh location data

The original 110 locations remain in `index.html`. `extra-locations.json` adds 100 real named road points in central Phnom Penh, for a total of 210. These are coordinate candidates, not independently verified panorama IDs.

The additional data was retrieved on 2026-10-29 from the OpenStreetMap Map API:

https://api.openstreetmap.org/api/0.6/map?bbox=104.89,11.55,104.92,11.58

`scripts/curate-locations.mjs` chooses points on named primary, secondary, tertiary and residential road geometry. Candidates are spaced at least 140 metres from original and previously selected additional points. Each record retains its OSM way ID. The import is a build-time snapshot; playing does not call OpenStreetMap APIs.

Coordinates are © OpenStreetMap contributors, licensed under [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/). Attribution is shown in the party dialog. The derived dataset is available on the deployed website at `/extra-locations.json` and in this repository at `data/extra-locations.json`.

Google panorama availability and the nearest captured viewpoint can vary. If a shared view is unavailable, the host can replace it before anyone guesses (at most five replacements per match). All players receive the replacement together. The map pin represents the requested road coordinate, not a verified Google panorama capture point.
