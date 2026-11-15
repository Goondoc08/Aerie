import { BIRDCAST, FRONT } from './config';
import { addDays, dayOf, hourOf } from './dates';
import { morningHours, type Forecast, type Hour } from './scoring';

const inNorth = (deg: number) => deg >= FRONT.northFrom || deg <= FRONT.northTo;
/** Smallest angle between two directions. */
const turn = (a: number, b: number) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };
const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

/** Hours from noon the day before through the end of the given day. */
function frontHours(f: Forecast, date: string): Hour[] {
  const prev = addDays(date, -1);
  return f.hours.filter((h) => dayOf(h.time) === date || (dayOf(h.time) === prev && hourOf(h.time) >= 12));
}

export function isFrontDay(f: Forecast, date: string): boolean {
  const day = f.hours.filter((h) => dayOf(h.time) === date);
  if (day.length === 0) return false;
  if (Math.max(...day.map((h) => h.rain)) < FRONT.rainAtLeast) return false;
  if (Math.max(...day.map((h) => h.gust)) < FRONT.gustAtLeast) return false;
  // The swing: an earlier hour outside the north arc, a later hour on this day inside it.
  const hs = frontHours(f, date);
  for (let j = 0; j < hs.length; j++) {
    if (dayOf(hs[j].time) !== date || !inNorth(hs[j].windDir)) continue;
    for (let i = 0; i < j; i++) {
      if (!inNorth(hs[i].windDir) && turn(hs[i].windDir, hs[j].windDir) >= FRONT.minSwing) return true;
    }
  }
  return false;
}

export function isClearMorning(f: Forecast, date: string): boolean {
  const am = morningHours(f, date);
  if (am.length === 0) return false;
  return avg(am.map((h) => h.wind)) <= FRONT.clearMaxWind
    && avg(am.map((h) => h.cloud)) < FRONT.clearMaxCloud
    && Math.max(...am.map((h) => h.rain)) < FRONT.clearMaxRain;
}

export const FRONT_TAG = 'Cold front passing';
export const CLEAR_TAG = 'First clear morning behind the front';

/** Tags for every forecast day (including yesterday, so a front that just passed still marks today). */
export function frontTags(f: Forecast): Record<string, string[]> {
  const tags: Record<string, string[]> = {};
  const add = (d: string, t: string) => { (tags[d] ??= []).includes(t) || tags[d].push(t); };
  const dates = f.days.map((d) => d.date);
  for (const d of dates) {
    if (!isFrontDay(f, d)) continue;
    add(d, FRONT_TAG);
    for (let k = 1; k <= FRONT.lookAheadDays; k++) {
      const next = addDays(d, k);
      if (!dates.includes(next) || isFrontDay(f, next)) break;
      if (isClearMorning(f, next)) { add(next, CLEAR_TAG); break; }
    }
  }
  return tags;
}

/** "Fall" when the date falls in a BirdCast migration season, else null. */
export function migrationSeason(date: string): string | null {
  const md = date.slice(5);
  return BIRDCAST.seasons.find((s) => md >= s.from && md <= s.to)?.name ?? null;
}
