import { DRIVE, HOME_DEFAULT, SCORING, SHIFT, type Weights } from './config';
import { db } from './db';

export interface Settings {
  homeName: string;
  lat: number;
  lng: number;
  shiftAnchor: string;
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
  shiftAnchor: SHIFT.anchorDate,
  maxDrive: DRIVE.default,
  ebirdKey: '',
  weights: {},
};

export const weightsOf = (s: Settings): Weights => ({ ...SCORING, ...s.weights });

export async function loadSettings(): Promise<Settings> {
  const rows = await db.settings.toArray();
  return { ...DEFAULT_SETTINGS, ...Object.fromEntries(rows.map((r) => [r.key, r.value])) };
}

export async function saveSettings(patch: Partial<Settings>): Promise<void> {
  await db.settings.bulkPut(Object.entries(patch).map(([key, value]) => ({ key, value })));
}
