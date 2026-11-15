import Dexie, { type Table } from 'dexie';
import { SEED_SPOTS, SPOT_RENAMES, SPOT_STATIONS, type Spot } from './spots';

// Only raw fetched data, settings and spots are stored. Scores are worked out on screen.
export interface CacheRow {
  source: string; // 'forecast', 'tides:<station id>', later 'birds'
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
    // Version 2 corrects two seeded spot names on devices that already have the list.
    this.version(2).stores({ cache: 'source', settings: 'key', spots: '++id' }).upgrade((tx) =>
      tx.table<Spot, number>('spots').toCollection().modify((s) => {
        if (SPOT_RENAMES[s.name]) s.name = SPOT_RENAMES[s.name];
      }));
    // Version 3 moves the two seeded tidal spots from the shared Galveston station to their nearest one,
    // only if they still have the old shared station.
    this.version(3).stores({ cache: 'source', settings: 'key', spots: '++id' }).upgrade((tx) =>
      tx.table<Spot, number>('spots').toCollection().modify((s) => {
        if (SPOT_STATIONS[s.name] && s.stationId === '8771450') s.stationId = SPOT_STATIONS[s.name];
      }));
    this.on('populate', () => { this.spots.bulkAdd(SEED_SPOTS); });
  }
}
export const db = new AerieDB();
