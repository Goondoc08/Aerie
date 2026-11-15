// Hotspot suggestions (phase 5): eBird hotspots near home, ranked by recent activity.
// Fetched only when asked for in Settings, so it costs a handful of eBird calls at most.
import { BIRDS } from './config';
import { db, type CacheRow } from './db';
import { estimateDrive, km } from './geo';
import type { Spot } from './spots';

const API = 'https://api.ebird.org/v2';
const MAX_COUNTIES = 4;
const LIST_SIZE = 200;
export const HOTSPOTS = 'hotspots';

export interface Suggestion {
  locId: string;
  name: string;
  lat: number;
  lng: number;
  /** Checklists at this hotspot among its county's most recent 200. */
  checklists: number;
  species?: number;
  latest?: string;
  driveMin: number;
}

const get = async (url: string, key: string) => {
  const res = await fetch(url, { headers: { 'x-ebirdapitoken': key } });
  if (res.status === 401 || res.status === 403) throw new Error('eBird did not accept the key');
  if (!res.ok) throw new Error(`eBird answered ${res.status}`);
  return res.json();
};

/** Hotspots with sightings this week within 50 km, plus each busy county's recent checklists. */
export async function refreshHotspots(lat: number, lng: number, key: string): Promise<CacheRow> {
  const q = new URLSearchParams({ lat: lat.toFixed(4), lng: lng.toFixed(4), dist: String(BIRDS.radiusKm), back: '7', fmt: 'json' });
  const hotspots = await get(`${API}/ref/hotspot/geo?${q}`, key);
  if (!Array.isArray(hotspots)) throw new Error('eBird hotspot reply is not a list');
  const counties = countBy(hotspots.map((h: any) => h.subnational2Code).filter(Boolean))
    .slice(0, MAX_COUNTIES).map(([c]) => c);
  const lists: Record<string, unknown[]> = {};
  for (const c of counties) {
    try { lists[c] = await get(`${API}/product/lists/${c}?maxResults=${LIST_SIZE}`, key); } catch { lists[c] = []; }
  }
  const row: CacheRow = { source: HOTSPOTS, fetchedAt: Date.now(), data: { hotspots, lists }, lat, lng };
  await db.cache.put(row);
  return row;
}

function countBy(xs: string[]): [string, number][] {
  const m = new Map<string, number>();
  for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

/**
 * Rank: most recent checklists first, then most species all time. Hotspots within 1 km of one of
 * my spots are left out. If no checklist counts came back, species count alone decides.
 */
export function rankHotspots(data: { hotspots: any[]; lists: Record<string, any[]> }, home: { lat: number; lng: number }, spots: Spot[], limit = 10): Suggestion[] {
  const counts = new Map<string, number>();
  for (const list of Object.values(data.lists ?? {})) {
    for (const c of Array.isArray(list) ? list : []) {
      const id = c?.locId ?? c?.loc?.locId;
      if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  }
  return (data.hotspots ?? [])
    .filter((h) => h?.locId && Number.isFinite(h.lat) && Number.isFinite(h.lng))
    .filter((h) => !spots.some((s) => km(h.lat, h.lng, s.lat, s.lng) < 1))
    .map((h): Suggestion => ({
      locId: h.locId, name: h.locName ?? h.locId, lat: h.lat, lng: h.lng,
      checklists: counts.get(h.locId) ?? 0, species: h.numSpeciesAllTime, latest: h.latestObsDt,
      driveMin: estimateDrive(home.lat, home.lng, h.lat, h.lng),
    }))
    .sort((a, b) => b.checklists - a.checklists || (b.species ?? 0) - (a.species ?? 0) || a.driveMin - b.driveMin)
    .slice(0, limit);
}
