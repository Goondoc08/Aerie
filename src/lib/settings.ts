import { DRIVE, HOME_DEFAULT, SCORING, SHIFT, type Weights } from './config';
import { db } from './db';
import type { Schedule, ScheduleMode } from './shifts';

/** A place found from a ZIP code. */
export interface Place { zip: string; name: string; lat: number; lng: number }

export interface Settings {
  homeName: string;
  lat: number;
  lng: number;
  /** ZIP the home coordinates came from, if they were looked up. */
  homeZip: string;
  /** Planning from somewhere else for now; null means home. */
  visit: Place | null;
  /** Last few places planned from, newest first, for one-tap reuse. */
  recentVisits: Place[];
  scheduleMode: ScheduleMode;
  shiftAnchor: string;
  /** Weekday schedule: 0 = Sunday ... 6 = Saturday. */
  workDays: number[];
  maxDrive: number;
  /** Kept only on this device; sent only to eBird. */
  ebirdKey: string;
  /** Score weights changed in Settings; anything missing uses config.ts. */
  weights: Partial<Weights>;
}

export const DEFAULT_SETTINGS: Settings = {
  homeName: 'Pearland, TX',
  lat: HOME_DEFAULT.lat,
  lng: HOME_DEFAULT.lng,
  homeZip: '',
  visit: null,
  recentVisits: [],
  scheduleMode: 'rotation',
  shiftAnchor: SHIFT.anchorDate,
  workDays: [],
  maxDrive: DRIVE.default,
  ebirdKey: '',
  weights: {},
};

export const scheduleOf = (s: Settings): Schedule => ({ mode: s.scheduleMode, anchor: s.shiftAnchor, weekdays: s.workDays });

/** Where the forecast, birds and drive times are worked out from: the visit, or home. */
export const placeOf = (s: Settings): { name: string; lat: number; lng: number; visiting: boolean } =>
  s.visit ? { name: s.visit.name, lat: s.visit.lat, lng: s.visit.lng, visiting: true } : { name: s.homeName, lat: s.lat, lng: s.lng, visiting: false };

export const weightsOf = (s: Settings): Weights => ({ ...SCORING, ...s.weights });

export async function loadSettings(): Promise<Settings> {
  const rows = await db.settings.toArray();
  return { ...DEFAULT_SETTINGS, ...Object.fromEntries(rows.map((r) => [r.key, r.value])) };
}

export async function saveSettings(patch: Partial<Settings>): Promise<void> {
  await db.settings.bulkPut(Object.entries(patch).map(([key, value]) => ({ key, value })));
}

/** Strip what a phone paste can carry along: spaces, line breaks, invisible characters, quotes, a "Key:" label. */
export function cleanKey(raw: string): string {
  return raw
    .replace(/[\s\u200B-\u200D\u2060\uFEFF\u00A0]+/g, '')
    .replace(/^["'\u201C\u201D\u2018\u2019]+|["'\u201C\u201D\u2018\u2019]+$/g, '')
    .replace(/^(api)?key[:=]/i, '');
}
