import { TIMEZONE } from '../lib/config';
import { hourOf, monthDay, shortClock, weekday } from '../lib/dates';
import { compass, morningHours, reason, type DayScore, type Forecast, type Hour } from '../lib/scoring';
import type { Settings } from '../lib/settings';
import { clock, sunTimes } from '../lib/twilight';
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

export function DayCard({ day, forecast, settings }: { day: DayScore; forecast: Forecast; settings: Settings }) {
  const sun = forecast.days.find((d) => d.date === day.date)!;
  const light = sunTimes(day.date, settings.lat, settings.lng);
  const am = morningHours(forecast, day.date);
  return (
    <article className={`card v-${verdictClass(day.morning)}${day.shift ? ' shift' : ''}`}>
      <div className="date">{weekday(day.date)} {monthDay(day.date)}</div>
      <Window name="Morning" score={day.morning}
        times={`first light ${bare(clock(light.firstLight, TIMEZONE))} · sunrise ${shortClock(sun.sunrise)}`} />
      <p className="why">{reason(am, '7')}</p>
      {am.length > 0 && <HourTable hours={am} />}
      <Window name="Evening" score={day.evening}
        times={`sunset ${shortClock(sun.sunset)} · last light ${bare(clock(light.lastLight, TIMEZONE))}`} />
      <div className="foot"><span className="conf">Forecast: {day.confidence}</span></div>
    </article>
  );
}
