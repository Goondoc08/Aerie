// Unusual birds: eBird notable reports, filtered, grouped and labelled.
import { BIRDS } from './config';
import { dayOf } from './dates';
import { db, type CacheRow } from './db';
import { estimateDrive, km } from './geo';
import type { Spot } from './spots';

export interface Report {
  speciesCode: string;
  comName: string;
  sciName?: string;
  locId: string;
  locName: string;
  obsDt: string; // "2026-11-13 07:00", local time
  howMany?: number;
  lat: number;
  lng: number;
  obsValid: boolean;
  obsReviewed: boolean;
  locationPrivate: boolean;
  subId?: string;
}

export type Label = 'Lingering' | 'Returning' | 'Confirmed' | 'Watch';

export interface BirdGroup {
  key: string;
  comName: string;
  locId: string;
  locName: string;
  lat: number;
  lng: number;
  /** Distinct dates reported, oldest first. */
  days: string[];
  latest: string;
  reports: number;
  confirmed: boolean;
  label: Label;
  /** Lingering, Returning and Confirmed birds move spots; Watch birds only tag. */
  qualifies: boolean;
  /** A subspecies or form, written with brackets, e.g. "Yellow-rumped Warbler (Audubon's)". */
  form: boolean;
  /** The id of my spot this report is at, if any. */
  spotId?: number;
  driveMin: number;
  driveEstimated: boolean;
}

export const ebirdUrl = (lat: number, lng: number) =>
  `https://api.ebird.org/v2/data/obs/geo/recent/notable?${new URLSearchParams({
    lat: lat.toFixed(4), lng: lng.toFixed(4), dist: String(BIRDS.radiusKm), back: String(BIRDS.backDays),
  })}`;

/** Fetch notable reports and replace the cached copy. The key is sent only to eBird, in a header. */
export async function refreshBirds(lat: number, lng: number, key: string): Promise<CacheRow> {
  const res = await fetch(ebirdUrl(lat, lng), { headers: { 'x-ebirdapitoken': key } });
  if (res.status === 401 || res.status === 403) throw new Error('eBird did not accept the key');
  if (!res.ok) throw new Error(`eBird answered ${res.status}`);
  const data = await res.json();
  if (!Array.isArray(data)) throw new Error('eBird reply is not a list');
  for (const f of ['comName', 'locId', 'locName', 'obsDt', 'lat', 'lng'] as const) {
    if (data.some((r: any) => r?.[f] == null)) throw new Error(`eBird reports are missing ${f}`);
  }
  const row: CacheRow = { source: 'birds', fetchedAt: Date.now(), data, lat, lng };
  await db.cache.put(row);
  return row;
}

const isHybrid = (name: string) => /\(hybrid\)|\shybrid\b| x /i.test(name);
const isSp = (name: string) => /\bsp\.(\s|\)|$)/i.test(name);
const isForm = (name: string) => /\(.*\)|\[.*\]/.test(name);

/** "2026-11-13 07:00" or "2026-11-13" as a number we can subtract (all times are local, so no timezone maths). */
const ms = (s: string) => Date.parse(`${s.slice(0, 10)}T${s.length > 10 ? s.slice(11, 16) : '00:00'}:00Z`);

export interface Where { lat: number; lng: number; spots: Spot[] }

/**
 * The filter and labels from the brief:
 * drop private locations, hybrids and "sp."; group by species and location; drop groups whose
 * latest report is more than 4 days old; label Lingering / Returning / Confirmed / Watch.
 * `nowLocal` is the current local time, "2026-11-14T23:30".
 */
export function analyseBirds(reports: Report[], nowLocal: string, where: Where): BirdGroup[] {
  const groups = new Map<string, Report[]>();
  for (const r of reports) {
    if (r.locationPrivate) continue;
    if (isHybrid(r.comName) || isSp(r.comName)) continue;
    const key = `${r.comName}|${r.locId}`;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  const now = ms(nowLocal.replace('T', ' '));
  const out: BirdGroup[] = [];
  for (const [key, rs] of groups) {
    const latest = rs.map((r) => r.obsDt).sort().at(-1)!;
    if (now - ms(latest) > BIRDS.maxAgeDays * 86400000) continue;
    const days = [...new Set(rs.map((r) => dayOf(r.obsDt)))].sort();
    const confirmed = rs.some((r) => r.obsReviewed && r.obsValid);
    const label: Label =
      days.length >= BIRDS.lingeringDays ? 'Lingering'
      : days.length >= BIRDS.returningDays ? 'Returning'
      : confirmed ? 'Confirmed' : 'Watch';
    const first = rs[0];
    const spot = where.spots
      .map((s) => ({ s, d: km(first.lat, first.lng, s.lat, s.lng) }))
      .filter((x) => x.d <= BIRDS.atSpotKm)
      .sort((a, b) => a.d - b.d)[0]?.s;
    out.push({
      key, comName: first.comName, locId: first.locId, locName: first.locName, lat: first.lat, lng: first.lng,
      days, latest, reports: rs.length, confirmed, label, qualifies: label !== 'Watch', form: isForm(first.comName),
      spotId: spot?.id,
      driveMin: spot ? spot.driveMin : estimateDrive(where.lat, where.lng, first.lat, first.lng),
      driveEstimated: !spot,
    });
  }
  // Panel order: strongest label first, then more days, then shorter drive.
  const rank: Record<Label, number> = { Lingering: 0, Returning: 1, Confirmed: 2, Watch: 3 };
  return out.sort((a, b) => rank[a.label] - rank[b.label] || b.days.length - a.days.length || a.driveMin - b.driveMin);
}

/** Candidates for temporary entries: qualifying birds away from my spots, ranked, at most two. */
export function temporaryBirds(groups: BirdGroup[]): BirdGroup[] {
  return groups
    .filter((g) => g.qualifies && g.spotId == null)
    .sort((a, b) => Number(a.form) - Number(b.form) || b.days.length - a.days.length || a.driveMin - b.driveMin)
    .slice(0, BIRDS.maxTemporary);
}

/** True when sightings may change the spot list on this day (the next four days). */
export const birdsApply = (dayIndex: number) => dayIndex < BIRDS.affectsNextDays;

/** "Reported on 4 days, Nov 10 to 13. Not yet reviewed." */
export function birdNote(g: BirdGroup): string {
  const md = (d: string) => new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' }).format(new Date(ms(d)));
  const first = g.days[0], last = g.days.at(-1)!;
  const span = g.days.length === 1 ? `on ${md(first)}`
    : first.slice(0, 7) === last.slice(0, 7) ? `${md(first)} to ${Number(last.slice(8))}` : `${md(first)} to ${md(last)}`;
  const n = g.days.length;
  const when = n === 1 ? `Reported ${span}.` : `Reported on ${n} days, ${span}.`;
  return `${when} ${g.confirmed ? 'Reviewer confirmed.' : 'Not yet reviewed.'}`;
}
