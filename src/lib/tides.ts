import { DAYS_SHOWN, TIMEZONE } from './config';
import { addDays, compactDay, dayOf, todayIn } from './dates';
import { db, type CacheRow } from './db';
import type { TidePoint } from './scoring';

export const tideKey = (station: string) => `tides:${station}`;

export function tidesUrl(station: string, fromDay: string): string {
  const q = new URLSearchParams({
    product: 'predictions', application: 'aerie', station,
    begin_date: compactDay(fromDay), end_date: compactDay(addDays(fromDay, DAYS_SHOWN)),
    datum: 'MLLW', units: 'english', time_zone: 'lst_ldt', interval: 'hilo', format: 'json',
  });
  return `https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?${q}`;
}

/** NOAA gives heights as text and may write lower lows as "LL"; normalise to numbers and H/L. */
export function parseTides(raw: any): TidePoint[] {
  return (raw?.predictions ?? []).map((p: any) => ({
    time: p.t,
    ft: Number(p.v),
    type: String(p.type).startsWith('L') ? 'L' : 'H',
  }));
}

/** Fetch one station's highs and lows and replace its cached copy. Throws, leaving the old copy, if anything is off. */
export async function refreshTides(station: string): Promise<CacheRow> {
  const res = await fetch(tidesUrl(station, todayIn(TIMEZONE)));
  if (!res.ok) throw new Error(`NOAA answered ${res.status}`);
  const data = await res.json();
  if (data?.error) throw new Error(`NOAA: ${data.error.message ?? 'error'}`);
  const pts = parseTides(data);
  if (pts.length === 0 || pts.some((p) => !p.time || !Number.isFinite(p.ft))) throw new Error('Tide predictions are missing or malformed');
  const row: CacheRow = { source: tideKey(station), fetchedAt: Date.now(), data };
  await db.cache.put(row);
  return row;
}

/** The lowest low tide of the day, for the line on each card. */
export function dayLow(tides: TidePoint[], date: string): TidePoint | null {
  return tides.filter((t) => t.type === 'L' && dayOf(t.time) === date).sort((a, b) => a.ft - b.ft)[0] ?? null;
}

/** "0.258" -> "0.3", "-0.017" -> "0.0" */
export const feet = (ft: number) => (Math.round(ft * 10) / 10 || 0).toFixed(1);
