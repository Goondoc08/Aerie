// Everything Nicholas is likely to tune lives here: weights, windows, thresholds.

export const HOME_DEFAULT = { lat: 29.5633, lng: -95.2861 };
export const TIMEZONE = 'America/Chicago';
export const DAYS_SHOWN = 9;

export const WINDOWS = {
  morningHours: [7, 8, 9, 10],
  // Evening = this many hourly forecast marks before sunset.
  eveningHourCount: 3,
};

export const SCORING = {
  start: 100,
  windFreeMph: 6, // average sustained wind allowed before points come off
  windPerMph: 5,
  gustFreeMph: 20, // highest gust allowed before points come off
  gustPerMph: 1.5,
  rainPerPercent: 0.6, // per point of the window's highest rain chance
  cloudHeavyAbove: 80,
  cloudHeavyPenalty: 12,
  cloudPartFrom: 30,
  cloudPartPenalty: 6,
};

export const VERDICTS = [
  { min: 80, word: 'Go' },
  { min: 65, word: 'Decent' },
  { min: 45, word: 'Marginal' },
  { min: 0, word: 'Skip' },
] as const;
export type VerdictWord = (typeof VERDICTS)[number]['word'];

export const TIDE = {
  morningFromHour: 5,
  morningToHour: 11,
  eveningFromHour: 13, // evening window runs from here to sunset
  goodAtOrBelowFt: 0.3,
  goodBonus: 8,
  poorAboveFt: 0.7,
  poorPenalty: 8,
  noLowPenalty: 15,
  homeStation: '8771450', // Galveston Pier 21, used for the low tide line on each card
};

export const SHIFT = {
  anchorDate: '2026-11-14', // first day of a shift pair
  cycleDays: 6,
  shiftDays: 2,
};

export const CONFIDENCE = [
  { throughDay: 3, label: 'sharp' },
  { throughDay: 7, label: 'rough' },
  { throughDay: Infinity, label: 'outlook only' },
];

export const DRIVE = { min: 10, max: 90, step: 5, default: 45, minutesPerMile: 1.5 };

export const BIRDS = {
  radiusKm: 50,
  backDays: 7,
  maxAgeDays: 4,
  lingeringDays: 3,
  returningDays: 2,
  affectsNextDays: 4,
  maxTemporary: 2,
  atSpotKm: 2, // a report this close to one of my spots counts as "at" that spot
};

export const REFRESH_HOURS = { forecast: 3, tides: 24, birds: 6, staleBanner: 6 };
