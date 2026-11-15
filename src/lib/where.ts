// "Where to go": each spot's score for both windows, and the best bet.
import { dayOf } from './dates';
import { clamp, lowTideInWindow, tideAdjustment, type DayScore, type TidePoint } from './scoring';
import type { Spot } from './spots';

export type Which = 'morning' | 'evening';

export interface SpotWindow {
  score: number | null;
  /** The low tide used, for tidal spots. */
  low: TidePoint | null;
  /** Points added or taken off for the tide; 0 for inland spots. */
  adj: number;
}

export interface SpotRow {
  spot: Spot;
  inRange: boolean;
  /** True for a tidal spot whose station has no predictions for this day. */
  tideMissing: boolean;
  morning: SpotWindow;
  evening: SpotWindow;
}

/** Tide predictions by NOAA station id. */
export type TideMap = Record<string, TidePoint[] | undefined>;

function windowFor(spot: Spot, base: number | null, tides: TidePoint[] | null, date: string, which: Which, sunset: string): SpotWindow {
  if (!spot.tidal || !tides || base == null) return { score: base, low: null, adj: 0 };
  const low = lowTideInWindow(tides, date, which, sunset);
  const adj = tideAdjustment(low);
  return { score: clamp(base + adj), low, adj };
}

/** Every spot, nearest first. Spots beyond the max drive stay in the list, marked out of range. */
export function rankSpots(spots: Spot[], day: DayScore, sunset: string, tides: TideMap, maxDrive: number): SpotRow[] {
  return [...spots]
    .sort((a, b) => a.driveMin - b.driveMin || a.name.localeCompare(b.name))
    .map((spot) => {
      const all = spot.tidal && spot.stationId ? tides[spot.stationId] : undefined;
      // Only trust a station's tides for days its predictions actually cover.
      const covered = all && all.some((t) => dayOf(t.time) === day.date) ? all : null;
      return {
        spot,
        inRange: spot.driveMin <= maxDrive,
        tideMissing: spot.tidal && !covered,
        morning: windowFor(spot, day.morning, covered, day.date, 'morning', sunset),
        evening: windowFor(spot, day.evening, covered, day.date, 'evening', sunset),
      };
    });
}

export interface BestBet { row: SpotRow; which: Which; score: number }

/** The in-range spot and window with the highest score; ties go to the shorter drive, then the morning. */
export function bestBet(rows: SpotRow[]): BestBet | null {
  let best: BestBet | null = null;
  for (const row of rows) {
    if (!row.inRange) continue;
    for (const which of ['morning', 'evening'] as const) {
      const score = row[which].score;
      if (score == null) continue;
      if (!best || score > best.score || (score === best.score && row.spot.driveMin < best.row.spot.driveMin)) {
        best = { row, which, score };
      }
    }
  }
  return best;
}
