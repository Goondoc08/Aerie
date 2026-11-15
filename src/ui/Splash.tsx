import { useEffect, useState } from 'react';
import hawk from '../assets/aerie-hawk.svg';

export function Splash() {
  const [state, setState] = useState<'in' | 'out' | 'gone'>('in');
  useEffect(() => {
    if (state === 'in') { const t = setTimeout(() => setState('out'), 1900); return () => clearTimeout(t); }
    if (state === 'out') { const t = setTimeout(() => setState('gone'), 450); return () => clearTimeout(t); }
  }, [state]);
  if (state === 'gone') return null;
  const dismiss = () => setState('out');
  return (
    <div id="splash" className={state === 'out' ? 'out' : ''} role="button" tabIndex={0}
      aria-label="Dismiss splash screen" onClick={dismiss}
      onKeyDown={(e) => { if (['Enter', ' ', 'Escape'].includes(e.key)) dismiss(); }}>
      <img src={hawk} alt="" width="192" height="245" />
      <div className="splash-name">Aerie</div>
      <div className="splash-tag">Wind · light · tide</div>
    </div>
  );
}
