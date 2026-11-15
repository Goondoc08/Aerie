import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Model } from '../App';
import { dayNumber, monthDay, weekday } from '../lib/dates';
import { verdict } from '../lib/scoring';
import { DayCard } from './DayCard';

export const verdictClass = (score: number | null) =>
  score == null ? 'none' : { Go: 'go', Decent: 'ok', Marginal: 'warn', Skip: 'skip' }[verdict(score)];
export const verdictText = (score: number | null) => (score == null ? 'No data' : `${verdict(score)} ${score}`);

interface Props {
  model: Model; notes: string[]; busy: boolean; failed: boolean;
  focus: string | null; onFocus: (date: string) => void; onOpen: (date: string) => void;
}

export function Home({ model, notes, busy, failed, focus, onFocus, onOpen }: Props) {
  const { settings, forecast: f, week, best } = model;
  const bestIndex = best ? week.findIndex((d) => d.date === best.date) : 0;
  const focusIndex = focus ? week.findIndex((d) => d.date === focus) : -1;

  const [sel, setSel] = useState(0);
  const car = useRef<HTMLDivElement>(null);
  const opened = useRef(false);

  const center = (i: number, smooth: boolean) => {
    const c = car.current, el = c?.children[i] as HTMLElement | undefined;
    if (!c || !el) return;
    const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
    c.scrollTo({ left: el.offsetLeft - (c.clientWidth - el.offsetWidth) / 2, behavior: smooth && !calm ? 'smooth' : 'auto' });
  };

  // Open on the card we came back to, or else the day holding the best open window.
  useLayoutEffect(() => {
    if (opened.current || week.length === 0) return;
    opened.current = true;
    const i = focusIndex >= 0 ? focusIndex : bestIndex;
    setSel(i);
    center(i, false);
  }, [week.length, bestIndex, focusIndex]);

  // Swiping updates the selected chip.
  useEffect(() => {
    const c = car.current;
    if (!c) return;
    let tick = 0;
    const onScroll = () => {
      if (tick) return;
      tick = requestAnimationFrame(() => {
        tick = 0;
        const mid = c.scrollLeft + c.clientWidth / 2;
        let bi = 0, bd = Infinity;
        Array.from(c.children).forEach((el, i) => {
          const h = el as HTMLElement, d = Math.abs(h.offsetLeft + h.offsetWidth / 2 - mid);
          if (d < bd) { bd = d; bi = i; }
        });
        setSel(bi);
      });
    };
    c.addEventListener('scroll', onScroll, { passive: true });
    return () => { c.removeEventListener('scroll', onScroll); cancelAnimationFrame(tick); };
  }, [week.length]);

  // Remember the selected card so Settings or a detail page returns to it.
  const selDate = week[sel]?.date;
  useEffect(() => { if (selDate && opened.current) onFocus(selDate); }, [selDate]);

  return (
    <>
      <header>
        <div>
          <h1>Aerie</h1>
          <div className="sub">
            {settings.homeName}
            {notes.map((n) => <span key={n}> · <span className="stale">{n}</span></span>)}
          </div>
        </div>
        <a className="gear" href="#settings" aria-label="Settings">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </a>
      </header>

      {!f || week.length === 0 ? (
        <div className="empty">
          {busy ? 'Loading the forecast…'
            : failed ? 'The forecast could not be loaded. Connect to the internet and open Aerie again.'
            : 'No forecast for the coming days yet.'}
        </div>
      ) : (
        <div className="home">
          <div className="strip" style={{ gridTemplateColumns: `repeat(${week.length},1fr)` }}>
            {week.map((d, i) => {
              const dia = (w: 'morning' | 'evening') => (best && best.date === d.date && best.which === w ? ' dia' : '');
              const mark = best?.date === d.date ? `, best ${best.which} of the week` : '';
              return (
                <button key={d.date} className={`chip${d.shift ? ' shift' : ''}`} aria-pressed={i === sel}
                  aria-label={`${weekday(d.date)} ${monthDay(d.date)}, morning ${verdictText(d.morning)}, evening ${verdictText(d.evening)}${mark}`}
                  onClick={() => { setSel(i); center(i, true); }}>
                  <span className="wd">{weekday(d.date)}</span>
                  <span className="dn">{dayNumber(d.date)}</span>
                  <span className="dots">
                    <i className={`dot b-${verdictClass(d.morning)}${dia('morning')}`} />
                    <i className={`dot b-${verdictClass(d.evening)}${dia('evening')}`} />
                  </span>
                </button>
              );
            })}
          </div>
          <div className="car" ref={car} tabIndex={0} aria-label="Days, swipe left and right">
            {week.map((d) => <DayCard key={d.date} day={d} model={model} onOpen={() => onOpen(d.date)} />)}
          </div>
        </div>
      )}
    </>
  );
}
