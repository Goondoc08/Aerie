import { useEffect } from 'react';
import type { Model } from '../App';
import { DRIVE, TIDE } from '../lib/config';
import { clock12, hourOf, monthDay, weekday } from '../lib/dates';
import { eveningHours, lowTideInWindow, morningHours, reason, type DayScore, type TidePoint } from '../lib/scoring';
import { feet } from '../lib/tides';
import { rankSpots, type SpotRow, type SpotWindow } from '../lib/where';
import { dayTimes, HourTable, lowTideText, Window } from './DayCard';
import { verdictClass, verdictText } from './Home';

interface Props { model: Model; day: DayScore; onBack: () => void; onMaxDrive: (min: number) => void }

const lowText = (low: TidePoint | null) => (low ? `${clock12(low.time)} at ${feet(low.ft)} ft` : null);
const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '±0');

/** "AM: low 7:53 AM at 0.0 ft (+8)" */
function tideNote(r: SpotRow): string | null {
  if (!r.spot.tidal) return null;
  if (r.tideMissing) return 'Tide data not loaded; scores ignore the tide.';
  const part = (name: string, w: SpotWindow) =>
    `${name}: ${w.low ? `low ${lowText(w.low)}` : 'no low tide'} (${signed(w.adj)})`;
  return `${part('AM', r.morning)} · ${part('PM', r.evening)}`;
}

export function Detail({ model, day, onBack, onMaxDrive }: Props) {
  useEffect(() => { window.scrollTo(0, 0); }, [day.date]);
  const f = model.forecast!;
  const t = dayTimes(model, day.date);
  const am = morningHours(f, day.date);
  const pm = eveningHours(f, day.date, t.sun.sunset);
  const tides = model.tides[TIDE.homeStation];
  const amLow = tides ? lowTideInWindow(tides, day.date, 'morning', t.sun.sunset) : null;
  const pmLow = tides ? lowTideInWindow(tides, day.date, 'evening', t.sun.sunset) : null;
  const maxDrive = model.settings.maxDrive;
  const list = rankSpots(model.spots, day, t.sun.sunset, model.tides, maxDrive);
  const far = list.filter((r) => !r.inRange).length;
  const pmLabel = pm.length ? `${hourOf(pm[0].time) % 12 || 12} PM` : '';

  return (
    <div className="detail">
      <button className="back" type="button" onClick={onBack}>‹ All days</button>

      <section className={`dhead v-${verdictClass(day.morning)}${day.shift ? ' shift' : ''}`}>
        <div className="date">{weekday(day.date)} {monthDay(day.date)}<small>Forecast: {day.confidence}</small></div>
        <Window name="Morning" score={day.morning} times={t.morning} />
        <p className="why">{reason(am, '7')}</p>
        {am.length > 0 && <HourTable hours={am} gusts />}
        <dl className="kv">
          <dt>Low tide</dt><dd>{lowTideText(model, day.date)}</dd>
          {tides && <><dt>Tidal spots</dt><dd>{amLow ? `low ${lowText(amLow)}, 5 to 11 AM` : 'no low tide 5 to 11 AM'}</dd></>}
        </dl>
      </section>

      <section className={`panel stack${day.shift ? ' shift' : ''}`}>
        <Window name="Evening" score={day.evening} times={t.evening} />
        <p className="why">{reason(pm, pmLabel)}</p>
        {pm.length > 0 && <HourTable hours={pm} gusts />}
        <dl className="kv">
          <dt>Tidal spots</dt>
          <dd>{!tides ? 'tide data not loaded' : pmLow ? `low tide ${lowText(pmLow)} before sunset` : 'no low tide before sunset'}</dd>
        </dl>
      </section>

      <section className="panel">
        <h2>Where to go</h2>
        <div className="sub" style={{ marginBottom: 6 }}>Morning and evening scores for each spot; tidal spots include the tide.</div>
        <div className="set">
          <label htmlFor="max-drive">Max drive</label>
          <input type="range" id="max-drive" min={DRIVE.min} max={DRIVE.max} step={DRIVE.step} value={maxDrive}
            onChange={(e) => onMaxDrive(Number(e.target.value))} />
          <output htmlFor="max-drive">{maxDrive} min</output>
        </div>
        <div className="spots">
          {list.length === 0 && <div className="sub">No spots yet. Add some in Settings.</div>}
          {list.map((r) => {
            const note = tideNote(r);
            return (
              <div key={r.spot.id ?? r.spot.name} className={`spot${r.inRange ? '' : ' far'}`}>
                <div className="n">{r.spot.name}<small>{r.spot.type} · {r.spot.driveMin} min</small></div>
                {note && <div className="note">{note}</div>}
                <div className="scores">
                  <span className="lbl">AM</span><span className={`pill sm ${verdictClass(r.morning.score)}`}>{verdictText(r.morning.score)}</span>
                  <span className="lbl">PM</span><span className={`pill sm ${verdictClass(r.evening.score)}`}>{verdictText(r.evening.score)}</span>
                </div>
              </div>
            );
          })}
        </div>
        {far > 0 && <div className="sub" style={{ marginTop: 6 }}>{far} faded spot{far > 1 ? 's are' : ' is'} beyond {maxDrive} min</div>}
      </section>
    </div>
  );
}
