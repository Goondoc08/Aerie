import { useState, type FormEvent } from 'react';
import type { CacheRow } from '../lib/db';
import { ago } from '../lib/dates';
import type { Settings } from '../lib/settings';

interface Props {
  settings: Settings; forecast: CacheRow | null; busy: boolean; failed: boolean;
  onSave: (patch: Partial<Settings>) => Promise<void>; onRefresh: () => void;
}

export function SettingsScreen({ settings, forecast, busy, failed, onSave, onRefresh }: Props) {
  const [name, setName] = useState(settings.homeName);
  const [lat, setLat] = useState(String(settings.lat));
  const [lng, setLng] = useState(String(settings.lng));
  const [anchor, setAnchor] = useState(settings.shiftAnchor);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const la = Number(lat), lo = Number(lng);
    if (!lat.trim() || !Number.isFinite(la) || la < -90 || la > 90) return setMsg({ ok: false, text: 'Latitude must be a number from -90 to 90.' });
    if (!lng.trim() || !Number.isFinite(lo) || lo < -180 || lo > 180) return setMsg({ ok: false, text: 'Longitude must be a number from -180 to 180.' });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(anchor)) return setMsg({ ok: false, text: 'Pick the first day of a shift pair.' });
    await onSave({ homeName: name.trim() || 'Home', lat: la, lng: lo, shiftAnchor: anchor });
    setMsg({ ok: true, text: 'Saved' });
  };

  return (
    <>
      <a className="back" href="#">‹ Back</a>
      <h1>Settings</h1>
      <form className="panel form" onSubmit={submit}>
        <h2>Home and schedule</h2>
        <label className="field" htmlFor="home-name">Place name
          <input id="home-name" className="text" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <div className="row2">
          <label className="field" htmlFor="home-lat">Latitude
            <input id="home-lat" inputMode="decimal" value={lat} onChange={(e) => setLat(e.target.value)} />
          </label>
          <label className="field" htmlFor="home-lng">Longitude
            <input id="home-lng" inputMode="decimal" value={lng} onChange={(e) => setLng(e.target.value)} />
          </label>
        </div>
        <label className="field" htmlFor="shift-anchor">First day of a shift pair
          <input id="shift-anchor" type="date" value={anchor} onChange={(e) => setAnchor(e.target.value)} />
        </label>
        <div className="actions">
          <button className="btn solid" type="submit">Save</button>
          {msg && <span className={msg.ok ? 'sub' : 'err'} role="status">{msg.text}</span>}
        </div>
      </form>
      <section className="panel form">
        <h2>Data</h2>
        <div className="src">
          <div>
            <div>Forecast · Open-Meteo</div>
            <div className="when">
              {forecast ? `updated ${ago(forecast.fetchedAt)}` : 'not loaded yet'}
              {failed && ' · last refresh failed'}
            </div>
          </div>
          <button className="btn" type="button" disabled={busy} onClick={onRefresh}>{busy ? 'Refreshing…' : 'Refresh'}</button>
        </div>
      </section>
    </>
  );
}
