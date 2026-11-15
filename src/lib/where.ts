// "Where to go": each spot's score for both windows, and the best bet.
import { temporaryBirds, type BirdGroup } from './birds';
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
  /** A Lingering, Returning or Confirmed bird here: the spot moves to the top with a coral tag. */
  bird?: BirdGroup;
  /** A single unreviewed report here: a grey "reported once" tag, nothing moves. */
  watch?: BirdGroup;
  /** A temporary entry, there only while the bird keeps being reported. */
  temp?: boolean;
  /** Drive time is a straight-line estimate. */
  driveEstimated?: boolean;
  /** This spot's own forecast was used (phase 5); otherwise the home forecast. */
  ownForecast?: boolean;
}

/** Tide predictions by NOAA station id. */
export type TideMap = Record<string, TidePoint[] | undefined>;

export interface SpotOptions {
  /** Sightings that passed the filter; pass them only on days they apply (the next four). */
  birds?: BirdGroup[];
  /** A spot's own window scores, when it has its own forecast. */
  base?: (spot: Spot) => { morning: number | null; evening: number | null } | null;
}

export const TEMP_TYPE = 'temporary, while the bird keeps being reported';

function windowFor(spot: Spot, base: number | null, tides: TidePoint[] | null, date: string, which: Which, sunset: string): SpotWindow {
  if (!spot.tidal || !tides || base == null) return { score: base, low: null, adj: 0 };
  const low = lowTideInWindow(tides, date, which, sunset);
  const adj = tideAdjustment(low);
  return { score: clamp(base + adj), low, adj };
}

/**
 * Every spot, nearest first. Spots beyond the max drive stay in the list, marked out of range.
 * On bird days, temporary entries come first, then my spots with a qualifying bird.
 */
export function rankSpots(spots: Spot[], day: DayScore, sunset: string, tides: TideMap, maxDrive: number, opts: SpotOptions = {}): SpotRow[] {
  const birds = opts.birds ?? [];
  const row = (spot: Spot): SpotRow => {
    const own = opts.base?.(spot) ?? null;
    const base = own ?? { morning: day.morning, evening: day.evening };
    const all = spot.tidal && spot.stationId ? tides[spot.stationId] : undefined;
    // Only trust a station's tides for days its predictions actually cover.
    const covered = all && all.some((t) => dayOf(t.time) === day.date) ? all : null;
    const here = spot.id != null ? birds.filter((b) => b.spotId === spot.id) : [];
    return {
      spot,
      inRange: spot.driveMin <= maxDrive,
      tideMissing: spot.tidal && !covered,
      morning: windowFor(spot, base.morning, covered, day.date, 'morning', sunset),
      evening: windowFor(spot, base.evening, covered, day.date, 'evening', sunset),
      bird: here.find((b) => b.qualifies),
      watch: here.some((b) => b.qualifies) ? undefined : here[0],
      ownForecast: own != null,
    };
  };

  const mine = [...spots].sort((a, b) => a.driveMin - b.driveMin || a.name.localeCompare(b.name)).map(row);
  const temps = temporaryBirds(birds).map((g) => ({
    ...row({ name: g.locName, type: TEMP_TYPE, lat: g.lat, lng: g.lng, driveMin: g.driveMin, tidal: false }),
    bird: g, temp: true, driveEstimated: g.driveEstimated,
  }));
  return [...temps, ...mine.filter((r) => r.bird), ...mine.filter((r) => !r.bird)];
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
