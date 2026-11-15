import type { Model } from '../App';
import { TIDE, TIMEZONE } from '../lib/config';
import { birdsApply } from '../lib/birds';
import { clock12, daysBetween, hourOf, monthDay, shortClock, weekday } from '../lib/dates';
import { compass, morningHours, reason, type DayScore, type Hour } from '../lib/scoring';
import { dayLow, feet } from '../lib/tides';
import { clock, sunTimes } from '../lib/twilight';
import { bestBet, rankSpots } from '../lib/where';
import { verdictClass, verdictText } from './Home';

const bare = (t: string) => t.replace(/\s?[AP]M$/, '');

export function HourTable({ hours, gusts }: { hours: Hour[]; gusts?: boolean }) {
  const label = (h: Hour, last: boolean) => {
    const hr = hourOf(h.time);
    return `${hr % 12 || 12}${last ? (hr < 12 ? ' AM' : ' PM') : ''}`;
  };
  const row = (name: string, cell: (h: Hour) => string) => (
    <tr><td>{name}</td>{hours.map((h) => <td key={h.time}>{cell(h)}</td>)}</tr>
  );
  return (
    <table className="hrs">
      <thead><tr><th></th>{hours.map((h, i) => <th key={h.time}>{label(h, i === hours.length - 1)}</th>)}</tr></thead>
      <tbody>
        {row('Temp', (h) => `${Math.round(h.temp)}°`)}
        {row('Wind', (h) => `${compass(h.windDir)} ${Math.round(h.wind)}`)}
        {gusts && row('Gust', (h) => `${Math.round(h.gust)}`)}
        {row('Cloud', (h) => `${Math.round(h.cloud)}%`)}
        {row('Rain', (h) => `${Math.round(h.rain)}%`)}
      </tbody>
    </table>
  );
}

export function Window({ name, times, score }: { name: string; times: string; score: number | null }) {
  return (
    <div className="win">
      <div><b>{name}</b><span>{times}</span></div>
      <span className={`pill ${verdictClass(score)}`}>{verdictText(score)}</span>
    </div>
  );
}

/** Morning and evening time lines, shared by the card and the detail page. */
export function dayTimes(model: Model, date: string) {
  const sun = model.forecast!.days.find((d) => d.date === date)!;
  const light = sunTimes(date, model.settings.lat, model.settings.lng);
  return {
    sun,
    morning: `first light ${bare(clock(light.firstLight, TIMEZONE))} · sunrise ${shortClock(sun.sunrise)}`,
    evening: `sunset ${shortClock(sun.sunset)} · last light ${bare(clock(light.lastLight, TIMEZONE))}`,
  };
}

export const lowTideText = (model: Model, date: string) => {
  const tides = model.tides[TIDE.homeStation];
  if (!tides) return 'not loaded';
  const low = dayLow(tides, date);
  return low ? `${clock12(low.time)} · ${feet(low.ft)} ft` : 'none this day';
};

/** Spot rows for a day, with sightings on the next four days. Card and detail page share this. */
export function spotRows(model: Model, day: DayScore) {
  const sun = model.forecast!.days.find((d) => d.date === day.date)!;
  const birds = model.birds && birdsApply(daysBetween(model.today, day.date)) ? model.birds : undefined;
  return rankSpots(model.spots, day, sun.sunset, model.tides, model.settings.maxDrive, { birds });
}

/** Unusual birds in range, for the next four days only; null on other days or with no sightings data. */
export function birdCount(model: Model, day: DayScore): number | null {
  if (!model.birds || !birdsApply(daysBetween(model.today, day.date))) return null;
  return model.birds.filter((b) => b.driveMin <= model.settings.maxDrive).length;
}

export const shortName = (name: string) => name.replace(/ (Nature Center|State Park|Neotropical Bird Sanctuary)$/, '');

export function DayCard({ day, model, onOpen }: { day: DayScore; model: Model; onOpen: () => void }) {
  const t = dayTimes(model, day.date);
  const am = morningHours(model.forecast!, day.date);
  const bet = day.shift ? null : bestBet(spotRows(model, day));
  const nb = birdCount(model, day);
  return (
    <article className={`card v-${verdictClass(day.morning)}${day.shift ? ' shift' : ''}`} tabIndex={0}
      aria-label={`${weekday(day.date)} ${monthDay(day.date)}, open details`}
      onClick={onOpen} onKeyDown={(e) => { if (e.key === 'Enter') onOpen(); }}>
      <div className="date">{weekday(day.date)} {monthDay(day.date)}</div>
      <Window name="Morning" score={day.morning} times={t.morning} />
      <p className="why">{reason(am, '7')}</p>
      {am.length > 0 && <HourTable hours={am} />}
      <Window name="Evening" score={day.evening} times={t.evening} />
      <dl className="kv">
        <dt>Low tide</dt><dd>{lowTideText(model, day.date)}</dd>
        {!day.shift && <>
          <dt>Best bet</dt>
          <dd className="bet">{bet ? <>{shortName(bet.row.spot.name)}, {bet.which} <span className={`pill sm ${verdictClass(bet.score)}`}>{verdictText(bet.score)}</span></> : 'No spots in range'}</dd>
        </>}
        {nb != null && nb > 0 && <><dt>Unusual</dt><dd>{nb} bird{nb > 1 ? 's' : ''} reported in range</dd></>}
      </dl>
      <div className="foot">
        <span className="conf">Forecast: {day.confidence}</span>
        <span className="more" aria-hidden="true">Details ›</span>
      </div>
    </article>
  );
}
