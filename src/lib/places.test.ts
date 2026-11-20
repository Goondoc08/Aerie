import { describe, expect, it } from 'vitest';
import { estimateDrive } from './geo';
import { DEFAULT_SETTINGS, placeOf, scheduleOf } from './settings';
import { isWorkDay, weekdayOf } from './shifts';
import { SEED_SPOTS } from './spots';
import { rankSpots } from './where';
import { normalZip, parseOpenMeteo, parseZippopotam } from './zip';

describe('work-day schedule', () => {
  it('rotation keeps the old pattern', () => {
    const s = { mode: 'rotation' as const, anchor: '2026-11-14', weekdays: [] };
    expect(['2026-11-14', '2026-11-15', '2026-11-16', '2026-11-20'].map((d) => isWorkDay(d, s))).toEqual([true, true, false, true]);
  });
  it('set days darken the same weekdays every week', () => {
    expect(weekdayOf('2026-11-16')).toBe(1); // a Monday
    const s = { mode: 'weekdays' as const, anchor: '', weekdays: [1, 3] };
    expect(['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-23'].map((d) => isWorkDay(d, s))).toEqual([true, false, true, true]);
  });
  it('no work days darkens nothing', () => {
    const s = { mode: 'none' as const, anchor: '2026-11-14', weekdays: [1] };
    expect(['2026-11-14', '2026-11-16'].some((d) => isWorkDay(d, s))).toBe(false);
  });
  it('existing settings keep the rotation', () => {
    expect(scheduleOf(DEFAULT_SETTINGS).mode).toBe('rotation');
  });
});

describe('ZIP lookup', () => {
  it('accepts 5-digit and ZIP+4, nothing else', () => {
    expect([normalZip(' 77581 '), normalZip('77581-1234'), normalZip('7758'), normalZip('Pearland')]).toEqual(['77581', '77581', null, null]);
  });
  it('reads Zippopotam', () => {
    const body = { places: [{ 'place name': 'Pearland', longitude: '-95.2721', latitude: '29.5617', 'state abbreviation': 'TX' }] };
    expect(parseZippopotam('77581', body)).toEqual({ zip: '77581', name: 'Pearland, TX', lat: 29.5617, lng: -95.2721 });
  });
  it('reads the Open-Meteo fallback only when it lists the ZIP', () => {
    const body = { results: [{ name: 'Pearland', latitude: 29.56, longitude: -95.29, admin1: 'Texas', postcodes: ['77581', '77584'] }] };
    expect(parseOpenMeteo('77584', body)?.name).toBe('Pearland, TX');
    expect(parseOpenMeteo('77001', body)).toBeNull();
  });
});

describe('planning from another place', () => {
  const visit = { zip: '77546', name: 'Friendswood, TX', lat: 29.5294, lng: -95.201 };
  it('the visit replaces home until cleared', () => {
    expect(placeOf({ ...DEFAULT_SETTINGS, visit })).toMatchObject({ name: 'Friendswood, TX', visiting: true });
    expect(placeOf(DEFAULT_SETTINGS)).toMatchObject({ name: 'Pearland, TX', visiting: false });
  });
  it('drive times come from the visited place and are marked as estimates', () => {
    const spots = SEED_SPOTS.map((s) => ({ ...s, driveMin: estimateDrive(visit.lat, visit.lng, s.lat, s.lng) }));
    const day = { date: '2026-11-17', shift: false, morning: 80, evening: 80, confidence: 'sharp' };
    const rows = rankSpots(spots, day, '2026-11-17T17:24', {}, 45, { estimated: true });
    expect(rows.every((r) => r.driveEstimated)).toBe(true);
    const tcd = rows.find((r) => r.spot.name === 'Texas City Dike')!;
    expect(tcd.spot.driveMin).toBe(estimateDrive(visit.lat, visit.lng, tcd.spot.lat, tcd.spot.lng));
  });
});
