# Aerie

A personal, local-first web app that answers one question: in the next nine days,
which morning or evening is worth going out with the camera, and where.

- `npm install` then `npm run dev` to run it, `npm test` to run the checks, `npm run build` to build.
- Scoring weights, time windows and thresholds are all in `src/lib/config.ts`.
- `aerie-mockup.html`, `aerie-hawk.svg` and `fixtures.json` are the reference files the app is built against.

Phase 1 (weather week) is in place: splash, day strip, day cards, settings, offline cache.
