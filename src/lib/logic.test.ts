import { describe, expect, it } from 'vitest';
import fixtures from '../../fixtures.json';
import { TIMEZONE, HOME_DEFAULT } from './config';
import { dayId, minutesOf, monthDay, weekday } from './dates';
import { isShiftDay } from './shifts';
import {
  bestOpenWindow, confidence, eveningHours, morningHours, reason, scoreWeek, scoreWindow,
  tideAdjustment, verdict, lowTideInWindow, type Forecast, type Hour,
} from './scoring';
import { sunTimes } from './twilight';

const hour = (o: Partial<Hour>): Hour => ({ time: '2026-11-17T07:00', temp: 50, wind: 4, gust: 8, windDir: 0, cloud: 0, rain: 0, ...o });

/** Rebuild a forecast from the saved fixture rows. */
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

describe('fixtures.json, Nov 15 to 23', () => {
  const f = fixtureForecast();
  const week = scoreWeek(f, '2026-11-15', 9);
  it('morning scores match', () => expect(week.map((d) => d.morning)).toEqual(fixtures.expected.morningScores));
  it('evening scores match', () => expect(week.map((d) => d.evening)).toEqual(fixtures.expected.eveningScores));
  it('shift days match', () => expect(week.map((d) => d.shift)).toEqual(fixtures.days.map((d) => d.shiftDay)));
  it('best open window matches', () => {
    const b = bestOpenWindow(week)!;
    expect(`${b.date} ${b.which}`).toBe(fixtures.expected.bestOpenWindow);
  });
  it('uses 7-10 AM and the three hours before sunset', () => {
    const d = f.days[0];
    expect(morningHours(f, d.date).map((h) => h.time.slice(11))).toEqual(['07:00', '08:00', '09:00', '10:00']);
    expect(eveningHours(f, d.date, d.sunset).map((h) => h.time.slice(11))).toEqual(['15:00', '16:00', '17:00']);
  });
  it('writes the reason line', () => {
    expect(reason(morningHours(f, '2026-11-17'), '7')).toBe('Light wind, clear, 50°F at 7.');
    expect(reason(morningHours(f, '2026-11-15'), '7')).toBe('Windy, gusts to 34, overcast, 52% rain chance, 57°F at 7.');
  });
  it('device sun times agree with the saved sunrise and sunset within 2 minutes', () => {
    const mins = (x: Date) => {
      const [h, m] = new Intl.DateTimeFormat('en-GB', { timeZone: TIMEZONE, hour: '2-digit', minute: '2-digit' }).format(x).split(':').map(Number);
      return h * 60 + m;
    };
    for (const d of f.days) {
      const s = sunTimes(d.date, HOME_DEFAULT.lat, HOME_DEFAULT.lng);
      expect(Math.abs(mins(s.sunrise!) - minutesOf(d.sunrise))).toBeLessThanOrEqual(2);
      expect(Math.abs(mins(s.sunset!) - minutesOf(d.sunset))).toBeLessThanOrEqual(2);
      const dawn = minutesOf(d.sunrise) - mins(s.firstLight!);
      expect(dawn).toBeGreaterThan(20);
      expect(dawn).toBeLessThan(30);
    }
  });
});

describe('shift schedule', () => {
  it('two on, four off from Sat Nov 14 2026', () => {
    expect(isShiftDay('2026-11-14')).toBe(true);
    expect(isShiftDay('2026-11-13')).toBe(false);
    expect(isShiftDay('2026-11-08')).toBe(true);
    expect(isShiftDay('2026-11-26')).toBe(true);
  });
});

describe('scoring rule', () => {
  it('calm clear window is 100', () => expect(scoreWindow([hour({})])).toBe(100));
  it('wind: 5 per mph of average over 6', () => expect(scoreWindow([hour({ wind: 8 }), hour({ wind: 12 })])).toBe(80));
  it('gusts: 1.5 per mph of the highest over 20', () => expect(scoreWindow([hour({ gust: 10 }), hour({ gust: 30 })])).toBe(85));
  it('rain: 0.6 per point of the highest chance', () => expect(scoreWindow([hour({ rain: 10 }), hour({ rain: 50 })])).toBe(70));
  it('cloud bands', () => {
    expect([29, 30, 80, 81].map((cloud) => scoreWindow([hour({ cloud })]))).toEqual([100, 94, 94, 88]);
  });
  it('clamps at 0 and handles no data', () => {
    expect(scoreWindow([hour({ wind: 40, rain: 100 })])).toBe(0);
    expect(scoreWindow([])).toBeNull();
  });
  it('verdict words', () =>
    expect([80, 79, 65, 64, 45, 44].map(verdict)).toEqual(['Go', 'Decent', 'Decent', 'Marginal', 'Marginal', 'Skip']));
  it('tide adjustment', () => {
    const low = (ft: number) => ({ time: '2026-11-17 08:00', ft, type: 'L' as const });
    expect([tideAdjustment(low(0.3)), tideAdjustment(low(0.5)), tideAdjustment(low(0.71)), tideAdjustment(null)]).toEqual([8, 0, -8, -15]);
  });
  it('finds a low tide only inside the window', () => {
    const tides = [{ time: '2026-11-15 13:48', ft: 0.258, type: 'L' as const }];
    expect(lowTideInWindow(tides, '2026-11-15', 'morning', '2026-11-15T17:25')).toBeNull();
    expect(lowTideInWindow(tides, '2026-11-15', 'evening', '2026-11-15T17:25')?.ft).toBe(0.258);
  });
  it('confidence labels', () =>
    expect([1, 3, 4, 7, 8, 9].map(confidence)).toEqual(['sharp', 'sharp', 'rough', 'rough', 'outlook only', 'outlook only']));
  it('date labels', () =>
    expect([weekday('2026-11-17'), monthDay('2026-11-17'), dayId('2026-11-17')]).toEqual(['Tue', 'Nov 17', 'nov-17']));
});
