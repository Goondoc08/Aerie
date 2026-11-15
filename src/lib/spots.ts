export interface Spot {
  id?: number;
  name: string;
  type: string;
  lat: number;
  lng: number;
  driveMin: number; // entered by hand
  tidal: boolean;
  stationId?: string; // NOAA station, tidal spots only
}

// Starting list. Drive times are rough; everything is editable in Settings.
/** Renames applied to lists saved before the names were corrected (Nov 15, 2026). */
export const SPOT_RENAMES: Record<string, string> = {
  'John Hargrove Environmental Complex': 'Delores Fenwick Nature Center',
  'Shadow Creek Ranch Nature Trail': 'Shadow Creek Trail',
};

/** Phase 5: each tidal spot gets its nearest NOAA station instead of the shared Galveston Pier 21. */
export const SPOT_STATIONS: Record<string, string> = {
  'Texas City Dike': '8771262', // Texas City, Galveston Bay, 0.1 km
  'San Luis Pass': '8771972', // San Luis Pass, 2.4 km
};

export const SEED_SPOTS: Spot[] = [
  { name: 'Delores Fenwick Nature Center', type: 'Ponds and rookery islands', lat: 29.5456, lng: -95.3088, driveMin: 10, tidal: false },
  { name: 'Shadow Creek Trail', type: 'Wetland and prairie', lat: 29.5808, lng: -95.4166, driveMin: 15, tidal: false },
  { name: 'El Franco Lee Park', type: 'Wetland ponds', lat: 29.5854, lng: -95.2545, driveMin: 15, tidal: false },
  { name: 'Brazos Bend State Park', type: 'Inland lakes and marsh', lat: 29.3738, lng: -95.6229, driveMin: 40, tidal: false },
  { name: 'Texas City Dike', type: 'Open bay shoreline', lat: 29.3903, lng: -94.8861, driveMin: 40, tidal: true, stationId: '8771262' },
  { name: 'Brazoria NWR', type: 'Coastal marsh and ponds', lat: 29.0599, lng: -95.2683, driveMin: 50, tidal: false },
  { name: 'San Luis Pass', type: 'Tidal flats', lat: 29.0796, lng: -95.1311, driveMin: 60, tidal: true, stationId: '8771972' },
  { name: 'Quintana Neotropical Bird Sanctuary', type: 'Migrant woodlot', lat: 28.9335, lng: -95.3085, driveMin: 65, tidal: false },
];
