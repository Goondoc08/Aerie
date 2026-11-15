import { describe, expect, it } from 'vitest';
import fixtures from '../../fixtures.json';
import { CLEAR_TAG, FRONT_TAG, frontTags, isFrontDay, migrationSeason } from './fronts';
import type { Forecast, Hour } from './scoring';

function fixtureForecast(): Forecast {
  const hours: Hour[] = [];
  const add = (date: string, hr: number, r: number[]) =>
    hours.push({ time: `${date}T${String(hr).padStart(2, '0')}:00`, temp: r[0], wind: r[1], gust: r[2], windDir: r[3], cloud: r[4], rain: r[5] });
  for (const d of fixtures.days) {
    d.morningHours_07_08_09_10.forEach((r, i) => add(d.date, 7 + i, r));
    d.eveningHours_15_16_17.forEach((r, i) => add(d.date, 15 + i, r));
  }
  return { hours, days: fixtures.days.map((d) => ({ date: d.date, sunrise: `${d.date}T${d.sunrise}`, sunset: `${d.date}T${d.sunset}` })) };
}
const f = fixtureForecast();

describe('cold fronts (fixtures.json)', () => {
  it('tags the Nov 15 front and the Nov 17 morning, nothing else', () => {
    expect(frontTags(f)).toEqual({ '2026-11-15': [FRONT_TAG], '2026-11-17': [CLEAR_TAG] });
  });
  it('Nov 16 is breezy and northerly but too dry to be the front', () => {
    expect(isFrontDay(f, '2026-11-16')).toBe(false);
  });
  it('needs the wind to swing into the north, not just blow from it', () => {
    const h = (time: string, windDir: number): Hour => ({ time, temp: 60, wind: 15, gust: 30, windDir, cloud: 100, rain: 60 });
    const steady: Forecast = { hours: ['08', '12', '16'].map((t) => h(`2026-12-01T${t}:00`, 10)), days: [] };
    expect(isFrontDay(steady, '2026-12-01')).toBe(false);
    const swing: Forecast = { hours: [h('2026-11-30T20:00', 200), h('2026-12-01T03:00', 340)], days: [] };
    expect(isFrontDay(swing, '2026-12-01')).toBe(true); // overnight passage still counts
  });
});

describe('BirdCast seasons', () => {
  it('spring and fall only', () => {
    expect(['2026-11-15', '2026-11-16', '2027-03-01', '2027-06-15', '2027-07-01', '2026-08-01'].map(migrationSeason))
      .toEqual(['Fall', null, 'Spring', 'Spring', null, 'Fall']);
  });
});
