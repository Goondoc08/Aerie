# Aerie

A personal, local-first web app that answers one question: in the next nine days,
which morning or evening is worth going out with the camera, and where.

- `npm install` then `npm run dev` to run it, `npm test` to run the checks, `npm run build` to build.
- Scoring weights, time windows and thresholds are all in `src/lib/config.ts`.
- `aerie-mockup.html`, `aerie-hawk.svg` and `fixtures.json` are the reference files the app is built against.

Phase 1 (weather week) is in place: splash, day strip, day cards, settings, offline cache.
Phase 2 (detail, spots, tides) is in place: day detail pages (#nov-17), spot list with max-drive slider, NOAA tides, tide-adjusted spot scores, best bet.
Phase 3 (unusual birds) is in place: eBird key in Settings (stored on the device only), notable-sightings filter and labels, spot tags, temporary entries, birds panel, card counts.
Phase 4 (fronts and seasons) is in place: cold front and first-clear-morning tags (rule and thresholds in config.ts, FRONT), BirdCast link in spring and fall.
