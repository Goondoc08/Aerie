import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DAYS_SHOWN, REFRESH_HOURS, TIDE, TIMEZONE } from './lib/config';
import { db, type CacheRow } from './lib/db';
import { HOTSPOTS, HOTSPOTS_VISIT, rankHotspots, refreshHotspots } from './lib/hotspots';
import { analyseBirds, refreshBirds, type BirdGroup, type Report } from './lib/birds';
import { ago, dayId, nowIn, todayIn } from './lib/dates';
import { pointKey, refreshForecast, refreshSpotForecasts, SPOT_FORECASTS } from './lib/forecast';
import { frontTags } from './lib/fronts';
import { bestOpenWindow, parseForecast, scoreWeek, type Forecast } from './lib/scoring';
import { loadSettings, placeOf, saveSettings, scheduleOf, weightsOf, type Place, type Settings } from './lib/settings';
import type { Spot } from './lib/spots';
import { parseTides, refreshTides, tideKey } from './lib/tides';
import type { TideMap } from './lib/where';
import { Detail } from './ui/Detail';
import { Home } from './ui/Home';
import { SettingsScreen } from './ui/SettingsScreen';
import { Splash } from './ui/Splash';

const HOUR = 3600000;
/** Cached data counts as fetched for a place when it is within about a kilometre of it. */
const near = (r: CacheRow | undefined, p: { lat: number; lng: number }) =>
  !!r && r.lat != null && r.lng != null && Math.abs(r.lat - p.lat) < 0.01 && Math.abs(r.lng - p.lng) < 0.01;
/** Visit hotspots shown in Where to go. */
const VISIT_HOTSPOTS = 5;
const useHash = () => {
  const [hash, setHash] = useState(location.hash.slice(1));
  useEffect(() => {
    const on = () => setHash(location.hash.slice(1));
    addEventListener('hashchange', on);
    return () => removeEventListener('hashchange', on);
  }, []);
  return hash;
};

/** Every station the app needs: the card's station plus each tidal spot's. */
const stationsFor = (spots: Spot[]) =>
  [...new Set([TIDE.homeStation, ...spots.filter((s) => s.tidal && s.stationId).map((s) => s.stationId!)])];

export interface Status { busy: boolean; failed: boolean; error?: string }
export type Sources = Record<string, Status>;

export default function App() {
  const hash = useHash();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [spots, setSpots] = useState<Spot[]>([]);
  const [rows, setRows] = useState<Record<string, CacheRow>>({});
  const [status, setStatus] = useState<Sources>({});
  const [loaded, setLoaded] = useState(false);
  const [focus, setFocus] = useState<string | null>(null); // the card to return to
  const fromHome = useRef(false);

  const mark = (key: string, s: Partial<Status>) =>
    setStatus((prev) => ({ ...prev, [key]: { ...(prev[key] ?? { busy: false, failed: false }), ...s } }));

  // Each source is fetched on its own; a failure keeps that source's cached copy and marks only it.
  const run = useCallback(async (key: string, job: () => Promise<CacheRow>) => {
    mark(key, { busy: true });
    try {
      const row = await job();
      setRows((prev) => ({ ...prev, [key]: row }));
      mark(key, { busy: false, failed: false, error: undefined });
    } catch (e) {
      mark(key, { busy: false, failed: true, error: e instanceof Error ? e.message : String(e) });
    }
  }, []);

  const refreshAll = useCallback((s: Settings, sp: Spot[], cached: Record<string, CacheRow>, force: boolean) => {
    const at = placeOf(s);
    const f = cached.forecast;
    if (force || !near(f, at) || Date.now() - f.fetchedAt > REFRESH_HOURS.forecast * HOUR) {
      run('forecast', () => refreshForecast(at.lat, at.lng));
    }
    for (const st of stationsFor(sp)) {
      const key = tideKey(st), t = cached[key];
      if (force || !t || Date.now() - t.fetchedAt > REFRESH_HOURS.tides * HOUR) run(key, () => refreshTides(st));
    }
    // Every spot's own forecast, in one request; refetched when old or when the spot list moves.
    const sf = cached[SPOT_FORECASTS];
    const want = [...new Set(sp.map(pointKey))].sort().join('|');
    const have = sf ? [...((sf.data as { keys: string[] }).keys ?? [])].sort().join('|') : '';
    if (sp.length && (force || !sf || want !== have || Date.now() - sf.fetchedAt > REFRESH_HOURS.forecast * HOUR)) {
      run(SPOT_FORECASTS, () => refreshSpotForecasts(sp));
    }
    const b = cached.birds;
    if (s.ebirdKey && (force || !near(b, at) || Date.now() - b.fetchedAt > REFRESH_HOURS.birds * HOUR)) {
      run('birds', () => refreshBirds(at.lat, at.lng, s.ebirdKey));
    }
    // While visiting, the busiest eBird hotspots near that place join Where to go.
    const hv = cached[HOTSPOTS_VISIT];
    if (s.visit && s.ebirdKey && (force || !near(hv, at) || Date.now() - hv.fetchedAt > 24 * HOUR)) {
      run(HOTSPOTS_VISIT, () => refreshHotspots(at.lat, at.lng, s.ebirdKey, HOTSPOTS_VISIT));
    }
  }, [run]);

  // Show whatever is cached straight away, then refresh anything old.
  useEffect(() => {
    let live = true;
    const check = async () => {
      const [s, sp, cache] = await Promise.all([loadSettings(), db.spots.toArray(), db.cache.toArray()]);
      if (!live) return;
      const cached = Object.fromEntries(cache.map((r) => [r.source, r]));
      setSettings(s);
      setSpots(sp);
      setRows((prev) => ({ ...cached, ...prev }));
      setLoaded(true);
      refreshAll(s, sp, cached, false);
    };
    check();
    const onVisible = () => { if (document.visibilityState === 'visible') check(); };
    document.addEventListener('visibilitychange', onVisible);
    addEventListener('online', check);
    return () => {
      live = false;
      document.removeEventListener('visibilitychange', onVisible);
      removeEventListener('online', check);
    };
  }, [refreshAll]);

  const update = async (patch: Partial<Settings>) => {
    if (!settings) return;
    const next = { ...settings, ...patch };
    setSettings(next);
    await saveSettings(patch);
    const was = placeOf(settings), at = placeOf(next);
    const moved = was.lat !== at.lat || was.lng !== at.lng;
    if (moved) run('forecast', () => refreshForecast(at.lat, at.lng));
    if (next.ebirdKey && (moved || next.ebirdKey !== settings.ebirdKey)) run('birds', () => refreshBirds(at.lat, at.lng, next.ebirdKey));
    if (next.visit && next.ebirdKey && (moved || !near(rows[HOTSPOTS_VISIT], at))) {
      run(HOTSPOTS_VISIT, () => refreshHotspots(at.lat, at.lng, next.ebirdKey, HOTSPOTS_VISIT));
    }
  };

  /** Plan from another place, or pass null to go back to home. Remembers the last three places. */
  const visit = (p: Place | null) => {
    if (!settings) return Promise.resolve();
    const recentVisits = p ? [p, ...settings.recentVisits.filter((r) => r.zip !== p.zip)].slice(0, 3) : settings.recentVisits;
    return update({ visit: p, recentVisits });
  };

  const reloadSpots = async () => {
    const sp = await db.spots.toArray();
    setSpots(sp);
    if (settings) refreshAll(settings, sp, rows, false); // fetch tides for any new station
  };

  // Everything below is worked out from the raw cached data each time the screen draws.
  const today = todayIn(TIMEZONE);
  const forecast = rows.forecast ?? null;
  const f = useMemo(() => (forecast ? parseForecast(forecast.data) : null), [forecast]);
  const weights = useMemo(() => (settings ? weightsOf(settings) : null), [settings?.weights]);
  const week = useMemo(() => (f && settings ? scoreWeek(f, today, DAYS_SHOWN, scheduleOf(settings), weights!) : []), [f, today, settings?.scheduleMode, settings?.shiftAnchor, settings?.workDays, weights]);
  const sfRow = rows[SPOT_FORECASTS] ?? null;
  const spotForecasts = useMemo(() => {
    const m = new Map<string, Forecast>();
    const d = sfRow?.data as { keys: string[]; results: unknown[] } | undefined;
    d?.keys.forEach((k, i) => { try { m.set(k, parseForecast(d.results[i])); } catch { /* skip a bad entry */ } });
    return m;
  }, [sfRow]);
  const best = useMemo(() => bestOpenWindow(week), [week]);
  const tags = useMemo(() => (f ? frontTags(f) : {}), [f]);
  const tides = useMemo<TideMap>(() => {
    const m: TideMap = {};
    for (const [k, r] of Object.entries(rows)) if (k.startsWith('tides:')) m[k.slice(6)] = parseTides(r.data);
    return m;
  }, [rows]);

  const birdRow = rows.birds ?? null;
  // Sightings count only while a key is set; removing the key hides them.
  const here = settings ? placeOf(settings) : null;
  const birds = useMemo(() => (birdRow && settings?.ebirdKey && here
    ? analyseBirds(birdRow.data as Report[], nowIn(TIMEZONE), { lat: here.lat, lng: here.lng, spots })
    : null), [birdRow, settings?.ebirdKey, here?.lat, here?.lng, spots]);
  const hvRow = rows[HOTSPOTS_VISIT];
  const visitSpots = useMemo<Spot[]>(() => {
    if (!settings?.visit || !settings.ebirdKey || !near(hvRow, settings.visit)) return [];
    const v = settings.visit;
    return rankHotspots(hvRow.data as any, v, spots)
      .filter((h) => h.driveMin <= settings.maxDrive)
      .slice(0, VISIT_HOTSPOTS)
      .map((h) => ({ name: h.name, type: `eBird hotspot near ${v.name}`, lat: h.lat, lng: h.lng, driveMin: h.driveMin, tidal: false }));
  }, [hvRow, settings?.visit, settings?.ebirdKey, settings?.maxDrive, spots]);

  // Header notes: say which part is out of date, and the forecast's age past six hours.
  const notes: string[] = [];
  if (forecast && here && !near(forecast, here)) notes.push(status.forecast?.failed ? `Forecast for ${here.name} could not be loaded; showing the last place` : `Loading the forecast for ${here.name}`);
  else if (forecast) {
    if (status.forecast?.failed) notes.push(`Forecast out of date, last updated ${ago(forecast.fetchedAt)}`);
    else if (Date.now() - forecast.fetchedAt > REFRESH_HOURS.staleBanner * HOUR) notes.push(`Forecast from ${ago(forecast.fetchedAt)}`);
  }
  const tideRows = stationsFor(spots).map((st) => ({ st, row: rows[tideKey(st)], s: status[tideKey(st)] }));
  const tideFailed = tideRows.filter((t) => t.s?.failed || (t.row && Date.now() - t.row.fetchedAt > REFRESH_HOURS.tides * 1.5 * HOUR));
  if (tideFailed.length) {
    const oldest = Math.min(...tideFailed.map((t) => t.row?.fetchedAt ?? Infinity));
    notes.push(Number.isFinite(oldest) ? `Tides out of date, last updated ${ago(oldest)}` : 'Tides could not be loaded');
  }

  if (status[SPOT_FORECASTS]?.failed) notes.push('Spot forecasts out of date');
  if (birdRow && settings?.ebirdKey) {
    if (status.birds?.failed) notes.push(`Sightings out of date, last updated ${ago(birdRow.fetchedAt)}`);
    else if (Date.now() - birdRow.fetchedAt > REFRESH_HOURS.staleBanner * HOUR) notes.push(`Sightings from ${ago(birdRow.fetchedAt)}`);
  }

  const detailDay = week.find((d) => dayId(d.date) === hash);
  const openDay = (date: string) => { setFocus(date); fromHome.current = true; location.hash = dayId(date); };
  const goHome = () => {
    if (fromHome.current) { fromHome.current = false; history.back(); } else location.hash = '';
  };
  // The browser back button leaves the detail page without our button; keep the flag honest.
  useEffect(() => { if (!detailDay) fromHome.current = false; }, [detailDay]);
  useEffect(() => { if (detailDay) setFocus(detailDay.date); }, [detailDay]);

  const model: Model = { settings: settings!, forecast: f, week, best, spots, tides, today, birds, birdRow, tags, weights: weights!, spotForecasts, visitSpots };

  return (
    <>
      <Splash />
      <div className="wrap">
        {!loaded || !settings ? null : hash === 'settings' ? (
          <SettingsScreen settings={settings} spots={spots} rows={rows} status={status} stations={stationsFor(spots)}
            onSave={update} onSpotsChanged={reloadSpots}
            onRefresh={(key) => key === 'forecast' ? run(key, () => refreshForecast(here!.lat, here!.lng))
              : key === SPOT_FORECASTS ? run(key, () => refreshSpotForecasts(spots))
              : key === HOTSPOTS ? run(key, () => refreshHotspots(settings.lat, settings.lng, settings.ebirdKey))
              : key === 'birds' ? run(key, () => refreshBirds(here!.lat, here!.lng, settings.ebirdKey))
              : run(key, () => refreshTides(key.slice(6)))} />
        ) : detailDay && f ? (
          <Detail model={model} day={detailDay} onBack={goHome} onMaxDrive={(maxDrive) => update({ maxDrive })} />
        ) : (
          <Home model={model} notes={notes} busy={!!status.forecast?.busy} failed={!!status.forecast?.failed}
            focus={focus} onFocus={setFocus} onOpen={openDay} onVisit={visit} />
        )}
      </div>
    </>
  );
}

export type Model = {
  settings: Settings;
  forecast: ReturnType<typeof parseForecast> | null;
  week: ReturnType<typeof scoreWeek>;
  best: ReturnType<typeof bestOpenWindow>;
  spots: Spot[];
  tides: TideMap;
  today: string;
  /** Sightings that passed the filter, or null when there is no key or no data yet. */
  birds: BirdGroup[] | null;
  birdRow: CacheRow | null;
  /** Cold front tags by date. */
  tags: Record<string, string[]>;
  weights: ReturnType<typeof weightsOf>;
  /** Each spot's own forecast, by pointKey. */
  spotForecasts: Map<string, Forecast>;
  /** eBird hotspots near a visited place, shown in Where to go while visiting. */
  visitSpots: Spot[];
};
