import { TIMEZONE } from './config';
import { db, type CacheRow } from './db';

const FIELDS = ['temperature_2m', 'wind_speed_10m', 'wind_gusts_10m', 'wind_direction_10m', 'cloud_cover', 'precipitation_probability'];

/** One location, or several comma-separated (Open-Meteo then answers with a list, in the same order). */
export function forecastUrl(lat: number | string, lng: number | string): string {
  const q = new URLSearchParams({
    latitude: String(lat), longitude: String(lng),
    hourly: FIELDS.join(','), daily: 'sunrise,sunset',
    temperature_unit: 'fahrenheit', wind_speed_unit: 'mph',
    timezone: TIMEZONE, forecast_days: '10',
    past_days: '1', // yesterday too, so a front that passed overnight still tags this morning
  });
  return `https://api.open-meteo.com/v1/forecast?${q}`;
}

/** Fetch the forecast and replace the cached copy. Throws if anything is off, leaving the old copy in place. */
export async function refreshForecast(lat: number, lng: number): Promise<CacheRow> {
  const res = await fetch(forecastUrl(lat, lng));
  if (!res.ok) throw new Error(`Open-Meteo answered ${res.status}`);
  const data = await res.json();
  for (const f of FIELDS) if (!Array.isArray(data?.hourly?.[f])) throw new Error(`Forecast is missing ${f}`);
  if (!Array.isArray(data?.daily?.sunset)) throw new Error('Forecast is missing sunset');
  const row: CacheRow = { source: 'forecast', fetchedAt: Date.now(), data, lat, lng };
  await db.cache.put(row);
  return row;
}

export interface Point { lat: number; lng: number }
/** Spots closer than about 1 km share a forecast; Open-Meteo's grid is coarser than that anyway. */
export const pointKey = (p: Point) => `${p.lat.toFixed(2)},${p.lng.toFixed(2)}`;
export const SPOT_FORECASTS = 'forecast:spots';

/** Every spot's forecast in one request. Stored raw as { keys, results } in request order. */
export async function refreshSpotForecasts(points: Point[]): Promise<CacheRow> {
  const unique = [...new Map(points.map((p) => [pointKey(p), p])).entries()];
  if (unique.length === 0) throw new Error('No spots to forecast');
  const res = await fetch(forecastUrl(unique.map(([, p]) => p.lat.toFixed(4)).join(','), unique.map(([, p]) => p.lng.toFixed(4)).join(',')));
  if (!res.ok) throw new Error(`Open-Meteo answered ${res.status}`);
  const body = await res.json();
  const results = Array.isArray(body) ? body : [body];
  if (results.length !== unique.length) throw new Error('Open-Meteo returned the wrong number of spot forecasts');
  for (const r of results) for (const f of FIELDS) if (!Array.isArray(r?.hourly?.[f])) throw new Error(`Spot forecast is missing ${f}`);
  const row: CacheRow = { source: SPOT_FORECASTS, fetchedAt: Date.now(), data: { keys: unique.map(([k]) => k), results } };
  await db.cache.put(row);
  return row;
}
