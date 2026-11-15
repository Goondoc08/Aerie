import { describe, expect, it } from 'vitest';
import { SCORING } from './config';
import { forecastUrl, pointKey } from './forecast';
import { rankHotspots } from './hotspots';
import { dayWindows, scoreWindow, type DayScore, type Forecast, type Hour } from './scoring';
import { SEED_SPOTS } from './spots';
import { nearestStations } from './stations';
import { rankSpots } from './where';

const hour = (time: string, o: Partial<Hour> = {}): Hour => ({ time, temp: 60, wind: 4, gust: 8, windDir: 0, cloud: 0, rain: 0, ...o });
const home = { lat: 29.5633, lng: -95.2861 };

describe('per-spot forecasts', () => {
  it('asks Open-Meteo for several places in one request', () => {
    const u = new URL(forecastUrl('29.5456,29.3903', '-95.3088,-94.8861'));
    expect(u.searchParams.get('latitude')).toBe('29.5456,29.3903');
    expect(u.searchParams.get('past_days')).toBe('1');
  });
  it('spots about a kilometre apart share a forecast key', () => {
    expect(pointKey({ lat: 29.5456, lng: -95.3088 })).toBe(pointKey({ lat: 29.5462, lng: -95.3091 }));
  });
  it('a spot with its own forecast scores from it; others use home', () => {
    const windy: Forecast = {
      hours: [7, 8, 9, 10, 15, 16].map((h) => hour(`2026-11-17T${String(h).padStart(2, '0')}:00`, { wind: 16 })),
      days: [{ date: '2026-11-17', sunrise: '2026-11-17T06:47', sunset: '2026-11-17T17:24' }],
    };
    const day: DayScore = { date: '2026-11-17', shift: false, morning: 87, evening: 94, confidence: 'sharp' };
    const tcd = SEED_SPOTS.find((s) => s.name === 'Texas City Dike')!;
    const rows = rankSpots(SEED_SPOTS, day, '2026-11-17T17:24', {}, 90, {
      base: (s) => (pointKey(s) === pointKey(tcd) ? dayWindows(windy, day.date) : null),
    });
    const r = rows.find((x) => x.spot.name === 'Texas City Dike')!;
    expect([r.morning.score, r.evening.score, r.ownForecast]).toEqual([50, 50, true]); // 100 - (16-6)*5
    expect(rows.find((x) => x.spot.name === 'Brazos Bend State Park')!.morning.score).toBe(87);
  });
});

describe('editable weights', () => {
  it('the same hours score differently with different weights', () => {
    const hs = [hour('2026-11-17T07:00', { wind: 10 })];
    expect(scoreWindow(hs)).toBe(80);
    expect(scoreWindow(hs, { ...SCORING, windPerMph: 2 })).toBe(92);
    expect(scoreWindow(hs, { ...SCORING, windFreeMph: 10 })).toBe(100);
  });
});

describe('tide stations', () => {
  const stations = [
    { id: '8771450', name: 'Galveston Pier 21', lat: 29.31, lng: -94.7933 },
    { id: '8771262', name: 'Texas City, Galveston Bay', lat: 29.3903, lng: -94.8867 },
    { id: '8771972', name: 'San Luis Pass', lat: 29.0806, lng: -95.1547 },
  ];
  it('each tidal seed spot has its own nearest station', () => {
    for (const s of SEED_SPOTS.filter((x) => x.tidal)) {
      expect(nearestStations(stations, s.lat, s.lng, 1)[0].id).toBe(s.stationId);
    }
  });
});

describe('hotspot suggestions', () => {
  const data = {
    hotspots: [
      { locId: 'L1', locName: 'Busy Park', lat: 29.6, lng: -95.3, numSpeciesAllTime: 150, subnational2Code: 'US-TX-201' },
      { locId: 'L2', locName: 'Big List Marsh', lat: 29.5, lng: -95.2, numSpeciesAllTime: 300, subnational2Code: 'US-TX-039' },
      { locId: 'L3', locName: 'Quiet Pond', lat: 29.55, lng: -95.25, numSpeciesAllTime: 80, subnational2Code: 'US-TX-039' },
      { locId: 'L4', locName: 'Already Mine', lat: 29.3738, lng: -95.6229, numSpeciesAllTime: 400, subnational2Code: 'US-TX-157' },
    ],
    lists: {
      'US-TX-201': [{ locId: 'L1' }, { locId: 'L1' }, { locId: 'L1' }, { loc: { locId: 'L2' } }],
      'US-TX-039': [{ locId: 'L3' }],
    },
  };
  it('busiest first, then most species; my own spots are left out', () => {
    const r = rankHotspots(data, home, SEED_SPOTS);
    expect(r.map((h) => [h.name, h.checklists])).toEqual([['Busy Park', 3], ['Big List Marsh', 1], ['Quiet Pond', 1]]);
    expect(r[0].driveMin).toBeGreaterThan(0);
  });
  it('falls back to species count when no checklists came back', () => {
    expect(rankHotspots({ ...data, lists: {} }, home, SEED_SPOTS).map((h) => h.locId)).toEqual(['L2', 'L1', 'L3']);
  });
});
