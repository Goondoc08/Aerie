import { useState, type FormEvent } from 'react';
import type { Sources } from '../App';
import { DRIVE } from '../lib/config';
import { db, type CacheRow } from '../lib/db';
import { ago } from '../lib/dates';
import type { Settings } from '../lib/settings';
import type { Spot } from '../lib/spots';
import { tideKey } from '../lib/tides';

interface Props {
  settings: Settings; spots: Spot[]; rows: Record<string, CacheRow>; status: Sources; stations: string[];
  onSave: (patch: Partial<Settings>) => Promise<void>; onSpotsChanged: () => Promise<void>; onRefresh: (key: string) => void;
}

const inRange = (s: string, lo: number, hi: number) => s.trim() !== '' && Number.isFinite(Number(s)) && Number(s) >= lo && Number(s) <= hi;

export function SettingsScreen({ settings, spots, rows, status, stations, onSave, onSpotsChanged, onRefresh }: Props) {
  const [name, setName] = useState(settings.homeName);
  const [lat, setLat] = useState(String(settings.lat));
  const [lng, setLng] = useState(String(settings.lng));
  const [anchor, setAnchor] = useState(settings.shiftAnchor);
  const [drive, setDrive] = useState(String(settings.maxDrive));
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [editing, setEditing] = useState<number | 'new' | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!inRange(lat, -90, 90)) return setMsg({ ok: false, text: 'Latitude must be a number from -90 to 90.' });
    if (!inRange(lng, -180, 180)) return setMsg({ ok: false, text: 'Longitude must be a number from -180 to 180.' });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(anchor)) return setMsg({ ok: false, text: 'Pick the first day of a shift pair.' });
    const d = Math.round(Number(drive) / DRIVE.step) * DRIVE.step;
    if (!inRange(drive, DRIVE.min, DRIVE.max)) return setMsg({ ok: false, text: `Max drive must be from ${DRIVE.min} to ${DRIVE.max} minutes.` });
    await onSave({ homeName: name.trim() || 'Home', lat: Number(lat), lng: Number(lng), shiftAnchor: anchor, maxDrive: d });
    setDrive(String(d));
    setMsg({ ok: true, text: 'Saved' });
  };

  const sorted = [...spots].sort((a, b) => a.driveMin - b.driveMin || a.name.localeCompare(b.name));
  const sources = [
    { key: 'forecast', label: 'Forecast · Open-Meteo' },
    ...stations.map((st) => ({ key: tideKey(st), label: `Tides · NOAA station ${st}` })),
  ];

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
        <div className="row2">
          <label className="field" htmlFor="shift-anchor">First day of a shift pair
            <input id="shift-anchor" type="date" value={anchor} onChange={(e) => setAnchor(e.target.value)} />
          </label>
          <label className="field" htmlFor="max-drive-default">Max drive, minutes
            <input id="max-drive-default" inputMode="numeric" value={drive} onChange={(e) => setDrive(e.target.value)} />
          </label>
        </div>
        <div className="actions">
          <button className="btn solid" type="submit">Save</button>
          {msg && <span className={msg.ok ? 'sub' : 'err'} role="status">{msg.text}</span>}
        </div>
      </form>

      <section className="panel form">
        <h2>Spots</h2>
        <div className="spots">
          {sorted.map((s) => editing === s.id ? (
            <SpotForm key={s.id} spot={s} onDone={async () => { setEditing(null); await onSpotsChanged(); }} />
          ) : (
            <div key={s.id} className="spot">
              <div className="n">{s.name}<small>{s.type} · {s.driveMin} min{s.tidal ? ` · tidal, station ${s.stationId || 'not set'}` : ''}</small></div>
              <div className="actions">
                <button className="btn" type="button" onClick={() => setEditing(s.id!)}>Edit</button>
                <button className="btn" type="button" onClick={async () => {
                  if (!confirm(`Remove ${s.name}?`)) return;
                  await db.spots.delete(s.id!);
                  await onSpotsChanged();
                }}>Remove</button>
              </div>
            </div>
          ))}
          {editing === 'new' && <SpotForm onDone={async () => { setEditing(null); await onSpotsChanged(); }} />}
        </div>
        {editing !== 'new' && (
          <div className="actions"><button className="btn" type="button" onClick={() => setEditing('new')}>Add a spot</button></div>
        )}
      </section>

      <section className="panel form">
        <h2>Data</h2>
        {sources.map(({ key, label }) => {
          const row = rows[key], s = status[key];
          return (
          <div className="src" key={key}>
            <div>
              <div>{label}</div>
              <div className="when">
                {s?.busy ? 'refreshing…' : row ? `updated ${ago(row.fetchedAt)}` : 'not loaded yet'}
                {s?.failed && ' · last refresh failed'}
              </div>
            </div>
            <button className="btn" type="button" disabled={s?.busy} onClick={() => onRefresh(key)}>{s?.busy ? 'Refreshing…' : 'Refresh'}</button>
          </div>
          );
        })}
      </section>
    </>
  );
}

const BLANK: Spot = { name: '', type: '', lat: 0, lng: 0, driveMin: 30, tidal: false, stationId: '' };

function SpotForm({ spot, onDone }: { spot?: Spot; onDone: () => Promise<void> }) {
  const s = spot ?? BLANK;
  const [v, setV] = useState({
    name: s.name, type: s.type, lat: spot ? String(s.lat) : '', lng: spot ? String(s.lng) : '',
    drive: String(s.driveMin), tidal: s.tidal, station: s.stationId ?? '',
  });
  const [err, setErr] = useState('');
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setV({ ...v, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!v.name.trim()) return setErr('Give the spot a name.');
    if (!inRange(v.lat, -90, 90) || !inRange(v.lng, -180, 180)) return setErr('Latitude and longitude must be numbers.');
    if (!inRange(v.drive, 1, 600)) return setErr('Drive time must be a number of minutes.');
    if (v.tidal && !/^\d{7}$/.test(v.station.trim())) return setErr('A tidal spot needs a 7-digit NOAA station id.');
    const next: Spot = {
      name: v.name.trim(), type: v.type.trim(), lat: Number(v.lat), lng: Number(v.lng),
      driveMin: Math.round(Number(v.drive)), tidal: v.tidal, stationId: v.tidal ? v.station.trim() : undefined,
    };
    if (spot?.id != null) await db.spots.put({ ...next, id: spot.id });
    else await db.spots.add(next);
    await onDone();
  };

  return (
    <form className="spot-form form" onSubmit={save}>
      <label className="field">Name<input className="text" value={v.name} onChange={set('name')} /></label>
      <label className="field">Type<input className="text" value={v.type} onChange={set('type')} placeholder="e.g. Tidal flats" /></label>
      <div className="row2">
        <label className="field">Latitude<input inputMode="decimal" value={v.lat} onChange={set('lat')} /></label>
        <label className="field">Longitude<input inputMode="decimal" value={v.lng} onChange={set('lng')} /></label>
      </div>
      <div className="row2">
        <label className="field">Drive, minutes<input inputMode="numeric" value={v.drive} onChange={set('drive')} /></label>
        <label className="field">NOAA station<input inputMode="numeric" value={v.station} onChange={set('station')} disabled={!v.tidal} placeholder="8771450" /></label>
      </div>
      <label className="check"><input type="checkbox" checked={v.tidal} onChange={set('tidal')} /> Tidal spot (score uses low tide)</label>
      <div className="actions">
        <button className="btn solid" type="submit">{spot ? 'Save spot' : 'Add spot'}</button>
        <button className="btn" type="button" onClick={() => onDone()}>Cancel</button>
        {err && <span className="err" role="status">{err}</span>}
      </div>
    </form>
  );
}
