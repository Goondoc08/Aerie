import { TIMEZONE } from './config';
import { db, type CacheRow } from './db';

const FIELDS = ['temperature_2m', 'wind_speed_10m', 'wind_gusts_10m', 'wind_direction_10m', 'cloud_cover', 'precipitation_probability'];

export function forecastUrl(lat: number, lng: number): string {
  const q = new URLSearchParams({
    latitude: String(lat), longitude: String(lng),
    hourly: FIELDS.join(','), daily: 'sunrise,sunset',
    temperature_unit: 'fahrenheit', wind_speed_unit: 'mph',
    timezone: TIMEZONE, forecast_days: '10',
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
