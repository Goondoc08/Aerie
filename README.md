# Aerie

A personal, local-first web app that answers one question: in the next nine days,
which morning or evening is worth going out with the camera, and where.

- `npm install` then `npm run dev` to run it, `npm test` to run the checks, `npm run build` to build.
- Live copy: https://goondoc08.github.io/Aerie/ (rebuilt by `.github/workflows/pages.yml` on every push to main).
- Scoring weights, time windows and thresholds are all in `src/lib/config.ts`.
- `aerie-mockup.html`, `aerie-hawk.svg` and `fixtures.json` are the reference files the app is built against.

Phase 1 (weather week) is in place: splash, day strip, day cards, settings, offline cache.
Phase 2 (detail, spots, tides) is in place: day detail pages (#nov-17), spot list with max-drive slider, NOAA tides, tide-adjusted spot scores, best bet.
Phase 3 (unusual birds) is in place: eBird key in Settings (stored on the device only), notable-sightings filter and labels, spot tags, temporary entries, birds panel, card counts.
Phase 4 (fronts and seasons) is in place: cold front and first-clear-morning tags (rule and thresholds in config.ts, FRONT), BirdCast link in spring and fall.
Phase 5 (sharper inputs) is in place: a forecast per spot, the nearest NOAA station per tidal spot (with a finder in the spot editor), eBird hotspot suggestions ranked by recent checklists, and score weights editable in Settings.
Places and schedule: home can be set from a ZIP code (Zippopotam, with Open-Meteo geocoding as fallback); "Plan from another ZIP" on the main screen moves the forecast, birds and drive estimates to that place and adds its busiest eBird hotspots to Where to go; work days can be a rotation, set weekdays, or none.
