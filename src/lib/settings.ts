import { DRIVE, HOME_DEFAULT, SHIFT } from './config';
import { db } from './db';

export interface Settings {
  homeName: string;
  lat: number;
  lng: number;
  shiftAnchor: string;
  maxDrive: number;
  /** Kept only on this device; sent only to eBird. */
  ebirdKey: string;
}

export const DEFAULT_SETTINGS: Settings = {
  homeName: 'Pearland, TX',
  lat: HOME_DEFAULT.lat,
  lng: HOME_DEFAULT.lng,
  shiftAnchor: SHIFT.anchorDate,
  maxDrive: DRIVE.default,
  ebirdKey: '',
};

export async function loadSettings(): Promise<Settings> {
  const rows = await db.settings.toArray();
  return { ...DEFAULT_SETTINGS, ...Object.fromEntries(rows.map((r) => [r.key, r.value])) };
}

export async function saveSettings(patch: Partial<Settings>): Promise<void> {
  await db.settings.bulkPut(Object.entries(patch).map(([key, value]) => ({ key, value })));
}
