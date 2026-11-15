// Dates are handled as plain local strings ("2026-11-17", "2026-11-17T07:00"),
// the way Open-Meteo returns them for America/Chicago, so no timezone maths is needed.

export const dayOf = (isoLocal: string) => isoLocal.slice(0, 10);
export const hourOf = (isoLocal: string) => Number(isoLocal.slice(11, 13));
export const minutesOf = (isoLocal: string) =>
  Number(isoLocal.slice(11, 13)) * 60 + Number(isoLocal.slice(14, 16));

const toUtcMs = (day: string) => {
  const [y, m, d] = day.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};

export const daysBetween = (fromDay: string, toDay: string) =>
  Math.round((toUtcMs(toDay) - toUtcMs(fromDay)) / 86400000);

export const addDays = (day: string, n: number) =>
  new Date(toUtcMs(day) + n * 86400000).toISOString().slice(0, 10);

/** Today's date in the given timezone, as "2026-11-17". */
export const todayIn = (timeZone: string, now = new Date()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);

const part = (day: string, opts: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', ...opts }).format(new Date(toUtcMs(day)));

export const weekday = (day: string) => part(day, { weekday: 'short' }); // "Tue"
export const monthDay = (day: string) => part(day, { month: 'short', day: 'numeric' }); // "Nov 17"
export const dayNumber = (day: string) => String(Number(day.slice(8, 10)));
export const dayId = (day: string) => monthDay(day).toLowerCase().replace(' ', '-'); // "nov-17"

/** "2026-11-17T06:47" -> "6:47" */
export const shortClock = (isoLocal: string) => `${hourOf(isoLocal) % 12 || 12}:${isoLocal.slice(14, 16)}`;

/** "2026-11-17 14:37" -> "2:37 PM" */
export const clock12 = (isoLocal: string) => `${shortClock(isoLocal)} ${hourOf(isoLocal) < 12 ? 'AM' : 'PM'}`;

/** "2026-11-17" -> "20261117" */
export const compactDay = (day: string) => day.replaceAll('-', '');

export function ago(ms: number, now = Date.now()): string {
  const mins = Math.max(0, Math.round((now - ms) / 60000));
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 48) return `${hrs} hour${hrs === 1 ? '' : 's'} ago`;
  return `${Math.round(hrs / 24)} days ago`;
}
