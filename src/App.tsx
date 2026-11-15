import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DAYS_SHOWN, REFRESH_HOURS, TIDE, TIMEZONE } from './lib/config';
import { db, type CacheRow } from './lib/db';
import { analyseBirds, refreshBirds, type BirdGroup, type Report } from './lib/birds';
import { ago, dayId, nowIn, todayIn } from './lib/dates';
import { refreshForecast } from './lib/forecast';
import { frontTags } from './lib/fronts';
import { bestOpenWindow, parseForecast, scoreWeek } from './lib/scoring';
import { loadSettings, saveSettings, type Settings } from './lib/settings';
import type { Spot } from './lib/spots';
import { parseTides, refreshTides, tideKey } from './lib/tides';
import type { TideMap } from './lib/where';
import { Detail } from './ui/Detail';
import { Home } from './ui/Home';
import { SettingsScreen } from './ui/SettingsScreen';
import { Splash } from './ui/Splash';

const HOUR = 3600000;
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
    const f = cached.forecast;
    const moved = f && (f.lat !== s.lat || f.lng !== s.lng);
    if (force || moved || !f || Date.now() - f.fetchedAt > REFRESH_HOURS.forecast * HOUR) {
      run('forecast', () => refreshForecast(s.lat, s.lng));
    }
    for (const st of stationsFor(sp)) {
      const key = tideKey(st), t = cached[key];
      if (force || !t || Date.now() - t.fetchedAt > REFRESH_HOURS.tides * HOUR) run(key, () => refreshTides(st));
    }
    const b = cached.birds;
    const birdsMoved = b && (b.lat !== s.lat || b.lng !== s.lng);
    if (s.ebirdKey && (force || birdsMoved || !b || Date.now() - b.fetchedAt > REFRESH_HOURS.birds * HOUR)) {
      run('birds', () => refreshBirds(s.lat, s.lng, s.ebirdKey));
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
    const moved = next.lat !== settings.lat || next.lng !== settings.lng;
    if (moved) run('forecast', () => refreshForecast(next.lat, next.lng));
    if (next.ebirdKey && (moved || next.ebirdKey !== settings.ebirdKey)) run('birds', () => refreshBirds(next.lat, next.lng, next.ebirdKey));
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
  const week = useMemo(() => (f && settings ? scoreWeek(f, today, DAYS_SHOWN, settings.shiftAnchor) : []), [f, today, settings?.shiftAnchor]);
  const best = useMemo(() => bestOpenWindow(week), [week]);
  const tags = useMemo(() => (f ? frontTags(f) : {}), [f]);
  const tides = useMemo<TideMap>(() => {
    const m: TideMap = {};
    for (const [k, r] of Object.entries(rows)) if (k.startsWith('tides:')) m[k.slice(6)] = parseTides(r.data);
    return m;
  }, [rows]);

  const birdRow = rows.birds ?? null;
  // Sightings count only while a key is set; removing the key hides them.
  const birds = useMemo(() => (birdRow && settings?.ebirdKey
    ? analyseBirds(birdRow.data as Report[], nowIn(TIMEZONE), { lat: settings.lat, lng: settings.lng, spots })
    : null), [birdRow, settings?.ebirdKey, settings?.lat, settings?.lng, spots]);

  // Header notes: say which part is out of date, and the forecast's age past six hours.
  const notes: string[] = [];
  if (forecast) {
    if (status.forecast?.failed) notes.push(`Forecast out of date, last updated ${ago(forecast.fetchedAt)}`);
    else if (Date.now() - forecast.fetchedAt > REFRESH_HOURS.staleBanner * HOUR) notes.push(`Forecast from ${ago(forecast.fetchedAt)}`);
  }
  const tideRows = stationsFor(spots).map((st) => ({ st, row: rows[tideKey(st)], s: status[tideKey(st)] }));
  const tideFailed = tideRows.filter((t) => t.s?.failed || (t.row && Date.now() - t.row.fetchedAt > REFRESH_HOURS.tides * 1.5 * HOUR));
  if (tideFailed.length) {
    const oldest = Math.min(...tideFailed.map((t) => t.row?.fetchedAt ?? Infinity));
    notes.push(Number.isFinite(oldest) ? `Tides out of date, last updated ${ago(oldest)}` : 'Tides could not be loaded');
  }

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

  const model: Model = { settings: settings!, forecast: f, week, best, spots, tides, today, birds, birdRow, tags };

  return (
    <>
      <Splash />
      <div className="wrap">
        {!loaded || !settings ? null : hash === 'settings' ? (
          <SettingsScreen settings={settings} spots={spots} rows={rows} status={status} stations={stationsFor(spots)}
            onSave={update} onSpotsChanged={reloadSpots}
            onRefresh={(key) => key === 'forecast' ? run(key, () => refreshForecast(settings.lat, settings.lng))
              : key === 'birds' ? run(key, () => refreshBirds(settings.lat, settings.lng, settings.ebirdKey))
              : run(key, () => refreshTides(key.slice(6)))} />
        ) : detailDay && f ? (
          <Detail model={model} day={detailDay} onBack={goHome} onMaxDrive={(maxDrive) => update({ maxDrive })} />
        ) : (
          <Home model={model} notes={notes} busy={!!status.forecast?.busy} failed={!!status.forecast?.failed}
            focus={focus} onFocus={setFocus} onOpen={openDay} />
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
};
