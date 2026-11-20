// ZIP code to a place. Zippopotam gives the ZIP's own centre; Open-Meteo's geocoder is the fallback
// (it answers with the town the ZIP belongs to). Both accept browser calls and need no key.
import type { Place } from './settings';

/** "77581" or "77581-1234" to "77581"; null when it is not a US ZIP. */
export function normalZip(raw: string): string | null {
  const m = raw.trim().match(/^(\d{5})(-\d{4})?$/);
  return m ? m[1] : null;
}

export function parseZippopotam(zip: string, body: any): Place | null {
  const p = body?.places?.[0];
  const lat = Number(p?.latitude), lng = Number(p?.longitude);
  if (!p || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const state = p['state abbreviation'] ? `, ${p['state abbreviation']}` : '';
  return { zip, name: `${p['place name'] ?? zip}${state}`, lat, lng };
}

export function parseOpenMeteo(zip: string, body: any): Place | null {
  const r = (body?.results ?? []).find((x: any) => (x.postcodes ?? []).includes(zip)) ?? null;
  if (!r || !Number.isFinite(r.latitude) || !Number.isFinite(r.longitude)) return null;
  return { zip, name: r.admin1 === 'Texas' ? `${r.name}, TX` : `${r.name}${r.admin1 ? `, ${r.admin1}` : ''}`, lat: r.latitude, lng: r.longitude };
}

export async function lookupZip(raw: string): Promise<Place> {
  const zip = normalZip(raw);
  if (!zip) throw new Error('Enter a 5-digit ZIP code.');
  try {
    const res = await fetch(`https://api.zippopotam.us/us/${zip}`);
    if (res.status === 404) throw new Error(`No place found for ZIP ${zip}.`);
    if (res.ok) {
      const p = parseZippopotam(zip, await res.json());
      if (p) return p;
    }
  } catch (e) {
    if (e instanceof Error && e.message.startsWith('No place')) throw e;
    // Network trouble: try the fallback.
  }
  const q = new URLSearchParams({ name: zip, count: '10', countryCode: 'US', format: 'json' });
  const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?${q}`);
  if (!res.ok) throw new Error('Could not look up the ZIP code.');
  const p = parseOpenMeteo(zip, await res.json());
  if (!p) throw new Error(`No place found for ZIP ${zip}.`);
  return p;
}
