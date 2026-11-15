// Nearest NOAA tide-prediction station, for the spot editor. Fetched on demand, kept in memory only.
import { km } from './geo';

export interface Station { id: string; name: string; lat: number; lng: number }

const URL_ = 'https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations.json?type=tidepredictions';
let cache: Station[] | null = null;

export async function loadStations(): Promise<Station[]> {
  if (cache) return cache;
  const res = await fetch(URL_);
  if (!res.ok) throw new Error(`NOAA answered ${res.status}`);
  const body = await res.json();
  cache = (body?.stations ?? [])
    .map((s: any) => ({ id: String(s.id), name: String(s.name), lat: Number(s.lat), lng: Number(s.lng) }))
    .filter((s: Station) => Number.isFinite(s.lat) && Number.isFinite(s.lng));
  return cache!;
}

export function nearestStations(stations: Station[], lat: number, lng: number, n = 3) {
  return stations
    .map((s) => ({ ...s, km: km(lat, lng, s.lat, s.lng) }))
    .sort((a, b) => a.km - b.km)
    .slice(0, n);
}
