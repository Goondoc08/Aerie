import { CONFIDENCE, SCORING, TIDE, VERDICTS, WINDOWS, type VerdictWord, type Weights } from './config';
import { dayOf, daysBetween, hourOf, minutesOf } from './dates';
import { isShiftDay } from './shifts';

export interface Hour {
  time: string; // "2026-11-17T07:00"
  temp: number;
  wind: number;
  gust: number;
  windDir: number;
  cloud: number;
  rain: number;
}

export interface Forecast {
  hours: Hour[];
  days: { date: string; sunrise: string; sunset: string }[];
}

/** Turn the raw Open-Meteo response into rows. */
export function parseForecast(raw: any): Forecast {
  const h = raw.hourly;
  const hours: Hour[] = h.time.map((time: string, i: number) => ({
    time,
    temp: h.temperature_2m[i],
    wind: h.wind_speed_10m[i],
    gust: h.wind_gusts_10m[i],
    windDir: h.wind_direction_10m[i],
    cloud: h.cloud_cover[i],
    rain: h.precipitation_probability[i],
  }));
  const days = raw.daily.time.map((date: string, i: number) => ({
    date,
    sunrise: raw.daily.sunrise[i],
    sunset: raw.daily.sunset[i],
  }));
  return { hours, days };
}

export function morningHours(f: Forecast, date: string): Hour[] {
  return f.hours.filter((h) => dayOf(h.time) === date && WINDOWS.morningHours.includes(hourOf(h.time)));
}

/** The last N hourly marks that fall before sunset. */
export function eveningHours(f: Forecast, date: string, sunset: string): Hour[] {
  const cutoff = minutesOf(sunset);
  return f.hours
    .filter((h) => dayOf(h.time) === date && minutesOf(h.time) < cutoff)
    .slice(-WINDOWS.eveningHourCount);
}

const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

/** The one scoring rule, used for both windows. Returns null when there is no data. */
export function scoreWindow(hours: Hour[], S: Weights = SCORING): number | null {
  const ok = hours.filter((h) => [h.wind, h.gust, h.cloud, h.rain].every((v) => v != null));
  if (ok.length === 0) return null;
  const wind = avg(ok.map((h) => h.wind));
  const gust = Math.max(...ok.map((h) => h.gust));
  const rain = Math.max(...ok.map((h) => h.rain));
  const cloud = avg(ok.map((h) => h.cloud));
  let score = S.start;
  score -= Math.max(0, wind - S.windFreeMph) * S.windPerMph;
  score -= Math.max(0, gust - S.gustFreeMph) * S.gustPerMph;
  score -= rain * S.rainPerPercent;
  if (cloud > S.cloudHeavyAbove) score -= S.cloudHeavyPenalty;
  else if (cloud >= S.cloudPartFrom) score -= S.cloudPartPenalty;
  return clamp(score);
}

export const clamp = (n: number) => Math.round(Math.min(100, Math.max(0, n)));

export function verdict(score: number): VerdictWord {
  return VERDICTS.find((v) => score >= v.min)!.word;
}

export interface TidePoint {
  time: string; // "2026-11-17 14:37" or with a T
  ft: number;
  type: 'H' | 'L';
}

export function lowTideInWindow(
  tides: TidePoint[], date: string, which: 'morning' | 'evening', sunset: string,
): TidePoint | null {
  const from = (which === 'morning' ? TIDE.morningFromHour : TIDE.eveningFromHour) * 60;
  const to = which === 'morning' ? TIDE.morningToHour * 60 : minutesOf(sunset);
  const lows = tides.filter((t) => {
    const m = minutesOf(t.time);
    return t.type === 'L' && dayOf(t.time) === date && m >= from && m <= to;
  });
  return lows.sort((a, b) => a.ft - b.ft)[0] ?? null;
}

/** Points a tidal spot adds to (or takes from) a window's score. */
export function tideAdjustment(low: TidePoint | null): number {
  if (!low) return -TIDE.noLowPenalty;
  if (low.ft <= TIDE.goodAtOrBelowFt) return TIDE.goodBonus;
  if (low.ft > TIDE.poorAboveFt) return -TIDE.poorPenalty;
  return 0;
}

export function confidence(dayNumber: number): string {
  return CONFIDENCE.find((c) => dayNumber <= c.throughDay)!.label;
}

export interface DayScore {
  date: string;
  shift: boolean;
  morning: number | null;
  evening: number | null;
  confidence: string;
}

/** Up to `count` days starting at `today`; older cached days are dropped. */
export function scoreWeek(f: Forecast, today: string, count: number, anchorDate?: string, w: Weights = SCORING): DayScore[] {
  return f.days
    .filter((d) => d.date >= today)
    .slice(0, count)
    .map((d) => ({
      date: d.date,
      shift: isShiftDay(d.date, anchorDate),
      morning: scoreWindow(morningHours(f, d.date), w),
      evening: scoreWindow(eveningHours(f, d.date, d.sunset), w),
      confidence: confidence(daysBetween(today, d.date) + 1),
    }));
}

/** Window scores for one day from a forecast (used for a spot's own forecast). */
export function dayWindows(f: Forecast, date: string, w: Weights = SCORING): { morning: number | null; evening: number | null } | null {
  const d = f.days.find((x) => x.date === date);
  if (!d) return null;
  return { morning: scoreWindow(morningHours(f, date), w), evening: scoreWindow(eveningHours(f, date, d.sunset), w) };
}

/** Highest-scoring window on a non-shift day; ties go to the earlier one. */
export function bestOpenWindow(days: DayScore[]): { date: string; which: 'morning' | 'evening'; score: number } | null {
  let best: { date: string; which: 'morning' | 'evening'; score: number } | null = null;
  for (const d of days) {
    if (d.shift) continue;
    for (const which of ['morning', 'evening'] as const) {
      const score = d[which];
      if (score != null && (!best || score > best.score)) best = { date: d.date, which, score };
    }
  }
  return best;
}

const avgOf = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
export const compass = (deg: number) => COMPASS[Math.round(deg / 45) % 8];

/** The one-line reason, e.g. "Light wind, clear, 50°F at 7." */
export function reason(hours: Hour[], at: string, w: Weights = SCORING): string {
  if (hours.length === 0) return 'No forecast for this window yet.';
  const wind = avgOf(hours.map((h) => h.wind));
  const gust = Math.max(...hours.map((h) => h.gust));
  const cloud = avgOf(hours.map((h) => h.cloud));
  const rain = Math.max(...hours.map((h) => h.rain));
  const parts = [wind <= 9 ? 'light wind' : wind <= 12 ? 'moderate wind' : 'windy'];
  if (gust > 25) parts.push(`gusts to ${Math.round(gust)}`);
  parts.push(cloud > w.cloudHeavyAbove ? 'overcast' : cloud >= w.cloudPartFrom ? 'mixed cloud' : 'clear');
  if (rain >= 15) parts.push(`${rain}% rain chance`);
  const text = parts.join(', ');
  return `${text[0].toUpperCase()}${text.slice(1)}, ${Math.round(hours[0].temp)}°F at ${at}.`;
}
