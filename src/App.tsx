import { useCallback, useEffect, useState } from 'react';
import { REFRESH_HOURS } from './lib/config';
import { db, type CacheRow } from './lib/db';
import { refreshForecast } from './lib/forecast';
import { loadSettings, saveSettings, type Settings } from './lib/settings';
import { Home } from './ui/Home';
import { SettingsScreen } from './ui/SettingsScreen';
import { Splash } from './ui/Splash';

const HOUR = 3600000;
const useHash = () => {
  const [hash, setHash] = useState(location.hash.slice(1));
  useEffect(() => {
    const on = () => setHash(location.hash.slice(1));
    addEventListener('hashchange', on);
    return () => removeEventListener('hashchange', on);
  }, []);
  return hash;
};

export default function App() {
  const hash = useHash();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [forecast, setForecast] = useState<CacheRow | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const refresh = useCallback(async (s: Settings) => {
    setBusy(true);
    try {
      setForecast(await refreshForecast(s.lat, s.lng));
      setFailed(false);
    } catch {
      setFailed(true); // the cached copy stays on screen
    } finally {
      setBusy(false);
    }
  }, []);

  // Show whatever is cached straight away, then refresh if it is old.
  useEffect(() => {
    let live = true;
    const check = async () => {
      const [s, row] = await Promise.all([loadSettings(), db.cache.get('forecast')]);
      if (!live) return;
      setSettings(s);
      if (row) setForecast(row);
      setLoaded(true);
      const old = !row || Date.now() - row.fetchedAt > REFRESH_HOURS.forecast * HOUR;
      const moved = row && (row.lat !== s.lat || row.lng !== s.lng);
      if (old || moved) refresh(s);
    };
    check();
    const onVisible = () => { if (document.visibilityState === 'visible') check(); };
    document.addEventListener('visibilitychange', onVisible);
    addEventListener('online', check);
    return () => {
      live = false;
      document.removeEventListener('visibilitychange', onVisible);
      removeEventListener('online', check);
    };
  }, [refresh]);

  const update = async (patch: Partial<Settings>) => {
    if (!settings) return;
    const next = { ...settings, ...patch };
    await saveSettings(patch);
    setSettings(next);
    if (next.lat !== settings.lat || next.lng !== settings.lng) refresh(next);
  };

  return (
    <>
      <Splash />
      <div className="wrap">
        {!loaded || !settings ? null : hash === 'settings' ? (
          <SettingsScreen settings={settings} forecast={forecast} busy={busy} failed={failed}
            onSave={update} onRefresh={() => refresh(settings)} />
        ) : (
          <Home settings={settings} forecast={forecast} busy={busy} failed={failed} />
        )}
      </div>
    </>
  );
}
