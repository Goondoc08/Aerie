// Sun times computed on the device (NOAA solar equations). Civil twilight is
// the sun 6 degrees below the horizon: "first light" and "last light".

const rad = Math.PI / 180;

function sunEvent(date: string, lat: number, lng: number, zenith: number, rising: boolean): Date | null {
  const [y, m, d] = date.split('-').map(Number);
  const jd = Date.UTC(y, m - 1, d) / 86400000 + 2440587.5;
  let t = (jd - 2451545) / 36525;
  let minutes = 720;
  for (let i = 0; i < 3; i++) {
    const L0 = (280.46646 + t * (36000.76983 + t * 0.0003032)) % 360;
    const M = 357.52911 + t * (35999.05029 - 0.0001537 * t);
    const e = 0.016708634 - t * (0.000042037 + 0.0000001267 * t);
    const C =
      Math.sin(M * rad) * (1.914602 - t * (0.004817 + 0.000014 * t)) +
      Math.sin(2 * M * rad) * (0.019993 - 0.000101 * t) +
      Math.sin(3 * M * rad) * 0.000289;
    const omega = 125.04 - 1934.136 * t;
    const lambda = L0 + C - 0.00569 - 0.00478 * Math.sin(omega * rad);
    const eps0 = 23 + (26 + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60) / 60;
    const eps = eps0 + 0.00256 * Math.cos(omega * rad);
    const decl = Math.asin(Math.sin(eps * rad) * Math.sin(lambda * rad));
    const yy = Math.tan((eps / 2) * rad) ** 2;
    const eqTime =
      (4 / rad) *
      (yy * Math.sin(2 * L0 * rad) -
        2 * e * Math.sin(M * rad) +
        4 * e * yy * Math.sin(M * rad) * Math.cos(2 * L0 * rad) -
        0.5 * yy * yy * Math.sin(4 * L0 * rad) -
        1.25 * e * e * Math.sin(2 * M * rad));
    const cosH =
      Math.cos(zenith * rad) / (Math.cos(lat * rad) * Math.cos(decl)) - Math.tan(lat * rad) * Math.tan(decl);
    if (cosH > 1 || cosH < -1) return null;
    const H = Math.acos(cosH) / rad;
    minutes = 720 - 4 * (lng + (rising ? H : -H)) - eqTime; // minutes after 00:00 UTC
    t = (jd + minutes / 1440 - 2451545) / 36525;
  }
  return new Date(Date.UTC(y, m - 1, d) + minutes * 60000);
}

export interface SunTimes {
  firstLight: Date | null;
  sunrise: Date | null;
  sunset: Date | null;
  lastLight: Date | null;
}

export function sunTimes(date: string, lat: number, lng: number): SunTimes {
  return {
    firstLight: sunEvent(date, lat, lng, 96, true),
    sunrise: sunEvent(date, lat, lng, 90.833, true),
    sunset: sunEvent(date, lat, lng, 90.833, false),
    lastLight: sunEvent(date, lat, lng, 96, false),
  };
}

export function clock(d: Date | null, timeZone: string): string {
  if (!d) return '–';
  return new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit' }).format(d);
}
