import { SHIFT } from './config';
import { daysBetween } from './dates';

/** True when the whole day is taken by a shift. The morning after a pair is open. */
export function isShiftDay(day: string, anchorDate: string = SHIFT.anchorDate): boolean {
  const n = daysBetween(anchorDate, day);
  const pos = ((n % SHIFT.cycleDays) + SHIFT.cycleDays) % SHIFT.cycleDays;
  return pos < SHIFT.shiftDays;
}
