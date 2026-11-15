import { describe, expect, it } from 'vitest';
import fixtures from '../../fixtures.json';
import { clock12 } from './dates';
import { scoreWeek, type Forecast, type Hour, type TidePoint } from './scoring';
import { SEED_SPOTS } from './spots';
import { dayLow, feet, parseTides, tidesUrl } from './tides';
import { bestBet, rankSpots, type TideMap } from './where';

const tides: TidePoint[] = parseTides({
  predictions: fixtures.tides_station_8771450_MLLW_ft_local.map((p) => ({ t: p.t, v: String(p.ft), type: p.type })),
});
const map: TideMap = { '8771450': tides };
// The fixture holds Galveston Pier 21 tides only, so point both tidal spots at that station here.
const SPOTS = SEED_SPOTS.map((s) => (s.tidal ? { ...s, stationId: '8771450' } : s));

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
const week = scoreWeek(f, '2026-11-15', 9);
const rows = (date: string, maxDrive = 45, t: TideMap = map) => {
  const day = week.find((d) => d.date === date)!;
  return rankSpots(SPOTS, day, f.days.find((d) => d.date === date)!.sunset, t, maxDrive);
};
const spot = (date: string, name: string, maxDrive = 45) => rows(date, maxDrive).find((r) => r.spot.name === name)!;
const scores = (date: string, name: string) => {
  const r = spot(date, name);
  return [r.morning.score, r.evening.score];
};

describe('tide predictions', () => {
  it('reads NOAA text heights as numbers', () => {
    expect(tides[1]).toEqual({ time: '2026-11-15 13:48', ft: 0.258, type: 'L' });
    expect(parseTides({ predictions: [{ t: '2026-11-15 13:48', v: '-0.2', type: 'LL' }] })[0].type).toBe('L');
  });
  it('asks NOAA for the agreed product and units', () => {
    const u = new URL(tidesUrl('8771450', '2026-11-15'));
    expect(Object.fromEntries(u.searchParams)).toMatchObject({
      product: 'predictions', interval: 'hilo', datum: 'MLLW', units: 'english', time_zone: 'lst_ldt',
      station: '8771450', begin_date: '20261115', end_date: '20261124',
    });
  });
  it('card line shows the lowest low of the day', () => {
    const l = dayLow(tides, '2026-11-19')!;
    expect(`${clock12(l.time)} · ${feet(l.ft)} ft`).toBe('7:10 AM · 0.9 ft');
    expect(feet(dayLow(tides, '2026-11-22')!.ft)).toBe('0.0');
  });
});

describe('tidal spots, Galveston Pier 21 tides', () => {
  it('inland spots keep the window score', () => {
    for (const d of week) expect(scores(d.date, 'Brazos Bend State Park')).toEqual([d.morning, d.evening]);
  });
  it('no low in the window takes 15 off', () => {
    expect(scores('2026-11-17', 'Texas City Dike')).toEqual([84 - 15, 94]); // low at 3:26 PM, 0.5 ft: evening unchanged
    expect(scores('2026-11-16', 'Texas City Dike')).toEqual([37 - 15, 87]);
  });
  it('a low at 0.3 ft or less adds 8', () => {
    expect(scores('2026-11-15', 'Texas City Dike')).toEqual([0, 8]); // 0.26 ft at 1:48 PM, base 0
    expect(scores('2026-11-22', 'Texas City Dike')[0]).toBe(67 + 8); // -0.02 ft at 7:53 AM
  });
  it('a low above 0.7 ft takes 8 off; a low after sunset does not count', () => {
    expect(scores('2026-11-19', 'Texas City Dike')).toEqual([73 - 8, 67 - 15]); // 0.86 ft at 7:10 AM; 5:29 PM low is after sunset
  });
  it('a low from 0.3 to 0.7 ft changes nothing', () => {
    expect(scores('2026-11-20', 'Texas City Dike')[0]).toBe(85); // 0.59 ft at 7:12 AM
  });
  it('without tide data the score is left alone and flagged', () => {
    const r = rows('2026-11-17', 45, {}).find((x) => x.spot.name === 'San Luis Pass')!;
    expect(r.tideMissing).toBe(true);
    expect([r.morning.score, r.evening.score]).toEqual([84, 94]);
  });
});

describe('spot list and best bet', () => {
  it('is nearest first and keeps every spot whatever the max drive', () => {
    const list = rows('2026-11-17', 20);
    expect(list).toHaveLength(8);
    expect(list.map((r) => r.spot.driveMin)).toEqual([10, 15, 15, 40, 40, 50, 60, 65]);
    expect(list.filter((r) => !r.inRange).map((r) => r.spot.name)).toEqual([
      'Brazos Bend State Park', 'Texas City Dike', 'Brazoria NWR', 'San Luis Pass', 'Quintana Neotropical Bird Sanctuary',
    ]);
  });
  it('best bet: highest score in range, then shortest drive', () => {
    const b = bestBet(rows('2026-11-17'))!;
    expect([b.row.spot.name, b.which, b.score]).toEqual(['Delores Fenwick Nature Center', 'evening', 94]);
    const t = bestBet(rows('2026-11-22'))!;
    expect([t.row.spot.name, t.which, t.score]).toEqual(['Texas City Dike', 'morning', 75]);
  });
  it('best bet ignores spots beyond the max drive', () => {
    const t = bestBet(rows('2026-11-22', 35))!;
    expect(t.row.spot.name).toBe('Delores Fenwick Nature Center');
    expect(bestBet(rows('2026-11-22', 5))).toBeNull();
  });
});
