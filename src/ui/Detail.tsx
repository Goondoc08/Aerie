import { useEffect } from 'react';
import type { Model } from '../App';
import { DRIVE, TIDE } from '../lib/config';
import { birdNote, birdsApply, type BirdGroup, type Label } from '../lib/birds';
import { clock12, daysBetween, hourOf, monthDay, weekday } from '../lib/dates';
import { eveningHours, lowTideInWindow, morningHours, reason, type DayScore, type TidePoint } from '../lib/scoring';
import { feet } from '../lib/tides';
import type { SpotRow, SpotWindow } from '../lib/where';
import { BIRDCAST } from '../lib/config';
import { migrationSeason } from '../lib/fronts';
import { dayTimes, HourTable, lowTideText, spotRows, Tags, Window } from './DayCard';
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
  const list = spotRows(model, day);
  const far = list.filter((r) => !r.inRange).length;
  const season = migrationSeason(day.date);
  const pmLabel = pm.length ? `${hourOf(pm[0].time) % 12 || 12} PM` : '';

  return (
    <div className="detail">
      <button className="back" type="button" onClick={onBack}>‹ All days</button>

      <section className={`dhead v-${verdictClass(day.morning)}${day.shift ? ' shift' : ''}`}>
        <div className="date">{weekday(day.date)} {monthDay(day.date)}<small>Forecast: {day.confidence}</small></div>
        <Window name="Morning" score={day.morning} times={t.morning} />
        <p className="why">{reason(am, '7', model.weights)}</p>
        <Tags tags={model.tags[day.date]} />
        {am.length > 0 && <HourTable hours={am} gusts />}
        <dl className="kv">
          <dt>Low tide</dt><dd>{lowTideText(model, day.date)}</dd>
          {tides && <><dt>Tidal spots</dt><dd>{amLow ? `low ${lowText(amLow)}, 5 to 11 AM` : 'no low tide 5 to 11 AM'}</dd></>}
          {season && <><dt>{season} migration</dt><dd><a className="link" href={BIRDCAST.url} target="_blank" rel="noreferrer">BirdCast forecast ›</a></dd></>}
        </dl>
      </section>

      <section className={`panel stack${day.shift ? ' shift' : ''}`}>
        <Window name="Evening" score={day.evening} times={t.evening} />
        <p className="why">{reason(pm, pmLabel, model.weights)}</p>
        {pm.length > 0 && <HourTable hours={pm} gusts />}
        <dl className="kv">
          <dt>Tidal spots</dt>
          <dd>{!tides ? 'tide data not loaded' : pmLow ? `low tide ${lowText(pmLow)} before sunset` : 'no low tide before sunset'}</dd>
        </dl>
      </section>

      <section className="panel">
        <h2>Where to go</h2>
        <div className="sub" style={{ marginBottom: 6 }}>
          Morning and evening scores for each spot{model.spotForecasts.size ? ', from its own forecast' : ''}; tidal spots include their own station's tide.
        </div>
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
                <div className="n">{r.spot.name}<small>{r.spot.type} · {r.driveEstimated ? '~' : ''}{r.spot.driveMin} min</small></div>
                {(note || r.bird || r.watch) && (
                  <div className="note">
                    {r.bird && <span className="tag front">{r.bird.comName} reported</span>}
                    {r.watch && <span className="tag">{r.watch.comName} reported once</span>}
                    {note && <span>{note}</span>}
                  </div>
                )}
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

      <BirdsPanel model={model} day={day} />
    </div>
  );
}

const LABEL_CLASS: Record<Label, string> = { Lingering: 'go', Returning: 'ok', Confirmed: 'ok', Watch: 'warn' };

function BirdsPanel({ model, day }: { model: Model; day: DayScore }) {
  const { settings, birds, birdRow } = model;
  const maxDrive = settings.maxDrive;
  const applies = birdsApply(daysBetween(model.today, day.date));
  const reports = (birdRow?.data as unknown[] | undefined)?.length ?? 0;
  const dates = ((birdRow?.data as { obsDt: string }[] | undefined) ?? []).map((r) => r.obsDt.slice(0, 10)).sort();
  const md = (d: string) => monthDay(d);
  const row = (b: BirdGroup) => (
    <div key={b.key} className={`spot${b.driveMin <= maxDrive ? '' : ' far'}`}>
      <div className="n">{b.comName}<small>{b.locName} · {b.driveEstimated ? '~' : ''}{b.driveMin} min</small></div>
      <div className="note">{birdNote(b)}</div>
      <span className={`pill ${LABEL_CLASS[b.label]}`}>{b.label}</span>
    </div>
  );
  return (
    <section className="panel">
      <h2>Unusual birds</h2>
      {!settings.ebirdKey ? (
        <div className="sub">Add your eBird key in <a className="link" href="#settings">Settings</a> to see unusual birds.</div>
      ) : !birds ? (
        <div className="sub">Sightings have not loaded yet.</div>
      ) : (
        <>
          <div className="spots">
            {birds.length === 0 && <div className="sub">No unusual birds reported in the last few days.</div>}
            {birds.map(row)}
          </div>
          <div className="sub" style={{ marginTop: 6 }}>
            {reports > 0 && <>From {reports} eBird report{reports > 1 ? 's' : ''}, {md(dates[0])} to {md(dates.at(-1)!)}. </>}
            {applies ? 'Lingering, Returning and Confirmed birds move spots up the list.'
              : 'Too far ahead for these to change the spot list; treat them as stale.'}
            {' '}Data: <a className="link" href="https://ebird.org" target="_blank" rel="noreferrer">eBird.org</a>
          </div>
        </>
      )}
    </section>
  );
}
