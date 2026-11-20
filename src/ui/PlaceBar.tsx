import { useState, type FormEvent } from 'react';
import type { Place, Settings } from '../lib/settings';
import { lookupZip } from '../lib/zip';

/**
 * Under the title: home, or the place being visited. "Plan from another ZIP" moves the forecast,
 * birds and drive times to that ZIP until "Back to home".
 */
export function PlaceBar({ settings, onVisit }: { settings: Settings; onVisit: (p: Place | null) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [zip, setZip] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const v = settings.visit;

  const go = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg('Looking up the ZIP…');
    try {
      const p = await lookupZip(zip);
      await onVisit(p);
      setOpen(false);
      setZip('');
      setMsg('');
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Could not look up the ZIP code.');
    } finally {
      setBusy(false);
    }
  };

  if (v) {
    return (
      <div className="place visiting">
        <span>Planning from <b>{v.name}</b> {v.zip}</span>
        <button className="btn sm" type="button" onClick={() => onVisit(null)}>Back to home</button>
      </div>
    );
  }

  const recent = settings.recentVisits.filter((r) => r.zip !== settings.homeZip);
  return (
    <div className="place">
      {!open ? (
        <button className="linkbtn" type="button" onClick={() => setOpen(true)}>Plan from another ZIP</button>
      ) : (
        <form className="place-form" onSubmit={go}>
          <label className="sr" htmlFor="visit-zip">ZIP code</label>
          <input id="visit-zip" className="text" inputMode="numeric" autoComplete="postal-code" placeholder="ZIP code"
            maxLength={10} value={zip} autoFocus onChange={(e) => setZip(e.target.value)} />
          <button className="btn solid sm" type="submit" disabled={busy}>Go</button>
          <button className="btn sm" type="button" onClick={() => { setOpen(false); setMsg(''); }}>Cancel</button>
          {recent.length > 0 && (
            <div className="recent">
              {recent.map((r) => (
                <button key={r.zip} className="btn sm" type="button" onClick={() => onVisit(r)}>{r.name} {r.zip}</button>
              ))}
            </div>
          )}
          {msg && <div className={busy ? 'sub' : 'err'} role="status">{msg}</div>}
        </form>
      )}
    </div>
  );
}
