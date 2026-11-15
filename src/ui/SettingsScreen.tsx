import { useState, type FormEvent } from 'react';
import type { Sources } from '../App';
import { DRIVE, SCORING, type Weights } from '../lib/config';
import { db, type CacheRow } from '../lib/db';
import { ago } from '../lib/dates';
import type { Settings } from '../lib/settings';
import type { Spot } from '../lib/spots';
import { SPOT_FORECASTS } from '../lib/forecast';
import { HOTSPOTS, rankHotspots, type Suggestion } from '../lib/hotspots';
import { loadStations, nearestStations } from '../lib/stations';
import { cleanKey } from '../lib/settings';
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
  const [draft, setDraft] = useState<Spot | undefined>(undefined);
  const hotRow = rows[HOTSPOTS];
  const suggestions = hotRow ? rankHotspots(hotRow.data as any, settings, spots) : null;
  const addSuggestion = (h: Suggestion) => {
    setDraft({ name: h.name, type: 'eBird hotspot', lat: h.lat, lng: h.lng, driveMin: h.driveMin, tidal: false });
    setEditing('new');
  };

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
    { key: SPOT_FORECASTS, label: 'Spot forecasts · Open-Meteo' },
    ...stations.map((st) => ({ key: tideKey(st), label: `Tides · NOAA station ${st}` })),
    ...(settings.ebirdKey ? [{ key: 'birds', label: 'Sightings · eBird notable' }] : []),
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
          {editing === 'new' && <SpotForm key={draft?.name ?? 'new'} spot={draft} isNew onDone={async () => { setEditing(null); setDraft(undefined); await onSpotsChanged(); }} />}
        </div>
        {editing !== 'new' && (
          <div className="actions"><button className="btn" type="button" onClick={() => { setDraft(undefined); setEditing('new'); }}>Add a spot</button></div>
        )}
      </section>

      <section className="panel form">
        <h2>Hotspot suggestions</h2>
        {!settings.ebirdKey ? <div className="sub">Add your eBird key below to get suggestions.</div> : <>
          <div className="sub">eBird hotspots within 50 km with sightings this week, busiest first: most of their county's 200 latest checklists, then most species. Drive times are straight-line estimates; correct them after adding.</div>
          <div className="actions">
            <button className="btn" type="button" disabled={status[HOTSPOTS]?.busy} onClick={() => onRefresh(HOTSPOTS)}>
              {status[HOTSPOTS]?.busy ? 'Looking…' : suggestions ? 'Refresh suggestions' : 'Suggest hotspots'}
            </button>
            {hotRow && <span className="sub">updated {ago(hotRow.fetchedAt)}</span>}
            {status[HOTSPOTS]?.failed && <span className="err">{status[HOTSPOTS]?.error ?? 'Could not load suggestions'}</span>}
          </div>
          {suggestions && (
            <div className="spots">
              {suggestions.length === 0 && <div className="sub">No new hotspots found.</div>}
              {suggestions.map((h) => (
                <div key={h.locId} className="spot">
                  <div className="n">{h.name}<small>~{h.driveMin} min · {h.checklists} recent checklist{h.checklists === 1 ? '' : 's'}{h.species ? ` · ${h.species} species all time` : ''}</small></div>
                  <div className="actions"><button className="btn" type="button" onClick={() => addSuggestion(h)}>Add</button></div>
                </div>
              ))}
            </div>
          )}
          <div className="sub">Data: <a className="link" href="https://ebird.org" target="_blank" rel="noreferrer">eBird.org</a></div>
        </>}
      </section>

      <WeightsForm current={settings.weights} onSave={(weights) => onSave({ weights })} />

      <KeyForm current={settings.ebirdKey} check={status.birds} onSave={(ebirdKey) => onSave({ ebirdKey })} />

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
                {s?.failed && ` · last refresh failed${s.error ? `: ${s.error}` : ''}`}
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

function SpotForm({ spot, isNew, onDone }: { spot?: Spot; isNew?: boolean; onDone: () => Promise<void> }) {
  const s = spot ?? BLANK;
  const [v, setV] = useState({
    name: s.name, type: s.type, lat: spot ? String(s.lat) : '', lng: spot ? String(s.lng) : '',
    drive: String(s.driveMin), tidal: s.tidal, station: s.stationId ?? '',
  });
  const [err, setErr] = useState('');
  const [near, setNear] = useState('');
  const findStation = async () => {
    if (!inRange(v.lat, -90, 90) || !inRange(v.lng, -180, 180)) return setNear('Enter the coordinates first.');
    setNear('Looking…');
    try {
      const [n] = nearestStations(await loadStations(), Number(v.lat), Number(v.lng), 1);
      setV((cur) => ({ ...cur, station: n.id }));
      setNear(`${n.name}, ${n.km.toFixed(1)} km away`);
    } catch { setNear('Could not reach NOAA.'); }
  };
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setV({ ...v, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!v.name.trim()) return setErr('Give the spot a name.');
    if (!inRange(v.lat, -90, 90) || !inRange(v.lng, -180, 180)) return setErr('Latitude and longitude must be numbers.');
    if (!inRange(v.drive, 1, 600)) return setErr('Drive time must be a number of minutes.');
    if (v.tidal && !/^[A-Za-z0-9]{5,10}$/.test(v.station.trim())) return setErr('A tidal spot needs a NOAA station id, e.g. 8771450.');
    const next: Spot = {
      name: v.name.trim(), type: v.type.trim(), lat: Number(v.lat), lng: Number(v.lng),
      driveMin: Math.round(Number(v.drive)), tidal: v.tidal, stationId: v.tidal ? v.station.trim() : undefined,
    };
    if (spot?.id != null && !isNew) await db.spots.put({ ...next, id: spot.id });
    else await db.spots.add(next);
    await onDone();
  };

  return (
    <form className="spot-form form" onSubmit={save}>
      <label className="field">Name<input className="text" value={v.name} onChange={set('name')} autoFocus={isNew} /></label>
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
      {v.tidal && (
        <div className="actions">
          <button className="btn" type="button" onClick={findStation}>Use nearest NOAA station</button>
          {near && <span className="sub">{near}</span>}
        </div>
      )}
      <div className="actions">
        <button className="btn solid" type="submit">{spot && !isNew ? 'Save spot' : 'Add spot'}</button>
        <button className="btn" type="button" onClick={() => onDone()}>Cancel</button>
        {err && <span className="err" role="status">{err}</span>}
      </div>
    </form>
  );
}

/** The eBird key: masked, kept only in this browser's storage, sent only to eBird. eBird itself is the check. */
function KeyForm({ current, check, onSave }: { current: string; check?: { busy: boolean; failed: boolean; error?: string }; onSave: (key: string) => Promise<void> }) {
  const [key, setKey] = useState(current);
  const [show, setShow] = useState(false);
  const [msg, setMsg] = useState('');
  const save = async (e: FormEvent) => {
    e.preventDefault();
    const k = cleanKey(key);
    setKey(k);
    await onSave(k);
    setMsg(k ? 'Key saved on this device' : 'Key removed');
  };
  return (
    <form className="panel form" onSubmit={save} autoComplete="off">
      <h2>eBird</h2>
      <div className="sub">Your eBird API key stays on this device and is sent only to eBird. Get one at <a className="link" href="https://ebird.org/api/keygen" target="_blank" rel="noreferrer">ebird.org/api/keygen</a>.</div>
      <div className="key-row">
        <label className="field" htmlFor="ebird-key">API key
          <input id="ebird-key" type={show ? 'text' : 'password'} value={key} autoComplete="off" spellCheck={false}
            onChange={(e) => setKey(e.target.value)} />
        </label>
        <button className="btn" type="button" onClick={() => setShow(!show)} aria-pressed={show}>{show ? 'Hide' : 'Show'}</button>
      </div>
      <div className="actions">
        <button className="btn solid" type="submit">Save key</button>
        {current && <button className="btn" type="button" onClick={async () => { setKey(''); await onSave(''); setMsg('Key removed'); }}>Remove key</button>}
        {msg && <span className="sub" role="status">{msg}</span>}
      </div>
      {current && check && (
        <div className={check.failed ? 'err' : 'sub'} role="status">
          {check.busy ? 'Checking with eBird…' : check.failed ? (check.error ?? 'eBird did not answer') : 'eBird accepted the key'}
        </div>
      )}
    </form>
  );
}

const WEIGHT_FIELDS: { key: keyof Weights; label: string }[] = [
  { key: 'windFreeMph', label: 'Wind allowed, mph' },
  { key: 'windPerMph', label: 'Points per mph over' },
  { key: 'gustFreeMph', label: 'Gusts allowed, mph' },
  { key: 'gustPerMph', label: 'Points per gust mph over' },
  { key: 'rainPerPercent', label: 'Points per % rain chance' },
  { key: 'cloudHeavyAbove', label: 'Heavy cloud above, %' },
  { key: 'cloudHeavyPenalty', label: 'Heavy cloud points' },
  { key: 'cloudPartFrom', label: 'Part cloud from, %' },
  { key: 'cloudPartPenalty', label: 'Part cloud points' },
];

/** Score weights. Values equal to config.ts are not stored, so later default changes still apply. */
function WeightsForm({ current, onSave }: { current: Partial<Weights>; onSave: (w: Partial<Weights>) => Promise<void> }) {
  const [v, setV] = useState<Record<string, string>>(() =>
    Object.fromEntries(WEIGHT_FIELDS.map(({ key }) => [key, String(current[key] ?? SCORING[key])])));
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const save = async (e: FormEvent) => {
    e.preventDefault();
    const out: Partial<Weights> = {};
    for (const { key, label } of WEIGHT_FIELDS) {
      const n = Number(v[key]);
      if (!v[key].trim() || !Number.isFinite(n) || n < 0 || n > 200) return setMsg({ ok: false, text: `${label} must be a number from 0 to 200.` });
      if (n !== SCORING[key]) out[key] = n;
    }
    await onSave(out);
    setMsg({ ok: true, text: Object.keys(out).length ? 'Saved; scores updated' : 'Saved; using the defaults' });
  };
  const reset = async () => {
    setV(Object.fromEntries(WEIGHT_FIELDS.map(({ key }) => [key, String(SCORING[key])])));
    await onSave({});
    setMsg({ ok: true, text: 'Back to the defaults' });
  };
  return (
    <form className="panel form" onSubmit={save}>
      <h2>Scoring</h2>
      <div className="sub">Each window starts at {SCORING.start} and loses points for wind, gusts, rain chance and cloud.</div>
      <div className="row2">
        {WEIGHT_FIELDS.map(({ key, label }) => (
          <label key={key} className="field" htmlFor={`w-${key}`}>{label}
            <input id={`w-${key}`} inputMode="decimal" value={v[key]} onChange={(e) => setV({ ...v, [key]: e.target.value })} />
          </label>
        ))}
      </div>
      <div className="actions">
        <button className="btn solid" type="submit">Save weights</button>
        <button className="btn" type="button" onClick={reset}>Reset to defaults</button>
        {msg && <span className={msg.ok ? 'sub' : 'err'} role="status">{msg.text}</span>}
      </div>
    </form>
  );
}
