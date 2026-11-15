import Dexie, { type Table } from 'dexie';
import { SEED_SPOTS, type Spot } from './spots';

// Only raw fetched data, settings and spots are stored. Scores are worked out on screen.
export interface CacheRow {
  source: 'forecast' | 'tides' | 'birds';
  fetchedAt: number;
  data: unknown;
  lat?: number;
  lng?: number;
}
export interface SettingRow { key: string; value: unknown }

class AerieDB extends Dexie {
  cache!: Table<CacheRow, string>;
  settings!: Table<SettingRow, string>;
  spots!: Table<Spot, number>;
  constructor() {
    super('aerie');
    this.version(1).stores({ cache: 'source', settings: 'key', spots: '++id' });
    this.on('populate', () => { this.spots.bulkAdd(SEED_SPOTS); });
  }
}
export const db = new AerieDB();
