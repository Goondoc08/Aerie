import { DRIVE } from './config';

const rad = Math.PI / 180;

/** Straight-line distance in kilometres. */
export function km(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const a = Math.sin(((lat2 - lat1) * rad) / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(((lng2 - lng1) * rad) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(a));
}

/** Rough drive time from straight-line distance, 1.5 minutes per mile, rounded to 5. Shown with "~". */
export function estimateDrive(fromLat: number, fromLng: number, lat: number, lng: number): number {
  const miles = km(fromLat, fromLng, lat, lng) / 1.609344;
  return Math.max(5, Math.round((miles * DRIVE.minutesPerMile) / 5) * 5);
}
