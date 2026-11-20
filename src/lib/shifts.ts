import { SHIFT } from './config';
import { daysBetween } from './dates';

/** How work days are set: the repeating rotation, the same weekdays every week, or none at all. */
export type ScheduleMode = 'rotation' | 'weekdays' | 'none';

export interface Schedule {
  mode: ScheduleMode;
  /** Rotation only: the first day of a pair of work days. */
  anchor: string;
  /** Weekdays only: 0 = Sunday ... 6 = Saturday. */
  weekdays: number[];
}

/** True when the whole day is taken by a shift. The morning after a pair is open. */
export function isShiftDay(day: string, anchorDate: string = SHIFT.anchorDate): boolean {
  const n = daysBetween(anchorDate, day);
  const pos = ((n % SHIFT.cycleDays) + SHIFT.cycleDays) % SHIFT.cycleDays;
  return pos < SHIFT.shiftDays;
}

/** 0 = Sunday ... 6 = Saturday, for a "2026-11-17" date. */
export const weekdayOf = (day: string) => new Date(`${day}T12:00:00Z`).getUTCDay();

/** True when the day is a work day under the chosen schedule; those days are darkened. */
export function isWorkDay(day: string, s: Schedule | string | undefined): boolean {
  if (s == null || typeof s === 'string') return isShiftDay(day, s);
  if (s.mode === 'none') return false;
  if (s.mode === 'weekdays') return s.weekdays.includes(weekdayOf(day));
  return isShiftDay(day, s.anchor);
}
